/**
 * Fleet Routine reference client — V1
 *
 * A dependency-free TypeScript client that answers the four Fleet Routine
 * questions by calling GET /v1/me/work, persists the returned cursor on its
 * native platform, and supports idempotent mutations with retry-safe
 * Idempotency-Key reuse.
 *
 * See contracts/routine-v1.md and contracts/http-v1.md for the full contract.
 *
 * The four required questions (contracts/routine-v1.md):
 *   1. What work is owed now?
 *   2. What outbound requests exist, and what is the state of each?
 *   3. What new inbound requests need attention?
 *   4. What Pull Candidates have been published?
 *
 * Design rules from the contract:
 *   - Persists ONLY the returned opaque decimal next_cursor on its native
 *     platform. A routine must not advance the cursor until native
 *     persistence succeeds.
 *   - For the same logical write, retry with the same Idempotency-Key; do
 *     not make a second request merely because the first response was lost.
 *   - HEARTBEAT and JOURNAL prose, along with personal-work interiors, never
 *     enter Fleet. This client exposes only Fleet API endpoints.
 */

import { buildAuthHeaders, type ReferenceClientAuth } from "./access-auth";
import {
  ResponseDecodeError,
  decodeActivityPage,
  decodeAgentWorkSnapshot,
  decodeDecisionsEnvelope,
  decodeNeedsShane,
  decodePullCandidate,
  decodeWorkRequestSummary,
  type Decoder,
} from "./response-schema";
export { ResponseDecodeError } from "./response-schema";
import type { CompleteAction, CreateNeedsShane, DelegateAction, NeedsShane, RecordDecision } from "../contracts/needs-shane";
export type { CompleteAction, CreateNeedsShane, DelegateAction, NeedsShane, RecordDecision } from "../contracts/needs-shane";
import type { BlockRequestInput, EndRequestInput, RequestBlocker, RequestLifecycleFields, ReturnRequestInput, UnblockRequestInput } from "../contracts/request-lifecycle";
export type { BlockRequestInput, EndRequestInput, RequestBlocker, RequestLifecycleFields, RequestResolution, ReturnRequestInput, UnblockRequestInput } from "../contracts/request-lifecycle";

// ---------------------------------------------------------------------------
// Contract types — matching contracts/http-v1.md
// ---------------------------------------------------------------------------

export type WorkRequestState =
  | "Pending"
  | "Accepted"
  | "Fulfilled"
  | "Returned"
  | "Declined"
  | "Withdrawn"
  | "Expired";

export interface ActorRef {
  id: string;
}

export interface Obligation {
  source: "accepted_request" | "owner_next_action";
  request_id?: string;
  project_id: string | null;
  blocker?: RequestBlocker | null;
}

export interface EvidenceLink {
  uri: string;
  summary: string;
  created_at?: string;
}

export type ArtifactLink = EvidenceLink;

export interface AcceptedRequestScope {
  title: string;
  detail: string;
  artifact: ArtifactLink | null;
  expires_at?: string | null;
}

