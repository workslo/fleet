/**
 * Fleet Routine reference client — response decoders (V1)
 *
 * Closes workslo/fleet#7. The client used to cast successful response bodies
 * to their contract type (`(await response.json()) as AgentWorkSnapshot`) and
 * then persist `next_cursor` from the result. A cast is not a check: a 2xx
 * whose body is the wrong shape — or whose `next_cursor` is not a cursor —
 * reached `CursorStore.write()` and became durable native state.
 *
 * Every decoder here validates the shape `contracts/http-v1.md` promises for
 * one route, and returns the same value typed. Three rules hold everywhere:
 *
 *   1. **Strict on every declared field, forward-compatible on the rest.**
 *      A declared field of the wrong type is a decode failure. An unknown
 *      property is preserved untouched, so a server that adds a field does
 *      not break a client that has not been updated.
 *
 *   2. **No response data in the error.** A decode failure names the JSON
 *      path and the expected shape, never the offending value. Response
 *      bodies can carry another actor's data, and an error message travels
 *      into logs. This follows `access-auth.ts`, which reports a provider
 *      failure by the error's `name` and drops its message.
 *
 *   3. **Cursors are validated as cursors.** `contracts/http-v1.md`: the
 *      cursor is "the last observed integer `activity_events.id`, encoded as
 *      an opaque decimal string". Opaque to the client does not mean
 *      unchecked — a decimal string is still a decimal string, and this is
 *      the one field the client writes to durable storage.
 *
 * The decoders are pure and platform-free. They throw `ResponseDecodeError`;
 * the client converts that to `FleetRoutineError` with code
 * `invalid_response` so a caller distinguishes "the server said no" from
 * "the server said yes and I could not believe it".
 */

import type { NeedsShane, NeedsShaneEvidence, NeedsShaneKind, NeedsShaneOutcome, DecisionChoice } from "../contracts/needs-shane";
import type { RequestBlocker, RequestEnding, RequestEvidence, RequestResolution } from "../contracts/request-lifecycle";
import type {
  ActivityEvent,
  ActorRef,
  AcceptedRequestScope,
  AgentWorkSnapshot,
  ArtifactLink,
  EvidenceLink,
  Obligation,
  PullCandidate,
  WorkRequestState,
  WorkRequestSummary,
} from "./reference-client";

/** Thrown when a 2xx body does not match the shape the contract promises. */
export class ResponseDecodeError extends Error {
  /** JSON path of the offending field, e.g. `outbound_requests[0].state`. */
  readonly path: string;

  constructor(path: string, expected: string) {
    super(`response field ${path} is not ${expected}`);
    this.name = "ResponseDecodeError";
    this.path = path;
  }
}

export type Decoder<T> = (value: unknown, path?: string) => T;

// ---------------------------------------------------------------------------
// Closed unions — validated against their members, because passing an unknown
// member through hands the caller a value its own declared type says cannot
// exist. A new state added server-side is a contract change, not a field.
// ---------------------------------------------------------------------------

const WORK_REQUEST_STATES: readonly WorkRequestState[] = [
  "Pending", "Accepted", "Fulfilled", "Returned", "Declined", "Withdrawn", "Expired",
];
const REQUEST_ENDINGS: readonly RequestEnding[] = [
  "Fulfilled", "Returned", "Declined", "Withdrawn", "Expired",
];
const OBLIGATION_SOURCES: readonly Obligation["source"][] = ["accepted_request", "owner_next_action"];
const NEEDS_SHANE_KINDS: readonly NeedsShaneKind[] = ["decision", "action", "decision_and_action"];
const DECISION_CHOICES: readonly DecisionChoice[] = ["approved", "declined"];
const ACTION_STATUSES: readonly NeedsShane["action_status"][] = [
  "not_requested", "awaiting_decision", "pending", "completed", "not_required",
];

