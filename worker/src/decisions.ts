import type { CreateNeedsShane, NeedsShane, NeedsShaneEvidence, NeedsShaneKind } from "../../contracts/needs-shane";
import { error, isResponse, json, requestJson } from "./http";
import {
  IDEMPOTENCY_KEY_MESSAGE,
  V1_LIMITS,
  boundedHttpUri,
  boundedIdentifier,
  boundedText,
  idempotencyKey,
} from "./limits";
import { principalValues, type Actor, type Env } from "./types";

type DecisionRow = {
  id: string;
  project_id: string | null;
  work_request_id: string | null;
  requester_id: string | null;
  kind: NeedsShaneKind;
  question: string;
  resolution_condition: string | null;
  state: string;
  version: number;
  decision_json: string | null;
  action_json: string | null;
  delegation_json: string | null;
  delegate_id: string | null;
  created_at: string;
  updated_at: string;
};
type Replay = { key: string; hash: string };
type Transition = "decide" | "complete-action" | "delegate-action";

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

// #9. Decodes rather than type-guards, so the trimmed, bounded links are what get stored.
function evidenceLinks(value: unknown): NeedsShaneEvidence[] | null {
  if (!Array.isArray(value) || value.length > V1_LIMITS.evidence_items) return null;
  const links: NeedsShaneEvidence[] = [];
  for (const entry of value) {
    if (!object(entry) || !onlyKeys(entry, ["uri", "summary"])) return null;
    const uri = boundedHttpUri(entry.uri);
    const summary = boundedText(entry.summary, V1_LIMITS.summary);
    if (uri === null || summary === null) return null;
    links.push({ uri, summary });
  }
  return links;
}

function response(row: DecisionRow): NeedsShane {
  const decision: NeedsShane["decision"] = row.decision_json ? JSON.parse(row.decision_json) : null;
  const action: NeedsShane["action"] = row.action_json ? JSON.parse(row.action_json) : null;
  return {
    id: row.id, project_id: row.project_id, work_request_id: row.work_request_id,
    requester: row.requester_id ? { id: row.requester_id } : null,
    kind: row.kind, question: row.question, resolution_condition: row.resolution_condition,
    state: row.state, version: row.version, decision, action,
    delegation: row.delegation_json ? JSON.parse(row.delegation_json) : null,
    action_status: row.kind === "decision" ? "not_requested"
      : action ? "completed"
      : decision?.choice === "declined" ? "not_required"
      : row.kind === "decision_and_action" && !decision ? "awaiting_decision" : "pending",
    created_at: row.created_at, updated_at: row.updated_at,
  };
}

async function rowById(env: Env, id: string) {
  return env.DB.prepare("SELECT * FROM decision_requests WHERE id = ?").bind(id).first<DecisionRow>();
}

