import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { accessHeaders } from "./access-fixture";

// workslo/fleet#8. A Work Request is a bounded ask from one agent to another. Before
// this guard an authenticated actor could address one to itself, accept it as itself,
// and manufacture an accepted_request obligation with no second party in it — the same
// shape as failures/self-addressed-mail.md in fleet-home-claude, one surface down.

const ask = { title: "Review a shared artifact", detail: "Return a bounded review of the linked draft." };

async function post(actor: string, path: string, body: unknown, key = crypto.randomUUID()) {
  const headers = await accessHeaders(actor);
  headers.set("Content-Type", "application/json");
  headers.set("Idempotency-Key", key);
  if (actor === "shane") headers.set("Origin", "https://fleet.test");
  return exports.default.fetch(`https://fleet.test${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

async function get(actor: string, path: string) {
  return exports.default.fetch(`https://fleet.test${path}`, { headers: await accessHeaders(actor) });
}

async function workSnapshot(actor: string) {
  const response = await get(actor, "/v1/me/work");
  expect(response.status).toBe(200);
  return response.json();
}

async function transition(actor: string, id: string, action: string, version: number, body: unknown = {}) {
  const headers = await accessHeaders(actor);
  headers.set("Content-Type", "application/json");
  headers.set("Idempotency-Key", crypto.randomUUID());
  headers.set("If-Match", `"${version}"`);
  return exports.default.fetch(`https://fleet.test/v1/requests/${id}/${action}`, { method: "POST", headers, body: JSON.stringify(body) });
}

async function obligationIds(actor: string) {
  const work = await workSnapshot(actor) as { obligations: { source: string; request_id?: string }[] };
  return work.obligations.map((entry) => entry.request_id);
}

// Setup only. Migration 0007 is insert-scoped and preserves rows that predate it, so the only
// honest way to stage one of those rows is to lift the shipped trigger, insert, and put it back.
// The trigger is read from sqlite_master rather than retyped here, so this setup cannot drift
// from the migration it is reasoning about; the last assertion proves the floor came back.
async function preservedSelfAddressedRequest(actor: string, state: "Pending" | "Accepted" = "Pending") {
  const trigger = await env.DB.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'work_request_recipient_is_not_requester'",
  ).first<{ sql: string }>();
  expect(trigger?.sql).toBeTruthy();
  const id = `preserved-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await env.DB.prepare("DROP TRIGGER work_request_recipient_is_not_requester").run();
  await env.DB.prepare(
    `INSERT INTO work_requests (id, project_id, requester_id, recipient_id, title, detail, state, version, created_at, updated_at)
     VALUES (?, NULL, ?, ?, ?, ?, 'Pending', 1, ?, ?)`,
  ).bind(id, actor, actor, ask.title, ask.detail, now, now).run();
  await env.DB.prepare(trigger!.sql).run();
  if (state === "Accepted") {
    await env.DB.prepare("UPDATE work_requests SET state = 'Accepted', accepted_at = ?, accepted_scope_json = ? WHERE id = ?")
      .bind(now, JSON.stringify({ title: ask.title, detail: ask.detail, artifact: null }), id).run();
  }
  await expect(env.DB.prepare(
    `INSERT INTO work_requests (id, requester_id, recipient_id, title, detail, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(`${id}-floor`, actor, actor, ask.title, ask.detail, now, now).run()).rejects.toThrow();
  return id;
}

