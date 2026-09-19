import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// The D1 floor under the Worker's refusal (workslo/fleet#8). The gate can be bypassed by
// an import, a recovery replay or a direct INSERT; the trigger cannot. This asserts both
// halves — that it fires, and that it is additive: no existing row is rewritten, and a
// row that was already self-addressed before the migration is preserved rather than
// silently dropped, because rewriting production history to enforce a new invariant is a
// different decision from refusing new violations.

describe("Self-addressed request migration", () => {
  it("rejects new self-addressed rows, leaves existing rows untouched, and keeps the update path closed", async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS.slice(0, 6));
    const migration = env.TEST_MIGRATIONS[6];
    if (!migration) throw new Error("Self-addressed request migration is required");

    await env.DB.batch([
      env.DB.prepare("INSERT INTO work_requests (id, requester_id, recipient_id, title, detail) VALUES ('legacy-pair', 'codex', 'juniorslo', 'Shared review', 'Bounded ask')"),
      // Written while nothing forbade it. It is history, not a new violation.
      env.DB.prepare("INSERT INTO work_requests (id, requester_id, recipient_id, title, detail) VALUES ('legacy-self', 'codex', 'codex', 'Self ask', 'Predates the rule')"),
    ]);
    const before = (await env.DB.prepare("SELECT * FROM work_requests ORDER BY id").all()).results;

    await applyD1Migrations(env.DB, [migration]);

    expect((await env.DB.prepare("SELECT * FROM work_requests ORDER BY id").all()).results).toEqual(before);
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);

    // Fires on a direct insert, whatever else the row looks like.
    await expect(env.DB.prepare(
      "INSERT INTO work_requests (id, requester_id, recipient_id, title, detail) VALUES ('new-self', 'claude', 'claude', 'Self ask', 'Blocked')",
    ).run()).rejects.toThrow(/addressed to another actor/);
    await expect(env.DB.prepare(
      "INSERT INTO work_requests (id, requester_id, recipient_id, title, detail, state, accepted_scope_json) VALUES ('new-self-accepted', 'claude', 'claude', 'Self ask', 'Blocked', 'Accepted', '{}')",
    ).run()).rejects.toThrow(/addressed to another actor/);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM work_requests WHERE id LIKE 'new-self%'").first()).toEqual({ n: 0 });

    // Known-good: the trigger must not refuse an ordinary pair, or it is an outage.
    await env.DB.prepare(
      "INSERT INTO work_requests (id, requester_id, recipient_id, title, detail) VALUES ('new-pair', 'claude', 'codex', 'Shared review', 'Bounded ask')",
    ).run();
    expect(await env.DB.prepare("SELECT requester_id, recipient_id FROM work_requests WHERE id = 'new-pair'").first())
      .toEqual({ requester_id: "claude", recipient_id: "codex" });

    // The other way in is UPDATE, and 0006 already closed it. Asserted here so the two
    // migrations are known to cover the whole surface between them.
    await expect(env.DB.prepare("UPDATE work_requests SET recipient_id = 'claude' WHERE id = 'new-pair'").run())
      .rejects.toThrow(/immutable/);
    await expect(env.DB.prepare("UPDATE work_requests SET requester_id = 'codex' WHERE id = 'new-pair'").run())
      .rejects.toThrow(/immutable/);
  });
});
