import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

const projectId = "migration-project";
const requestId = "migration-request";
const blankRequestId = "migration-blank-request";
type ActivityDigest = {
  id: number;
  project_id: string | null;
  actor_id: string;
  type: string;
  payload_json: string;
  created_at: string;
  principal_provider: string | null;
  principal_issuer: string | null;
  principal_kind: string | null;
  principal_subject: string | null;
  principal_legacy: number;
};
let activityBefore: ActivityDigest[] = [];

beforeAll(async () => {
  const schemaAndIndexes = env.TEST_MIGRATIONS.slice(0, 2);
  const productionIdentityMigration = env.TEST_MIGRATIONS.at(2);
  const standaloneMigration = env.TEST_MIGRATIONS.at(3);
  if (schemaAndIndexes.length !== 2 || !productionIdentityMigration || !standaloneMigration) {
    throw new Error("expected three foundation migrations followed by the standalone migration");
  }

  await applyD1Migrations(env.DB, schemaAndIndexes);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO projects (id, slug, title, originator_id, submitter_id, owner_id, state) VALUES (?, ?, 'Migration fixture', 'shane', 'shane', 'codex', 'Active')",
    ).bind(projectId, projectId),
    env.DB.prepare(
      "INSERT INTO activity_events (project_id, actor_id, type, payload_json, created_at) VALUES (?, 'codex', 'project.created', '{}', '2026-09-06T23:59:00Z')",
    ).bind(projectId),
  ]);

  await applyD1Migrations(env.DB, [productionIdentityMigration]);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO work_requests (id, project_id, requester_id, recipient_id, title, detail, state, version, accepted_at) VALUES (?, ?, 'codex', 'claude', 'Review migration', 'Preserve this accepted request', 'Accepted', 2, '2026-09-07T00:00:00Z')",
    ).bind(requestId, projectId),
    env.DB.prepare(
      "INSERT INTO work_requests (id, project_id, requester_id, recipient_id, title, detail) VALUES (?, ?, 'codex', 'claude', '', '   ')",
    ).bind(blankRequestId, projectId),
    env.DB.prepare(
      "INSERT INTO evidence_links (project_id, request_id, actor_id, uri, summary) VALUES (?, ?, 'claude', 'https://example.test/pre-upgrade', 'Pre-upgrade evidence')",
    ).bind(projectId, requestId),
    env.DB.prepare(
      `INSERT INTO activity_events
        (project_id, actor_id, type, payload_json, principal_provider, principal_issuer, principal_kind, principal_subject)
       VALUES (?, 'claude', 'work_request.accepted', ?, 'cloudflare_access', 'https://fleet-test.cloudflareaccess.com', 'service', 'claude-test.access')`,
    ).bind(projectId, JSON.stringify({ request_id: requestId })),
  ]);

  activityBefore = (await env.DB.prepare(
    `SELECT id, project_id, actor_id, type, payload_json, created_at,
            principal_provider, principal_issuer, principal_kind, principal_subject, principal_legacy
       FROM activity_events ORDER BY id ASC`,
  ).all<ActivityDigest>()).results;
  await applyD1Migrations(env.DB, [standaloneMigration]);
});