export interface WorkRequestSummary extends Partial<RequestLifecycleFields> {
  needs_shane?: NeedsShane[];
  id: string;
  project_id: string | null;
  requester: ActorRef;
  recipient: ActorRef;
  title: string;
  detail: string;
  artifact?: ArtifactLink | null;
  accepted_scope?: AcceptedRequestScope | null;
  evidence?: EvidenceLink[];
  state: WorkRequestState;
  version: number;
  accepted_at: string | null;
  fulfilled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PullCandidate {
  id: string;
  project_id: string;
  actor: ActorRef;
  title: string;
  detail: string;
  created_at: string;
}

export interface ActivityEvent {
  id: number;
  type: string;
  actor: ActorRef;
  project_id: string | null;
  request_id?: string | null;
  created_at: string;
}

export interface AgentWorkSnapshot {
  needs_shane?: NeedsShane[];
  obligations: Obligation[];
  outbound_requests: WorkRequestSummary[];
  inbound_requests: WorkRequestSummary[];
  pull_candidates: PullCandidate[];
  activity: ActivityEvent[];
  next_cursor: string;
}

export type DecisionRequest = NeedsShane;

// ---------------------------------------------------------------------------
// The four Fleet Routine answers
// ---------------------------------------------------------------------------

export interface FleetRoutineResult {
  /** Current source-linked Needs Shane records, including resolved outcomes. */
  needsShane: NeedsShane[];
  /** 1. What work is owed now? */
  obligations: Obligation[];
  /** 2. What outbound requests exist, and what is the state of each? */
  outboundRequests: WorkRequestSummary[];
  /** 3. What new inbound requests need attention? */
  inboundRequests: WorkRequestSummary[];
  /** 4. What Pull Candidates have been published? */
  pullCandidates: PullCandidate[];
  /**
   * Activity events in the consumed cursor window.
   *
   * reconcile() advances the shared cursor past these events. Without
   * exposing them here, getActivity() (which shares the same CursorStore)
   * would never be able to retrieve them — the cursor has already moved.
   * This is the "reconcile destroys activity" bug: events fetched but
   * dropped, cursor advanced past them, no path to recover.
   */
  activity: ActivityEvent[];
  /** The cursor to persist for the next run (already persisted by reconcile). */
  cursor: string;
}

// ---------------------------------------------------------------------------
// Injectable interfaces — the caller provides native-platform implementations
// ---------------------------------------------------------------------------

/**
 * Persists the cursor on the agent's native platform.
 *
 * The cursor is the last observed activity_events.id, encoded as an opaque
 * decimal string. A routine must not advance the cursor until its own native
 * persistence succeeds.
 */
export interface CursorStore {
  /** Returns the last persisted cursor, or null if no cursor has been stored. */
  read(): Promise<string | null>;
  /** Persists the new cursor. Must resolve only after the write is durable. */
  write(cursor: string): Promise<void>;
}

/**
 * Minimal fetch signature. Matches the structural shape of globalThis.fetch
 * without depending on DOM or Worker type definitions. The caller may pass
 * globalThis.fetch or a test mock.
 */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class FleetRoutineError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "FleetRoutineError";
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Client options
// ---------------------------------------------------------------------------

export interface FleetRoutineClientOptions {
  /** Base URL of the Fleet Worker, e.g. "https://fleet.workslo.ai". */
  baseUrl: string;
  /**
   * Explicit auth selection — no default. Either "access-pair" (the client
   * sends the two Cloudflare Access service-credential headers sourced from
   * the caller's injected request-time provider) or "external" (the client
   * sends no auth headers; an external proxy layer injects them).
   *
   * The actor identity is never caller-supplied: the Fleet Worker derives it
   * from the verified Access JWT (workslo/fleet#31). The retired
   * caller-identity header assumption ("X-Fleet-Principal") is intentionally
   * not supported.
   */
  auth: ReferenceClientAuth;
  /** Native-platform cursor persistence. Required. */
  cursorStore: CursorStore;
  /**
   * Injectable fetch. Required — the caller provides its platform's fetch
   * (globalThis.fetch in a Worker/Node, or a test mock) so the client stays
   * dependency-free and platform-agnostic.
   */
  fetchFn: FetchLike;
}

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

export class FleetRoutineClient {
  private readonly baseUrl: string;
  private readonly fetchFn: FetchLike;
  private readonly cursorStore: CursorStore;
  private readonly auth: ReferenceClientAuth;

  constructor(opts: FleetRoutineClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.fetchFn = opts.fetchFn;
    this.cursorStore = opts.cursorStore;
    this.auth = opts.auth;
  }

  /**
   * Resolve the auth headers for one request. Invoked per request (not in
   * the constructor) so request-time credential providers are read fresh,
   * and so a provider failure surfaces BEFORE any network call or cursor
   * advancement.
   */
  private authHeaders(): Promise<Record<string, string>> {
    return buildAuthHeaders(this.auth);
  }

  // --- The Fleet Routine ---

  /**
   * Run the Fleet Routine — answers the four required questions.
   *
   * Reads the persisted cursor, calls GET /v1/me/work?after=<cursor>,
   * persists the new cursor, and returns the four answers.
   *
   * Cursor safety: the cursor is NOT advanced if the API call fails or
   * if native persistence fails. The caller can safely retry reconcile()
   * with the same cursor.
   *
   * Three outcomes (per API contract): success, failure, and unknown.
   * A network error (fetch rejection) is the unknown case — the request
   * may or may not have been received. The cursor is NOT advanced in any
   * non-success case. The caller retries with the same cursor; the server's
   * idempotent read semantics make this safe.
   */
  async reconcile(): Promise<FleetRoutineResult> {
    const cursor = await this.cursorStore.read();
    const after = cursor ?? "0";

    const response = await this.fetchFn(
      `${this.baseUrl}/v1/me/work?after=${encodeURIComponent(after)}`,
      { method: "GET", headers: await this.authHeaders() },
    );

    await this.throwIfError(response, "reconcile_failed", "GET /v1/me/work returned");

    const snapshot = await this.decodeBody(response, decodeAgentWorkSnapshot);

    // Persist cursor BEFORE returning. Native persistence must succeed
    // before the cursor advances (contracts/routine-v1.md).
    await this.cursorStore.write(snapshot.next_cursor);

    return {
      needsShane: snapshot.needs_shane ?? [],
      obligations: snapshot.obligations,
      outboundRequests: snapshot.outbound_requests,
      inboundRequests: snapshot.inbound_requests,
      pullCandidates: snapshot.pull_candidates,
      activity: snapshot.activity,
      cursor: snapshot.next_cursor,
    };
  }

