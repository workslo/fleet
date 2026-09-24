import { error, isResponse, json, requestJson } from "./http";
import { decisionsForSource } from "./decisions";
import {
  IDEMPOTENCY_KEY_MESSAGE,
  V1_LIMITS,
  boundedIdentifier,
  boundedSlug,
  boundedText,
  boundedTextArray,
  idempotencyKey,
} from "./limits";
import { principalValues } from "./types";
import type { Actor, AuthorizationInput, Env, ProjectRow } from "./types";

type IdempotencyRecord = {
  method: string;
  path: string;
  request_hash: string;
  response_status: number;
  response_body: string;
};

type ProjectInput = { slug: string; title: string; originator_id: string };

function actor(id: string | null) {
  return id ? { id } : null;
}

// #9. Every decoder below returns the trimmed, bounded value rather than casting the
// caller's object, so what is written to D1 is what was validated.
function envelopeList(value: unknown): string[] | null {
  return boundedTextArray(value, V1_LIMITS.envelope_items, V1_LIMITS.summary);
}

function projectInput(value: unknown): ProjectInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const slug = boundedSlug(input.slug);
  const title = boundedText(input.title, V1_LIMITS.title);
  const originator_id = boundedIdentifier(input.originator_id);
  return slug !== null && title !== null && originator_id !== null
    ? { slug, title, originator_id }
    : null;
}

