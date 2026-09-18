import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { error } from "./http";
import type { Actor, Env, Principal, PrincipalKind } from "./types";

type ActorPrincipalRow = {
  actor_id: string;
  display_name: string;
  issuer: string;
  kind: PrincipalKind;
  provider: "cloudflare_access";
  subject: string;
};

type AccessConfig = {
  audience: string;
  issuer: string;
  jwksUrl: URL;
};

const jwksResolvers = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksResolver(url: URL): ReturnType<typeof createRemoteJWKSet> {
  const key = url.href;
  const existing = jwksResolvers.get(key);
  if (existing) return existing;
  const created = createRemoteJWKSet(url, { timeoutDuration: 3_000 });
  jwksResolvers.set(key, created);
  return created;
}

function accessConfig(env: Env): AccessConfig | Response {
  const issuerValue = typeof env.FLEET_ACCESS_ISSUER === "string" ? env.FLEET_ACCESS_ISSUER.trim() : "";
  const audience = typeof env.FLEET_ACCESS_AUDIENCE === "string" ? env.FLEET_ACCESS_AUDIENCE.trim() : "";
  const jwksValue = typeof env.FLEET_ACCESS_JWKS_URL === "string" ? env.FLEET_ACCESS_JWKS_URL.trim() : "";
  if (!issuerValue || !audience || !jwksValue) {
    return error("auth_unavailable", "production authentication is not configured", 503);
  }
  if (issuerValue.includes("replace-with-") || audience.startsWith("replace-with-") || jwksValue.includes("replace-with-")) {
    return error("auth_unavailable", "production authentication is not configured", 503);
  }

  try {
    const issuer = new URL(issuerValue);
    const jwksUrl = new URL(jwksValue);
    const issuerIsOrigin = issuer.protocol === "https:"
      && issuer.hostname.endsWith(".cloudflareaccess.com")
      && !issuer.port
      && issuer.pathname === "/"
      && !issuer.username
      && !issuer.password
      && !issuer.search
      && !issuer.hash;
    const jwksIsFixedAccessEndpoint = jwksUrl.protocol === "https:"
      && jwksUrl.origin === issuer.origin
      && jwksUrl.pathname === "/cdn-cgi/access/certs"
      && !jwksUrl.username
      && !jwksUrl.password
      && !jwksUrl.search
      && !jwksUrl.hash;
    if (!issuerIsOrigin || !jwksIsFixedAccessEndpoint) throw new Error("invalid Access URLs");
    return { audience, issuer: issuer.origin, jwksUrl };
  } catch {
    return error("auth_unavailable", "production authentication is misconfigured", 503);
  }
}

function principalFromPayload(payload: JWTPayload, issuer: string): Principal | null {
  if (payload.type !== "app" || typeof payload.sub !== "string") return null;
  const commonName = typeof payload.common_name === "string" ? payload.common_name : "";
  if (payload.sub && !commonName) {
    return { provider: "cloudflare_access", issuer, kind: "human", subject: payload.sub };
  }
  return !payload.sub && commonName
    ? { provider: "cloudflare_access", issuer, kind: "service", subject: commonName }
    : null;
}

function isJwtType(value: string): boolean {
  return value.replace(/^application\//i, "").toUpperCase() === "JWT";
}

function jwksUnavailable(caught: unknown): boolean {
  if (caught instanceof TypeError || caught instanceof SyntaxError) return true;
  if (!caught || typeof caught !== "object") return false;
  if (!("code" in caught)) return caught instanceof Error;
  return caught.code === "ERR_JOSE_GENERIC"
    || caught.code === "ERR_JWKS_TIMEOUT"
    || caught.code === "ERR_JWKS_INVALID";
}

async function activeActor(env: Env, principal: Principal): Promise<Actor | Response> {
  const row = await env.DB.prepare(
    `SELECT actors.id AS actor_id, actors.display_name,
            actor_principals.provider, actor_principals.issuer,
            actor_principals.kind, actor_principals.subject
       FROM actor_principals
       JOIN actors ON actors.id = actor_principals.actor_id
      WHERE actor_principals.provider = ?
        AND actor_principals.issuer = ?
        AND actor_principals.kind = ?
        AND actor_principals.subject = ?
        AND actor_principals.active = 1
        AND actors.active = 1`,
  ).bind(principal.provider, principal.issuer, principal.kind, principal.subject).first<ActorPrincipalRow>();

  return row
    ? {
        id: row.actor_id,
        display_name: row.display_name,
        principal: { provider: row.provider, issuer: row.issuer, kind: row.kind, subject: row.subject },
      }
    : error("unauthorized", "principal is not an active Fleet actor", 401);
}

async function resolveAccessCaller(request: Request, env: Env): Promise<Actor | Response> {
  const config = accessConfig(env);
  if (config instanceof Response) return config;
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return error("unauthorized", "Cloudflare Access application token is required", 401);

  try {
    const jwks = jwksResolver(config.jwksUrl);
    // Access application tokens carry no `typ` header, so it cannot be required.
    // When one is present it must still name a JWT.
    const { payload, protectedHeader } = await jwtVerify(token, jwks, {
      algorithms: ["RS256"],
      audience: config.audience,
      issuer: config.issuer,
      requiredClaims: ["aud", "exp", "iss", "sub", "type"],
      clockTolerance: 5,
    });
    if (protectedHeader.typ !== undefined && !isJwtType(protectedHeader.typ)) {
      return error("unauthorized", "Cloudflare Access application token is invalid", 401);
    }
    const principal = principalFromPayload(payload, config.issuer);
    return principal
      ? activeActor(env, principal)
      : error("unauthorized", "Cloudflare Access principal claims are invalid", 401);
  } catch (caught) {
    return jwksUnavailable(caught)
      ? error("auth_unavailable", "Cloudflare Access signing keys are unavailable", 503)
      : error("unauthorized", "Cloudflare Access application token is invalid", 401);
  }
}

export async function resolveCaller(request: Request, env: Env): Promise<Actor | Response> {
  return resolveAccessCaller(request, env);
}

export function enforceSameOriginMutation(request: Request, caller: Actor): Response | null {
  if (caller.principal.kind !== "human" || request.method === "GET" || request.method === "HEAD") return null;
  const origin = request.headers.get("Origin");
  if (!origin) return error("forbidden", "browser mutations require a same-origin request", 403);
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) {
      return error("forbidden", "browser mutations require a same-origin request", 403);
    }
  } catch {
    return error("forbidden", "browser mutations require a same-origin request", 403);
  }
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase();
  return contentType === "application/json"
    ? null
    : error("forbidden", "browser mutations require application/json", 403);
}
