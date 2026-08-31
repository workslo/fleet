import { error, isResponse, json, requestJson } from "./http";
import type { Actor, Env, WorkRequestRow } from "./types";

type IdempotencyRecord = {
  method: string;
  path: string;
  request_hash: string;
  response_status: number;
  response_body: string;
};

type EvidenceInput = { uri: string; summary: string };
type RequestInput = { recipient_id: string; title: string; detail: string };
type PullCandidateInput = { project_id: string; title: string; detail: string };

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requestInput(value: unknown): RequestInput | null {
  if (!object(value)) return null;
  const input = value as Partial<RequestInput>;
  return typeof input.recipient_id === "string" && typeof input.title === "string" && typeof input.detail === "string" ? input as RequestInput : null;
}

function pullCandidateInput(value: unknown): PullCandidateInput | null {
  if (!object(value)) return null;
  const input = value as Partial<PullCandidateInput>;
  return typeof input.project_id === "string" && typeof input.title === "string" && typeof input.detail === "string" ? input as PullCandidateInput : null;
}

function fulfillmentEvidence(value: unknown): EvidenceInput[] | null {
  if (!object(value)) return null;
  const evidence = value.evidence ?? [];
  if (!Array.isArray(evidence)) return null;
  return evidence.every((entry) => object(entry) && typeof entry.uri === "string" && typeof entry.summary === "string")
    ? evidence as EvidenceInput[]
    : null;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function priorReplay(env: Env, caller: Actor, request: Request, body: unknown): Promise<{ key: string; hash: string } | Response> {
  const key = request.headers.get("Idempotency-Key");
  if (!key) return error("invalid_request", "Idempotency-Key is required", 400);
  const hash = await sha256(JSON.stringify(body));
  const path = new URL(request.url).pathname;
  const existing = await env.DB.prepare(
    "SELECT method, path, request_hash, response_status, response_body FROM idempotency_records WHERE actor_id = ? AND idempotency_key = ?",
  ).bind(caller.id, key).first<IdempotencyRecord>();
  if (!existing) return { key, hash };
  if (existing.method !== request.method || existing.path !== path || existing.request_hash !== hash) {
    return error("idempotency_conflict", "Idempotency-Key was reused with a different payload", 409);
  }
  return new Response(existing.response_body, { status: existing.response_status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}

function idempotencyStatement(env: Env, caller: Actor, request: Request, idempotency: { key: string; hash: string }, status: number, body: string) {
  return env.DB.prepare(
    "INSERT INTO idempotency_records (actor_id, idempotency_key, method, path, request_hash, response_status, response_body) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(caller.id, idempotency.key, request.method, new URL(request.url).pathname, idempotency.hash, status, body);
}

function storedResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}

function expectedVersion(request: Request): number | Response {
  const match = request.headers.get("If-Match")?.match(/^"([1-9]\d*)"$/);
  const version = match?.[1] === undefined ? Number.NaN : Number(match[1]);
  return Number.isSafeInteger(version) && version > 0 ? version : error("invalid_request", "If-Match must be a quoted positive request version", 400);
}

async function activeActor(env: Env, actorId: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT id FROM actors WHERE id = ? AND active = 1").bind(actorId).first<{ id: string }>();
  return Boolean(row);
}

async function activeProject(env: Env, projectId: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT id FROM projects WHERE id = ? AND state = 'Active'").bind(projectId).first<{ id: string }>();
  return Boolean(row);
}

function requestResponse(row: WorkRequestRow) {
  return {
    id: row.id,
    project_id: row.project_id,
    requester: { id: row.requester_id },
    recipient: { id: row.recipient_id },
    title: row.title,
    detail: row.detail,
    state: row.state,
    version: row.version,
    accepted_at: row.accepted_at,
    fulfilled_at: row.fulfilled_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function workRequest(env: Env, requestId: string): Promise<WorkRequestRow | null> {
  return env.DB.prepare("SELECT * FROM work_requests WHERE id = ?").bind(requestId).first<WorkRequestRow>();
}

async function waitForTestPreBatchBarrier(env: Env, request: Request): Promise<void> {
  const name = env.TEST_PRE_BATCH_BARRIER && request.headers.get("X-Fleet-Test-Pre-Batch-Barrier");
  if (!name) return;
  await env.DB.prepare(
    "INSERT INTO test_pre_batch_barriers (name, arrivals) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET arrivals = arrivals + 1",
  ).bind(name).run();
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const barrier = await env.DB.prepare("SELECT arrivals, released FROM test_pre_batch_barriers WHERE name = ?").bind(name).first<{ arrivals: number; released: number }>();
    const arrivals = barrier?.arrivals ?? 0;
    const released = barrier?.released ?? 0;
    if (arrivals >= 2) {
      await env.DB.prepare("UPDATE test_pre_batch_barriers SET released = 1 WHERE name = ?").bind(name).run();
    }
    if (released === 1 || arrivals >= 2) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("test pre-batch barrier timed out");
}

export async function createRequest(request: Request, env: Env, caller: Actor, projectId: string): Promise<Response> {
  const body = await requestJson(request);
  if (isResponse(body)) return body;
  const input = requestInput(body);
  if (!input) return error("invalid_request", "recipient_id, title, and detail are required", 400);
  if (!await activeProject(env, projectId)) return error("conflict", "work requests require an active project", 409);
  if (!await activeActor(env, input.recipient_id)) return error("invalid_request", "recipient_id must be an active actor", 400);
  const idempotency = await priorReplay(env, caller, request, body);
  if (isResponse(idempotency)) return idempotency;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const stored: WorkRequestRow = {
    id, project_id: projectId, requester_id: caller.id, recipient_id: input.recipient_id, title: input.title, detail: input.detail,
    state: "Pending", version: 1, accepted_at: null, fulfilled_at: null, created_at: now, updated_at: now,
  };
  const responseBody = JSON.stringify(requestResponse(stored));
  await waitForTestPreBatchBarrier(env, request);
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO work_requests (id, project_id, requester_id, recipient_id, title, detail, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, projectId, caller.id, input.recipient_id, input.title, input.detail, now, now),
      env.DB.prepare("INSERT INTO activity_events (project_id, actor_id, type, payload_json, created_at) VALUES (?, ?, 'work_request.created', ?, ?)").bind(projectId, caller.id, JSON.stringify({ request_id: id, recipient_id: input.recipient_id }), now),
      idempotencyStatement(env, caller, request, idempotency, 201, responseBody),
    ]);
  } catch {
    const replay = await priorReplay(env, caller, request, body);
    return isResponse(replay) ? replay : error("internal_error", "work request was not stored", 500);
  }
  return storedResponse(responseBody, 201);
}

export async function acceptRequest(request: Request, env: Env, caller: Actor, requestId: string): Promise<Response> {
  const body = await requestJson(request);
  if (isResponse(body)) return body;
  if (!object(body) || Object.keys(body).length !== 0) return error("invalid_request", "request acceptance does not accept fields", 400);
  const version = expectedVersion(request);
  if (isResponse(version)) return version;
  const idempotency = await priorReplay(env, caller, request, body);
  if (isResponse(idempotency)) return idempotency;
  const current = await workRequest(env, requestId);
  if (!current) return error("not_found", "work request does not exist", 404);
  if (current.recipient_id !== caller.id) return error("forbidden", "only the recipient may accept a work request", 403);
  if (current.version !== version) return error("precondition_failed", "work request version is stale", 412);
  if (current.state !== "Pending") return error("conflict", "work request is not pending", 409);
  await waitForTestPreBatchBarrier(env, request);
  const now = new Date().toISOString();
  const responseBody = JSON.stringify(requestResponse({ ...current, state: "Accepted", version: version + 1, accepted_at: now, updated_at: now }));
  let transition: D1Result<unknown> | undefined;
  let replay: D1Result<unknown> | undefined;
  try {
    const results = await env.DB.batch([
      env.DB.prepare("INSERT INTO activity_events (project_id, actor_id, type, payload_json, created_at) SELECT project_id, ?, 'work_request.accepted', ?, ? FROM work_requests WHERE id = ? AND recipient_id = ? AND version = ? AND state = 'Pending'").bind(caller.id, JSON.stringify({ request_id: requestId }), now, requestId, caller.id, version),
      env.DB.prepare(
        "INSERT INTO idempotency_records (actor_id, idempotency_key, method, path, request_hash, response_status, response_body) SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM work_requests WHERE id = ? AND recipient_id = ? AND version = ? AND state = 'Pending')",
      ).bind(caller.id, idempotency.key, request.method, new URL(request.url).pathname, idempotency.hash, 200, responseBody, requestId, caller.id, version),
      env.DB.prepare("UPDATE work_requests SET state = 'Accepted', accepted_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND recipient_id = ? AND version = ? AND state = 'Pending'").bind(now, now, requestId, caller.id, version),
    ]);
    transition = results[2];
    replay = results[1];
  } catch {
    return error("internal_error", "work request acceptance was not stored", 500);
  }
  if (transition?.meta.changes !== 1) {
    const stored = await priorReplay(env, caller, request, body);
    return isResponse(stored) ? stored : error("conflict", "work request cannot be accepted", 409);
  }
  if (replay?.meta.changes !== 1) return error("internal_error", "work request acceptance response was not stored", 500);
  return storedResponse(responseBody);
}

export async function fulfillRequest(request: Request, env: Env, caller: Actor, requestId: string): Promise<Response> {
  const body = await requestJson(request);
  if (isResponse(body)) return body;
  const evidence = fulfillmentEvidence(body);
  if (!evidence) return error("invalid_request", "fulfillment evidence must be an array of uri and summary records", 400);
  const version = expectedVersion(request);
  if (isResponse(version)) return version;
  const idempotency = await priorReplay(env, caller, request, body);
  if (isResponse(idempotency)) return idempotency;
  const current = await workRequest(env, requestId);
  if (!current) return error("not_found", "work request does not exist", 404);
  if (current.recipient_id !== caller.id) return error("forbidden", "only the recipient may fulfill a work request", 403);
  if (current.version !== version) return error("precondition_failed", "work request version is stale", 412);
  if (current.state !== "Accepted") return error("conflict", "work request is not accepted", 409);
  await waitForTestPreBatchBarrier(env, request);
  const now = new Date().toISOString();
  const responseBody = JSON.stringify(requestResponse({ ...current, state: "Fulfilled", version: version + 1, fulfilled_at: now, updated_at: now }));
  let transition: D1Result<unknown> | undefined;
  let replay: D1Result<unknown> | undefined;
  try {
    const results = await env.DB.batch([
      ...evidence.map((entry) => env.DB.prepare("INSERT INTO evidence_links (project_id, request_id, actor_id, uri, summary, created_at) SELECT project_id, id, ?, ?, ?, ? FROM work_requests WHERE id = ? AND recipient_id = ? AND version = ? AND state = 'Accepted'").bind(caller.id, entry.uri, entry.summary, now, requestId, caller.id, version)),
      env.DB.prepare("INSERT INTO activity_events (project_id, actor_id, type, payload_json, created_at) SELECT project_id, ?, 'work_request.fulfilled', ?, ? FROM work_requests WHERE id = ? AND recipient_id = ? AND version = ? AND state = 'Accepted'").bind(caller.id, JSON.stringify({ request_id: requestId, evidence_count: evidence.length }), now, requestId, caller.id, version),
      env.DB.prepare(
        "INSERT INTO idempotency_records (actor_id, idempotency_key, method, path, request_hash, response_status, response_body) SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM work_requests WHERE id = ? AND recipient_id = ? AND version = ? AND state = 'Accepted')",
      ).bind(caller.id, idempotency.key, request.method, new URL(request.url).pathname, idempotency.hash, 200, responseBody, requestId, caller.id, version),
      env.DB.prepare("UPDATE work_requests SET state = 'Fulfilled', fulfilled_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND recipient_id = ? AND version = ? AND state = 'Accepted'").bind(now, now, requestId, caller.id, version),
    ]);
    transition = results.at(-1);
    replay = results.at(-2);
  } catch {
    return error("internal_error", "work request fulfillment was not stored", 500);
  }
  if (transition?.meta.changes !== 1) {
    const stored = await priorReplay(env, caller, request, body);
    return isResponse(stored) ? stored : error("conflict", "work request cannot be fulfilled", 409);
  }
  if (replay?.meta.changes !== 1) return error("internal_error", "work request fulfillment response was not stored", 500);
  return storedResponse(responseBody);
}

export async function createPullCandidate(request: Request, env: Env, caller: Actor): Promise<Response> {
  const body = await requestJson(request);
  if (isResponse(body)) return body;
  const input = pullCandidateInput(body);
  if (!input) return error("invalid_request", "project_id, title, and detail are required", 400);
  if (!await activeProject(env, input.project_id)) return error("conflict", "pull candidates require an active project", 409);
  const idempotency = await priorReplay(env, caller, request, body);
  if (isResponse(idempotency)) return idempotency;
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  const responseBody = JSON.stringify({ id, project_id: input.project_id, actor: { id: caller.id }, title: input.title, detail: input.detail, created_at });
  await waitForTestPreBatchBarrier(env, request);
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO pull_candidates (id, project_id, actor_id, title, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, input.project_id, caller.id, input.title, input.detail, created_at),
      env.DB.prepare("INSERT INTO activity_events (project_id, actor_id, type, payload_json, created_at) VALUES (?, ?, 'pull_candidate.published', ?, ?)").bind(input.project_id, caller.id, JSON.stringify({ pull_candidate_id: id }), created_at),
      idempotencyStatement(env, caller, request, idempotency, 201, responseBody),
    ]);
  } catch {
    const replay = await priorReplay(env, caller, request, body);
    return isResponse(replay) ? replay : error("internal_error", "pull candidate was not stored", 500);
  }
  return storedResponse(responseBody, 201);
}

