import { env, exports } from "cloudflare:workers";
import { exportJWK, generateKeyPair, generateSecret, SignJWT, type JWK } from "jose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const issuer = "https://fleet-test.cloudflareaccess.com";
const audience = "fleet-test-audience";
const jwksUrl = `${issuer}/cdn-cgi/access/certs`;
const keyId = "fleet-test-key";

let signingKey: CryptoKey;
let publicJwk: JWK;

type TokenOptions = {
  algorithm?: "HS256" | "RS256";
  audience?: string | string[];
  expiresAt?: number;
  issuer?: string;
  notBefore?: number;
  protectedType?: string;
  tokenType?: string;
};

async function token(
  claims: { common_name?: string; email?: string; name?: string; sub: string },
  options: TokenOptions = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1_000);
  const algorithm = options.algorithm ?? "RS256";
  const key = algorithm === "RS256" ? signingKey : await generateSecret("HS256");
  return new SignJWT({ ...claims, type: options.tokenType ?? "app" })
    .setProtectedHeader(
      options.protectedType === undefined
        ? { alg: algorithm, kid: keyId }
        : { alg: algorithm, kid: keyId, typ: options.protectedType },
    )
    .setIssuer(options.issuer ?? issuer)
    .setAudience(options.audience ?? audience)
    .setIssuedAt(now)
    .setNotBefore(options.notBefore ?? now - 5)
    .setExpirationTime(options.expiresAt ?? now + 300)
    .sign(key);
}

