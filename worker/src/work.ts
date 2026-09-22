import type { RequestBlocker, RequestResolution, RequestEnding, RequestTransition } from "../../contracts/request-lifecycle";
import { error, isResponse, json, requestJson } from "./http";
import { decisionsForActor, decisionsForSource } from "./decisions";
import {
  IDEMPOTENCY_KEY_MESSAGE,
  V1_LIMITS,
  boundedHttpUri,
  boundedIdentifier,
  boundedText,
  idempotencyKey,
} from "./limits";
import { principalValues } from "./types";
import type { Actor, Env, WorkRequestRow } from "./types";

type IdempotencyRecord = {
  method: string;
  path: string;
  request_hash: string;
  response_status: number;
  response_body: string;
};

type EvidenceInput = { uri: string; summary: string };
type EvidenceRow = EvidenceInput & { created_at: string };
type ArtifactInput = { uri: string; summary: string };
type RequestInput = { project_id?: string | null; recipient_id: string; title: string; detail: string; artifact?: ArtifactInput; expires_at?: string | null };
type PullCandidateInput = { project_id: string; title: string; detail: string };

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// #9. Decoders return the trimmed, bounded value instead of casting the caller's object,
// so the bytes written to D1 are the bytes that were validated.
function linkInput(value: unknown): ArtifactInput | null {
  if (!object(value)) return null;
  const uri = boundedHttpUri(value.uri);
  const summary = boundedText(value.summary, V1_LIMITS.summary);
  return uri !== null && summary !== null ? { uri, summary } : null;
}

function requestInput(value: unknown): RequestInput | null {
  if (!object(value)) return null;
  if ("requester_id" in value || "actor_id" in value || "agent_id" in value) return null;
  const recipient_id = boundedIdentifier(value.recipient_id);
  const title = boundedText(value.title, V1_LIMITS.title);
  const detail = boundedText(value.detail, V1_LIMITS.detail);
  if (recipient_id === null || title === null || detail === null) return null;

  let artifact: ArtifactInput | undefined;
  if ("artifact" in value && value.artifact !== undefined) {
    const link = linkInput(value.artifact);
    if (link === null) return null;
    artifact = link;
  }

  // `undefined` (absent) and `null` (explicitly none) are distinct to createRequest and to
  // the project-scoped route, so both are preserved rather than collapsed.
  let project_id: string | null | undefined;
  if ("project_id" in value && value.project_id !== undefined) {
    if (value.project_id === null) project_id = null;
    else {
      const id = boundedIdentifier(value.project_id);
      if (id === null) return null;
      project_id = id;
    }
  }

  let expires_at: string | null | undefined;
  if ("expires_at" in value && value.expires_at !== undefined) {
    if (value.expires_at === null) expires_at = null;
    else {
      const deadline = invitationDeadline(value.expires_at);
      if (deadline === null) return null;
      expires_at = deadline;
    }
  }

  return {
    recipient_id,
    title,
    detail,
    ...(artifact !== undefined ? { artifact } : {}),
    ...(project_id !== undefined ? { project_id } : {}),
    ...(expires_at !== undefined ? { expires_at } : {}),
  };
}

function invitationDeadline(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return null;
  const normalized = value.includes(".") ? value : value.replace("Z", ".000Z");
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === normalized ? normalized : null;
}

function pullCandidateInput(value: unknown): PullCandidateInput | null {
  if (!object(value)) return null;
  const project_id = boundedIdentifier(value.project_id);
  const title = boundedText(value.title, V1_LIMITS.title);
  const detail = boundedText(value.detail, V1_LIMITS.detail);
  return project_id !== null && title !== null && detail !== null ? { project_id, title, detail } : null;
}