  // --- Mutations (all require Idempotency-Key; transitions require If-Match) ---

  /**
   * Accept a Work Request addressed to this agent.
   *
   * @param requestId   The Work Request id.
   * @param version     The current request version (sent as If-Match).
   * @param idempotencyKey  Reuse the same key for retries of the same logical accept.
   */
  async acceptRequest(
    requestId: string,
    version: number,
    idempotencyKey: string,
  ): Promise<WorkRequestSummary> {
    return this.mutate(
      `/v1/requests/${encodeURIComponent(requestId)}/accept`,
      version,
      {},
      idempotencyKey,
      decodeWorkRequestSummary,
    );
  }

  /**
   * Fulfill a Work Request this agent has accepted.
   *
   * @param requestId   The Work Request id.
   * @param version     The current request version (sent as If-Match).
   * @param idempotencyKey  Reuse the same key for retries of the same logical fulfill.
   * @param evidence    Optional evidence links [{ uri, summary }].
   */
  async fulfillRequest(
    requestId: string,
    version: number,
    idempotencyKey: string,
    evidence?: ReadonlyArray<{ uri: string; summary: string }>,
  ): Promise<WorkRequestSummary> {
    const body: Record<string, unknown> = {};
    if (evidence !== undefined) {
      body.evidence = evidence;
    }
    return this.mutate(
      `/v1/requests/${encodeURIComponent(requestId)}/fulfill`,
      version,
      body,
      idempotencyKey,
      decodeWorkRequestSummary,
    );
  }

  /** Decline a pending invitation without creating an obligation. */
  async declineRequest(requestId: string, version: number, idempotencyKey: string, input: EndRequestInput): Promise<WorkRequestSummary> {
    return this.mutate(`/v1/requests/${encodeURIComponent(requestId)}/decline`, version, input, idempotencyKey, decodeWorkRequestSummary);
  }

  /** Withdraw a pending invitation sent by this agent. */
  async withdrawRequest(requestId: string, version: number, idempotencyKey: string, input: EndRequestInput): Promise<WorkRequestSummary> {
    return this.mutate(`/v1/requests/${encodeURIComponent(requestId)}/withdraw`, version, input, idempotencyKey, decodeWorkRequestSummary);
  }

  /** End an accepted obligation and disclose the unfinished work. */
  async returnRequest(requestId: string, version: number, idempotencyKey: string, input: ReturnRequestInput): Promise<WorkRequestSummary> {
    return this.mutate(`/v1/requests/${encodeURIComponent(requestId)}/return`, version, input, idempotencyKey, decodeWorkRequestSummary);
  }

  /** Attach a blocker while retaining the accepted obligation. */
  async blockRequest(requestId: string, version: number, idempotencyKey: string, input: BlockRequestInput): Promise<WorkRequestSummary> {
    return this.mutate(`/v1/requests/${encodeURIComponent(requestId)}/block`, version, input, idempotencyKey, decodeWorkRequestSummary);
  }

  async unblockRequest(requestId: string, version: number, idempotencyKey: string, input: UnblockRequestInput): Promise<WorkRequestSummary> {
    return this.mutate(`/v1/requests/${encodeURIComponent(requestId)}/unblock`, version, input, idempotencyKey, decodeWorkRequestSummary);
  }

  /** Explicitly record a due invitation expiry; the server enforces its deadline. */
  async expireRequest(requestId: string, version: number, idempotencyKey: string): Promise<WorkRequestSummary> {
    return this.mutate(`/v1/requests/${encodeURIComponent(requestId)}/expire`, version, {}, idempotencyKey, decodeWorkRequestSummary);
  }