/**
 * The cursor's syntax, from `contracts/http-v1.md`: an opaque decimal string.
 * Digits only, at least one, and no longer than the 19 digits a SQLite
 * INTEGER rowid can reach — so a malformed 2xx cannot write an unbounded
 * string into an agent's native store. Leading zeros are accepted: the
 * contract fixes the alphabet, not a canonical form, and the client's job is
 * to refuse what cannot be a cursor, not to police how the server spells one.
 */
const CURSOR_PATTERN = /^[0-9]{1,19}$/;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function fail(path: string, expected: string): never {
  throw new ResponseDecodeError(path, expected);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) fail(path, "an object");
  return value;
}

function str(value: unknown, path: string): string {
  if (typeof value !== "string") fail(path, "a string");
  return value;
}

function nullableStr(value: unknown, path: string): string | null {
  if (value === null) return null;
  return str(value, path);
}

/**
 * A declared-optional-and-nullable field: absent and `null` are both allowed.
 * Use `optionalStr` where the declared type is `field?: string` with no `| null`
 * — accepting `null` there would be laxer than the type the caller is handed,
 * and "strict on every declared field" has to include that distinction.
 */
function optionalNullableStr(value: unknown, path: string): string | null | undefined {
  if (value === undefined) return undefined;
  return nullableStr(value, path);
}

/** A declared-optional field that is NOT nullable: absent or a string. */
function optionalStr(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  return str(value, path);
}

function num(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "a finite number");
  return value;
}

function int(value: unknown, path: string): number {
  if (!Number.isInteger(num(value, path))) fail(path, "an integer");
  return value as number;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "a boolean");
  return value;
}

function member<T extends string>(value: unknown, path: string, members: readonly T[]): T {
  const s = str(value, path);
  if (!(members as readonly string[]).includes(s)) {
    fail(path, `one of ${members.join(", ")}`);
  }
  return s as T;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, "an array");
  return value;
}

function each<T>(value: unknown, path: string, decode: (v: unknown, p: string) => T): T[] {
  const items = array(value, path);
  items.forEach((item, i) => decode(item, `${path}[${i}]`));
  return value as T[];
}

/** Validates the cursor's syntax. See CURSOR_PATTERN. */
export function decodeCursor(value: unknown, path = "next_cursor"): string {
  const s = str(value, path);
  if (!CURSOR_PATTERN.test(s)) fail(path, "an opaque decimal cursor (1-19 digits)");
  return s;
}

// ---------------------------------------------------------------------------
// Shared objects
// ---------------------------------------------------------------------------

function actorRef(value: unknown, path: string): ActorRef {
  const o = record(value, path);
  str(o.id, `${path}.id`);
  return value as ActorRef;
}

function evidenceLink(value: unknown, path: string): EvidenceLink {
  const o = record(value, path);
  str(o.uri, `${path}.uri`);
  str(o.summary, `${path}.summary`);
  optionalStr(o.created_at, `${path}.created_at`);
  return value as EvidenceLink;
}

function needsShaneEvidence(value: unknown, path: string): NeedsShaneEvidence {
  const o = record(value, path);
  str(o.uri, `${path}.uri`);
  str(o.summary, `${path}.summary`);
  return value as NeedsShaneEvidence;
}

function requestEvidence(value: unknown, path: string): RequestEvidence {
  return needsShaneEvidence(value, path) as RequestEvidence;
}

function artifactLink(value: unknown, path: string): ArtifactLink | null {
  if (value === null) return null;
  return evidenceLink(value, path);
}

function acceptedScope(value: unknown, path: string): AcceptedRequestScope | null {
  if (value === null) return null;
  const o = record(value, path);
  str(o.title, `${path}.title`);
  str(o.detail, `${path}.detail`);
  if (o.artifact === undefined) fail(`${path}.artifact`, "present (an object or null)");
  artifactLink(o.artifact, `${path}.artifact`);
  optionalNullableStr(o.expires_at, `${path}.expires_at`);
  return value as AcceptedRequestScope;
}