function cursor(value: string | null): { id: number; value: string } | Response {
  if (value === null) return { id: 0, value: "0" };
  if (!/^\d+$/.test(value)) return error("invalid_request", "after must be an opaque decimal activity cursor", 400);
  const result = Number(value);
  return Number.isSafeInteger(result) && result >= 0 ? { id: result, value } : error("invalid_request", "after must be an opaque decimal activity cursor", 400);
}

type ActivityRow = { id: number; project_id: string; actor_id: string; type: string; payload_json: string; created_at: string };

async function activitySince(env: Env, after: number, fallbackCursor: string) {
  const result = await env.DB.prepare(
    "SELECT id, project_id, actor_id, type, payload_json, created_at FROM activity_events WHERE id > ? ORDER BY id ASC LIMIT 200",
  ).bind(after).all<ActivityRow>();
  const activity = result.results.map((event) => ({
    id: event.id,
    project_id: event.project_id,
    actor: { id: event.actor_id },
    type: event.type,
    payload: JSON.parse(event.payload_json),
    created_at: event.created_at,
  }));
  return { activity, next_cursor: String(activity.at(-1)?.id ?? fallbackCursor) };
}

export async function activity(env: Env, afterValue: string | null): Promise<Response> {
  const after = cursor(afterValue);
  return isResponse(after) ? after : json(await activitySince(env, after.id, after.value));
}