  /**
   * Create a Work Request to another agent. Creates no obligation until the
   * recipient explicitly accepts.
   *
   * @param projectId    The project this request belongs to.
   * @param recipientId  The agent who will receive the request.
   * @param title        Short title.
   * @param detail       Full description of the ask.
   * @param idempotencyKey  Reuse the same key for retries.
   * @param expiresAt    Optional immutable deadline for accepting the invitation; accepted work does not expire.
   */
  async createWorkRequest(
    projectId: string,
    recipientId: string,
    title: string,
    detail: string,
    idempotencyKey: string,
    expiresAt?: string,
  ): Promise<WorkRequestSummary> {
    const body: Record<string, unknown> = { recipient_id: recipientId, title, detail };
    if (expiresAt !== undefined) body.expires_at = expiresAt;
    return this.mutate(
      `/v1/projects/${encodeURIComponent(projectId)}/requests`,
      undefined,
      body,
      idempotencyKey,
      decodeWorkRequestSummary,
    );
  }

  /**
   * Create a bounded Work Request without a Fleet Project. The caller shares
   * only the supplied artifact link; personal-work contents remain in place.
   * The optional final deadline limits acceptance only, never accepted work.
   */
  async createStandaloneRequest(
    recipientId: string,
    title: string,
    detail: string,
    idempotencyKey: string,
    artifact?: ArtifactLink,
    expiresAt?: string,
  ): Promise<WorkRequestSummary> {
    const body: Record<string, unknown> = { recipient_id: recipientId, title, detail };
    if (artifact !== undefined) body.artifact = artifact;
    if (expiresAt !== undefined) body.expires_at = expiresAt;
    return this.mutate(
      "/v1/requests",
      undefined,
      body,
      idempotencyKey,
      decodeWorkRequestSummary,
    );
  }

  /**
   * Publish a Pull Candidate. Pull Candidates are voluntary and never create
   * an obligation, claim, or priority.
   *
   * @param projectId    The project this pull relates to.
   * @param title        Short title.
   * @param detail       What the work is.
   * @param idempotencyKey  Reuse the same key for retries.
   */
  async publishPullCandidate(
    projectId: string,
    title: string,
    detail: string,
    idempotencyKey: string,
  ): Promise<PullCandidate> {
    return this.mutate(
      "/v1/pull-candidates",
      undefined,
      { project_id: projectId, title, detail },
      idempotencyKey,
      decodePullCandidate,
    );
  }

  // --- Read endpoints ---

  /** Read one request, including its frozen accepted scope and evidence. */
  async getRequest(requestId: string): Promise<WorkRequestSummary> {
    const response = await this.fetchFn(
      `${this.baseUrl}/v1/requests/${encodeURIComponent(requestId)}`,
      { method: "GET", headers: await this.authHeaders() },
    );
    return this.parseJson(response, decodeWorkRequestSummary);
  }

  /**
   * Read activity events after the supplied cursor.
   *
   * When called with no argument (the Routine path), reads the stored
   * cursor and persists the returned next_cursor after a successful read.
   * When called with an explicit `after` (a historical/ad-hoc read), the
   * durable cursor is NOT advanced — the caller asked for a specific range
   * and the routine's bookkeeping must not jump forward.
   */
  async getActivity(after?: string): Promise<{
    activity: ActivityEvent[];
    next_cursor: string;
  }> {
    const persist = after === undefined;
    const cursor = after ?? (await this.cursorStore.read()) ?? "0";
    const response = await this.fetchFn(
      `${this.baseUrl}/v1/activity?after=${encodeURIComponent(cursor)}`,
      { method: "GET", headers: await this.authHeaders() },
    );

    await this.throwIfError(response, "request_failed", "GET /v1/activity returned");

    const result = await this.decodeBody(response, decodeActivityPage);

    // Persist cursor only on the Routine (no-arg) path. Native persistence
    // must succeed before the cursor advances (contracts/routine-v1.md).
    // Explicit/historical reads do NOT advance the durable cursor —
    // getActivity("1000") must not make later reconcile() skip 11–1000.
    // API or persistence failure leaves the prior cursor intact.
    if (persist) {
      await this.cursorStore.write(result.next_cursor);
    }

    return result;
  }

  /** Read the pending queue, or include resolved history explicitly. */
  async getDecisions(state: "pending" | "all" = "pending"): Promise<DecisionRequest[]> {
    const response = await this.fetchFn(
      `${this.baseUrl}/v1/decisions${state === "all" ? "?state=all" : ""}`,
      { method: "GET", headers: await this.authHeaders() },
    );
    const envelope = await this.parseJson(response, decodeDecisionsEnvelope);
    return envelope.decisions;
  }