describe("Self-addressed Work Requests", () => {
  it("refuses every self-addressed create with a stable 400 and stores nothing", async () => {
    for (const actor of ["codex", "claude", "juniorslo", "agentslo"]) {
      const before = await workSnapshot(actor);
      const response = await post(actor, "/v1/requests", { ...ask, recipient_id: actor });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "invalid_request",
        message: "recipient_id must name a different actor; self-claimed work is not a Work Request",
      });
      expect(await workSnapshot(actor)).toEqual(before);
    }
  });

  it("does not consume the Idempotency-Key it refused", async () => {
    const key = crypto.randomUUID();
    expect((await post("codex", "/v1/requests", { ...ask, recipient_id: "codex" }, key)).status).toBe(400);
    const retry = await post("codex", "/v1/requests", { ...ask, recipient_id: "juniorslo" }, key);
    expect(retry.status).toBe(201);
    expect(await retry.json()).toMatchObject({ state: "Pending", version: 1 });
  });

  it("replays a matching response committed before the self-address refusal", async () => {
    const key = crypto.randomUUID();
    const legacyResponse = {
      id: "legacy-self-addressed-request",
      requester: { id: "codex" },
      recipient: { id: "codex" },
      state: "Pending",
      version: 1,
    };
    // Setup only: migration coverage proves legacy self-addressed rows survive. This
    // record represents the response committed with one of those rows before the new
    // Worker validation existed; behavior is still observed through the HTTP seam.
    await env.DB.prepare(
      `INSERT INTO idempotency_records
        (actor_id, idempotency_key, method, path, request_hash, response_status, response_body)
       VALUES ('codex', ?, 'POST', '/v1/requests', ?, 201, ?)`,
    ).bind(
      key,
      "4fcf8f1ada9e1cd13cb1f06bc3eb0c06047f0c29ff48b2d94b27008d29617c85",
      JSON.stringify(legacyResponse),
    ).run();

    const replay = await post("codex", "/v1/requests", { ...ask, recipient_id: "codex" }, key);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(legacyResponse);
  });

  it("keeps the normal idempotency conflict for an already-consumed key", async () => {
    const key = crypto.randomUUID();
    expect((await post("codex", "/v1/requests", { ...ask, recipient_id: "juniorslo" }, key)).status).toBe(201);

    const conflict = await post("codex", "/v1/requests", { ...ask, recipient_id: "codex" }, key);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({
      error: "idempotency_conflict",
      message: "Idempotency-Key was reused with a different payload",
    });
  });

  it("still passes a request between two distinct active actors", async () => {
    const response = await post("codex", "/v1/requests", { ...ask, recipient_id: "juniorslo" });
    expect(response.status).toBe(201);
    const stored = await response.json() as { id: string };
    const detail = await get("codex", `/v1/requests/${stored.id}`);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ requester: { id: "codex" }, recipient: { id: "juniorslo" } });
  });

  it("refuses the self-addressed ask before it decides anything else is wrong", async () => {
    // Stability: the same 400 whatever else the body gets wrong, so a caller fixing one
    // complaint at a time is never told the recipient is fine.
    const response = await post("codex", "/v1/requests", { ...ask, recipient_id: "codex", expires_at: "1999-01-01T00:00:00.000Z" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request", message: expect.stringContaining("different actor") });
  });

  it("refuses an unknown recipient without reporting it as self-addressed", async () => {
    const response = await post("codex", "/v1/requests", { ...ask, recipient_id: "nobody" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: expect.stringContaining("active actor") });
  });

  it("refuses to accept a preserved self-addressed request, and changes nothing by refusing", async () => {
    // workslo/fleet#8, the lifecycle half: the insert floor preserves rows that predate it, and a
    // preserved Pending row is one accept away from the obligation the rule exists to prevent.
    const id = await preservedSelfAddressedRequest("codex");
    const before = await workSnapshot("codex");

    const response = await transition("codex", id, "accept", 1);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "conflict",
      message: "a self-addressed work request cannot be accepted or worked; it can only be ended",
    });

    const detail = await get("codex", `/v1/requests/${id}`);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ state: "Pending", version: 1 });
    expect(await workSnapshot("codex")).toEqual(before);
    expect(await obligationIds("codex")).not.toContain(id);
  });

  it("still lets the sole participant end a preserved self-addressed request", async () => {
    // Quarantine, not a trap: the row can always be retired by the actor it belongs to, so
    // nobody needs a production-data change to clear one.
    const id = await preservedSelfAddressedRequest("codex");
    const declined = await transition("codex", id, "decline", 1, { reason: "Self-claimed work is not a Work Request." });
    expect(declined.status).toBe(200);
    expect(await declined.json()).toMatchObject({ state: "Declined", version: 2 });
  });

  it("lets a preserved self-addressed obligation be ended, and refuses to work it in place", async () => {
    const id = await preservedSelfAddressedRequest("codex", "Accepted");
    expect(await obligationIds("codex")).toContain(id);

    const blocked = await transition("codex", id, "block", 1, { reason: "waiting on myself", resolution_condition: "never" });
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ error: "conflict", message: expect.stringContaining("self-addressed") });

    const fulfilled = await transition("codex", id, "fulfill", 1, {});
    expect(fulfilled.status).toBe(200);
    expect(await obligationIds("codex")).not.toContain(id);
  });

  it("leaves an ordinary request's transitions alone", async () => {
    // KNOWN-GOOD: a quarantine that also refuses valid pairs is an outage, not a fix.
    const created = await post("codex", "/v1/requests", { ...ask, recipient_id: "juniorslo" });
    expect(created.status).toBe(201);
    const { id } = await created.json() as { id: string };
    const accepted = await transition("juniorslo", id, "accept", 1);
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({ state: "Accepted", version: 2 });
  });
});