function fulfillmentEvidence(value: unknown): EvidenceInput[] | null {
  if (!object(value)) return null;
  const raw = (value as { evidence?: unknown }).evidence;
  // evidence is optional (absent means none), but an explicit null is a
  // malformed shape like any other and must fail validation.
  if (raw !== undefined && !Array.isArray(raw)) return null;
  const evidence = raw ?? [];
  if (evidence.length > V1_LIMITS.evidence_items) return null;
  const links: EvidenceInput[] = [];
  for (const entry of evidence) {
    const link = linkInput(entry);
    if (link === null) return null;
    links.push(link);
  }
  return links;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function priorReplay(env: Env, caller: Actor, request: Request, body: unknown): Promise<{ key: string; hash: string } | Response> {
  const key = idempotencyKey(request);
  if (!key) return error("invalid_request", IDEMPOTENCY_KEY_MESSAGE, 400);
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

function artifact(row: WorkRequestRow): ArtifactInput | null {
  return row.artifact_uri && row.artifact_summary
    ? { uri: row.artifact_uri, summary: row.artifact_summary }
    : null;
}

function acceptedScope(row: WorkRequestRow): { title: string; detail: string; artifact: ArtifactInput | null; expires_at?: string } | null {
  return row.accepted_scope_json
    ? JSON.parse(row.accepted_scope_json) as { title: string; detail: string; artifact: ArtifactInput | null }
    : null;
}

function requestResponse(row: WorkRequestRow, evidence?: EvidenceRow[]) {
  const response = {
    id: row.id,
    project_id: row.project_id,
    requester: { id: row.requester_id },
    recipient: { id: row.recipient_id },
    title: row.title,
    detail: row.detail,
    artifact: artifact(row),
    accepted_scope: acceptedScope(row),
    state: row.state,
    version: row.version,
    accepted_at: row.accepted_at,
    fulfilled_at: row.fulfilled_at,
    expires_at: row.expires_at,
    expiry_due: row.state === "Pending" && row.expires_at !== null && row.expires_at <= new Date().toISOString(),
    ended_at: row.ended_at,
    resolution: row.resolution_json ? JSON.parse(row.resolution_json) as RequestResolution : null,
    blocker: row.blocker_json ? JSON.parse(row.blocker_json) as RequestBlocker : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  return evidence === undefined ? response : { ...response, evidence };
}

async function workRequest(env: Env, requestId: string): Promise<WorkRequestRow | null> {
  return env.DB.prepare("SELECT * FROM work_requests WHERE id = ?").bind(requestId).first<WorkRequestRow>();
}

async function requestEvidence(env: Env, requestId: string): Promise<EvidenceRow[]> {
  const result = await env.DB.prepare(
    "SELECT uri, summary, created_at FROM evidence_links WHERE request_id = ? ORDER BY id ASC",
  ).bind(requestId).all<EvidenceRow>();
  return result.results;
}

export async function getRequest(env: Env, requestId: string): Promise<Response> {
  const row = await workRequest(env, requestId);
  return row ? json({ ...requestResponse(row, await requestEvidence(env, requestId)), needs_shane: await decisionsForSource(env, { requestId }) }) : error("not_found", "work request does not exist", 404);
}

export async function createRequest(request: Request, env: Env, caller: Actor, routeProjectId?: string): Promise<Response> {
  const body = await requestJson(request);
  if (isResponse(body)) return body;
  const input = requestInput(body);
  if (!input) return error("invalid_request", "project_id is optional; recipient_id, title, and detail are required; caller identity fields are forbidden", 400);
  if (routeProjectId !== undefined && input.project_id !== undefined) return error("invalid_request", "project_id is supplied by the project-scoped route", 400);
  const idempotency = await priorReplay(env, caller, request, body);
  if (isResponse(idempotency)) return idempotency;
  // A Work Request is a bounded ask from one agent to another (Working Agreement §4).
  // Self-claimed work is its own obligation source and travels the Work Item /
  // owner-next-action path. Honor a response committed before this rule existed, then
  // refuse a new self-addressed ask before writing an idempotency, request or activity row.
  if (input.recipient_id === caller.id) return error("invalid_request", "recipient_id must name a different actor; self-claimed work is not a Work Request", 400);
  const projectId = routeProjectId ?? input.project_id ?? null;
  if (projectId !== null && !await activeProject(env, projectId)) return error("conflict", "project-linked work requests require an active project", 409);
  if (!await activeActor(env, input.recipient_id)) return error("invalid_request", "recipient_id must be an active actor", 400);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = input.expires_at == null ? null : invitationDeadline(input.expires_at);
  if (expiresAt !== null && expiresAt <= now) return error("invalid_request", "expires_at must be a future UTC invitation acceptance deadline", 400);
  const stored: WorkRequestRow = {
    id, project_id: projectId, requester_id: caller.id, recipient_id: input.recipient_id, title: input.title, detail: input.detail,
    artifact_uri: input.artifact?.uri ?? null, artifact_summary: input.artifact?.summary ?? null, accepted_scope_json: null,
    state: "Pending", version: 1, accepted_at: null, fulfilled_at: null, expires_at: expiresAt, resolution_json: null, blocker_json: null, ended_at: null, created_at: now, updated_at: now,
  };
  const responseBody = JSON.stringify(requestResponse(stored));
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO work_requests (id, project_id, requester_id, recipient_id, title, detail, artifact_uri, artifact_summary, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, projectId, caller.id, input.recipient_id, input.title, input.detail, input.artifact?.uri ?? null, input.artifact?.summary ?? null, expiresAt, now, now),
      env.DB.prepare(
        `INSERT INTO activity_events
          (project_id, request_id, actor_id, principal_provider, principal_issuer, principal_kind, principal_subject, type, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'work_request.created', ?, ?)`,
      ).bind(projectId, id, caller.id, ...principalValues(caller), JSON.stringify({ request_id: id, recipient_id: input.recipient_id, ...(expiresAt ? { expires_at: expiresAt } : {}) }), now),
      idempotencyStatement(env, caller, request, idempotency, 201, responseBody),
    ]);
  } catch {
    const replay = await priorReplay(env, caller, request, body);
    return isResponse(replay) ? replay : error("internal_error", "work request was not stored", 500);
  }
  return storedResponse(responseBody, 201);
}

