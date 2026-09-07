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
  project_id: string;
  requester: ActorRef;
  recipient: ActorRef;
  title: string;
  detail: string;
  state: string;
};

export type Obligation = {
  source: "accepted_request" | "owner_next_action";
  request_id?: string;
  project_id: string;
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

  async myWork(after = "0"): Promise<AgentWorkSnapshot> {
    return this.get(`/v1/me/work?after=${encodeURIComponent(after)}`);
  }

  async decisions(): Promise<{ decisions: Decision[] }> {
    return this.get("/v1/decisions");
  }

  private async get<T>(path: string): Promise<T> {
    const headers = new Headers({ Accept: "application/json" });
    let response: Response;
    try {
      response = await fetch(path, { headers, credentials: "same-origin" });
    } catch {
      throw new FleetApiError("Fleet could not be reached. Check the connection and retry.", 0);
    }

    let body: T | ApiErrorBody;
    try {
      body = await response.json() as T | ApiErrorBody;
    } catch {
      throw new FleetApiError(`Fleet returned an unreadable response (${response.status}).`, response.status);
    }
    if (!response.ok) {
      const error = body as ApiErrorBody;
      throw new FleetApiError(error.message ?? `Fleet request failed (${response.status}).`, response.status);
    }
    return body as T;
  }
}
