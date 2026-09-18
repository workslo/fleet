import { env, exports } from "cloudflare:workers";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const issuer = "https://fleet-jwks.cloudflareaccess.com";
const audience = "fleet-test-audience";
const jwksUrl = `${issuer}/cdn-cgi/access/certs`;
const keyId = "fleet-jwks-test-key";
const subject = "codex-cache.access";

let accessToken: string;
let publicJwk: JWK;

function identity(): Promise<Response> {
  return exports.default.fetch("https://fleet.test/v1/me", {
    headers: { "Cf-Access-Jwt-Assertion": accessToken },
  });
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  publicJwk = { ...await exportJWK(pair.publicKey), alg: "RS256", kid: keyId, use: "sig" };
  const now = Math.floor(Date.now() / 1_000);
  accessToken = await new SignJWT({ common_name: subject, sub: "", type: "app" })
    .setProtectedHeader({ alg: "RS256", kid: keyId })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt(now)
    .setNotBefore(now - 5)
    .setExpirationTime(now + 300)
    .sign(pair.privateKey);
  await env.DB.prepare(
    "INSERT INTO actor_principals (provider, issuer, kind, subject, actor_id) VALUES ('cloudflare_access', ?, 'service', ?, 'codex')",
  ).bind(issuer, subject).run();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("Cloudflare Access JWKS availability", () => {
  it("reports remote failures and reuses a successfully loaded key set", async () => {
    let attempt = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) !== jwksUrl) throw new Error(`unexpected outbound request: ${String(input)}`);
      attempt += 1;
      if (attempt === 1) throw new Error("network unavailable");
      if (attempt === 2) return new Response("unavailable", { status: 502 });
      if (attempt === 3) return new Response("not-json", { status: 200 });
      if (attempt === 4) return Response.json({ keys: [publicJwk] });
      throw new TypeError("JWKS unavailable");
    }));
    expect((await identity()).status).toBe(503);
    expect((await identity()).status).toBe(503);
    expect((await identity()).status).toBe(503);
    const loaded = await identity();
    expect(loaded.status).toBe(200);
    expect(await loaded.json()).toMatchObject({ actor: { id: "codex" } });
    expect((await identity()).status).toBe(200);
  });
});
