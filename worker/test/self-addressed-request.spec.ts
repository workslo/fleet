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
});
