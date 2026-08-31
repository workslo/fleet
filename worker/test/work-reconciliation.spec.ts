import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

type RequestOptions = {
  body?: unknown;
  idempotencyKey?: string;
  ifMatch?: number;
  principal?: string;
};

function apiRequest(path: string, options: RequestOptions = {}): Promise<Response> {
  const headers = new Headers({ "X-Fleet-Auth-Mode": "test" });
  if (options.principal) headers.set("X-Fleet-Principal", options.principal);
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
  if (options.ifMatch !== undefined) headers.set("If-Match", `"${options.ifMatch}"`);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  return exports.default.fetch(`https://fleet.test${path}`, {
    method: options.body === undefined ? "GET" : "POST",
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

function postAs(principal: string, path: string, body: unknown, idempotencyKey = crypto.randomUUID()) {
  return apiRequest(path, { body, idempotencyKey, principal });
}

function mutateAs(principal: string, path: string, ifMatch: number, body: unknown) {
  return apiRequest(path, { body, ifMatch, idempotencyKey: crypto.randomUUID(), principal });
}

function getAs(principal: string, path: string) {
  return apiRequest(path, { principal });
}

async function activeProject() {
  const proposed = await postAs("shane", "/v1/projects", {
    slug: `work-${crypto.randomUUID()}`,
    title: "Work reconciliation",
    originator_id: "shane",
  });
  const project = (await proposed.json()) as { id: string };
  await mutateAs("shane", `/v1/projects/${project.id}/authorize`, 1, {
    proposed_owner_id: "codex",
    outcome: "Reconcile work",
    scope: ["Worker"],
    exclusions: ["deploy"],
    delegated_actions: ["request"],
    gates: ["production"],
    validation_evidence: ["HTTP tests"],
    plan: "Build the reconciliation slice",
  });
  await mutateAs("codex", `/v1/projects/${project.id}/owner-accept`, 2, {});
  return project;
}

describe("Fleet work reconciliation", () => {
  it("does not create an obligation until the recipient accepts", async () => {
    const project = await activeProject();
    const requested = await postAs("codex", `/v1/projects/${project.id}/requests`, {
      recipient_id: "claude",
      title: "Add authority tests",
      detail: "Prove cross-seat writes are rejected",
    });
    expect(requested.status).toBe(201);
    const request = (await requested.json()) as { id: string };

    const pendingWork = await getAs("claude", "/v1/me/work");
    expect(await pendingWork.json()).toMatchObject({
      obligations: [],
      inbound_requests: [{ id: request.id, state: "Pending" }],
    });

    const accepted = await mutateAs("claude", `/v1/requests/${request.id}/accept`, 1, {});
    expect(accepted.status).toBe(200);
    const acceptedWork = await getAs("claude", "/v1/me/work");
    expect(await acceptedWork.json()).toMatchObject({
      obligations: [{ source: "accepted_request", request_id: request.id }],
    });
  });

  it("shows outbound state and rejects a non-recipient acceptance or fulfillment", async () => {
    const project = await activeProject();
    const requested = await postAs("codex", `/v1/projects/${project.id}/requests`, {
      recipient_id: "claude",
      title: "Review the authority model",
      detail: "Check cross-seat authority",
    });
    const request = (await requested.json()) as { id: string };

    const outbound = await getAs("codex", "/v1/me/work");
    expect(await outbound.json()).toMatchObject({
      outbound_requests: expect.arrayContaining([expect.objectContaining({ id: request.id, state: "Pending" })]),
    });

    const rejectedAcceptance = await mutateAs("agentslo", `/v1/requests/${request.id}/accept`, 1, {});
    expect(rejectedAcceptance.status).toBe(403);
    const accepted = await mutateAs("claude", `/v1/requests/${request.id}/accept`, 1, {});
    expect(accepted.status).toBe(200);
    const rejectedFulfillment = await mutateAs("agentslo", `/v1/requests/${request.id}/fulfill`, 2, {
      evidence: [{ uri: "https://example.test/authority", summary: "Authority review" }],
    });
    expect(rejectedFulfillment.status).toBe(403);
  });

  it("discharges an accepted request and preserves its fulfillment evidence", async () => {
    const project = await activeProject();
    const requested = await postAs("codex", `/v1/projects/${project.id}/requests`, {
      recipient_id: "claude",
      title: "Run authority checks",
      detail: "Verify request authority",
    });
    const request = (await requested.json()) as { id: string };
    await mutateAs("claude", `/v1/requests/${request.id}/accept`, 1, {});
    const fulfilled = await mutateAs("claude", `/v1/requests/${request.id}/fulfill`, 2, {
      evidence: [{ uri: "https://example.test/authority-checks", summary: "Authority checks passed" }],
    });
    expect(fulfilled.status).toBe(200);

    const work = await getAs("claude", "/v1/me/work");
    const payload = (await work.json()) as { obligations: Array<{ request_id?: string }> };
    expect(payload.obligations.some((obligation) => obligation.request_id === request.id)).toBe(false);
    const card = await getAs("claude", `/v1/projects/${project.id}`);
    expect(await card.json()).toMatchObject({
      evidence: [{ uri: "https://example.test/authority-checks", summary: "Authority checks passed" }],
    });
  });

  it("publishes Pull Candidates without creating an obligation", async () => {
    const project = await activeProject();
    const candidate = await postAs("claude", "/v1/pull-candidates", {
      project_id: project.id,
      title: "Improve request copy",
      detail: "I would like to clarify the request language",
    });
    expect(candidate.status).toBe(201);
    const work = await getAs("claude", "/v1/me/work");
    const payload = await work.json() as { obligations: Array<{ project_id: string }>; pull_candidates: Array<{ title: string }> };
    expect(payload).toMatchObject({
      pull_candidates: expect.arrayContaining([expect.objectContaining({ title: "Improve request copy" })]),
    });
    expect(payload.obligations.some((obligation) => obligation.project_id === project.id)).toBe(false);
  });

  it("derives the active project owner's standing next action", async () => {
    const project = await activeProject();
    const work = await getAs("codex", "/v1/me/work");
    expect(await work.json()).toMatchObject({
      obligations: expect.arrayContaining([expect.objectContaining({ source: "owner_next_action", project_id: project.id })]),
    });
  });

  it("returns activity after an opaque cursor and advances it", async () => {
    const project = await activeProject();
    const before = await getAs("codex", "/v1/activity");
    const baseline = (await before.json()) as { next_cursor: string };
    await postAs("codex", `/v1/projects/${project.id}/requests`, {
      recipient_id: "claude",
      title: "Record cursor activity",
      detail: "Create a later event",
    });

    const later = await getAs("codex", `/v1/activity?after=${baseline.next_cursor}`);
    const payload = (await later.json()) as { activity: Array<{ id: number; type: string }>; next_cursor: string };
    expect(payload.activity).toEqual([expect.objectContaining({ type: "work_request.created" })]);
    expect(payload.activity[0]?.id).toBeGreaterThan(Number(baseline.next_cursor));
    expect(payload.next_cursor).toBe(String(payload.activity[0]?.id));

    const snapshot = await getAs("codex", `/v1/me/work?after=${baseline.next_cursor}`);
    expect(await snapshot.json()).toMatchObject({
      activity: [expect.objectContaining({ id: payload.activity[0]?.id, type: "work_request.created" })],
      next_cursor: payload.next_cursor,
    });

    const empty = await getAs("codex", "/v1/activity?after=999999");
    expect(await empty.json()).toEqual({ activity: [], next_cursor: "999999" });
  });

  it("replays a repeated request POST without creating another request", async () => {
    const project = await activeProject();
    const idempotencyKey = crypto.randomUUID();
    const body = {
      recipient_id: "claude",
      title: "Replay this request",
      detail: "The response should be stable",
    };
    const first = await postAs("codex", `/v1/projects/${project.id}/requests`, body, idempotencyKey);
    const second = await postAs("codex", `/v1/projects/${project.id}/requests`, body, idempotencyKey);
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual(await first.json());
  });

  it("reads Decisions from the decision request collection", async () => {
    const project = await activeProject();
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO decision_requests (id, project_id, question, state) VALUES (?, ?, ?, ?)",
    ).bind(id, project.id, "Should this change ship?", "Pending").run();
    const response = await getAs("codex", "/v1/decisions");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      decisions: expect.arrayContaining([
        expect.objectContaining({ id, project_id: project.id, question: "Should this change ship?", state: "Pending" }),
      ]),
    });
  });
});