function apiRequest(
  path: string,
  accessToken?: string,
  init: { body?: unknown; headers?: HeadersInit; method?: string } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Cf-Access-Jwt-Assertion", accessToken);
  if (init.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return exports.default.fetch(`https://fleet.test${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

function authorizationBody(outcome: string) {
  return {
    actor_id: "shane",
    delegated_actions: ["request"],
    exclusions: [],
    gates: [],
    outcome,
    plan: "Exercise authenticated authority",
    proposed_owner_id: "codex",
    scope: ["identity"],
    validation_evidence: ["controlled JWT tests"],
  };
}

async function activeCodexProject(codexToken: string): Promise<string> {
  const proposed = await apiRequest("/v1/projects", codexToken, {
    body: { originator_id: "codex", slug: `identity-${crypto.randomUUID()}`, title: "Identity proof" },
    headers: { "Idempotency-Key": crypto.randomUUID() },
  });
  if (proposed.status !== 201) throw new Error("active-project fixture could not propose a project");
  const project = await proposed.json() as { id: string };
  const shaneToken = await token({ sub: "human-shane" });
  const authorized = await apiRequest(`/v1/projects/${project.id}/authorize`, shaneToken, {
    body: authorizationBody("Cross-seat proof"),
    headers: { "Idempotency-Key": crypto.randomUUID(), "If-Match": '"1"', Origin: "https://fleet.test" },
  });
  if (authorized.status !== 200) throw new Error("active-project fixture could not authorize the project");
  const accepted = await apiRequest(`/v1/projects/${project.id}/owner-accept`, codexToken, {
    body: {},
    headers: { "Idempotency-Key": crypto.randomUUID(), "If-Match": '"2"' },
  });
  if (accepted.status !== 200) throw new Error("active-project fixture could not accept ownership");
  return project.id;
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  signingKey = pair.privateKey;
  publicJwk = { ...await exportJWK(pair.publicKey), alg: "RS256", kid: keyId, use: "sig" };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) !== jwksUrl) throw new Error(`unexpected outbound request: ${String(input)}`);
    return Response.json({ keys: [publicJwk] });
  }));
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO actor_principals (provider, issuer, kind, subject, actor_id, active) VALUES ('cloudflare_access', ?, 'human', ?, 'shane', 1)",
    ).bind(issuer, "human-shane"),
    env.DB.prepare(
      "INSERT INTO actor_principals (provider, issuer, kind, subject, actor_id, active) VALUES ('cloudflare_access', ?, 'service', ?, 'codex', 1)",
    ).bind(issuer, "codex-primary.access"),
    env.DB.prepare(
      "INSERT INTO actor_principals (provider, issuer, kind, subject, actor_id, active) VALUES ('cloudflare_access', ?, 'service', ?, 'codex', 1)",
    ).bind(issuer, "codex-rotated.access"),
    env.DB.prepare(
      "INSERT INTO actor_principals (provider, issuer, kind, subject, actor_id, active) VALUES ('cloudflare_access', ?, 'service', ?, 'claude', 0)",
    ).bind(issuer, "claude-disabled.access"),
    env.DB.prepare(
      "INSERT INTO actor_principals (provider, issuer, kind, subject, actor_id, active) VALUES ('cloudflare_access', ?, 'service', ?, 'claude', 1)",
    ).bind(issuer, "claude-primary.access"),
    env.DB.prepare(
      "INSERT INTO actor_principals (provider, issuer, kind, subject, actor_id, active) VALUES ('cloudflare_access', ?, 'service', ?, 'juniorslo', 1)",
    ).bind(issuer, "junior-disabled-actor.access"),
  ]);
});

afterEach(async () => {
  await env.DB.prepare("UPDATE actors SET active = 1 WHERE id = 'juniorslo'").run();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("Fleet production identity", () => {
  it("resolves human and service principals through the authenticated identity endpoint", async () => {
    const human = await apiRequest("/v1/me", await token({ sub: "human-shane" }));
    expect(human.status).toBe(200);
    expect(await human.json()).toEqual({
      actor: { display_name: "Shane Slosar", id: "shane" },
      principal: { issuer, kind: "human", provider: "cloudflare_access", subject: "human-shane" },
    });

    const service = await apiRequest("/v1/me", await token({ common_name: "codex-primary.access", sub: "" }));
    expect(service.status).toBe(200);
    expect(await service.json()).toMatchObject({
      actor: { id: "codex" },
      principal: { kind: "service", subject: "codex-primary.access" },
    });
  });

  it("maps multiple explicitly enrolled principals to one active actor", async () => {
    const primary = await apiRequest("/v1/me", await token({ common_name: "codex-primary.access", sub: "" }));
    const rotated = await apiRequest("/v1/me", await token({ common_name: "codex-rotated.access", sub: "" }));
    const primaryIdentity = await primary.json() as { actor: { display_name: string; id: string } };
    const rotatedIdentity = await rotated.json() as { actor: { display_name: string; id: string } };
    expect(primaryIdentity.actor).toEqual({ display_name: "Codex", id: "codex" });
    expect(rotatedIdentity.actor).toEqual({ display_name: "Codex", id: "codex" });
  });

  it("rejects missing, unmapped, disabled-principal, and disabled-actor identities", async () => {
    const missing = await apiRequest("/v1/me");
    const unmapped = await apiRequest("/v1/me", await token({ common_name: "unknown.access", sub: "" }));
    const disabledPrincipal = await apiRequest("/v1/me", await token({ common_name: "claude-disabled.access", sub: "" }));
    await env.DB.prepare("UPDATE actors SET active = 0 WHERE id = 'juniorslo'").run();
    const disabledActor = await apiRequest("/v1/me", await token({ common_name: "junior-disabled-actor.access", sub: "" }));

    expect([missing.status, unmapped.status, disabledPrincipal.status, disabledActor.status]).toEqual([401, 401, 401, 401]);
  });

  it("never auto-enrolls from email, display name, or a forged test identity header", async () => {
    const emailOnly = await apiRequest("/v1/me", await token({
      email: "shane@example.test",
      name: "Shane Slosar",
      sub: "unmapped-human",
    }), {
      headers: { "X-Fleet-Principal": "shane" },
    });
    expect(emailOnly.status).toBe(401);

    const forged = await apiRequest("/v1/me", await token({ common_name: "codex-primary.access", sub: "" }), {
      headers: { "X-Fleet-Principal": "shane" },
    });
    expect(await forged.json()).toMatchObject({ actor: { id: "codex" } });
  });

  it.each([
    ["tampered signature", async () => {
      const valid = await token({ common_name: "codex-primary.access", sub: "" });
      const [header, payload, signature] = valid.split(".");
      if (!header || !payload || !signature) throw new Error("test token was malformed");
      return `${header}.${payload}.${signature.startsWith("a") ? "b" : "a"}${signature.slice(1)}`;
    }],
    ["expired token", () => token({ common_name: "codex-primary.access", sub: "" }, { expiresAt: Math.floor(Date.now() / 1_000) - 10 })],
    ["future not-before", () => token({ common_name: "codex-primary.access", sub: "" }, { notBefore: Math.floor(Date.now() / 1_000) + 300 })],
    ["wrong issuer", () => token({ common_name: "codex-primary.access", sub: "" }, { issuer: "https://other.cloudflareaccess.com" })],
    ["wrong audience", () => token({ common_name: "codex-primary.access", sub: "" }, { audience: "other-audience" })],
    ["wrong application type", () => token({ common_name: "codex-primary.access", sub: "" }, { tokenType: "org" })],
    ["empty service principal", () => token({ sub: "" })],
    ["ambiguous human and service claims", () => token({ common_name: "codex-primary.access", sub: "human-shane" })],
    ["wrong signature algorithm", () => token({ common_name: "codex-primary.access", sub: "" }, { algorithm: "HS256" })],
    ["wrong protected type", () => token({ common_name: "codex-primary.access", sub: "" }, { protectedType: "NOT-JWT" })],
  ])("rejects %s", async (_name, makeToken) => {
    const response = await apiRequest("/v1/me", await makeToken());
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "unauthorized" });
  });

  it("accepts a token without a protected typ header, as Cloudflare Access issues them", async () => {
    const response = await apiRequest("/v1/me", await token({ common_name: "codex-primary.access", sub: "" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ actor: { id: "codex" } });
  });

  it("accepts a token whose protected typ names a JWT", async () => {
    const response = await apiRequest(
      "/v1/me",
      await token({ common_name: "codex-primary.access", sub: "" }, { protectedType: "JWT" }),
    );
    expect(response.status).toBe(200);
  });

  it("accepts an audience array containing the configured Fleet audience", async () => {
    const response = await apiRequest(
      "/v1/me",
      await token({ common_name: "codex-primary.access", sub: "" }, { audience: ["other-audience", audience] }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ actor: { id: "codex" } });
  });

  it("records an own action with principal provenance and denies Shane-only authority", async () => {
    const codexToken = await token({ common_name: "codex-primary.access", sub: "" });
    const proposed = await apiRequest("/v1/projects", codexToken, {
      body: { originator_id: "codex", slug: `identity-${crypto.randomUUID()}`, title: "Identity proof" },
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });
    expect(proposed.status).toBe(201);
    const project = await proposed.json() as { id: string };

    const activity = await apiRequest("/v1/activity", codexToken);
    expect(await activity.json()).toMatchObject({
      activity: expect.arrayContaining([
        expect.objectContaining({
          actor: { id: "codex" },
          principal: {
            issuer,
            kind: "service",
            provider: "cloudflare_access",
            subject: "codex-primary.access",
          },
          project_id: project.id,
          type: "project.proposed",
        }),
      ]),
    });

    const denied = await apiRequest(`/v1/projects/${project.id}/authorize`, codexToken, {
      body: authorizationBody("No impersonation"),
      headers: { "Idempotency-Key": crypto.randomUUID(), "If-Match": '"1"' },
    });
    expect(denied.status).toBe(403);
  });

  it("denies accepting or fulfilling another actor's request", async () => {
    const codexToken = await token({ common_name: "codex-primary.access", sub: "" });
    const projectId = await activeCodexProject(codexToken);
    const requested = await apiRequest(`/v1/projects/${projectId}/requests`, codexToken, {
      body: { recipient_id: "claude", title: "Review identity", detail: "Prove recipient authority" },
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });
    expect(requested.status).toBe(201);
    const workRequest = await requested.json() as { id: string };
    expect((await apiRequest(`/v1/requests/${workRequest.id}/accept`, codexToken, {
      body: {},
      headers: { "Idempotency-Key": crypto.randomUUID(), "If-Match": '"1"' },
    })).status).toBe(403);

    const claudeToken = await token({ common_name: "claude-primary.access", sub: "" });
    expect((await apiRequest(`/v1/requests/${workRequest.id}/accept`, claudeToken, {
      body: {},
      headers: { "Idempotency-Key": crypto.randomUUID(), "If-Match": '"1"' },
    })).status).toBe(200);
    expect((await apiRequest(`/v1/requests/${workRequest.id}/fulfill`, codexToken, {
      body: { evidence: [] },
      headers: { "Idempotency-Key": crypto.randomUUID(), "If-Match": '"2"' },
    })).status).toBe(403);
  });

  it("requires same-origin browser mutations while allowing non-browser service requests", async () => {
    const humanToken = await token({ sub: "human-shane" });
    const body = { originator_id: "shane", slug: `csrf-${crypto.randomUUID()}`, title: "CSRF proof" };
    const headers = { "Idempotency-Key": crypto.randomUUID() };
    expect((await apiRequest("/v1/projects", humanToken, { body, headers })).status).toBe(403);
    expect((await apiRequest("/v1/projects", humanToken, { body, headers: { ...headers, Origin: "https://evil.test" } })).status).toBe(403);
    expect((await apiRequest("/v1/projects", humanToken, {
      body,
      headers: { ...headers, "Content-Type": "text/plain", Origin: "https://fleet.test" },
    })).status).toBe(403);
    expect((await apiRequest("/v1/projects", humanToken, { body, headers: { ...headers, Origin: "https://fleet.test" } })).status).toBe(201);

    const serviceToken = await token({ common_name: "codex-primary.access", sub: "" });
    const service = await apiRequest("/v1/projects", serviceToken, {
      body: { originator_id: "codex", slug: `service-${crypto.randomUUID()}`, title: "Service request" },
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });
    expect(service.status).toBe(201);
  });
});
