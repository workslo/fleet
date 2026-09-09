import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Request lifecycle migration", () => {
  it("preserves populated legacy requests, source links, scope, evidence and activity without inventing endings", async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS.slice(0, 5));
    const migration = env.TEST_MIGRATIONS[5];
    if (!migration) throw new Error("Request lifecycle migration is required");
    const scope = JSON.stringify({ title: "Shared review", detail: "Frozen detail", artifact: null });
    await env.DB.batch([
      env.DB.prepare("INSERT INTO work_requests (id, requester_id, recipient_id, title, detail) VALUES ('legacy-pending', 'codex', 'juniorslo', 'Pending review', 'Original invitation')"),
      env.DB.prepare("INSERT INTO work_requests (id, requester_id, recipient_id, title, detail, state, version, accepted_scope_json, accepted_at) VALUES ('legacy-accepted', 'codex', 'juniorslo', 'Shared review', 'Frozen detail', 'Accepted', 2, ?, '2026-09-01T00:00:00Z')").bind(scope),
      env.DB.prepare("INSERT INTO work_requests (id, requester_id, recipient_id, title, detail, state, version, accepted_scope_json, accepted_at, fulfilled_at) VALUES ('legacy-fulfilled', 'codex', 'juniorslo', 'Shared review', 'Frozen detail', 'Fulfilled', 3, ?, '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z')").bind(scope),
      env.DB.prepare("INSERT INTO evidence_links (request_id, actor_id, uri, summary) VALUES ('legacy-fulfilled', 'juniorslo', 'https://example.test/review', 'Original evidence')"),
      env.DB.prepare("INSERT INTO activity_events (request_id, actor_id, type, payload_json, principal_legacy) VALUES ('legacy-fulfilled', 'juniorslo', 'work_request.fulfilled', '{}', 1)"),
      env.DB.prepare("INSERT INTO decision_requests (id, work_request_id, requester_id, question, resolution_condition) VALUES ('legacy-need', 'legacy-accepted', 'juniorslo', 'Enable access', 'Access exists')"),
    ]);
    const before = (await env.DB.prepare("SELECT * FROM work_requests ORDER BY id").all()).results;
    const evidence = (await env.DB.prepare("SELECT * FROM evidence_links ORDER BY id").all()).results;
    const activity = (await env.DB.prepare("SELECT * FROM activity_events ORDER BY id").all()).results;
    await applyD1Migrations(env.DB, [migration]);
    const after = (await env.DB.prepare("SELECT * FROM work_requests ORDER BY id").all()).results;
    expect(after).toEqual(before.map((row) => ({ ...row, expires_at: null, resolution_json: null, blocker_json: null, ended_at: null })));
    expect((await env.DB.prepare("SELECT * FROM evidence_links ORDER BY id").all()).results).toEqual(evidence);
    expect((await env.DB.prepare("SELECT * FROM activity_events ORDER BY id").all()).results).toEqual(activity);
    expect(await env.DB.prepare("SELECT work_request_id FROM decision_requests WHERE id = 'legacy-need'").first()).toEqual({ work_request_id: "legacy-accepted" });
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
    await expect(env.DB.prepare("UPDATE work_requests SET expires_at = '2099-01-01T00:00:00.000Z' WHERE id = 'legacy-pending'").run()).rejects.toThrow(/immutable/);
    await expect(env.DB.prepare("UPDATE work_requests SET accepted_scope_json = '{}' WHERE id = 'legacy-accepted'").run()).rejects.toThrow(/immutable/);
    await expect(env.DB.prepare("UPDATE activity_events SET type = 'changed'").run()).rejects.toThrow(/append only/);
  });
});
