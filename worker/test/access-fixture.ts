import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { vi } from "vitest";

export const testAccessIssuer = "https://fleet-test.cloudflareaccess.com";
export const testAccessAudience = "fleet-test-audience";
const jwksUrl = `${testAccessIssuer}/cdn-cgi/access/certs`;
const keyId = "fleet-domain-test-key";
const keyPair = await generateKeyPair("RS256", { extractable: true });
const publicJwk = { ...await exportJWK(keyPair.publicKey), alg: "RS256", kid: keyId, use: "sig" };

vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
  if (String(input) !== jwksUrl) throw new Error(`unexpected outbound request: ${String(input)}`);
  return Response.json({ keys: [publicJwk] });
}));

export function testPrincipal(actorId: string): { kind: "human" | "service"; subject: string } {
  return actorId === "shane"
    ? { kind: "human", subject: "test-human-shane" }
    : { kind: "service", subject: `${actorId}-test.access` };
}

export async function accessHeaders(actorId: string): Promise<Headers> {
  const now = Math.floor(Date.now() / 1_000);
  const principal = testPrincipal(actorId);
  const claims = principal.kind === "human"
    ? { sub: principal.subject, type: "app" }
    : { common_name: principal.subject, sub: "", type: "app" };
  const token = await new SignJWT(claims)
    // Real Access application tokens carry no `typ` header.
    .setProtectedHeader({ alg: "RS256", kid: keyId })
    .setIssuer(testAccessIssuer)
    .setAudience(testAccessAudience)
    .setIssuedAt(now)
    .setNotBefore(now - 5)
    .setExpirationTime(now + 300)
    .sign(keyPair.privateKey);
  return new Headers({ "Cf-Access-Jwt-Assertion": token });
}
