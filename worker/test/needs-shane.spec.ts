import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { NeedsShane } from "../../contracts/needs-shane";
import { accessHeaders } from "./access-fixture";

async function api(actor: string, path: string, body?: unknown, version?: number, key = crypto.randomUUID()) {
  const headers = await accessHeaders(actor);
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    headers.set("Idempotency-Key", key);
    if (actor === "shane") headers.set("Origin", "https://fleet.test");
  }
  if (version !== undefined) headers.set("If-Match", `"${version}"`);
  return exports.default.fetch(`https://fleet.test${path}`, {
    method: body === undefined ? "GET" : "POST", headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function sourceRequest() {
  const created = await api("codex", "/v1/requests", { recipient_id: "juniorslo", title: "Verify native access", detail: "Verify access after provisioning." });
  expect(created.status).toBe(201);
  const source = await created.json() as { id: string };
  expect((await api("juniorslo", `/v1/requests/${source.id}/accept`, {}, 1)).status).toBe(200);
  return source.id;
}

async function create(kind: NeedsShane["kind"] = "decision_and_action", requestId?: string) {
  const workRequestId = requestId ?? await sourceRequest();
  const created = await api("juniorslo", "/v1/decisions", {
    work_request_id: workRequestId, kind, question: "Approve and enable my access",
    resolution_condition: "My agreed access is provisioned; native verification remains my work.",
  });
  expect(created.status).toBe(201);
  return await created.json() as NeedsShane;
}

async function queue(state = "pending") {
  const read = await api("shane", `/v1/decisions?state=${state}`);
  expect(read.status).toBe(200);
  return (await read.json() as { decisions: NeedsShane[] }).decisions;
}

describe("Needs Shane lifecycle", () => {
  it("retains an approved action and clears only Shane's part after attributed completion", async () => {
    const requestId = await sourceRequest();
    const entry = await create("decision_and_action", requestId);
    expect(entry).toMatchObject({ project_id: null, work_request_id: requestId, requester: { id: "juniorslo" }, state: "Pending", action_status: "awaiting_decision" });
    const approved = await api("shane", `/v1/decisions/${entry.id}/decide`, { choice: "approved", summary: "Enable the agreed access." }, 1);
    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({ state: "Pending", version: 2, action_status: "pending", decision: { choice: "approved", actor: { id: "shane" } }, action: null });
    expect(await queue()).toEqual(expect.arrayContaining([expect.objectContaining({ id: entry.id, state: "Pending" })]));

    const evidence = [{ uri: "https://example.test/provisioning/1", summary: "Provisioning receipt" }];
    const completed = await api("shane", `/v1/decisions/${entry.id}/complete-action`, { summary: "Access enabled.", evidence }, 2);
    expect(completed.status).toBe(200);
    expect(await completed.json()).toMatchObject({ state: "Resolved", version: 3, action_status: "completed", action: { actor: { id: "shane" }, summary: "Access enabled.", evidence } });
    expect((await queue()).some((item) => item.id === entry.id)).toBe(false);
    expect((await queue("all")).some((item) => item.id === entry.id)).toBe(true);

    const source = await api("juniorslo", `/v1/requests/${requestId}`);
    expect(await source.json()).toMatchObject({ state: "Accepted", version: 2, needs_shane: [expect.objectContaining({ id: entry.id, state: "Resolved" })] });
    for (const actor of ["codex", "juniorslo"]) {
      const work = await (await api(actor, "/v1/me/work")).json() as { needs_shane: NeedsShane[]; next_cursor: string; obligations: { request_id: string }[] };
      expect(work.needs_shane).toEqual(expect.arrayContaining([expect.objectContaining({ id: entry.id, state: "Resolved" })]));
      if (actor === "juniorslo") expect(work.obligations).toEqual(expect.arrayContaining([expect.objectContaining({ request_id: requestId })]));
      const reconciled = await (await api(actor, `/v1/me/work?after=${work.next_cursor}`)).json();
      expect(reconciled).toMatchObject({ needs_shane: expect.arrayContaining([expect.objectContaining({ id: entry.id, state: "Resolved" })]), activity: [] });
    }
  });

  it("resolves decision-only and declined combined asks without claiming action completion", async () => {
    for (const kind of ["decision", "decision_and_action"] as const) {
      const entry = await create(kind);
      const decided = await api("shane", `/v1/decisions/${entry.id}/decide`, { choice: "declined", summary: "The requested access is outside scope." }, 1);
      expect(decided.status).toBe(200);
      expect(await decided.json()).toMatchObject({ state: "Resolved", action: null, action_status: kind === "decision" ? "not_requested" : "not_required" });
      expect((await api("shane", `/v1/decisions/${entry.id}/complete-action`, { summary: "Claim completion" }, 2)).status).toBe(409);
    }
    const approval = await create("decision");
    const resolved = await api("shane", `/v1/decisions/${approval.id}/decide`, { choice: "approved", summary: "Proceed within scope." }, 1);
    expect(await resolved.json()).toMatchObject({ state: "Resolved", action: null });
  });

  it("records explicit delegation and the actual performer without creating an obligation", async () => {
    const entry = await create("action");
    expect((await api("codex", `/v1/decisions/${entry.id}/complete-action`, { summary: "Did it" }, 1)).status).toBe(403);
    expect((await api("codex", `/v1/decisions/${entry.id}/delegate-action`, { delegate_id: "codex", summary: "Self authorize" }, 1)).status).toBe(403);
    const delegated = await api("shane", `/v1/decisions/${entry.id}/delegate-action`, { delegate_id: "codex", summary: "Record completion of this bounded action." }, 1);
    expect(delegated.status).toBe(200);
    expect(await delegated.json()).toMatchObject({ state: "Pending", delegation: { actor: { id: "shane" }, delegate: { id: "codex" } }, action: null });
    expect(await (await api("codex", "/v1/me/work")).json()).toMatchObject({ obligations: [] });
    expect((await api("claude", `/v1/decisions/${entry.id}/complete-action`, { summary: "Wrong actor" }, 2)).status).toBe(403);
    const completed = await api("codex", `/v1/decisions/${entry.id}/complete-action`, { summary: "Provisioned under the recorded authorization." }, 2);
    expect(await completed.json()).toMatchObject({ state: "Resolved", action: { actor: { id: "codex" } }, delegation: { actor: { id: "shane" } } });
    const activity = await (await api("codex", "/v1/activity")).json() as { activity: { type: string; actor: { id: string }; payload: { decision_request_id: string }; principal: { kind: string } }[] };
    expect(activity.activity.filter((item) => item.payload.decision_request_id === entry.id && item.type === "needs_shane.action_completed")).toEqual([
      expect.objectContaining({ actor: { id: "codex" }, principal: expect.objectContaining({ kind: "service" }) }),
    ]);
  });

  it("rejects impersonation, bad source links, blank asks, invalid evidence and missing version", async () => {
    const requestId = await sourceRequest();
    const input = { work_request_id: requestId, kind: "action", question: "Enable access", resolution_condition: "Access exists" };
    for (const change of [{ actor_id: "shane" }, { requester_id: "shane" }, { question: " " }, { resolution_condition: "" }, { project_id: "extra" }, { kind: "bogus" }, { kind: ["action"] }, { kind: { toString: null } }, { work_request_id: null }]) {
      expect((await api("codex", "/v1/decisions", { ...input, ...change })).status).toBe(400);
    }
    expect((await api("codex", "/v1/decisions", { ...input, work_request_id: "missing" })).status).toBe(404);
    const entry = await create();
    expect((await api("codex", `/v1/decisions/${entry.id}/decide`, { choice: "approved", summary: "Approve as agent" }, 1)).status).toBe(403);
    expect((await api("shane", `/v1/decisions/${entry.id}/complete-action`, { summary: "Premature" }, 1)).status).toBe(409);
    expect((await api("shane", `/v1/decisions/${entry.id}/delegate-action`, { delegate_id: "codex", summary: "Premature" }, 1)).status).toBe(409);
    expect((await api("shane", `/v1/decisions/${entry.id}/decide`, { choice: "approved", summary: "No version" })).status).toBe(400);
    for (const evidence of [null, [{ uri: "javascript:alert(1)", summary: "bad" }], [{ uri: "https://example.test", summary: " " }]]) {
      expect((await api("shane", `/v1/decisions/${entry.id}/decide`, { choice: "approved", summary: "Invalid evidence", evidence }, 1)).status).toBe(400);
    }
    expect((await api("shane", `/v1/decisions/${entry.id}/decide`, { choice: "approved", summary: "Wrong version" }, 9)).status).toBe(412);
  });

  it("replays uncertain writes once and rejects conflicting concurrent outcomes", async () => {
    const requestId = await sourceRequest();
    const createKey = crypto.randomUUID();
    const input = { work_request_id: requestId, kind: "action", question: "Enable access", resolution_condition: "Access enabled" };
    const created = await Promise.all([api("codex", "/v1/decisions", input, undefined, createKey), api("codex", "/v1/decisions", input, undefined, createKey)]);
    expect(created.map((result) => result.status)).toEqual([201, 201]);
    const [entry, duplicate] = await Promise.all(created.map(async (result) => await result.json() as NeedsShane));
    expect(entry).toEqual(duplicate);
    if (!entry) throw new Error("create response missing");
    const path = `/v1/decisions/${entry.id}/complete-action`;
    const key = crypto.randomUUID();
    const body = { summary: "Enabled", evidence: [{ uri: "https://example.test/done", summary: "Receipt" }] };
    const first = await api("shane", path, body, 1, key);
    const replayed = await api("shane", path, body, 1, key);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual(await replayed.json());
    expect((await api("shane", path, { summary: "Changed" }, 1, key)).status).toBe(409);
    const race = await create("decision");
    const competing = await Promise.all([
      api("shane", `/v1/decisions/${race.id}/decide`, { choice: "approved", summary: "Yes" }, 1),
      api("shane", `/v1/decisions/${race.id}/decide`, { choice: "declined", summary: "No" }, 1),
    ]);
    expect(competing.map((result) => result.status).sort()).toEqual([200, 412]);
    const events = await (await api("shane", "/v1/activity")).json() as { activity: { type: string; payload: { decision_request_id: string } }[] };
    expect(events.activity.filter((event) => event.payload.decision_request_id === entry.id)).toHaveLength(2);
    expect(events.activity.filter((event) => event.payload.decision_request_id === race.id && event.type === "needs_shane.decided")).toHaveLength(1);
    const source = await (await api("codex", `/v1/requests/${requestId}`)).json() as { evidence: unknown[] };
    expect(source.evidence).toHaveLength(1);
  });

  it("links project asks before authorization without changing project state", async () => {
    const proposed = await api("codex", "/v1/projects", { slug: `needs-${crypto.randomUUID()}`, title: "Proposed work", originator_id: "codex" });
    const project = await proposed.json() as { id: string };
    const ask = await api("codex", "/v1/decisions", { project_id: project.id, kind: "decision", question: "Is this direction useful?", resolution_condition: "Shane records his direction." });
    expect(ask.status).toBe(201);
    const entry = await ask.json() as NeedsShane;
    await api("shane", `/v1/decisions/${entry.id}/decide`, { choice: "approved", summary: "Useful direction; project authorization is separate." }, 1);
    expect(await (await api("codex", `/v1/projects/${project.id}`)).json()).toMatchObject({ state: "Proposed", version: 1, needs_shane: [expect.objectContaining({ id: entry.id, state: "Resolved" })] });
    const portfolio = await (await api("codex", "/v1/portfolio")).json() as { projects: { id: string; needs_shane?: NeedsShane[] }[] };
    expect(portfolio.projects.find((item) => item.id === project.id)).not.toHaveProperty("needs_shane");
  });

  it("revokes the old delegate when Shane changes the permitted performer", async () => {
    const entry = await create("action");
    for (const delegate_id of ["missing", "shane"]) {
      expect((await api("shane", `/v1/decisions/${entry.id}/delegate-action`, { delegate_id, summary: "Invalid performer" }, 1)).status).toBe(400);
    }
    expect((await api("shane", `/v1/decisions/${entry.id}/delegate-action`, { delegate_id: "codex", summary: "First permission" }, 1)).status).toBe(200);
    expect((await api("shane", `/v1/decisions/${entry.id}/delegate-action`, { delegate_id: "claude", summary: "Replace the earlier permission" }, 2)).status).toBe(200);
    expect((await api("codex", `/v1/decisions/${entry.id}/complete-action`, { summary: "Old permission" }, 3)).status).toBe(403);
    const completed = await api("claude", `/v1/decisions/${entry.id}/complete-action`, { summary: "Current permission" }, 3);
    expect(completed.status).toBe(200);
    expect(await completed.json()).toMatchObject({ action: { actor: { id: "claude" } } });
  });
});