type Transition = RequestTransition | "accept" | "fulfill";
type TransitionInput = { reason?: string; unfinished_work?: string; resolution_condition?: string; summary?: string; evidence?: EvidenceInput[] };

// The transitions that end a request, named once so the quarantine in transitionRequest and
// the resolution it writes cannot drift apart.
const REQUEST_ENDINGS: Partial<Record<Transition, RequestEnding>> = { fulfill: "Fulfilled", return: "Returned", decline: "Declined", withdraw: "Withdrawn", expire: "Expired" };

function transitionInput(action: Transition, body: unknown): TransitionInput | null {
  if (!object(body)) return null;
  const fields: Record<Transition, string[]> = {
    accept: [], fulfill: ["evidence"], decline: ["reason"], withdraw: ["reason"],
    return: ["reason", "unfinished_work", "evidence"], expire: [],
    block: ["reason", "resolution_condition"], unblock: ["summary"],
  };
  if (Object.keys(body).some((key) => !fields[action].includes(key))) return null;
  // #9. `summary` is a short note and the rest are explanations; both were previously
  // capped at 4000 UTF-16 code units and are now capped in UTF-8 bytes, which is what D1
  // stores. The normalized values are returned, not the caller's object.
  const normalized: Record<string, unknown> = {};
  for (const field of fields[action].filter((key) => key !== "evidence")) {
    const text = boundedText(body[field], field === "summary" ? V1_LIMITS.summary : V1_LIMITS.detail);
    if (text === null) return null;
    normalized[field] = text;
  }
  if (fields[action].includes("evidence")) {
    const evidence = fulfillmentEvidence(body);
    if (!evidence) return null;
    normalized.evidence = evidence;
  }
  return normalized as TransitionInput;
}