function authorizationInput(value: unknown): AuthorizationInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const proposed_owner_id = boundedIdentifier(input.proposed_owner_id);
  const outcome = boundedText(input.outcome, V1_LIMITS.summary);
  const plan = boundedText(input.plan, V1_LIMITS.plan);
  const scope = envelopeList(input.scope);
  const exclusions = envelopeList(input.exclusions);
  const delegated_actions = envelopeList(input.delegated_actions);
  const gates = envelopeList(input.gates);
  const validation_evidence = envelopeList(input.validation_evidence);
  if (
    proposed_owner_id === null || outcome === null || plan === null ||
    scope === null || exclusions === null || delegated_actions === null ||
    gates === null || validation_evidence === null
  ) return null;
  return { proposed_owner_id, outcome, scope, exclusions, delegated_actions, gates, validation_evidence, plan };
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function priorReplay(
  env: Env,
  caller: Actor,
  request: Request,
  body: unknown,
): Promise<{ key: string; hash: string } | Response> {
  const key = idempotencyKey(request);
  if (!key) return error("invalid_request", IDEMPOTENCY_KEY_MESSAGE, 400);
  const hash = await sha256(JSON.stringify(body));
  const path = new URL(request.url).pathname;
  const existing = await env.DB.prepare(
    `SELECT method, path, request_hash, response_status, response_body
       FROM idempotency_records WHERE actor_id = ? AND idempotency_key = ?`,
  ).bind(caller.id, key).first<IdempotencyRecord>();
  if (!existing) return { key, hash };
  if (existing.method !== request.method || existing.path !== path || existing.request_hash !== hash) {
    return error("idempotency_conflict", "Idempotency-Key was reused with a different payload", 409);
  }
  return new Response(existing.response_body, {
    status: existing.response_status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function idempotencyStatement(
  env: Env,
  caller: Actor,
  request: Request,
  idempotency: { key: string; hash: string },
  status: number,
  body: string,
) {
  return env.DB.prepare(
    `INSERT INTO idempotency_records (actor_id, idempotency_key, method, path, request_hash, response_status, response_body)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(caller.id, idempotency.key, request.method, new URL(request.url).pathname, idempotency.hash, status, body);
}

function storedResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function projectRow(env: Env, projectId: string): Promise<ProjectRow | null> {
  return env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(projectId).first<ProjectRow>();
}

async function activeActor(env: Env, actorId: string): Promise<boolean> {
  const record = await env.DB.prepare("SELECT id FROM actors WHERE id = ? AND active = 1").bind(actorId).first<{ id: string }>();
  return Boolean(record);
}

function expectedVersion(request: Request): number | Response {
  const header = request.headers.get("If-Match");
  const match = header?.match(/^"([1-9]\d*)"$/);
  const version = match?.[1] === undefined ? Number.NaN : Number(match[1]);
  return Number.isSafeInteger(version) && version > 0
    ? version
    : error("invalid_request", "If-Match must be a quoted positive project version", 400);
}

async function card(env: Env, row: ProjectRow, includeNeedsShane = true) {
  const results = await env.DB.batch([
    env.DB.prepare("SELECT revision, outcome, scope_json, exclusions_json, delegated_actions_json, gates_json, validation_evidence_json FROM project_envelope_revisions WHERE project_id = ? ORDER BY revision DESC LIMIT 1").bind(row.id),
    env.DB.prepare("SELECT revision, body FROM plan_revisions WHERE project_id = ? ORDER BY revision DESC LIMIT 1").bind(row.id),
    env.DB.prepare("SELECT uri, summary, created_at FROM evidence_links WHERE project_id = ? ORDER BY id DESC LIMIT 20").bind(row.id),
    env.DB.prepare("SELECT activity_events.type, activity_events.created_at, actors.id AS actor_id FROM activity_events JOIN actors ON actors.id = activity_events.actor_id WHERE project_id = ? ORDER BY activity_events.id DESC LIMIT 20").bind(row.id),
  ]);
  const envelope = results[0];
  const plan = results[1];
  const evidence = results[2];
  const activity = results[3];
  if (!envelope || !plan || !evidence || !activity) {
    throw new Error("project card query returned an incomplete result set");
  }
  const currentEnvelope = envelope.results[0] as Record<string, unknown> | undefined;
  const currentPlan = plan.results[0] as Record<string, unknown> | undefined;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    originator: actor(row.originator_id),
    submitter: actor(row.submitter_id),
    owner: actor(row.owner_id),
    proposed_owner: actor(row.proposed_owner_id),
    state: row.state,
    health: row.health,
    next_action: row.next_action,
    version: row.version,
    ...(includeNeedsShane ? { needs_shane: await decisionsForSource(env, { projectId: row.id }) } : {}),
    envelope: currentEnvelope && {
      revision: currentEnvelope.revision,
      outcome: currentEnvelope.outcome,
      scope: JSON.parse(String(currentEnvelope.scope_json)),
      exclusions: JSON.parse(String(currentEnvelope.exclusions_json)),
      delegated_actions: JSON.parse(String(currentEnvelope.delegated_actions_json)),
      gates: JSON.parse(String(currentEnvelope.gates_json)),
      validation_evidence: JSON.parse(String(currentEnvelope.validation_evidence_json)),
    },
    plan: currentPlan && { revision: currentPlan.revision, body: currentPlan.body },
    evidence: evidence.results,
    activity: activity.results.map((event) => {
      const value = event as { actor_id: string; created_at: string; type: string };
      return { actor: actor(value.actor_id), type: value.type, created_at: value.created_at };
    }),
    updated_at: row.updated_at,
  };
}

export async function createProject(request: Request, env: Env, caller: Actor): Promise<Response> {
  const body = await requestJson(request);
  if (isResponse(body)) return body;
  const input = projectInput(body);
  if (!input) return error("invalid_request", `slug (canonical, at most ${V1_LIMITS.slug} bytes), title (at most ${V1_LIMITS.title} bytes), and originator_id are required and must be non-blank`, 400);
  if (!await activeActor(env, input.originator_id)) return error("invalid_request", "originator_id must be an active actor", 400);
  const idempotency = await priorReplay(env, caller, request, body);
  if (isResponse(idempotency)) return idempotency;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const responseBody = JSON.stringify({
    id,
    slug: input.slug,
    title: input.title,
    originator: actor(input.originator_id),
    submitter: actor(caller.id),
    owner: null,
    proposed_owner: null,
    state: "Proposed",
    health: "On Track",
    next_action: null,
    version: 1,
    evidence: [],
    activity: [{ actor: actor(caller.id), type: "project.proposed", created_at: now }],
    updated_at: now,
  });
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO projects (id, slug, title, originator_id, submitter_id, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'Proposed', ?, ?)").bind(id, input.slug, input.title, input.originator_id, caller.id, now, now),
      env.DB.prepare(
        `INSERT INTO activity_events
          (project_id, actor_id, principal_provider, principal_issuer, principal_kind, principal_subject, type, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'project.proposed', ?, ?)`,
      ).bind(id, caller.id, ...principalValues(caller), JSON.stringify({ slug: input.slug }), now),
      idempotencyStatement(env, caller, request, idempotency, 201, responseBody),
    ]);
  } catch {
    const replay = await priorReplay(env, caller, request, body);
    if (isResponse(replay)) return replay;
    const existing = await env.DB.prepare("SELECT id FROM projects WHERE slug = ?").bind(input.slug).first<{ id: string }>();
    return existing
      ? error("conflict", "project slug already exists", 409)
      : error("internal_error", "project proposal was not stored", 500);
  }
  return storedResponse(responseBody, 201);
}

export async function authorizeProject(request: Request, env: Env, caller: Actor, projectId: string): Promise<Response> {
  if (caller.id !== "shane") return error("forbidden", "only Shane may authorize a project", 403);
  const body = await requestJson(request);
  if (isResponse(body)) return body;
  const input = authorizationInput(body);
  if (!input) return error("invalid_request", "authorization envelope is incomplete: every field must be non-blank and within its V1 limit", 400);
  if (!await activeActor(env, input.proposed_owner_id)) return error("invalid_request", "proposed_owner_id must be an active actor", 400);
  const version = expectedVersion(request);
  if (isResponse(version)) return version;
  const idempotency = await priorReplay(env, caller, request, body);
  if (isResponse(idempotency)) return idempotency;
  const project = await projectRow(env, projectId);
  if (!project) return error("not_found", "project does not exist", 404);
  if (project.version !== version) return error("precondition_failed", "project version is stale", 412);
  if (project.state !== "Proposed") return error("conflict", "project is not proposed", 409);
  const currentCard = await card(env, project);
  const now = new Date().toISOString();
  const responseBody = JSON.stringify({
    ...currentCard,
    proposed_owner: actor(input.proposed_owner_id),
    state: "Authorized",
    version: version + 1,
    envelope: {
      revision: 1,
      outcome: input.outcome,
      scope: input.scope,
      exclusions: input.exclusions,
      delegated_actions: input.delegated_actions,
      gates: input.gates,
      validation_evidence: input.validation_evidence,
    },
    plan: { revision: 1, body: input.plan },
    activity: [
      { actor: actor(caller.id), type: "project.authorized", created_at: now },
      ...currentCard.activity,
    ],
    updated_at: now,
  });
  let transition: D1Result<unknown> | undefined;
  let replay: D1Result<unknown> | undefined;
  try {
    const results = await env.DB.batch([
      env.DB.prepare(
        "UPDATE projects SET proposed_owner_id = ?, state = 'Authorized', version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND state = 'Proposed'",
      ).bind(input.proposed_owner_id, now, projectId, version),
      env.DB.prepare(
        `INSERT INTO project_envelope_revisions (project_id, revision, actor_id, outcome, scope_json, exclusions_json, delegated_actions_json, gates_json, validation_evidence_json, created_at)
         SELECT ?, 1, ?, ?, ?, ?, ?, ?, ?, ?
           FROM projects
          WHERE id = ? AND version = ? AND state = 'Authorized' AND proposed_owner_id = ?`,
      ).bind(projectId, caller.id, input.outcome, JSON.stringify(input.scope), JSON.stringify(input.exclusions), JSON.stringify(input.delegated_actions), JSON.stringify(input.gates), JSON.stringify(input.validation_evidence), now, projectId, version + 1, input.proposed_owner_id),
      env.DB.prepare(
        `INSERT INTO plan_revisions (project_id, revision, actor_id, body, created_at)
         SELECT ?, 1, ?, ?, ?
           FROM projects
          WHERE id = ? AND version = ? AND state = 'Authorized' AND proposed_owner_id = ?`,
      ).bind(projectId, caller.id, input.plan, now, projectId, version + 1, input.proposed_owner_id),
      env.DB.prepare(
        `INSERT INTO activity_events
          (project_id, actor_id, principal_provider, principal_issuer, principal_kind, principal_subject, type, payload_json, created_at)
         SELECT ?, ?, ?, ?, ?, ?, 'project.authorized', ?, ?
           FROM projects
          WHERE id = ? AND version = ? AND state = 'Authorized' AND proposed_owner_id = ?`,
      ).bind(projectId, caller.id, ...principalValues(caller), JSON.stringify({ proposed_owner_id: input.proposed_owner_id }), now, projectId, version + 1, input.proposed_owner_id),
      env.DB.prepare(
        `INSERT INTO idempotency_records (actor_id, idempotency_key, method, path, request_hash, response_status, response_body)
         SELECT ?, ?, ?, ?, ?, 200, ?
          WHERE EXISTS (SELECT 1 FROM projects WHERE id = ? AND version = ? AND state = 'Authorized' AND proposed_owner_id = ?)`,
      ).bind(caller.id, idempotency.key, request.method, new URL(request.url).pathname, idempotency.hash, responseBody, projectId, version + 1, input.proposed_owner_id),
    ]);
    transition = results[0];
    replay = results[4];
  } catch {
    const stored = await priorReplay(env, caller, request, body);
    if (isResponse(stored)) return stored;
    const current = await projectRow(env, projectId);
    return current?.version !== version
      ? error("precondition_failed", "project version is stale", 412)
      : error("internal_error", "project authorization was not stored", 500);
  }
  if (transition?.meta.changes !== 1) {
    const stored = await priorReplay(env, caller, request, body);
    if (isResponse(stored)) return stored;
    const current = await projectRow(env, projectId);
    if (current?.version !== version) return error("precondition_failed", "project version is stale", 412);
    return error("conflict", "project is not proposed", 409);
  }
  if (replay?.meta.changes !== 1) return error("internal_error", "project authorization response was not stored", 500);
  return storedResponse(responseBody);
}

export async function acceptOwnership(request: Request, env: Env, caller: Actor, projectId: string): Promise<Response> {
  const body = await requestJson(request);
  if (isResponse(body)) return body;
  if (!body || typeof body !== "object" || Object.keys(body).length !== 0) return error("invalid_request", "owner acceptance does not accept fields", 400);
  const version = expectedVersion(request);
  if (isResponse(version)) return version;
  const idempotency = await priorReplay(env, caller, request, body);
  if (isResponse(idempotency)) return idempotency;
  const project = await projectRow(env, projectId);
  if (!project) return error("not_found", "project does not exist", 404);
  if (project.proposed_owner_id !== caller.id) return error("forbidden", "only the proposed owner may accept ownership", 403);
  if (project.version !== version) return error("precondition_failed", "project version is stale", 412);
  if (project.state !== "Authorized") return error("conflict", "project is not authorized", 409);
  const currentCard = await card(env, project);
  const now = new Date().toISOString();
  const responseBody = JSON.stringify({
    ...currentCard,
    owner: actor(caller.id),
    proposed_owner: null,
    state: "Active",
    version: version + 1,
    activity: [
      { actor: actor(caller.id), type: "project.owner_accepted", created_at: now },
      ...currentCard.activity,
    ],
    updated_at: now,
  });
  let transition: D1Result<unknown> | undefined;
  let replay: D1Result<unknown> | undefined;
  try {
    const results = await env.DB.batch([
      env.DB.prepare(
        "UPDATE projects SET owner_id = ?, proposed_owner_id = NULL, state = 'Active', version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND state = 'Authorized' AND proposed_owner_id = ?",
      ).bind(caller.id, now, projectId, version, caller.id),
      env.DB.prepare(
        `INSERT INTO activity_events
          (project_id, actor_id, principal_provider, principal_issuer, principal_kind, principal_subject, type, payload_json, created_at)
         SELECT ?, ?, ?, ?, ?, ?, 'project.owner_accepted', '{}', ?
           FROM projects
          WHERE id = ? AND version = ? AND state = 'Active' AND owner_id = ?`,
      ).bind(projectId, caller.id, ...principalValues(caller), now, projectId, version + 1, caller.id),
      env.DB.prepare(
        `INSERT INTO idempotency_records (actor_id, idempotency_key, method, path, request_hash, response_status, response_body)
         SELECT ?, ?, ?, ?, ?, 200, ?
          WHERE EXISTS (SELECT 1 FROM projects WHERE id = ? AND version = ? AND state = 'Active' AND owner_id = ?)`,
      ).bind(caller.id, idempotency.key, request.method, new URL(request.url).pathname, idempotency.hash, responseBody, projectId, version + 1, caller.id),
    ]);
    transition = results[0];
    replay = results[2];
  } catch {
    const stored = await priorReplay(env, caller, request, body);
    if (isResponse(stored)) return stored;
    const current = await projectRow(env, projectId);
    return current?.version !== version
      ? error("precondition_failed", "project version is stale", 412)
      : error("internal_error", "project owner acceptance was not stored", 500);
  }
  if (transition?.meta.changes !== 1) {
    const stored = await priorReplay(env, caller, request, body);
    if (isResponse(stored)) return stored;
    const current = await projectRow(env, projectId);
    if (current?.version !== version) return error("precondition_failed", "project version is stale", 412);
    return error("conflict", "project ownership cannot be accepted", 409);
  }
  if (replay?.meta.changes !== 1) return error("internal_error", "project owner acceptance response was not stored", 500);
  return storedResponse(responseBody);
}

export async function getProject(env: Env, projectId: string): Promise<Response> {
  const project = await projectRow(env, projectId);
  return project ? json(await card(env, project)) : error("not_found", "project does not exist", 404);
}

export async function portfolio(env: Env): Promise<Response> {
  const projects = await env.DB.prepare("SELECT * FROM projects ORDER BY updated_at DESC, id DESC").all<ProjectRow>();
  return json({ projects: await Promise.all(projects.results.map((project) => card(env, project, false))) });
}
