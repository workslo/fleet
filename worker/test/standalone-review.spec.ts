import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { accessHeaders } from "./access-fixture";

type RequestOptions = {
  body?: unknown;
  idempotencyKey?: string;
  ifMatch?: number;
  principal: string;
};

async function apiRequest(path: string, options: RequestOptions): Promise<Response> {
  const headers = await accessHeaders(options.principal);
  if (options.principal === "shane" && options.body !== undefined) headers.set("Origin", "https://fleet.test");
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

function mutateAs(principal: string, path: string, ifMatch: number, body: unknown, idempotencyKey = crypto.randomUUID()) {
  return apiRequest(path, { body, ifMatch, idempotencyKey, principal });
}

function getAs(principal: string, path: string) {
  return apiRequest(path, { principal });
}

async function activeProject() {
  const proposed = await postAs("shane", "/v1/projects", {
    slug: `standalone-compat-${crypto.randomUUID()}`,
    title: "Project request compatibility",
    originator_id: "shane",
  });
  const project = (await proposed.json()) as { id: string };
  await mutateAs("shane", `/v1/projects/${project.id}/authorize`, 1, {
    proposed_owner_id: "codex",
    outcome: "Preserve project-linked requests",
    scope: ["Worker"],
    exclusions: ["deploy"],
    delegated_actions: ["request"],
    gates: ["production"],
    validation_evidence: ["HTTP tests"],
    plan: "Verify compatibility",
  });
  await mutateAs("codex", `/v1/projects/${project.id}/owner-accept`, 2, {});
  return project;
}

describe("standalone review requests", () => {
  it("creates, discovers, accepts, and fulfills a review without a Fleet Project", async () => {
    const portfolioBefore = await getAs("codex", "/v1/portfolio");
    const beforeProjects = (await portfolioBefore.json()) as { projects: unknown[] };
    const before = await getAs("codex", "/v1/activity");
    const baseline = (await before.json()) as { next_cursor: string };
    const requestBody = {
      recipient_id: "claude",
      title: "Review a personal experiment",
      detail: "Review only the linked shareable artifact; no production authority is granted.",
      artifact: {
        uri: "https://home.example.test/experiments/shareable-review",
        summary: "Shareable experiment",
      },
    };

    const unsafeArtifact = await postAs("codex", "/v1/requests", {
      ...requestBody,
      artifact: { uri: "javascript:alert('fleet')", summary: "Unsafe artifact" },
    });
    expect(unsafeArtifact.status).toBe(400);
    expect(await unsafeArtifact.json()).toMatchObject({ error: "invalid_request" });

    const impersonation = await postAs("codex", "/v1/requests", { ...requestBody, requester_id: "shane" });
    expect(impersonation.status).toBe(400);
    expect(await impersonation.json()).toMatchObject({ error: "invalid_request" });

    const created = await postAs("codex", "/v1/requests", requestBody);
    expect(created.status).toBe(201);
    const pending = await created.json() as { id: string; requester: { id: string }; project_id: null; accepted_scope: null };
    expect(pending).toMatchObject({ requester: { id: "codex" }, project_id: null, accepted_scope: null });

    const discovered = await getAs("claude", "/v1/me/work");
    expect(await discovered.json()).toMatchObject({
      obligations: [],
      inbound_requests: [expect.objectContaining({ id: pending.id, project_id: null, state: "Pending", artifact: requestBody.artifact })],
    });

    expect((await mutateAs("agentslo", `/v1/requests/${pending.id}/accept`, 1, {})).status).toBe(403);
    expect((await mutateAs("claude", `/v1/requests/${pending.id}/accept`, 2, {})).status).toBe(412);

    const accepted = await mutateAs("claude", `/v1/requests/${pending.id}/accept`, 1, {});
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({
      state: "Accepted",
      version: 2,
      accepted_scope: {
        title: requestBody.title,
        detail: requestBody.detail,
        artifact: requestBody.artifact,
      },
    });

    const acceptedWork = await getAs("claude", "/v1/me/work");
    const acceptedSnapshot = await acceptedWork.json() as { obligations: Array<{ request_id?: string }> };
    expect(acceptedSnapshot.obligations.filter((item) => item.request_id === pending.id)).toHaveLength(1);

    const evidence = [{ uri: "https://reviews.example.test/result/42", summary: "Completed review" }];
    expect((await mutateAs("codex", `/v1/requests/${pending.id}/fulfill`, 2, { evidence })).status).toBe(403);
    const blankEvidence = await mutateAs("claude", `/v1/requests/${pending.id}/fulfill`, 2, {
      evidence: [{ uri: "   ", summary: "Completed review" }],
    });
    expect(blankEvidence.status).toBe(400);
    expect(await blankEvidence.json()).toMatchObject({ error: "invalid_request" });
    const unsafeEvidence = await mutateAs("claude", `/v1/requests/${pending.id}/fulfill`, 2, {
      evidence: [{ uri: "data:text/html,unsafe", summary: "Unsafe review" }],
    });
    expect(unsafeEvidence.status).toBe(400);
    expect(await unsafeEvidence.json()).toMatchObject({ error: "invalid_request" });
    const fulfillmentKey = crypto.randomUUID();
    const fulfilled = await mutateAs("claude", `/v1/requests/${pending.id}/fulfill`, 2, { evidence }, fulfillmentKey);
    const replay = await mutateAs("claude", `/v1/requests/${pending.id}/fulfill`, 2, { evidence }, fulfillmentKey);
    expect(fulfilled.status).toBe(200);
    expect(await replay.json()).toEqual(await fulfilled.json());

    const [shaneRead, requesterRead, recipientRead, uninvolvedRead] = await Promise.all([
      getAs("shane", `/v1/requests/${pending.id}`),
      getAs("codex", `/v1/requests/${pending.id}`),
      getAs("claude", `/v1/requests/${pending.id}`),
      getAs("agentslo", `/v1/requests/${pending.id}`),
    ]);
    expect(shaneRead.status).toBe(200);
    const stored = await shaneRead.json();
    expect(await requesterRead.json()).toEqual(stored);
    expect(await recipientRead.json()).toEqual(stored);
    expect(uninvolvedRead.status).toBe(200);
    expect(await uninvolvedRead.json()).toEqual(stored);
    expect(stored).toMatchObject({
      id: pending.id,
      project_id: null,
      state: "Fulfilled",
      evidence,
      accepted_scope: {
        title: requestBody.title,
        detail: requestBody.detail,
        artifact: requestBody.artifact,
      },
    });
    expect((stored as { evidence: Array<{ created_at?: string }> }).evidence[0]?.created_at).toBeTruthy();
    const missing = await getAs("shane", "/v1/requests/missing");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: "not_found" });

    const portfolioAfter = await getAs("codex", "/v1/portfolio");
    expect((await portfolioAfter.json() as { projects: unknown[] }).projects).toHaveLength(beforeProjects.projects.length);

    const after = await getAs("codex", `/v1/activity?after=${baseline.next_cursor}`);
    const activity = (await after.json()) as { activity: Array<{ project_id: string | null; type: string; payload: { request_id?: string } }> };
    const requestActivity = activity.activity.filter((event) => event.payload.request_id === pending.id);
    expect(requestActivity).toEqual([
      expect.objectContaining({ project_id: null, request_id: pending.id, type: "work_request.created" }),
      expect.objectContaining({ project_id: null, request_id: pending.id, type: "work_request.accepted" }),
      expect.objectContaining({ project_id: null, request_id: pending.id, type: "work_request.fulfilled" }),
    ]);
    expect(requestActivity.map((event) => Object.keys(event.payload).sort())).toEqual([
      ["recipient_id", "request_id"],
      ["request_id"],
      ["evidence_count", "request_id"],
    ]);
  });

  it("replays standalone creation without duplicate requests or activity", async () => {
    const before = await getAs("codex", "/v1/activity");
    const baseline = (await before.json()) as { next_cursor: string };
    const key = crypto.randomUUID();
    const body = {
      recipient_id: "claude",
      title: "Retry this standalone review",
      detail: "Use the same idempotency key after an uncertain response.",
    };

    const first = await postAs("codex", "/v1/requests", body, key);
    const replay = await postAs("codex", "/v1/requests", body, key);
    expect(first.status).toBe(201);
    const stored = await first.json() as { id: string };
    expect(await replay.json()).toEqual(stored);

    const work = await getAs("codex", "/v1/me/work");
    const snapshot = await work.json() as { outbound_requests: Array<{ id: string }> };
    expect(snapshot.outbound_requests.filter((request) => request.id === stored.id)).toHaveLength(1);

    const after = await getAs("codex", `/v1/activity?after=${baseline.next_cursor}`);
    const activity = (await after.json()) as { activity: Array<{ type: string; payload: { request_id?: string } }> };
    expect(activity.activity.filter((event) => event.payload.request_id === stored.id)).toEqual([
      expect.objectContaining({ type: "work_request.created" }),
    ]);
  });

  it("replays creation before rechecking mutable project preconditions", async () => {
    const project = await activeProject();
    const key = crypto.randomUUID();
    const body = {
      project_id: project.id,
      recipient_id: "claude",
      title: "Replay after project state changes",
      detail: "A stored response remains authoritative for the same logical write.",
    };
    const first = await postAs("codex", "/v1/requests", body, key);
    expect(first.status).toBe(201);
    const stored = await first.json();

    await env.DB.prepare("UPDATE projects SET state = 'Paused' WHERE id = ?").bind(project.id).run();
    const replay = await postAs("codex", "/v1/requests", body, key);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(stored);
  });

  it("derives accepted obligations from the frozen scope snapshot", async () => {
    const created = await postAs("codex", "/v1/requests", {
      recipient_id: "claude",
      title: "Frozen review title",
      detail: "Preserve this accepted scope.",
    });
    const request = await created.json() as { id: string };
    expect((await mutateAs("claude", `/v1/requests/${request.id}/accept`, 1, {})).status).toBe(200);

    await env.DB.prepare(
      "UPDATE work_requests SET title = 'Later row title', detail = 'Later row detail' WHERE id = ?",
    ).bind(request.id).run();
    const currentWork = await getAs("claude", "/v1/me/work");
    const snapshot = await currentWork.json() as { obligations: Array<{ request_id?: string; title?: string; detail?: string }> };
    expect(snapshot.obligations.find((entry) => entry.request_id === request.id)).toMatchObject({
      title: "Frozen review title",
      detail: "Preserve this accepted scope.",
    });
  });

  it("preserves project-linked request behavior", async () => {
    const explicitNull = await postAs("codex", "/v1/requests", {
      project_id: null,
      recipient_id: "claude",
      title: "Explicit standalone association",
      detail: "A null project association is equivalent to omission.",
    });
    expect(explicitNull.status).toBe(201);
    expect(await explicitNull.json()).toMatchObject({ project_id: null, state: "Pending" });

    const proposed = await postAs("shane", "/v1/projects", {
      slug: `inactive-${crypto.randomUUID()}`,
      title: "Inactive project",
      originator_id: "shane",
    });
    const inactive = await proposed.json() as { id: string };
    expect((await postAs("codex", "/v1/requests", {
      project_id: inactive.id,
      recipient_id: "claude",
      title: "Do not attach this request",
      detail: "A Proposed project is not active.",
    })).status).toBe(409);

    const project = await activeProject();
    const bodyLinked = await postAs("codex", "/v1/requests", {
      project_id: project.id,
      recipient_id: "claude",
      title: "Review through the general route",
      detail: "The body project association is explicit.",
    });
    expect(bodyLinked.status).toBe(201);
    expect(await bodyLinked.json()).toMatchObject({ project_id: project.id, state: "Pending" });

    const duplicateProjectSource = await postAs("codex", `/v1/projects/${project.id}/requests`, {
      project_id: project.id,
      recipient_id: "claude",
      title: "Reject ambiguous project input",
      detail: "A project may come from the route or body, not both.",
    });
    expect(duplicateProjectSource.status).toBe(400);
    expect(await duplicateProjectSource.json()).toMatchObject({ error: "invalid_request" });
    const nullProjectSource = await postAs("codex", `/v1/projects/${project.id}/requests`, {
      project_id: null,
      recipient_id: "claude",
      title: "Reject an explicit null project body",
      detail: "The project-scoped route remains the only association source.",
    });
    expect(nullProjectSource.status).toBe(400);

    const created = await postAs("codex", `/v1/projects/${project.id}/requests`, {
      recipient_id: "claude",
      title: "Review a project change",
      detail: "This request remains linked to its active project.",
    });
    expect(created.status).toBe(201);
    const request = await created.json() as { id: string };
    await mutateAs("claude", `/v1/requests/${request.id}/accept`, 1, {});
    await mutateAs("claude", `/v1/requests/${request.id}/fulfill`, 2, {
      evidence: [{ uri: "https://example.test/project-review", summary: "Project review" }],
    });

    const stored = await getAs("codex", `/v1/requests/${request.id}`);
    expect(await stored.json()).toMatchObject({ project_id: project.id, state: "Fulfilled" });
    const card = await getAs("codex", `/v1/projects/${project.id}`);
    expect(await card.json()).toMatchObject({
      evidence: [expect.objectContaining({ uri: "https://example.test/project-review", summary: "Project review" })],
    });
  });
});