export async function transitionRequest(request: Request, env: Env, caller: Actor, requestId: string, action: Transition): Promise<Response> {
  const body = await requestJson(request);
  if (isResponse(body)) return body;
  const input = transitionInput(action, body);
  if (!input) return error("invalid_request", "supply only the required transition fields, nonblank explanations and valid HTTP evidence", 400);
  const version = expectedVersion(request);
  if (isResponse(version)) return version;
  const idempotency = await priorReplay(env, caller, request, body);
  if (isResponse(idempotency)) return idempotency;
  const current = await workRequest(env, requestId);
  if (!current) return error("not_found", "work request does not exist", 404);
  const permitted = action === "withdraw" ? current.requester_id === caller.id
    : action === "expire" ? current.requester_id === caller.id || current.recipient_id === caller.id
    : current.recipient_id === caller.id;
  if (!permitted) return error("forbidden", "only the request participant authorized for this transition may record it", 403);
  // #8, the other half. Migration 0007 refuses new self-addressed rows but deliberately
  // preserves any that predate it, and a preserved row is one its sole participant could still
  // accept into the self-obligation this rule exists to prevent. So the only transitions left
  // open on one are the ones that end it: it can be retired, never accepted or worked. Placed
  // after the authority check so a non-participant learns nothing about the row, and before the
  // version check so the refusal is the same answer at every version.
  if (current.requester_id === current.recipient_id && !(action in REQUEST_ENDINGS)) {
    return error("conflict", "a self-addressed work request cannot be accepted or worked; it can only be ended", 409);
  }
  if (current.version !== version) return error("precondition_failed", "work request version is stale", 412);
  const requiredState = ["accept", "decline", "withdraw", "expire"].includes(action) ? "Pending" : "Accepted";
  if (current.state !== requiredState) return error("conflict", `work request must be ${requiredState}`, 409);
  const now = new Date().toISOString();
  const due = current.expires_at !== null && current.expires_at <= now;
  if (action === "expire" && !due) return error("conflict", "the explicit invitation deadline has not passed", 409);
  if (requiredState === "Pending" && action !== "expire" && due) return error("conflict", "the invitation deadline has passed; record its expiry", 409);
  if (action === "unblock" && current.blocker_json === null) return error("conflict", "work request has no current blocker", 409);

  const state = REQUEST_ENDINGS[action] ?? (action === "accept" ? "Accepted" : current.state);
  const evidence = input.evidence ?? [];
  const resolution: RequestResolution | null = REQUEST_ENDINGS[action] ? {
    state: state as RequestEnding, actor: { id: caller.id }, at: now,
    reason: action === "expire" ? "The disclosed invitation acceptance deadline passed." : input.reason ?? null,
    unfinished_work: input.unfinished_work ?? null, evidence,
  } : null;
  const blocker: RequestBlocker | null = action === "block" ? {
    reason: input.reason!, resolution_condition: input.resolution_condition!, actor: { id: caller.id }, at: now,
  } : null;
  const acceptedScopeJson = action === "accept" ? JSON.stringify({
    title: current.title, detail: current.detail, artifact: artifact(current),
    ...(current.expires_at ? { expires_at: current.expires_at } : {}),
  }) : current.accepted_scope_json;
  const changed: WorkRequestRow = {
    ...current, state, version: version + 1, updated_at: now, accepted_scope_json: acceptedScopeJson,
    accepted_at: action === "accept" ? now : current.accepted_at,
    fulfilled_at: action === "fulfill" ? now : current.fulfilled_at,
    ended_at: resolution ? now : current.ended_at,
    resolution_json: resolution ? JSON.stringify(resolution) : current.resolution_json,
    blocker_json: blocker ? JSON.stringify(blocker) : null,
  };
  const responseBody = JSON.stringify(requestResponse(changed));
  const eventType: Record<Transition, string> = {
    accept: "accepted", fulfill: "fulfilled", decline: "declined", withdraw: "withdrawn",
    return: "returned", expire: "expired", block: "blocked", unblock: "unblocked",
  };
  // Each write observes the same pre-transition row; the guarded update runs last.
  // A competing ending cannot leave activity, evidence or a replay receipt behind.
  const predicate = "id = ? AND version = ? AND state = ? AND (expires_at IS NULL OR expires_at > ? OR state = 'Accepted' OR ? = 'expire')";
  const guard = [requestId, version, requiredState, now, action];
  const payload = { request_id: requestId,
    ...(action === "fulfill" || action === "return" ? { evidence_count: evidence.length } : {}),
    ...(resolution && action !== "fulfill" ? { resolution } : {}),
    ...(blocker ? { blocker } : {}),
    ...(action === "unblock" ? { summary: input.summary } : {}),
    ...(action === "expire" ? { cause: "explicit_expiry", expires_at: current.expires_at, recorded_by: caller.id } : {}),
  };
  try {
    const results = await env.DB.batch([
      ...evidence.map((entry) => env.DB.prepare(`INSERT INTO evidence_links (project_id, request_id, actor_id, uri, summary, created_at) SELECT project_id, id, ?, ?, ?, ? FROM work_requests WHERE ${predicate}`).bind(caller.id, entry.uri, entry.summary, now, ...guard)),
      env.DB.prepare(`INSERT INTO activity_events
        (project_id, request_id, actor_id, principal_provider, principal_issuer, principal_kind, principal_subject, type, payload_json, created_at)
        SELECT project_id, id, ?, ?, ?, ?, ?, ?, ?, ? FROM work_requests WHERE ${predicate}`)
        .bind(caller.id, ...principalValues(caller), `work_request.${eventType[action]}`, JSON.stringify(payload), now, ...guard),
      env.DB.prepare(`INSERT INTO idempotency_records (actor_id, idempotency_key, method, path, request_hash, response_status, response_body)
        SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM work_requests WHERE ${predicate})`)
        .bind(caller.id, idempotency.key, request.method, new URL(request.url).pathname, idempotency.hash, 200, responseBody, ...guard),
      env.DB.prepare(`UPDATE work_requests SET state = ?, accepted_scope_json = ?, accepted_at = ?, fulfilled_at = ?,
        ended_at = ?, resolution_json = ?, blocker_json = ?, version = version + 1, updated_at = ? WHERE ${predicate}`)
        .bind(changed.state, changed.accepted_scope_json, changed.accepted_at, changed.fulfilled_at, changed.ended_at, changed.resolution_json, changed.blocker_json, now, ...guard),
    ]);
    if (results.at(-1)?.meta.changes === 1 && results.at(-2)?.meta.changes === 1) return storedResponse(responseBody);
  } catch {
    const replay = await priorReplay(env, caller, request, body);
    return isResponse(replay) ? replay : error("internal_error", "work request transition was not stored", 500);
  }
  const replay = await priorReplay(env, caller, request, body);
  return isResponse(replay) ? replay : error("precondition_failed", "work request changed before the transition was recorded; refresh it", 412);
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
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO pull_candidates (id, project_id, actor_id, title, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, input.project_id, caller.id, input.title, input.detail, created_at),
      env.DB.prepare(
        `INSERT INTO activity_events
          (project_id, actor_id, principal_provider, principal_issuer, principal_kind, principal_subject, type, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pull_candidate.published', ?, ?)`,
      ).bind(input.project_id, caller.id, ...principalValues(caller), JSON.stringify({ pull_candidate_id: id }), created_at),
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

type ActivityRow = {
  id: number;
  project_id: string | null;
  request_id: string | null;
  actor_id: string;
  principal_provider: "cloudflare_access" | null;
  principal_issuer: string | null;
  principal_kind: "human" | "service" | null;
  principal_subject: string | null;
  type: string;
  payload_json: string;
  created_at: string;
};

async function activitySince(env: Env, after: number, fallbackCursor: string) {
  const result = await env.DB.prepare(
    `SELECT id, project_id, request_id, actor_id, principal_provider, principal_issuer,
            principal_kind, principal_subject, type, payload_json, created_at
       FROM activity_events
      WHERE id > ?
      ORDER BY id ASC
      LIMIT 200`,
  ).bind(after).all<ActivityRow>();
  const activity = result.results.map((event) => ({
    id: event.id,
    project_id: event.project_id,
    request_id: event.request_id,
    actor: { id: event.actor_id },
    principal: event.principal_provider && event.principal_issuer !== null && event.principal_kind && event.principal_subject
      ? {
          provider: event.principal_provider,
          issuer: event.principal_issuer,
          kind: event.principal_kind,
          subject: event.principal_subject,
        }
      : null,
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
  const [accepted, ownedProjects, outbound, inbound, candidates, changes, needsShane] = await Promise.all([
    env.DB.prepare("SELECT * FROM work_requests WHERE recipient_id = ? AND state = 'Accepted' ORDER BY created_at ASC, id ASC").bind(caller.id).all<WorkRequestRow>(),
    env.DB.prepare("SELECT id, next_action FROM projects WHERE owner_id = ? AND state = 'Active' ORDER BY updated_at DESC, id DESC").bind(caller.id).all<{ id: string; next_action: string | null }>(),
    env.DB.prepare("SELECT * FROM work_requests WHERE requester_id = ? ORDER BY created_at DESC, id DESC").bind(caller.id).all<WorkRequestRow>(),
    env.DB.prepare("SELECT * FROM work_requests WHERE recipient_id = ? ORDER BY created_at DESC, id DESC").bind(caller.id).all<WorkRequestRow>(),
    env.DB.prepare("SELECT id, project_id, actor_id, title, detail, created_at FROM pull_candidates ORDER BY created_at DESC, id DESC LIMIT 20").all<{ id: string; project_id: string; actor_id: string; title: string; detail: string; created_at: string }>(),
    activitySince(env, after.id, after.value),
    decisionsForActor(env, caller.id),
  ]);
  return json({
    obligations: [
      ...accepted.results.map((entry) => {
        const scope = acceptedScope(entry);
        return { source: "accepted_request", request_id: entry.id, project_id: entry.project_id, title: scope?.title ?? entry.title, detail: scope?.detail ?? entry.detail, blocker: entry.blocker_json ? JSON.parse(entry.blocker_json) as RequestBlocker : null };
      }),
      ...ownedProjects.results.map((project) => ({ source: "owner_next_action", project_id: project.id, title: "Project owner next action", detail: project.next_action })),
    ],
    outbound_requests: outbound.results.map((entry) => requestResponse(entry)),
    inbound_requests: inbound.results.map((entry) => requestResponse(entry)),
    pull_candidates: candidates.results.map((entry) => ({ id: entry.id, project_id: entry.project_id, actor: { id: entry.actor_id }, title: entry.title, detail: entry.detail, created_at: entry.created_at })),
    activity: changes.activity,
    needs_shane: needsShane,
    next_cursor: changes.next_cursor,
  });
}
