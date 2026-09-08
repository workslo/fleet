export type ActorRef = { id: string };

export type FleetIdentity = {
  actor: { id: string; display_name: string };
  principal: {
    provider: "cloudflare_access";
    issuer: string;
    kind: "human" | "service";
    subject: string;
  };
};

export type Evidence = {
  uri: string;
  summary: string;
  created_at?: string;
};

export type ProjectEnvelope = {
  revision: number;
  outcome: string;
  scope: string[];
  exclusions: string[];
  delegated_actions: string[];
  gates: string[];
  validation_evidence: string[];
};

export type ProjectCard = {
  id: string;
  slug: string;
  title: string;
  originator: ActorRef | null;
  submitter: ActorRef | null;
  owner: ActorRef | null;
  proposed_owner: ActorRef | null;
  state: string;
  health: string;
  next_action: string | null;
  version: number;
  envelope: ProjectEnvelope | null;
  plan: { revision: number; body: string } | null;
  evidence: Evidence[];
  activity: Array<{ actor: ActorRef | null; type: string; created_at: string }>;
  updated_at: string;
};

export type WorkRequest = {
  id: string;
  project_id: string | null;
  requester: ActorRef;
  recipient: ActorRef;
  title: string;
  detail: string;
  artifact: Evidence | null;
  accepted_scope: { title: string; detail: string; artifact: Evidence | null } | null;
  evidence?: Evidence[];
  state: string;
  version: number;
};

export type Obligation = {
  source: "accepted_request" | "owner_next_action";
  request_id?: string;
  project_id: string | null;
  title?: string;
  detail?: string | null;
};

export type PullCandidate = {
  id: string;
  project_id: string;
  actor: ActorRef;
  title: string;
  detail: string;
  created_at: string;
};

export type AgentWorkSnapshot = {
  obligations: Obligation[];
  outbound_requests: WorkRequest[];
  inbound_requests: WorkRequest[];
  pull_candidates: PullCandidate[];
  activity: Array<{ id: number; type: string; created_at: string }>;
  next_cursor: string;
};

export type Decision = {
  id: string;
  project_id: string;
  question: string;
  state: string;
  created_at: string;
};

type ApiErrorBody = { error?: string; message?: string };

export class FleetApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "FleetApiError";
  }
}

export class FleetApi {
  async identity(): Promise<FleetIdentity> {
    return this.get("/v1/me");
  }

  async portfolio(): Promise<{ projects: ProjectCard[] }> {
    return this.get("/v1/portfolio");
  }

  async project(projectId: string): Promise<ProjectCard> {
    return this.get(`/v1/projects/${encodeURIComponent(projectId)}`);
  }

  async request(requestId: string): Promise<WorkRequest> {
    return this.get(`/v1/requests/${encodeURIComponent(requestId)}`);
  }

  async myWork(after = "0"): Promise<AgentWorkSnapshot> {
    return this.get(`/v1/me/work?after=${encodeURIComponent(after)}`);
  }

  async decisions(): Promise<{ decisions: Decision[] }> {
    return this.get("/v1/decisions");
  }

  async createStandaloneRequest(input: {
    recipient_id: string;
    title: string;
    detail: string;
    artifact?: Evidence;
  }, idempotencyKey: string): Promise<WorkRequest> {
    return this.post("/v1/requests", input, undefined, idempotencyKey);
  }

  async acceptRequest(requestId: string, version: number, idempotencyKey: string): Promise<WorkRequest> {
    return this.post(`/v1/requests/${encodeURIComponent(requestId)}/accept`, {}, version, idempotencyKey);
  }

  async fulfillRequest(requestId: string, version: number, evidence: Evidence[], idempotencyKey: string): Promise<WorkRequest> {
    return this.post(`/v1/requests/${encodeURIComponent(requestId)}/fulfill`, { evidence }, version, idempotencyKey);
  }

  private async get<T>(path: string): Promise<T> {
    const headers = new Headers({ Accept: "application/json" });
    return this.send(path, { headers }, "Fleet could not be reached. Check the connection and retry.");
  }

  private async post<T>(path: string, body: object, version?: number, idempotencyKey: string = crypto.randomUUID()): Promise<T> {
    const headers = new Headers({
      Accept: "application/json",
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    });
    if (version !== undefined) headers.set("If-Match", `"${version}"`);
    return this.send(path, { method: "POST", headers, body: JSON.stringify(body) }, "Fleet could not be reached. Refresh current work before retrying this action.");
  }

  private async send<T>(path: string, init: RequestInit, networkError: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(path, { ...init, credentials: "same-origin" });
    } catch {
      throw new FleetApiError(networkError, 0);
    }

    let responseBody: T | ApiErrorBody;
    try {
      responseBody = await response.json() as T | ApiErrorBody;
    } catch {
      throw new FleetApiError(`Fleet returned an unreadable response (${response.status}).`, response.status);
    }
    if (!response.ok) {
      const apiError = responseBody as ApiErrorBody;
      throw new FleetApiError(apiError.message ?? `Fleet request failed (${response.status}).`, response.status);
    }
    return responseBody as T;
  }
}
