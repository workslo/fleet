export type Env = Cloudflare.Env;

export type PrincipalKind = "human" | "service";

export type Principal = {
  provider: "cloudflare_access";
  issuer: string;
  kind: PrincipalKind;
  subject: string;
};

export type Actor = {
  id: string;
  display_name: string;
  principal: Principal;
};

export function principalValues(caller: Actor) {
  return [
    caller.principal.provider,
    caller.principal.issuer,
    caller.principal.kind,
    caller.principal.subject,
  ] as const;
}

export type ProjectRow = {
  id: string;
  slug: string;
  title: string;
  originator_id: string;
  submitter_id: string;
  owner_id: string | null;
  proposed_owner_id: string | null;
  state: string;
  health: string;
  next_action: string | null;
  version: number;
  updated_at: string;
};

export type AuthorizationInput = {
  proposed_owner_id: string;
  outcome: string;
  scope: string[];
  exclusions: string[];
  delegated_actions: string[];
  gates: string[];
  validation_evidence: string[];
  plan: string;
};

export type WorkRequestRow = {
  id: string;
  project_id: string | null;
  requester_id: string;
  recipient_id: string;
  title: string;
  detail: string;
  artifact_uri: string | null;
  artifact_summary: string | null;
  accepted_scope_json: string | null;
  state: string;
  version: number;
  accepted_at: string | null;
  fulfilled_at: string | null;
  expires_at: string | null;
  resolution_json: string | null;
  blocker_json: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};
