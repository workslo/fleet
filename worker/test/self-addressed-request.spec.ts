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

async function counts() {
  const of = async (table: string) =>
    ((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n ?? -1);
  return { requests: await of("work_requests"), activity: await of("activity_events"), idempotency: await of("idempotency_records") };
}

describe("Self-addressed Work Requests", () => {
  it("refuses every self-addressed create with a stable 400 and stores nothing", async () => {
    const before = await counts();
    for (const actor of ["codex", "claude", "juniorslo", "agentslo"]) {
      const response = await post(actor, "/v1/requests", { ...ask, recipient_id: actor });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "invalid_request",
        message: "recipient_id must name a different actor; self-claimed work is not a Work Request",
      });
    }
    // Nothing was read into a record and nothing was written: not the request, not the
    // activity event, not the idempotency row. A refusal that still consumed the key
    // would make the failure sticky for the caller's next, valid attempt.
    expect(await counts()).toEqual(before);
  });

  it("does not consume the Idempotency-Key it refused", async () => {
    const key = crypto.randomUUID();
    expect((await post("codex", "/v1/requests", { ...ask, recipient_id: "codex" }, key)).status).toBe(400);
    const retry = await post("codex", "/v1/requests", { ...ask, recipient_id: "juniorslo" }, key);
    expect(retry.status).toBe(201);
    expect(await retry.json()).toMatchObject({ state: "Pending", version: 1 });
  });

  it("still passes a request between two distinct active actors", async () => {
    const response = await post("codex", "/v1/requests", { ...ask, recipient_id: "juniorslo" });
    expect(response.status).toBe(201);
    const stored = await response.json() as { id: string };
    const row = await env.DB.prepare("SELECT requester_id, recipient_id FROM work_requests WHERE id = ?").bind(stored.id).first();
    expect(row).toEqual({ requester_id: "codex", recipient_id: "juniorslo" });
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
