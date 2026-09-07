import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { testAccessIssuer } from "./access-fixture";

describe("production identity migration constraints", () => {
  it("prevents service principals from mapping to Shane on insert or update", async () => {
    await expect(env.DB.prepare(
      "INSERT INTO actor_principals (provider, issuer, kind, subject, actor_id) VALUES ('cloudflare_access', ?, 'service', ?, 'shane')",
    ).bind(testAccessIssuer, `shane-service-${crypto.randomUUID()}`).run()).rejects.toThrow();

    const subject = `codex-service-${crypto.randomUUID()}`;
    await env.DB.prepare(
      "INSERT INTO actor_principals (provider, issuer, kind, subject, actor_id) VALUES ('cloudflare_access', ?, 'service', ?, 'codex')",
    ).bind(testAccessIssuer, subject).run();
    await expect(env.DB.prepare(
      "UPDATE actor_principals SET actor_id = 'shane' WHERE provider = 'cloudflare_access' AND issuer = ? AND kind = 'service' AND subject = ?",
    ).bind(testAccessIssuer, subject).run()).rejects.toThrow();
  });
});
