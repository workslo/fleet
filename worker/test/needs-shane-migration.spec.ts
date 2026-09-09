import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { describe, expect, it } from "vitest";

declare global {
  namespace Cloudflare {
    interface Env { TEST_MIGRATIONS: D1Migration[] }
  }
}

describe("Needs Shane migration", () => {
  it("preserves legacy questions, state, unknown provenance, activity cursors and foreign keys", async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS.slice(0, 4));
    const migration = env.TEST_MIGRATIONS[4];
    if (!migration) throw new Error("Needs Shane migration is required");
    await env.DB.batch([
      env.DB.prepare("INSERT INTO projects (id, slug, title, originator_id, submitter_id, state) VALUES ('old-project', 'old-project', 'Existing work', 'codex', 'codex', 'Proposed')"),
      env.DB.prepare("INSERT INTO decision_requests (id, project_id, question, state, created_at) VALUES ('old-pending', 'old-project', 'Original question', 'Pending', '2026-08-31T00:00:00Z')"),
      env.DB.prepare("INSERT INTO decision_requests (id, project_id, question, state, created_at) VALUES ('old-resolved', 'old-project', 'Earlier decision', 'Resolved', '2026-08-31T00:00:01Z')"),
      env.DB.prepare("INSERT INTO activity_events (project_id, actor_id, type, payload_json, principal_legacy) VALUES ('old-project', 'codex', 'project.created', '{}', 1)"),
    ]);
    const before = (await env.DB.prepare("SELECT * FROM activity_events ORDER BY id").all()).results;
    await applyD1Migrations(env.DB, [migration]);
    const rows = (await env.DB.prepare("SELECT * FROM decision_requests ORDER BY created_at").all()).results;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: "old-pending", question: "Original question", state: "Pending", requester_id: null, decision_json: null, action_json: null, resolution_condition: null, created_at: "2026-08-31T00:00:00Z", updated_at: "2026-08-31T00:00:00Z", version: 1 });
    expect(rows[1]).toMatchObject({ id: "old-resolved", state: "Resolved", decision_json: null, requester_id: null });
    expect((await env.DB.prepare("SELECT * FROM activity_events ORDER BY id").all()).results).toEqual(before);
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
    await expect(env.DB.prepare("UPDATE activity_events SET type = 'changed'").run()).rejects.toThrow(/append only/);
    await expect(env.DB.prepare("DELETE FROM activity_events").run()).rejects.toThrow(/append only/);
    await expect(env.DB.prepare("UPDATE decision_requests SET question = 'Changed scope' WHERE id = 'old-pending'").run()).rejects.toThrow(/immutable/);
    await env.DB.prepare("INSERT INTO work_requests (id, requester_id, recipient_id, title, detail) VALUES ('standalone-source', 'codex', 'claude', 'Review', 'Review scope')").run();
    await expect(env.DB.prepare("INSERT INTO decision_requests (id, project_id, work_request_id, question) VALUES ('mismatch', 'old-project', 'standalone-source', 'Mismatched source')").run()).rejects.toThrow(/association/);
    await env.DB.prepare("INSERT INTO decision_requests (id, work_request_id, requester_id, kind, question, resolution_condition) VALUES ('linked', 'standalone-source', 'codex', 'action', 'Enable access', 'Access exists')").run();
    expect(await env.DB.prepare("SELECT project_id, work_request_id FROM decision_requests WHERE id = 'linked'").first()).toEqual({ project_id: null, work_request_id: "standalone-source" });
  });
});
