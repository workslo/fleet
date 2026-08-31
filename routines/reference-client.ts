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

// ---------------------------------------------------------------------------
// Contract types — matching contracts/http-v1.md
// ---------------------------------------------------------------------------

export type WorkRequestState =
  | "Pending"
  | "Accepted"
  | "Fulfilled"
  | "Declined"
  | "Withdrawn";

export interface ActorRef {
  id: string;
}

export interface Obligation {
  source: "accepted_request" | "owner_next_action";
  request_id?: string;
  project_id: string;
}

export interface WorkRequestSummary {
  id: string;
  project_id: string;
  requester: ActorRef;
  recipient: ActorRef;
  title: string;
  detail: string;
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
  author: ActorRef;
  title: string;
  detail: string;
  created_at: string;
}

export interface ActivityEvent {
  id: number;
  type: string;
  actor: ActorRef;
  project_id: string | null;
  created_at: string;
}

export interface AgentWorkSnapshot {
  obligations: Obligation[];
  outbound_requests: WorkRequestSummary[];
  inbound_requests: WorkRequestSummary[];
  pull_candidates: PullCandidate[];
  activity: ActivityEvent[];
  next_cursor: string;
}

export interface ProjectCard {
  id: string;
  slug: string;
  title: string;
  originator: ActorRef;
  submitter: ActorRef;
  owner: ActorRef | null;
  proposed_owner: ActorRef | null;
  state: string;
  health: string;
  next_action: string | null;
  version: number;
  envelope: { revision: number };
  plan: { revision: number; body: string };
  evidence: Array<{ uri: string; summary: string }>;
  updated_at: string;
}

export interface DecisionRequest {
  id: string;
  project_id: string;
  question: string;
  state: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// The four Fleet Routine answers
// ---------------------------------------------------------------------------

export interface FleetRoutineResult {
  /** 1. What work is owed now? */
  obligations: Obligation[];
  /** 2. What outbound requests exist, and what is the state of each? */
  outboundRequests: WorkRequestSummary[];
  /** 3. What new inbound requests need attention? */
  inboundRequests: WorkRequestSummary[];
  /** 4. What Pull Candidates have been published? */
  pullCandidates: PullCandidate[];
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
  /** The authenticated actor's principal id, e.g. "juniorslo". */
  principal: string;
  /** Native-platform cursor persistence. Required. */
  cursorStore: CursorStore;
  /**
   * Injectable fetch. Required — the caller provides its platform's fetch
   * (globalThis.fetch in a Worker/Node, or a test mock) so the client stays
   * dependency-free and platform-agnostic.
   */
  fetchFn: FetchLike;
  /** Auth header name. Defaults to "X-Fleet-Principal" (test mode). */
  authHeader?: string;
}

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

export class FleetRoutineClient {
  private readonly baseUrl: string;
  private readonly fetchFn: FetchLike;
  private readonly cursorStore: CursorStore;
  private readonly authHeaders: Record<string, string>;

  constructor(opts: FleetRoutineClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.fetchFn = opts.fetchFn;
    this.cursorStore = opts.cursorStore;
    this.authHeaders = {
      [opts.authHeader ?? "X-Fleet-Principal"]: opts.principal,
    };
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
      { method: "GET", headers: this.authHeaders },
    );

    if (response.status !== 200) {
      const body = await response.text();
      // Fleet API errors have shape { error: "machine_readable_code", message: "..." }
      let code = "reconcile_failed";
      let message = `GET /v1/me/work returned ${response.status}: ${body}`;
      try {
        const parsed = JSON.parse(body) as { error?: string; message?: string };
        if (typeof parsed.error === "string") {
          code = parsed.error;
        }
        if (typeof parsed.message === "string") {
          message = parsed.message;
        }
      } catch {
        // body isn't JSON — keep defaults
      }
      throw new FleetRoutineError(code, message, response.status);
    }

    const snapshot = (await response.json()) as AgentWorkSnapshot;

    // Persist cursor BEFORE returning. Native persistence must succeed
    // before the cursor advances (contracts/routine-v1.md).
    await this.cursorStore.write(snapshot.next_cursor);

    return {
      obligations: snapshot.obligations,
      outboundRequests: snapshot.outbound_requests,
      inboundRequests: snapshot.inbound_requests,
      pullCandidates: snapshot.pull_candidates,
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
    return this.mutate<WorkRequestSummary>(
      `/v1/requests/${requestId}/accept`,
      version,
      {},
      idempotencyKey,
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
    return this.mutate<WorkRequestSummary>(
      `/v1/requests/${requestId}/fulfill`,
      version,
      body,
      idempotencyKey,
    );
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
   */
  async createWorkRequest(
    projectId: string,
    recipientId: string,
    title: string,
    detail: string,
    idempotencyKey: string,
  ): Promise<WorkRequestSummary> {
    return this.mutate<WorkRequestSummary>(
      `/v1/projects/${projectId}/requests`,
      undefined,
      { recipient_id: recipientId, title, detail },
      idempotencyKey,
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
    return this.mutate<PullCandidate>(
      "/v1/pull-candidates",
      undefined,
      { project_id: projectId, title, detail },
      idempotencyKey,
    );
  }

  // --- Read endpoints ---

  /** Read the full project portfolio (list of project cards). */
  async listProjects(): Promise<ProjectCard[]> {
    const response = await this.fetchFn(
      `${this.baseUrl}/v1/portfolio`,
      { method: "GET", headers: this.authHeaders },
    );
    return this.parseJson<ProjectCard[]>(response);
  }

  /** Read a single project card. */
  async getProject(projectId: string): Promise<ProjectCard> {
    const response = await this.fetchFn(
      `${this.baseUrl}/v1/projects/${projectId}`,
      { method: "GET", headers: this.authHeaders },
    );
    return this.parseJson<ProjectCard>(response);
  }

  /** Read activity events after the supplied cursor. */
  async getActivity(after?: string): Promise<{
    activity: ActivityEvent[];
    next_cursor: string;
  }> {
    const cursor = after ?? (await this.cursorStore.read()) ?? "0";
    const response = await this.fetchFn(
      `${this.baseUrl}/v1/activity?after=${encodeURIComponent(cursor)}`,
      { method: "GET", headers: this.authHeaders },
    );
    return this.parseJson(response);
  }

  /** Read Decision requests. May return an empty array in V1. */
  async getDecisions(): Promise<DecisionRequest[]> {
    const response = await this.fetchFn(
      `${this.baseUrl}/v1/decisions`,
      { method: "GET", headers: this.authHeaders },
    );
    return this.parseJson<DecisionRequest[]>(response);
  }

  // --- Internal ---

  private async mutate<T>(
    path: string,
    version: number | undefined,
    body: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      ...this.authHeaders,
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

    return this.parseJson<T>(response);
  }

  private async parseJson<T>(response: {
    status: number;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
  }): Promise<T> {
    if (response.status < 200 || response.status >= 300) {
      const body = await response.text();
      // Fleet API errors have shape { error: "machine_readable_code", message: "..." }
      // Surface the machine-readable code so callers can branch on it.
      let code = "request_failed";
      let message = `Request returned ${response.status}: ${body}`;
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
    return (await response.json()) as T;
  }
}
