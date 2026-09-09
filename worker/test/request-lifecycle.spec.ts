import { exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RequestLifecycleFields } from "../../contracts/request-lifecycle";
import { accessHeaders } from "./access-fixture";

type WorkRequest = RequestLifecycleFields & { id: string; state: string; version: number; accepted_scope: unknown; evidence?: { uri: string; summary: string }[] };
async function api(actor: string, path: string, body?: unknown, version?: number, key = crypto.randomUUID()) {
  const headers = await accessHeaders(actor);
  if (body !== undefined) {
    headers.set("Content-Type", "application/json"); headers.set("Idempotency-Key", key);
    if (actor === "shane") headers.set("Origin", "https://fleet.test");
  }
  if (version !== undefined) headers.set("If-Match", `"${version}"`);
  return exports.default.fetch(`https://fleet.test${path}`, { method: body === undefined ? "GET" : "POST", headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const input = { recipient_id: "juniorslo", title: "Review a shared artifact", detail: "Return a bounded review of the linked draft.", artifact: { uri: "https://example.test/draft", summary: "Shared draft" } };
async function create(extra: object = {}, key?: string) {
  const response = await api("codex", "/v1/requests", { ...input, ...extra }, undefined, key);
  expect(response.status).toBe(201);
  return await response.json() as WorkRequest;
}
async function change(actor: string, entry: WorkRequest, action: string, body: unknown = {}, key?: string) {
  return api(actor, `/v1/requests/${entry.id}/${action}`, body, entry.version, key);
}
async function accept(entry: WorkRequest) {
  const response = await change("juniorslo", entry, "accept"); expect(response.status).toBe(200);
  return await response.json() as WorkRequest;
}
async function detail(entry: WorkRequest) { return await (await api("codex", `/v1/requests/${entry.id}`)).json() as WorkRequest; }
async function events(entry: WorkRequest) {
  const data = await (await api("codex", "/v1/activity")).json() as { activity: { request_id: string; type: string; actor: { id: string }; principal: { kind: string }; payload: Record<string, unknown> }[] };
  return data.activity.filter((event) => event.request_id === entry.id);
}
afterEach(() => vi.useRealTimers());

describe("Work Request endings and blockers", () => {
  it("declines and withdraws only pending asks under the correct actor, preserving replay and attributed reasons", async () => {
    for (const [action, actor, state] of [["decline", "juniorslo", "Declined"], ["withdraw", "codex", "Withdrawn"]] as const) {
      const entry = await create();
      for (const other of ["shane", "claude", actor === "codex" ? "juniorslo" : "codex"]) {
        expect((await change(other, entry, action, { reason: "Not my choice" })).status).toBe(403);
      }
      const key = crypto.randomUUID(), body = { reason: "The ask no longer fits." };
      const result = await change(actor, entry, action, body, key); expect(result.status).toBe(200);
      const outcome = await result.json();
      expect(outcome).toMatchObject({ state, version: 2, blocker: null, resolution: { state, actor: { id: actor }, reason: body.reason, unfinished_work: null } });
      expect(await (await change(actor, entry, action, body, key)).json()).toEqual(outcome);
      expect((await change(actor, entry, action, { reason: "Different" }, key)).status).toBe(409);
      expect((await change("juniorslo", await detail(entry), "accept")).status).toBe(409);
      expect(await events(entry)).toEqual([expect.objectContaining({ type: "work_request.created" }), expect.objectContaining({ type: `work_request.${state.toLowerCase()}`, actor: { id: actor }, principal: expect.objectContaining({ kind: "service" }) })]);
      const snapshot = await (await api(actor, "/v1/me/work?after=999999")).json() as { inbound_requests: WorkRequest[]; outbound_requests: WorkRequest[] };
      expect([...snapshot.inbound_requests, ...snapshot.outbound_requests].find((row) => row.id === entry.id)).toMatchObject({ state, resolution: { reason: body.reason } });
    }
  });

  it("keeps blocked work owed, records unblocking, and returns the unfinished scope without completing Needs Shane", async () => {
    let entry = await accept(await create());
    const acceptedScope = entry.accepted_scope;
    const needResponse = await api("juniorslo", "/v1/decisions", { work_request_id: entry.id, kind: "action", question: "Enable access", resolution_condition: "Access is enabled" });
    expect(needResponse.status).toBe(201);
    const needed = await needResponse.json() as { id: string };
    const blockBody = { reason: "Waiting for access", resolution_condition: "The agreed account is enabled" };
    const blocked = await change("juniorslo", entry, "block", blockBody); expect(blocked.status).toBe(200);
    entry = await blocked.json() as WorkRequest;
    expect(entry).toMatchObject({ state: "Accepted", accepted_scope: acceptedScope, blocker: { ...blockBody, actor: { id: "juniorslo" } } });
    const owed = await (await api("juniorslo", "/v1/me/work")).json() as { obligations: { request_id: string; blocker: unknown }[] };
    expect(owed.obligations.find((item) => item.request_id === entry.id)).toMatchObject({ blocker: { reason: blockBody.reason } });
    const cleared = await change("juniorslo", entry, "unblock", { summary: "Access restored" }); expect(cleared.status).toBe(200);
    entry = await cleared.json() as WorkRequest;
    expect(entry).toMatchObject({ state: "Accepted", blocker: null });
    expect((await change("juniorslo", entry, "unblock", { summary: "Again" })).status).toBe(409);
    entry = await (await change("juniorslo", entry, "block", blockBody)).json() as WorkRequest;
    const evidence = [{ uri: "https://example.test/partial", summary: "Completed observations" }];
    const returned = await change("juniorslo", entry, "return", { reason: "Unable to continue", unfinished_work: "Security review remains", evidence });
    expect(returned.status).toBe(200);
    expect(await returned.json()).toMatchObject({ state: "Returned", blocker: null, accepted_scope: acceptedScope, resolution: { reason: "Unable to continue", unfinished_work: "Security review remains", evidence, actor: { id: "juniorslo" } } });
    expect(await detail(entry)).toMatchObject({ state: "Returned", evidence: [expect.objectContaining(evidence[0]!)] });
    for (const actor of ["codex", "juniorslo"]) {
      const snapshot = await (await api(actor, "/v1/me/work")).json() as { obligations: { request_id: string }[] };
      expect(snapshot.obligations.some((item) => item.request_id === entry.id)).toBe(false);
    }
    expect(await (await api("shane", `/v1/decisions/${needed.id}`)).json()).toMatchObject({ state: "Pending" });
    expect((await events(entry)).filter((event) => event.type.startsWith("work_request.")).map((event) => event.type)).toEqual(["work_request.created", "work_request.accepted", "work_request.blocked", "work_request.unblocked", "work_request.blocked", "work_request.returned"]);
  });

  it("fulfills blocked work with evidence and clears only its current blocker", async () => {
    let entry = await accept(await create());
    entry = await (await change("juniorslo", entry, "block", { reason: "Waiting", resolution_condition: "Ready" })).json() as WorkRequest;
    const response = await change("juniorslo", entry, "fulfill", { evidence: [{ uri: "https://example.test/review", summary: "Finished review" }] });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state: "Fulfilled", blocker: null, resolution: { state: "Fulfilled", actor: { id: "juniorslo" }, reason: null } });
    expect((await events(entry)).map((event) => event.type)).toEqual(["work_request.created", "work_request.accepted", "work_request.blocked", "work_request.fulfilled"]);
  });

  it("rejects incomplete explanations, impersonation, bad evidence, stale versions and unauthorized accepted-work endings", async () => {
    let entry = await create();
    for (const body of [{}, { reason: " " }, { reason: "x", actor_id: "shane" }, { reason: "x".repeat(4001) }]) expect((await change("juniorslo", entry, "decline", body)).status).toBe(400);
    expect((await api("juniorslo", `/v1/requests/${entry.id}/decline`, { reason: "No version" })).status).toBe(400);
    expect((await change("juniorslo", { ...entry, version: 99 }, "decline", { reason: "Stale" })).status).toBe(412);
    entry = await accept(entry);
    expect((await change("codex", entry, "withdraw", { reason: "Cancel their obligation" })).status).toBe(409);
    for (const action of ["return", "block", "unblock", "fulfill"]) {
      const body = action === "return" ? { reason: "No", unfinished_work: "Remaining" } : action === "block" ? { reason: "No", resolution_condition: "Ready" } : action === "unblock" ? { summary: "Clear" } : {};
      expect((await change("shane", entry, action, body)).status).toBe(403);
    }
    for (const body of [{ reason: "No" }, { reason: "No", unfinished_work: " " }, { reason: "No", unfinished_work: "Remaining", evidence: [{ uri: "javascript:bad", summary: "Bad" }] }, { reason: "No", unfinished_work: "Remaining", evidence: null }]) expect((await change("juniorslo", entry, "return", body)).status).toBe(400);
    expect((await detail(entry)).version).toBe(entry.version);
  });

  it("commits only one competing ending and its evidence, while duplicate retries return one recorded result", async () => {
    const entry = await accept(await create());
    const firstEvidence = [{ uri: "https://example.test/finished", summary: "Finished" }], secondEvidence = [{ uri: "https://example.test/partial", summary: "Partial" }];
    const results = await Promise.all([change("juniorslo", entry, "fulfill", { evidence: firstEvidence }), change("juniorslo", entry, "return", { reason: "Stopping", unfinished_work: "Rest", evidence: secondEvidence })]);
    expect(results.filter((item) => item.status === 200)).toHaveLength(1);
    expect(results.filter((item) => item.status === 412)).toHaveLength(1);
    const stored = await detail(entry);
    expect(stored.evidence).toHaveLength(1);
    expect(stored.evidence![0]?.uri).toBe(stored.state === "Fulfilled" ? firstEvidence[0]!.uri : secondEvidence[0]!.uri);
    expect((await events(entry)).filter((event) => ["work_request.fulfilled", "work_request.returned"].includes(event.type))).toHaveLength(1);
    const pending = await create(), key = crypto.randomUUID(), body = { reason: "Withdraw this ask" };
    const duplicates = await Promise.all([change("codex", pending, "withdraw", body, key), change("codex", pending, "withdraw", body, key)]);
    expect(duplicates.map((item) => item.status)).toEqual([200, 200]);
    expect(await duplicates[0]!.json()).toEqual(await duplicates[1]!.json());
    expect((await events(pending)).filter((event) => event.type === "work_request.withdrawn")).toHaveLength(1);
  });

  it("resolves acceptance versus withdrawal atomically without creating an orphan obligation", async () => {
    const entry = await create();
    const results = await Promise.all([change("juniorslo", entry, "accept"), change("codex", entry, "withdraw", { reason: "Withdraw" })]);
    expect(results.filter((item) => item.status === 200)).toHaveLength(1);
    expect(results.filter((item) => item.status === 412)).toHaveLength(1);
    const stored = await detail(entry);
    const snapshot = await (await api("juniorslo", "/v1/me/work")).json() as { obligations: { request_id: string }[] };
    expect(snapshot.obligations.some((item) => item.request_id === entry.id)).toBe(stored.state === "Accepted");
    expect((await events(entry)).length).toBe(2);
  });
});

describe("Explicit invitation expiry", () => {
  it("rejects invalid dates and past new deadlines but preserves a successful creation replay after its deadline", async () => {
    for (const expires_at of ["2026-02-30T00:00:00Z", "2099-02-29T00:00:00Z", "2099-01-01", "2099-01-01T24:00:00Z", "2099-01-01T00:00:00+00:00", "2000-01-01T00:00:00Z", 999, {}]) {
      expect((await api("codex", "/v1/requests", { ...input, expires_at })).status).toBe(400);
    }
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now(), deadline = new Date(start + 1000).toISOString(), key = crypto.randomUUID();
    const created = await api("codex", "/v1/requests", { ...input, expires_at: deadline }, undefined, key);
    expect(created.status).toBe(201); const original = await created.json() as WorkRequest;
    vi.setSystemTime(start + 1000);
    const replay = await api("codex", "/v1/requests", { ...input, expires_at: deadline }, undefined, key);
    expect(replay.status).toBe(201); expect(await replay.json()).toEqual(original);
    expect(await detail(original)).toMatchObject({ state: "Pending", expiry_due: true, expires_at: deadline });
    expect((await events(original)).length).toBe(1);
  });

  it("exposes overdue invitations without GET writes, rejects acceptance at the boundary, and records expiry exactly once", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    const entry = await create({ expires_at: new Date(start + 1000).toISOString() });
    expect((await change("codex", entry, "expire")).status).toBe(409);
    vi.setSystemTime(start + 1000);
    expect((await change("juniorslo", entry, "accept")).status).toBe(409);
    expect((await change("juniorslo", entry, "decline", { reason: "Too late" })).status).toBe(409);
    expect((await change("claude", entry, "expire")).status).toBe(403);
    await api("codex", "/v1/me/work"); await detail(entry);
    expect((await events(entry)).length).toBe(1);
    const key = crypto.randomUUID();
    const results = await Promise.all([change("codex", entry, "expire", {}, key), change("codex", entry, "expire", {}, key)]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    const outcome = await results[0]!.json(); expect(await results[1]!.json()).toEqual(outcome);
    expect(outcome).toMatchObject({ state: "Expired", expiry_due: false, resolution: { state: "Expired", actor: { id: "codex" } } });
    expect((await events(entry)).at(-1)).toMatchObject({ type: "work_request.expired", payload: { cause: "explicit_expiry" }, principal: { kind: "service" } });
  });

  it("never expires accepted obligations or undated invitations", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now(), deadline = new Date(start + 1000).toISOString();
    const entry = await accept(await create({ expires_at: deadline }));
    const undated = await create({ expires_at: null });
    expect(entry.accepted_scope).toMatchObject({ expires_at: deadline });
    vi.setSystemTime(start + 1000);
    expect((await change("codex", entry, "expire")).status).toBe(409);
    expect((await change("juniorslo", undated, "expire")).status).toBe(409);
    expect(await detail(entry)).toMatchObject({ state: "Accepted", expiry_due: false });
    expect(await detail(undated)).toMatchObject({ state: "Pending", expiry_due: false });
    expect((await change("juniorslo", entry, "fulfill")).status).toBe(200);
    expect((await change("juniorslo", undated, "expire")).status).toBe(409);
  });
});