async function replay(env: Env, caller: Actor, request: Request, body: unknown): Promise<Replay | Response> {
  const key = idempotencyKey(request);
  if (!key) return error("invalid_request", IDEMPOTENCY_KEY_MESSAGE, 400);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(body)));
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const previous = await env.DB.prepare(
    "SELECT method, path, request_hash, response_status, response_body FROM idempotency_records WHERE actor_id = ? AND idempotency_key = ?",
  ).bind(caller.id, key).first<{ method: string; path: string; request_hash: string; response_status: number; response_body: string }>();
  if (!previous) return { key, hash };
  if (previous.method !== request.method || previous.path !== new URL(request.url).pathname || previous.request_hash !== hash) {
    return error("idempotency_conflict", "Idempotency-Key was reused with a different request", 409);
  }
  return new Response(previous.response_body, { status: previous.response_status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}

function storedReplay(env: Env, caller: Actor, request: Request, key: Replay, result: NeedsShane, status: number, current?: DecisionRow) {
  const condition = current ? " WHERE EXISTS (SELECT 1 FROM decision_requests WHERE id = ? AND version = ? AND state = 'Pending')" : "";
  return env.DB.prepare(
    `INSERT INTO idempotency_records (actor_id, idempotency_key, method, path, request_hash, response_status, response_body)
     SELECT ?, ?, ?, ?, ?, ?, ?${condition}`,
  ).bind(caller.id, key.key, request.method, new URL(request.url).pathname, key.hash, status, JSON.stringify(result), ...(current ? [current.id, current.version] : []));
}

function activity(env: Env, caller: Actor, row: DecisionRow, type: string, payload: unknown, current?: DecisionRow) {
  const condition = current ? " WHERE EXISTS (SELECT 1 FROM decision_requests WHERE id = ? AND version = ? AND state = 'Pending')" : "";
  return env.DB.prepare(
    `INSERT INTO activity_events (project_id, request_id, actor_id, principal_provider, principal_issuer, principal_kind, principal_subject, type, payload_json, created_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${condition}`,
  ).bind(row.project_id, row.work_request_id, caller.id, ...principalValues(caller), type,
    JSON.stringify({ decision_request_id: row.id, ...object(payload) ? payload : {} }), row.updated_at,
    ...(current ? [current.id, current.version] : []));
}

export async function decisionsForSource(env: Env, source: { projectId: string } | { requestId: string }): Promise<NeedsShane[]> {
  const [column, id] = "projectId" in source ? ["project_id", source.projectId] : ["work_request_id", source.requestId];
  const records = await env.DB.prepare(`SELECT * FROM decision_requests WHERE ${column} = ? ORDER BY created_at ASC, id ASC`).bind(id).all<DecisionRow>();
  return records.results.map(response);
}

export async function decisionsForActor(env: Env, actorId: string): Promise<NeedsShane[]> {
  const records = await env.DB.prepare(
    `SELECT d.* FROM decision_requests d WHERE ? = 'shane' OR d.requester_id = ? OR d.delegate_id = ?
       OR EXISTS (SELECT 1 FROM work_requests w WHERE w.id = d.work_request_id AND (w.requester_id = ? OR w.recipient_id = ?))
       OR EXISTS (SELECT 1 FROM projects p WHERE p.id = d.project_id AND (p.owner_id = ? OR p.proposed_owner_id = ?))
     ORDER BY d.created_at ASC, d.id ASC`,
  ).bind(actorId, actorId, actorId, actorId, actorId, actorId, actorId).all<DecisionRow>();
  return records.results.map(response);
}

export async function listDecisions(env: Env, state: string | null): Promise<Response> {
  if (state !== null && state !== "pending" && state !== "all") return error("invalid_request", "state must be pending or all", 400);
  const records = await env.DB.prepare(`SELECT * FROM decision_requests ${state === "all" ? "" : "WHERE state = 'Pending'"} ORDER BY created_at ASC, id ASC`).all<DecisionRow>();
  return json({ decisions: records.results.map(response) });
}

export async function getDecision(env: Env, id: string): Promise<Response> {
  const row = await rowById(env, id);
  return row ? json(response(row)) : error("not_found", "Needs Shane record does not exist", 404);
}

export async function createDecision(request: Request, env: Env, caller: Actor): Promise<Response> {
  const body = await requestJson(request);
  if (isResponse(body)) return body;
  const question = object(body) ? boundedText(body.question, V1_LIMITS.detail) : null;
  const resolutionCondition = object(body) ? boundedText(body.resolution_condition, V1_LIMITS.detail) : null;
  const sourceProjectId = object(body) && body.work_request_id === undefined ? boundedIdentifier(body.project_id) : null;
  const sourceRequestId = object(body) && body.project_id === undefined ? boundedIdentifier(body.work_request_id) : null;
  if (!object(body) || !onlyKeys(body, ["project_id", "work_request_id", "kind", "question", "resolution_condition"]) ||
      question === null || resolutionCondition === null ||
      typeof body.kind !== "string" || !["decision", "action", "decision_and_action"].includes(body.kind) ||
      (sourceProjectId === null) === (sourceRequestId === null)) {
    return error("invalid_request", "kind, question, resolution_condition, and exactly one project_id or work_request_id are required, each non-blank and within its V1 limit", 400);
  }
  const input = {
    kind: body.kind as CreateNeedsShane["kind"],
    question,
    resolution_condition: resolutionCondition,
    ...(sourceProjectId !== null ? { project_id: sourceProjectId } : {}),
    ...(sourceRequestId !== null ? { work_request_id: sourceRequestId } : {}),
  } satisfies CreateNeedsShane;
  const key = await replay(env, caller, request, body);
  if (isResponse(key)) return key;
  let projectId = input.project_id ?? null;
  if (input.work_request_id) {
    const source = await env.DB.prepare("SELECT project_id FROM work_requests WHERE id = ?").bind(input.work_request_id).first<{ project_id: string | null }>();
    if (!source) return error("not_found", "source work request does not exist", 404);
    projectId = source.project_id;
  } else if (!await env.DB.prepare("SELECT id FROM projects WHERE id = ?").bind(projectId).first()) {
    return error("not_found", "source project does not exist", 404);
  }
  const now = new Date().toISOString();
  const row: DecisionRow = {
    id: crypto.randomUUID(), project_id: projectId, work_request_id: input.work_request_id ?? null,
    requester_id: caller.id, kind: input.kind, question: input.question, resolution_condition: input.resolution_condition,
    state: "Pending", version: 1, decision_json: null, action_json: null, delegation_json: null, delegate_id: null,
    created_at: now, updated_at: now,
  };
  const result = response(row);
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO decision_requests (id, project_id, work_request_id, requester_id, kind, question, resolution_condition, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(row.id, row.project_id, row.work_request_id, caller.id, row.kind, row.question, row.resolution_condition, now, now),
      activity(env, caller, row, "needs_shane.created", { kind: row.kind, question: row.question, resolution_condition: row.resolution_condition }),
      storedReplay(env, caller, request, key, result, 201),
    ]);
  } catch {
    const previous = await replay(env, caller, request, body);
    return isResponse(previous) ? previous : error("internal_error", "Needs Shane request was not stored", 500);
  }
  return json(result, 201);
}