  async getDecision(id: string): Promise<NeedsShane> {
    const response = await this.fetchFn(`${this.baseUrl}/v1/decisions/${encodeURIComponent(id)}`, {
      method: "GET", headers: await this.authHeaders(),
    });
    return this.parseJson(response, decodeNeedsShane);
  }

  async createNeedsShane(input: CreateNeedsShane, idempotencyKey: string): Promise<NeedsShane> {
    return this.mutate("/v1/decisions", undefined, input, idempotencyKey, decodeNeedsShane);
  }

  async recordDecision(id: string, version: number, input: RecordDecision, idempotencyKey: string): Promise<NeedsShane> {
    return this.mutate(`/v1/decisions/${encodeURIComponent(id)}/decide`, version, input, idempotencyKey, decodeNeedsShane);
  }

  async completeAction(id: string, version: number, input: CompleteAction, idempotencyKey: string): Promise<NeedsShane> {
    return this.mutate(`/v1/decisions/${encodeURIComponent(id)}/complete-action`, version, input, idempotencyKey, decodeNeedsShane);
  }

  async delegateAction(id: string, version: number, input: DelegateAction, idempotencyKey: string): Promise<NeedsShane> {
    return this.mutate(`/v1/decisions/${encodeURIComponent(id)}/delegate-action`, version, input, idempotencyKey, decodeNeedsShane);
  }

  // --- Internal ---

  /**
   * Check a response for errors. If non-2xx, decode the Fleet error body
   * ({ error: "machine_readable_code", message: "..." }) and throw a
   * FleetRoutineError with the machine-readable code so callers can branch.
   * Falls back to a default code + raw body when the body isn't JSON.
   */
  private async throwIfError(
    response: { status: number; text: () => Promise<string> },
    fallbackCode: string,
    fallbackPrefix: string,
  ): Promise<void> {
    if (response.status < 200 || response.status >= 300) {
      const body = await response.text();
      let code = fallbackCode;
      let message = `${fallbackPrefix} ${response.status}: ${body}`;
      try {
        const parsed = JSON.parse(body) as { error?: string; message?: string };
        if (typeof parsed.error === "string") {
          code = parsed.error;
        }
        if (typeof parsed.message === "string") {
          message = parsed.message;
        }
      } catch {
        // body isn't JSON — keep the default code and raw body as message
      }
      throw new FleetRoutineError(code, message, response.status);
    }
  }

  private async mutate<T>(
    path: string,
    version: number | undefined,
    body: Record<string, unknown>,
    idempotencyKey: string,
    decode: Decoder<T>,
  ): Promise<T> {
    const headers: Record<string, string> = {
      ...(await this.authHeaders()),
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    };
    if (version !== undefined) {
      headers["If-Match"] = `"${version}"`;
    }

    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    return this.parseJson(response, decode);
  }

  private async parseJson<T>(
    response: {
      status: number;
      json: () => Promise<unknown>;
      text: () => Promise<string>;
    },
    decode: Decoder<T>,
  ): Promise<T> {
    await this.throwIfError(response, "request_failed", "Request returned");
    return this.decodeBody(response, decode);
  }

  /**
   * The one place a successful response becomes a typed value (#7).
   *
   * Before this existed, each route cast its body — so a 2xx of the wrong
   * shape became a typed value, and on the two cursor paths it became durable
   * native state before anyone looked at it. Every route now passes through
   * here, which is why the guarantee is a property of the client rather than
   * a habit of each method.
   *
   * Both failure modes answer with the same stable code, `invalid_response`:
   * a body that is not JSON, and a body that is JSON of the wrong shape. The
   * caller needs to distinguish "the server refused" from "the server agreed
   * and I could not read the answer" — not to distinguish the two ways of
   * being unreadable.
   *
   * No response data enters the message. A parse failure is reported by the
   * error's `name`, following `access-auth.ts`: a JSON parse error quotes the
   * offending bytes back, and those bytes can be another actor's data.
   */
  private async decodeBody<T>(
    response: { status: number; json: () => Promise<unknown> },
    decode: Decoder<T>,
  ): Promise<T> {
    let body: unknown;
    try {
      body = await response.json();
    } catch (err) {
      throw new FleetRoutineError(
        "invalid_response",
        `Response body is not JSON: ${err instanceof Error ? err.name : "unknown error"}`,
        response.status,
      );
    }
    try {
      return decode(body);
    } catch (err) {
      if (err instanceof ResponseDecodeError) {
        throw new FleetRoutineError("invalid_response", err.message, response.status);
      }
      throw err;
    }
  }
}
