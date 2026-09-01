export interface Env {
  DB: D1Database;
  FLEET_AUTH_MODE?: string;
  TEST_PRE_BATCH_BARRIER?: string;
}

export type Actor = { id: string; display_name: string };

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
  project_id: string;
  requester_id: string;
  recipient_id: string;
  title: string;
  detail: string;
  state: string;
  version: number;
  accepted_at: string | null;
  fulfilled_at: string | null;
  created_at: string;
  updated_at: string;
};