describe("standalone request migration", () => {
  it("preserves nonempty request history, protections, indexes, cursors, and foreign keys", async () => {
    const request = await env.DB.prepare(
      "SELECT project_id, state, version, accepted_scope_json FROM work_requests WHERE id = ?",
    ).bind(requestId).first<{ project_id: string; state: string; version: number; accepted_scope_json: string }>();
    expect(request).toMatchObject({ project_id: projectId, state: "Accepted", version: 2 });
    expect(JSON.parse(request?.accepted_scope_json ?? "null")).toEqual({
      title: "Review migration",
      detail: "Preserve this accepted request",
      artifact: null,
    });
    expect(await env.DB.prepare(
      "SELECT title, detail, state FROM work_requests WHERE id = ?",
    ).bind(blankRequestId).first()).toEqual({ title: "", detail: "   ", state: "Pending" });

    expect(await env.DB.prepare(
      "SELECT project_id, request_id, actor_id, uri, summary FROM evidence_links WHERE request_id = ?",
    ).bind(requestId).first()).toMatchObject({
      project_id: projectId,
      request_id: requestId,
      actor_id: "claude",
      uri: "https://example.test/pre-upgrade",
      summary: "Pre-upgrade evidence",
    });

    const activityAfter = (await env.DB.prepare(
      `SELECT id, project_id, actor_id, type, payload_json, created_at,
              principal_provider, principal_issuer, principal_kind, principal_subject, principal_legacy
         FROM activity_events ORDER BY id ASC`,
    ).all<ActivityDigest>()).results;
    expect(activityAfter).toEqual(activityBefore);
    expect(activityAfter.at(-1)?.id).toBe(activityBefore.at(-1)?.id);
    expect(activityAfter.filter((row) => row.principal_legacy === 1)).toHaveLength(1);
    expect(activityAfter.filter((row) => row.principal_legacy === 0)).toHaveLength(1);
    expect(await env.DB.prepare(
      "SELECT request_id, principal_provider, principal_kind, principal_subject FROM activity_events WHERE json_extract(payload_json, '$.request_id') = ?",
    ).bind(requestId).first()).toMatchObject({
      request_id: requestId,
      principal_provider: "cloudflare_access",
      principal_kind: "service",
      principal_subject: "claude-test.access",
    });

    const workIndexes = await env.DB.prepare("PRAGMA index_list('work_requests')").all<{ name: string }>();
    expect(workIndexes.results.map((index) => index.name)).toEqual(expect.arrayContaining([
      "idx_work_requests_project_id",
      "idx_work_requests_recipient_id",
      "idx_work_requests_requester_id",
    ]));
    const activityIndexes = await env.DB.prepare("PRAGMA index_list('activity_events')").all<{ name: string }>();
    expect(activityIndexes.results.map((index) => index.name)).toEqual(expect.arrayContaining([
      "idx_activity_events_project_id",
      "idx_activity_events_request_id",
    ]));
    const evidenceIndexes = await env.DB.prepare("PRAGMA index_list('evidence_links')").all<{ name: string }>();
    expect(evidenceIndexes.results.map((index) => index.name)).toEqual(expect.arrayContaining([
      "idx_evidence_links_project_id",
      "idx_evidence_links_request_id",
    ]));
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);

    await expect(env.DB.prepare(
      "UPDATE activity_events SET principal_subject = 'changed' WHERE json_extract(payload_json, '$.request_id') = ?",
    ).bind(requestId).run()).rejects.toThrow(/append only/);
    await expect(env.DB.prepare(
      "DELETE FROM activity_events WHERE json_extract(payload_json, '$.request_id') = ?",
    ).bind(requestId).run()).rejects.toThrow(/append only/);
    await expect(env.DB.prepare(
      "INSERT INTO activity_events (project_id, actor_id, type, payload_json) VALUES (?, 'codex', 'migration.invalid', '{}')",
    ).bind(projectId).run()).rejects.toThrow(/principal provenance/);
    await expect(env.DB.prepare(
      `INSERT INTO activity_events
        (project_id, request_id, actor_id, type, payload_json, principal_provider, principal_issuer, principal_kind, principal_subject)
       VALUES (NULL, NULL, 'codex', 'standalone.invalid', '{}', 'cloudflare_access', 'https://fleet-test.cloudflareaccess.com', 'service', 'codex-test.access')`,
    ).run()).rejects.toThrow(/CHECK constraint/);
    await env.DB.prepare(
      "INSERT INTO activity_events (project_id, actor_id, type, payload_json, principal_legacy) VALUES (?, 'codex', 'migration.legacy_after', '{}', 1)",
    ).bind(projectId).run();
    await expect(env.DB.prepare(
      "INSERT INTO evidence_links (project_id, request_id, actor_id, uri, summary) VALUES (NULL, NULL, 'claude', 'https://example.test/orphan', 'Orphan')",
    ).run()).rejects.toThrow(/CHECK constraint/);
    await expect(env.DB.prepare(
      "INSERT INTO work_requests (id, project_id, requester_id, recipient_id, title, detail, artifact_uri) VALUES ('half-artifact-uri', NULL, 'codex', 'claude', 'Half artifact', 'Reject partial metadata', 'https://example.test/half')",
    ).run()).rejects.toThrow(/CHECK constraint/);
    await expect(env.DB.prepare(
      "INSERT INTO work_requests (id, project_id, requester_id, recipient_id, title, detail, artifact_summary) VALUES ('half-artifact-summary', NULL, 'codex', 'claude', 'Half artifact', 'Reject partial metadata', 'Missing URI')",
    ).run()).rejects.toThrow(/CHECK constraint/);

    const standaloneId = "post-migration-standalone";
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO work_requests (id, project_id, requester_id, recipient_id, title, detail) VALUES (?, NULL, 'codex', 'claude', 'Standalone review', 'No project association')",
      ).bind(standaloneId),
      env.DB.prepare(
        `INSERT INTO activity_events
          (project_id, request_id, actor_id, type, payload_json, principal_provider, principal_issuer, principal_kind, principal_subject)
         VALUES (NULL, ?, 'codex', 'work_request.created', ?, 'cloudflare_access', 'https://fleet-test.cloudflareaccess.com', 'service', 'codex-test.access')`,
      ).bind(standaloneId, JSON.stringify({ request_id: standaloneId })),
      env.DB.prepare(
        "INSERT INTO evidence_links (project_id, request_id, actor_id, uri, summary) VALUES (NULL, ?, 'claude', 'https://example.test/standalone', 'Standalone evidence')",
      ).bind(standaloneId),
    ]);
    await expect(env.DB.prepare(
      "INSERT INTO evidence_links (project_id, request_id, actor_id, uri, summary) VALUES (?, ?, 'claude', 'https://example.test/mismatch', 'Mismatched evidence')",
    ).bind(projectId, standaloneId).run()).rejects.toThrow(/project association must match/);
    await expect(env.DB.prepare(
      "INSERT INTO work_requests (id, project_id, requester_id, recipient_id, title, detail, state) VALUES ('returned-without-scope', NULL, 'codex', 'claude', 'Returned', 'Missing scope', 'Returned')",
    ).run()).rejects.toThrow(/CHECK constraint/);
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO work_requests (id, project_id, requester_id, recipient_id, title, detail, accepted_scope_json, state) VALUES ('returned-with-scope', NULL, 'codex', 'claude', 'Returned', 'Preserved scope', json_object('title', 'Returned', 'detail', 'Preserved scope', 'artifact', NULL), 'Returned')",
      ),
      env.DB.prepare(
        "INSERT INTO work_requests (id, project_id, requester_id, recipient_id, title, detail, state) VALUES ('expired-request', NULL, 'codex', 'claude', 'Expired', 'No obligation', 'Expired')",
      ),
    ]);
    const lastBefore = activityBefore.at(-1)?.id ?? 0;
    const later = await env.DB.prepare(
      "SELECT id, request_id FROM activity_events WHERE id > ? AND request_id = ? ORDER BY id ASC",
    ).bind(lastBefore, standaloneId).all<{ id: number; request_id: string }>();
    expect(later.results).toHaveLength(1);
    expect(later.results[0]?.id).toBeGreaterThan(lastBefore);
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });
});
