import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { accessHeaders } from "./access-fixture";

type RequestOptions = {
  body?: unknown;
  idempotencyKey?: string;
  ifMatch?: number;
  principal?: string;
  gate?: string;
};

async function apiRequest(path: string, options: RequestOptions = {}): Promise<Response> {
  const headers = options.principal ? await accessHeaders(options.principal) : new Headers();
  if (options.principal === "shane" && options.body !== undefined) headers.set("Origin", "https://fleet.test");
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
  if (options.ifMatch !== undefined) headers.set("If-Match", `"${options.ifMatch}"`);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.gate) await holdAtGate(options.gate);
  return exports.default.fetch(`https://fleet.test${path}`, {
    method: options.body === undefined ? "GET" : "POST",
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

function postAs(principal: string, path: string, body: unknown, idempotencyKey = crypto.randomUUID(), gate?: string) {
  return apiRequest(path, { body, idempotencyKey, principal, ...(gate === undefined ? {} : { gate }) });
}

function mutateAs(principal: string, path: string, ifMatch: number, body: unknown, idempotencyKey = crypto.randomUUID(), gate?: string) {
  return apiRequest(path, { body, ifMatch, idempotencyKey, principal, ...(gate === undefined ? {} : { gate }) });
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

async function failIdempotencyWrite(idempotencyKey: string) {
  const trigger = `fail_idempotency_${crypto.randomUUID().replaceAll("-", "_")}`;
  await env.DB.prepare(`
    CREATE TRIGGER ${trigger}
    BEFORE INSERT ON idempotency_records
    WHEN NEW.idempotency_key = '${idempotencyKey}'
    BEGIN
      SELECT RAISE(ABORT, 'idempotency fixture');
    END;
  `).run();
  return () => env.DB.exec(`DROP TRIGGER ${trigger}`);
}

// Concurrency gate: the race tests need two requests to hit the worker at the
// same moment so the critical section is genuinely contended. Each caller
// parks at the worker boundary until the expected party count arrives, then
// all parties are released into the handler on the same tick. This seam lives
// entirely in the test layer — the worker itself carries no test scaffolding.
const GATE_PARTIES = 2;
const gateWaiters = new Map<string, Array<() => void>>();

async function holdAtGate(name: string): Promise<void> {
  const waiters = gateWaiters.get(name) ?? [];
  gateWaiters.set(name, waiters);

  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
    waiters.push(resolve);
    if (waiters.length >= GATE_PARTIES) {
      gateWaiters.delete(name);
      for (const r of waiters) r();
    }
  });

  const timeoutMs = 2_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((_, reject) => {
    timer = setTimeout(() => {
      const idx = waiters.indexOf(release);
      if (idx !== -1) waiters.splice(idx, 1);
      if (waiters.length === 0) gateWaiters.delete(name);
      reject(new Error(`concurrency gate timed out: ${name}`));
    }, timeoutMs);
  });

  try {
    await Promise.race([wait, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function concurrencyGate(): string {
  return crypto.randomUUID();
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

  it("rolls back an interrupted request create and replays the same key", async () => {
    const project = await activeProject();
    const idempotencyKey = crypto.randomUUID();
    const body = {
      recipient_id: "claude",
      title: "Retry safely",
      detail: "Prove an interrupted request does not duplicate",
    };
    const clearFixture = await failIdempotencyWrite(idempotencyKey);
    const interrupted = await postAs("codex", `/v1/projects/${project.id}/requests`, body, idempotencyKey);
    expect(interrupted.status).toBe(500);
    await clearFixture();

    const rolledBack = await getAs("codex", "/v1/me/work");
    const snapshot = (await rolledBack.json()) as { outbound_requests: Array<{ project_id: string; title: string }> };
    expect(snapshot.outbound_requests.some((entry) => entry.project_id === project.id && entry.title === body.title)).toBe(false);
    const first = await postAs("codex", `/v1/projects/${project.id}/requests`, body, idempotencyKey);
    const replay = await postAs("codex", `/v1/projects/${project.id}/requests`, body, idempotencyKey);
    expect(first.status).toBe(201);
    expect(await replay.json()).toEqual(await first.json());
  });

  it("returns the same stored request response to same-key concurrent callers", async () => {
    const project = await activeProject();
    const idempotencyKey = crypto.randomUUID();
    const gate = concurrencyGate();
    const body = {
      recipient_id: "claude",
      title: "Create concurrently",
      detail: "Both callers should receive the winning response",
    };

    const [first, second] = await Promise.all([
      postAs("codex", `/v1/projects/${project.id}/requests`, body, idempotencyKey, gate),
      postAs("codex", `/v1/projects/${project.id}/requests`, body, idempotencyKey, gate),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual(await first.json());

    const work = await getAs("codex", "/v1/me/work");
    const snapshot = (await work.json()) as { outbound_requests: Array<{ title: string }> };
    expect(snapshot.outbound_requests.filter((request) => request.title === body.title)).toHaveLength(1);
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

  it("rolls back an interrupted request acceptance and replays the same key", async () => {
    const project = await activeProject();
    const requested = await postAs("codex", `/v1/projects/${project.id}/requests`, {
      recipient_id: "claude",
      title: "Accept safely",
      detail: "Prove an interrupted acceptance does not transition",
    });
    const request = (await requested.json()) as { id: string };
    const idempotencyKey = crypto.randomUUID();
    const clearFixture = await failIdempotencyWrite(idempotencyKey);
    const interrupted = await mutateAs("claude", `/v1/requests/${request.id}/accept`, 1, {}, idempotencyKey);
    expect(interrupted.status).toBe(500);
    await clearFixture();

    const pending = await getAs("claude", "/v1/me/work");
    expect(await pending.json()).toMatchObject({
      inbound_requests: expect.arrayContaining([expect.objectContaining({ id: request.id, state: "Pending" })]),
    });
    const first = await mutateAs("claude", `/v1/requests/${request.id}/accept`, 1, {}, idempotencyKey);
    const replay = await mutateAs("claude", `/v1/requests/${request.id}/accept`, 1, {}, idempotencyKey);
    expect(first.status).toBe(200);
    expect(await replay.json()).toEqual(await first.json());
  });

  it("does not write accept side effects or replay success for a concurrent loser", async () => {
    const project = await activeProject();
    const requested = await postAs("codex", `/v1/projects/${project.id}/requests`, {
      recipient_id: "claude",
      title: "Accept concurrently",
      detail: "Only one acceptance may win",
    });
    const request = (await requested.json()) as { id: string };
    const before = await getAs("claude", "/v1/activity");
    const baseline = (await before.json()) as { next_cursor: string };
    const keys = [crypto.randomUUID(), crypto.randomUUID()];
    const results = await Promise.all(keys.map((key) => mutateAs("claude", `/v1/requests/${request.id}/accept`, 1, {}, key)));
    const statuses = results.map((result) => result.status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    const losingKey = keys[statuses.findIndex((status) => status !== 200)] as string;

    const replay = await mutateAs("claude", `/v1/requests/${request.id}/accept`, 1, {}, losingKey);
    expect(replay.status).not.toBe(200);
    const activity = await getAs("claude", `/v1/activity?after=${baseline.next_cursor}`);
    const changes = (await activity.json()) as { activity: Array<{ type: string }> };
    expect(changes.activity).toEqual([expect.objectContaining({ type: "work_request.accepted" })]);
  });

  it("returns the same stored acceptance response to same-key concurrent callers", async () => {
    const project = await activeProject();
    const requested = await postAs("codex", `/v1/projects/${project.id}/requests`, {
      recipient_id: "claude",
      title: "Accept with one key",
      detail: "Same-key callers must converge",
    });
    const request = (await requested.json()) as { id: string };
    const idempotencyKey = crypto.randomUUID();
    const gate = concurrencyGate();
    const results = await Promise.all([
      mutateAs("claude", `/v1/requests/${request.id}/accept`, 1, {}, idempotencyKey, gate),
      mutateAs("claude", `/v1/requests/${request.id}/accept`, 1, {}, idempotencyKey, gate),
    ]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(await results[0]?.json()).toEqual(await results[1]?.json());
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


  it("rejects an explicit null evidence shape while absent evidence stays optional", async () => {
    const project = await activeProject();
    const requested = await postAs("codex", `/v1/projects/${project.id}/requests`, {
      recipient_id: "claude",
      title: "Run authority checks",
      detail: "Verify request authority",
    });
    const request = (await requested.json()) as { id: string };
    await mutateAs("claude", `/v1/requests/${request.id}/accept`, 1, {});

    const nullEvidence = await mutateAs("claude", `/v1/requests/${request.id}/fulfill`, 2, { evidence: null });
    expect(nullEvidence.status).toBe(400);
    expect(await nullEvidence.json()).toMatchObject({ error: "invalid_request" });

    const fulfilled = await mutateAs("claude", `/v1/requests/${request.id}/fulfill`, 2, {});
    expect(fulfilled.status).toBe(200);
  });

  it("rolls back an interrupted fulfillment and replays the same key", async () => {
    const project = await activeProject();
    const requested = await postAs("codex", `/v1/projects/${project.id}/requests`, {
      recipient_id: "claude",
      title: "Fulfill safely",
      detail: "Prove an interrupted fulfillment does not transition",
    });
    const request = (await requested.json()) as { id: string };
    await mutateAs("claude", `/v1/requests/${request.id}/accept`, 1, {});
    const idempotencyKey = crypto.randomUUID();
    const body = { evidence: [{ uri: "https://example.test/retry", summary: "Retry-safe fulfillment" }] };
    const clearFixture = await failIdempotencyWrite(idempotencyKey);
    const interrupted = await mutateAs("claude", `/v1/requests/${request.id}/fulfill`, 2, body, idempotencyKey);
    expect(interrupted.status).toBe(500);
    await clearFixture();

    const accepted = await getAs("claude", "/v1/me/work");
    expect(await accepted.json()).toMatchObject({
      obligations: expect.arrayContaining([expect.objectContaining({ request_id: request.id })]),
    });
    const first = await mutateAs("claude", `/v1/requests/${request.id}/fulfill`, 2, body, idempotencyKey);
    const replay = await mutateAs("claude", `/v1/requests/${request.id}/fulfill`, 2, body, idempotencyKey);
    expect(first.status).toBe(200);
    expect(await replay.json()).toEqual(await first.json());
    const card = await getAs("claude", `/v1/projects/${project.id}`);
    expect(await card.json()).toMatchObject({ evidence: [{ uri: "https://example.test/retry", summary: "Retry-safe fulfillment" }] });
  });

  it("does not write fulfill side effects or replay success for a concurrent loser", async () => {
    const project = await activeProject();
    const requested = await postAs("codex", `/v1/projects/${project.id}/requests`, {
      recipient_id: "claude",
      title: "Fulfill concurrently",
      detail: "Only one fulfillment may win",
    });
    const request = (await requested.json()) as { id: string };
    await mutateAs("claude", `/v1/requests/${request.id}/accept`, 1, {});
    const before = await getAs("claude", "/v1/activity");
    const baseline = (await before.json()) as { next_cursor: string };
    const keys = [crypto.randomUUID(), crypto.randomUUID()];
    const evidence = [
      { uri: "https://example.test/concurrent-a", summary: "Concurrent winner A" },
      { uri: "https://example.test/concurrent-b", summary: "Concurrent winner B" },
    ];
    const results = await Promise.all(keys.map((key, index) => mutateAs("claude", `/v1/requests/${request.id}/fulfill`, 2, { evidence: [evidence[index]] }, key)));
    const statuses = results.map((result) => result.status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    const loser = statuses.findIndex((status) => status !== 200);
    const replay = await mutateAs("claude", `/v1/requests/${request.id}/fulfill`, 2, { evidence: [evidence[loser]] }, keys[loser] as string);
    expect(replay.status).not.toBe(200);
    const activity = await getAs("claude", `/v1/activity?after=${baseline.next_cursor}`);
    const changes = (await activity.json()) as { activity: Array<{ type: string }> };
    expect(changes.activity).toEqual([expect.objectContaining({ type: "work_request.fulfilled" })]);
    const card = await getAs("claude", `/v1/projects/${project.id}`);
    const payload = (await card.json()) as { evidence: Array<{ uri: string; summary: string }> };
    expect(payload.evidence).toEqual([expect.objectContaining(evidence[statuses.indexOf(200)])]);
  });

  it("returns the same stored fulfillment response to same-key concurrent callers", async () => {
    const project = await activeProject();
    const requested = await postAs("codex", `/v1/projects/${project.id}/requests`, {
      recipient_id: "claude",
      title: "Fulfill with one key",
      detail: "Same-key callers must converge",
    });
    const request = (await requested.json()) as { id: string };
    await mutateAs("claude", `/v1/requests/${request.id}/accept`, 1, {});
    const idempotencyKey = crypto.randomUUID();
    const body = { evidence: [{ uri: "https://example.test/same-key", summary: "Same-key fulfillment" }] };
    const gate = concurrencyGate();
    const results = await Promise.all([
      mutateAs("claude", `/v1/requests/${request.id}/fulfill`, 2, body, idempotencyKey, gate),
      mutateAs("claude", `/v1/requests/${request.id}/fulfill`, 2, body, idempotencyKey, gate),
    ]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(await results[0]?.json()).toEqual(await results[1]?.json());
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


  it("caps the shared Pull Candidate pool at the 20 newest in the work snapshot", async () => {
    const project = await activeProject();
    const rows = Array.from({ length: 25 }, (_, index) => [
      crypto.randomUUID(),
      project.id,
      "claude",
      `Candidate ${String(index).padStart(2, "0")}`,
      "Bulk insertion fixture",
      `2027-09-01 00:${String(index).padStart(2, "0")}:00`,
    ]);
    await env.DB.batch(rows.map((row) => env.DB.prepare(
      "INSERT INTO pull_candidates (id, project_id, actor_id, title, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(...row)));
    const work = await getAs("claude", "/v1/me/work");
    const payload = await work.json() as { pull_candidates: Array<{ title: string }> };
    expect(payload.pull_candidates).toHaveLength(20);
    expect(payload.pull_candidates[0]?.title).toBe("Candidate 24");
    expect(payload.pull_candidates.some((candidate) => candidate.title === "Candidate 00")).toBe(false);
    // bulk fixture rows persist in the shared test database — remove them so
    // later tests read an unmodified pool
    await env.DB.prepare("DELETE FROM pull_candidates WHERE detail = ?").bind("Bulk insertion fixture").run();
  });

  it("rolls back an interrupted Pull Candidate publication and replays the same key", async () => {
    const project = await activeProject();
    const idempotencyKey = crypto.randomUUID();
    const body = {
      project_id: project.id,
      title: "Publish safely",
      detail: "Prove an interrupted Pull Candidate does not duplicate",
    };
    const clearFixture = await failIdempotencyWrite(idempotencyKey);
    const interrupted = await postAs("claude", "/v1/pull-candidates", body, idempotencyKey);
    expect(interrupted.status).toBe(500);
    await clearFixture();

    const rolledBack = await getAs("claude", "/v1/me/work");
    const snapshot = (await rolledBack.json()) as { pull_candidates: Array<{ project_id: string; title: string }> };
    expect(snapshot.pull_candidates.some((entry) => entry.project_id === project.id && entry.title === body.title)).toBe(false);
    const first = await postAs("claude", "/v1/pull-candidates", body, idempotencyKey);
    const replay = await postAs("claude", "/v1/pull-candidates", body, idempotencyKey);
    expect(first.status).toBe(201);
    expect(await replay.json()).toEqual(await first.json());
  });

  it("returns the same stored Pull Candidate response to same-key concurrent callers", async () => {
    const project = await activeProject();
    const idempotencyKey = crypto.randomUUID();
    const gate = concurrencyGate();
    const body = {
      project_id: project.id,
      title: "Publish concurrently",
      detail: "Both callers should receive the winning response",
    };

    const [first, second] = await Promise.all([
      postAs("claude", "/v1/pull-candidates", body, idempotencyKey, gate),
      postAs("claude", "/v1/pull-candidates", body, idempotencyKey, gate),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual(await first.json());

    const work = await getAs("claude", "/v1/me/work");
    const snapshot = (await work.json()) as { pull_candidates: Array<{ title: string }> };
    expect(snapshot.pull_candidates.filter((candidate) => candidate.title === body.title)).toHaveLength(1);
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