function blocker(value: unknown, path: string): RequestBlocker | null {
  if (value === null) return null;
  const o = record(value, path);
  str(o.reason, `${path}.reason`);
  str(o.resolution_condition, `${path}.resolution_condition`);
  actorRef(o.actor, `${path}.actor`);
  str(o.at, `${path}.at`);
  return value as RequestBlocker;
}

function resolution(value: unknown, path: string): RequestResolution | null {
  if (value === null) return null;
  const o = record(value, path);
  member(o.state, `${path}.state`, REQUEST_ENDINGS);
  actorRef(o.actor, `${path}.actor`);
  str(o.at, `${path}.at`);
  nullableStr(o.reason, `${path}.reason`);
  nullableStr(o.unfinished_work, `${path}.unfinished_work`);
  each(o.evidence, `${path}.evidence`, requestEvidence);
  return value as RequestResolution;
}

function needsShaneOutcome(value: unknown, path: string): NeedsShaneOutcome {
  const o = record(value, path);
  actorRef(o.actor, `${path}.actor`);
  str(o.summary, `${path}.summary`);
  each(o.evidence, `${path}.evidence`, needsShaneEvidence);
  str(o.at, `${path}.at`);
  return value as NeedsShaneOutcome;
}

// ---------------------------------------------------------------------------
// Route payloads
// ---------------------------------------------------------------------------

/** `GET /v1/decisions/:id`, `POST /v1/decisions`, and the outcome routes. */
export function decodeNeedsShane(value: unknown, path = "$"): NeedsShane {
  const o = record(value, path);
  str(o.id, `${path}.id`);
  nullableStr(o.project_id, `${path}.project_id`);
  nullableStr(o.work_request_id, `${path}.work_request_id`);
  if (o.requester !== null) actorRef(o.requester, `${path}.requester`);
  member(o.kind, `${path}.kind`, NEEDS_SHANE_KINDS);
  str(o.question, `${path}.question`);
  nullableStr(o.resolution_condition, `${path}.resolution_condition`);
  str(o.state, `${path}.state`);
  int(o.version, `${path}.version`);
  if (o.decision !== null) {
    needsShaneOutcome(o.decision, `${path}.decision`);
    member(record(o.decision, `${path}.decision`).choice, `${path}.decision.choice`, DECISION_CHOICES);
  }
  if (o.action !== null) needsShaneOutcome(o.action, `${path}.action`);
  if (o.delegation !== null) {
    const d = record(o.delegation, `${path}.delegation`);
    actorRef(d.actor, `${path}.delegation.actor`);
    actorRef(d.delegate, `${path}.delegation.delegate`);
    str(d.summary, `${path}.delegation.summary`);
    str(d.at, `${path}.delegation.at`);
  }
  member(o.action_status, `${path}.action_status`, ACTION_STATUSES);
  str(o.created_at, `${path}.created_at`);
  str(o.updated_at, `${path}.updated_at`);
  return value as NeedsShane;
}

/** `GET /v1/requests/:id` and every request mutation and transition. */
export function decodeWorkRequestSummary(value: unknown, path = "$"): WorkRequestSummary {
  const o = record(value, path);
  str(o.id, `${path}.id`);
  nullableStr(o.project_id, `${path}.project_id`);
  actorRef(o.requester, `${path}.requester`);
  actorRef(o.recipient, `${path}.recipient`);
  str(o.title, `${path}.title`);
  str(o.detail, `${path}.detail`);
  member(o.state, `${path}.state`, WORK_REQUEST_STATES);
  int(o.version, `${path}.version`);
  nullableStr(o.accepted_at, `${path}.accepted_at`);
  nullableStr(o.fulfilled_at, `${path}.fulfilled_at`);
  str(o.created_at, `${path}.created_at`);
  str(o.updated_at, `${path}.updated_at`);

  // Optional in the contract type: absent is fine, present must be right.
  if (o.artifact !== undefined) artifactLink(o.artifact, `${path}.artifact`);
  if (o.accepted_scope !== undefined) acceptedScope(o.accepted_scope, `${path}.accepted_scope`);
  if (o.evidence !== undefined) each(o.evidence, `${path}.evidence`, evidenceLink);
  if (o.needs_shane !== undefined) each(o.needs_shane, `${path}.needs_shane`, decodeNeedsShane);

  // Partial<RequestLifecycleFields>.
  if (o.expires_at !== undefined) nullableStr(o.expires_at, `${path}.expires_at`);
  if (o.expiry_due !== undefined) bool(o.expiry_due, `${path}.expiry_due`);
  if (o.ended_at !== undefined) nullableStr(o.ended_at, `${path}.ended_at`);
  if (o.resolution !== undefined) resolution(o.resolution, `${path}.resolution`);
  if (o.blocker !== undefined) blocker(o.blocker, `${path}.blocker`);

  return value as WorkRequestSummary;
}

