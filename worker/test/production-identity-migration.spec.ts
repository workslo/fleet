import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { testAccessIssuer } from "./access-fixture";

describe("production identity migration constraints", () => {
  it("requires human identity for Shane and service identity for agent actors", async () => {
    await expect(env.DB.prepare(
      "INSERT INTO actor_principals (provider, issuer, kind, subject, actor_id) VALUES ('cloudflare_access', ?, 'service', ?, 'shane')",
    ).bind(testAccessIssuer, `shane-service-${crypto.randomUUID()}`).run()).rejects.toThrow();
    await expect(env.DB.prepare(
      "INSERT INTO actor_principals (provider, issuer, kind, subject, actor_id) VALUES ('cloudflare_access', ?, 'human', ?, 'codex')",
    ).bind(testAccessIssuer, `codex-human-${crypto.randomUUID()}`).run()).rejects.toThrow();

    const subject = `codex-service-${crypto.randomUUID()}`;
    await env.DB.prepare(
      "INSERT INTO actor_principals (provider, issuer, kind, subject, actor_id) VALUES ('cloudflare_access', ?, 'service', ?, 'codex')",
    ).bind(testAccessIssuer, subject).run();
    await expect(env.DB.prepare(
      "UPDATE actor_principals SET actor_id = 'shane' WHERE provider = 'cloudflare_access' AND issuer = ? AND kind = 'service' AND subject = ?",
    ).bind(testAccessIssuer, subject).run()).rejects.toThrow();
  });

  it("accepts legacy-null provenance but rejects incomplete provenance", async () => {
    const projectId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO projects (id, slug, title, originator_id, submitter_id, state) VALUES (?, ?, 'Migration proof', 'codex', 'codex', 'Proposed')",
    ).bind(projectId, `migration-${projectId}`).run();
    await env.DB.prepare(
      "INSERT INTO activity_events (project_id, actor_id, type, payload_json, principal_legacy) VALUES (?, 'codex', 'migration.legacy', '{}', 1)",
    ).bind(projectId).run();
    await expect(env.DB.prepare(
      "INSERT INTO activity_events (project_id, actor_id, type, payload_json) VALUES (?, 'codex', 'migration.unmarked', '{}')",
    ).bind(projectId).run()).rejects.toThrow();
    await expect(env.DB.prepare(
      "INSERT INTO activity_events (project_id, actor_id, principal_provider, type, payload_json) VALUES (?, 'codex', 'cloudflare_access', 'migration.invalid', '{}')",
    ).bind(projectId).run()).rejects.toThrow();
    await expect(env.DB.prepare(
      "UPDATE activity_events SET principal_subject = 'changed' WHERE project_id = ? AND type = 'migration.legacy'",
    ).bind(projectId).run()).rejects.toThrow();
    await expect(env.DB.prepare(
      "DELETE FROM activity_events WHERE project_id = ? AND type = 'migration.legacy'",
    ).bind(projectId).run()).rejects.toThrow();
  });
});
