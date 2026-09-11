import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { canonical, digest, persistence, requireCondition } from "./recovery-local.mjs";

export async function snapshotDatabase(run, side) {
  const directory = join(persistence(run, side), "v3/d1/miniflare-D1DatabaseObject");
  const files = (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isFile() && /^[a-f0-9]+\.sqlite$/.test(entry.name));
  requireCondition(files.length === 1, "Expected exactly one local D1 data file");
  const db = new DatabaseSync(join(directory, files[0].name), { readOnly: true });
  try {
    const schema = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name <> '_cf_METADATA' AND tbl_name <> '_cf_METADATA' ORDER BY type, name").all();
    const tables = [];
    for (const entry of schema.filter((item) => item.type === "table")) {
      const query = db.prepare(`SELECT * FROM "${entry.name.replaceAll('"', '""')}"`);
      query.setReadBigInts(true);
      const rows = query.all().map((row) => JSON.stringify(canonical(row))).sort();
      tables.push({ name: entry.name, rows: rows.length, sha256: digest(rows) });
    }
    const foreignKeys = db.prepare("PRAGMA foreign_key_check").all();
    const integrity = db.prepare("PRAGMA integrity_check").all();
    requireCondition(foreignKeys.length === 0, "Foreign-key violations found in local recovery database");
    requireCondition(integrity.length === 1 && integrity[0].integrity_check === "ok", "Local recovery database failed integrity_check");
    const sequences = db.prepare("SELECT name, seq FROM sqlite_sequence ORDER BY name").all();
    return {
      schema, schema_sha256: digest(schema), tables, rows_sha256: digest(tables), sequences,
      foreign_key_violations: 0, integrity_check: "ok",
      excluded: [{ name: "_cf_METADATA", reason: "Miniflare engine bookkeeping, not exported Fleet application data. All other tables, implicit indexes, and sqlite_sequence are included." }],
    };
  } finally { db.close(); }
}

export function compareSnapshots(source, restored) {
  requireCondition(source.schema_sha256 === restored.schema_sha256, "Restored tables, indexes, or triggers differ from the export source");
  requireCondition(source.rows_sha256 === restored.rows_sha256, "Restored row counts or contents differ from the export source");
  requireCondition(digest(source.sequences) === digest(restored.sequences), "Restored AUTOINCREMENT high-water marks differ");
}

export async function verifyRestoredConstraints(db, fixture) {
  const attempts = [
    ["activity update", "UPDATE activity_events SET type = 'tampered' WHERE id = (SELECT MIN(id) FROM activity_events)", [], "activity events are append only"],
    ["activity delete", "DELETE FROM activity_events WHERE id = (SELECT MIN(id) FROM activity_events)", [], "activity events are append only"],
    ["incomplete activity provenance", "INSERT INTO activity_events (project_id, actor_id, type, payload_json) VALUES (?, 'codex', 'invalid', '{}')", [fixture.project.id], "activity principal provenance must be complete or legacy-null"],
    ["accepted scope immutable", "UPDATE work_requests SET accepted_scope_json = '{}' WHERE id = ?", [fixture.blocked.id], "request agreement and disclosed expiry are immutable"],
    ["deadline immutable", "UPDATE work_requests SET expires_at = '2099-01-01T00:00:00Z' WHERE id = ?", [fixture.blocked.id], "request agreement and disclosed expiry are immutable"],
    ["principal kind authority", "INSERT INTO actor_principals (provider,issuer,kind,subject,actor_id) VALUES ('cloudflare_access','https://fixture.cloudflareaccess.com','service','invalid-shane','shane')", [], "principal kind does not match the Fleet actor"],
  ];
  for (const [name, sql, values, expectedError] of attempts) {
    let rejected = false;
    try { await db.prepare(sql).bind(...values).run(); } catch (error) {
      requireCondition(error instanceof Error && error.message.includes(expectedError), `Unexpected failure while probing restored invariant: ${name}`);
      rejected = true;
    }
    requireCondition(rejected, `Restored invariant failed: ${name}`);
  }
  return attempts.map(([name]) => ({ name, rejected: true }));
}