/** `POST /v1/pull-candidates`. */
export function decodePullCandidate(value: unknown, path = "$"): PullCandidate {
  const o = record(value, path);
  str(o.id, `${path}.id`);
  str(o.project_id, `${path}.project_id`);
  actorRef(o.actor, `${path}.actor`);
  str(o.title, `${path}.title`);
  str(o.detail, `${path}.detail`);
  str(o.created_at, `${path}.created_at`);
  return value as PullCandidate;
}

function activityEvent(value: unknown, path: string): ActivityEvent {
  const o = record(value, path);
  int(o.id, `${path}.id`);
  str(o.type, `${path}.type`);
  actorRef(o.actor, `${path}.actor`);
  nullableStr(o.project_id, `${path}.project_id`);
  if (o.request_id !== undefined) nullableStr(o.request_id, `${path}.request_id`);
  str(o.created_at, `${path}.created_at`);
  return value as ActivityEvent;
}

function obligation(value: unknown, path: string): Obligation {
  const o = record(value, path);
  member(o.source, `${path}.source`, OBLIGATION_SOURCES);
  nullableStr(o.project_id, `${path}.project_id`);
  if (o.request_id !== undefined) str(o.request_id, `${path}.request_id`);
  if (o.blocker !== undefined) blocker(o.blocker, `${path}.blocker`);
  return value as Obligation;
}

/** `GET /v1/me/work?after=<cursor>` — the reconcile snapshot. */
export function decodeAgentWorkSnapshot(value: unknown, path = "$"): AgentWorkSnapshot {
  const o = record(value, path);
  each(o.obligations, `${path}.obligations`, obligation);
  each(o.outbound_requests, `${path}.outbound_requests`, decodeWorkRequestSummary);
  each(o.inbound_requests, `${path}.inbound_requests`, decodeWorkRequestSummary);
  each(o.pull_candidates, `${path}.pull_candidates`, decodePullCandidate);
  each(o.activity, `${path}.activity`, activityEvent);
  if (o.needs_shane !== undefined) each(o.needs_shane, `${path}.needs_shane`, decodeNeedsShane);
  decodeCursor(o.next_cursor, `${path}.next_cursor`);
  return value as AgentWorkSnapshot;
}

/** `GET /v1/activity?after=<cursor>`. */
export function decodeActivityPage(
  value: unknown,
  path = "$",
): { activity: ActivityEvent[]; next_cursor: string } {
  const o = record(value, path);
  each(o.activity, `${path}.activity`, activityEvent);
  decodeCursor(o.next_cursor, `${path}.next_cursor`);
  return value as { activity: ActivityEvent[]; next_cursor: string };
}

/** `GET /v1/decisions` — the `{ decisions: [...] }` envelope. */
export function decodeDecisionsEnvelope(value: unknown, path = "$"): { decisions: NeedsShane[] } {
  const o = record(value, path);
  each(o.decisions, `${path}.decisions`, decodeNeedsShane);
  return value as { decisions: NeedsShane[] };
}