export async function myWork(env: Env, caller: Actor, afterValue: string | null): Promise<Response> {
  const after = cursor(afterValue);
  if (isResponse(after)) return after;
  const [accepted, ownedProjects, outbound, inbound, candidates, changes] = await Promise.all([
    env.DB.prepare("SELECT * FROM work_requests WHERE recipient_id = ? AND state = 'Accepted' ORDER BY created_at ASC, id ASC").bind(caller.id).all<WorkRequestRow>(),
    env.DB.prepare("SELECT id, next_action FROM projects WHERE owner_id = ? AND state = 'Active' ORDER BY updated_at DESC, id DESC").bind(caller.id).all<{ id: string; next_action: string | null }>(),
    env.DB.prepare("SELECT * FROM work_requests WHERE requester_id = ? ORDER BY created_at DESC, id DESC").bind(caller.id).all<WorkRequestRow>(),
    env.DB.prepare("SELECT * FROM work_requests WHERE recipient_id = ? ORDER BY created_at DESC, id DESC").bind(caller.id).all<WorkRequestRow>(),
    env.DB.prepare("SELECT id, project_id, actor_id, title, detail, created_at FROM pull_candidates ORDER BY created_at DESC, id DESC").all<{ id: string; project_id: string; actor_id: string; title: string; detail: string; created_at: string }>(),
    activitySince(env, after.id, after.value),
  ]);
  return json({
    obligations: [
      ...accepted.results.map((entry) => ({ source: "accepted_request", request_id: entry.id, project_id: entry.project_id, title: entry.title, detail: entry.detail })),
      ...ownedProjects.results.map((project) => ({ source: "owner_next_action", project_id: project.id, title: "Project owner next action", detail: project.next_action })),
    ],
    outbound_requests: outbound.results.map(requestResponse),
    inbound_requests: inbound.results.map(requestResponse),
    pull_candidates: candidates.results.map((entry) => ({ id: entry.id, project_id: entry.project_id, actor: { id: entry.actor_id }, title: entry.title, detail: entry.detail, created_at: entry.created_at })),
    activity: changes.activity,
    next_cursor: changes.next_cursor,
  });
}

export async function decisions(env: Env): Promise<Response> {
  const result = await env.DB.prepare("SELECT id, project_id, question, state, created_at FROM decision_requests ORDER BY created_at ASC, id ASC").all<{
    id: string;
    project_id: string;
    question: string;
    state: string;
    created_at: string;
  }>();
  return json({ decisions: result.results });
}