export async function transitionDecision(request: Request, env: Env, caller: Actor, id: string, transition: Transition): Promise<Response> {
  const body = await requestJson(request);
  if (isResponse(body)) return body;
  const allowed = transition === "decide" ? ["choice", "summary", "evidence"]
    : transition === "delegate-action" ? ["delegate_id", "summary"] : ["summary", "evidence"];
  const summary = object(body) ? boundedText(body.summary, V1_LIMITS.summary) : null;
  const delegateId = object(body) && transition === "delegate-action" ? boundedIdentifier(body.delegate_id) : null;
  const suppliedEvidence = object(body) && body.evidence !== undefined ? evidenceLinks(body.evidence) : [];
  if (!object(body) || !onlyKeys(body, allowed) || summary === null || suppliedEvidence === null ||
      (transition === "decide" && body.choice !== "approved" && body.choice !== "declined") ||
      (transition === "delegate-action" && delegateId === null)) {
    return error("invalid_request", "provide the transition fields, a non-blank bounded summary, and valid HTTP evidence links", 400);
  }
  const match = request.headers.get("If-Match")?.match(/^"([1-9]\d*)"$/);
  const version = Number(match?.[1]);
  if (!Number.isSafeInteger(version) || version < 1) return error("invalid_request", "If-Match must be a quoted positive Needs Shane version", 400);
  const key = await replay(env, caller, request, body);
  if (isResponse(key)) return key;
  const current = await rowById(env, id);
  if (!current) return error("not_found", "Needs Shane record does not exist", 404);
  if (caller.id !== "shane" && (transition !== "complete-action" || caller.id !== current.delegate_id)) {
    return error("forbidden", "only Shane decides or delegates; only Shane or the named delegate completes the action", 403);
  }
  if (current.version !== version) return error("precondition_failed", "Needs Shane version is stale", 412);
  if (current.state !== "Pending") {
    return error("conflict", current.state === "Resolved"
      ? "Shane's part is already resolved"
      : "this legacy state is preserved in history and has no supported transition", 409);
  }
  const now = new Date().toISOString();
  const evidence = suppliedEvidence;
  const outcome = { actor: { id: caller.id }, summary, evidence, at: now };
  const next = { ...current, version: version + 1, updated_at: now };
  if (transition === "decide") {
    if (current.kind === "action" || current.decision_json !== null) return error("conflict", "no decision is pending", 409);
    next.decision_json = JSON.stringify({ ...outcome, choice: body.choice });
    if (current.kind === "decision" || body.choice === "declined") next.state = "Resolved";
  } else {
    if (response(current).action_status !== "pending") return error("conflict", "no action is ready for completion or delegation", 409);
    if (transition === "delegate-action") {
      const delegate = await env.DB.prepare("SELECT id FROM actors WHERE id = ? AND active = 1 AND id != 'shane'").bind(delegateId).first<{ id: string }>();
      if (!delegate) return error("invalid_request", "delegate_id must name an active agent", 400);
      next.delegate_id = delegate.id;
      next.delegation_json = JSON.stringify({ actor: { id: caller.id }, delegate: { id: delegate.id }, summary, at: now });
    } else {
      next.action_json = JSON.stringify(outcome);
      next.state = "Resolved";
    }
  }
  const result = response(next);
  try {
    const results = await env.DB.batch([
      activity(env, caller, next, `needs_shane.${transition === "decide" ? "decided" : transition === "delegate-action" ? "action_delegated" : "action_completed"}`,
        transition === "decide" ? result.decision : transition === "delegate-action" ? result.delegation : result.action, current),
      ...evidence.map((entry) => env.DB.prepare(
        "INSERT INTO evidence_links (project_id, request_id, actor_id, uri, summary, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM decision_requests WHERE id = ? AND version = ? AND state = 'Pending')",
      ).bind(current.project_id, current.work_request_id, caller.id, entry.uri, entry.summary, now, id, version)),
      storedReplay(env, caller, request, key, result, 200, current),
      env.DB.prepare("UPDATE decision_requests SET state = ?, version = version + 1, decision_json = ?, action_json = ?, delegation_json = ?, delegate_id = ?, updated_at = ? WHERE id = ? AND version = ? AND state = 'Pending'")
        .bind(next.state, next.decision_json, next.action_json, next.delegation_json, next.delegate_id, now, id, version),
    ]);
    if (results.at(-1)?.meta.changes !== 1) {
      const previous = await replay(env, caller, request, body);
      return isResponse(previous) ? previous : error("precondition_failed", "Needs Shane version changed during the action", 412);
    }
  } catch {
    const previous = await replay(env, caller, request, body);
    return isResponse(previous) ? previous : error("internal_error", "Needs Shane outcome was not stored", 500);
  }
  return json(result);
}
