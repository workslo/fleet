export interface Env {
  DB: D1Database;
  FLEET_AUTH_MODE?: string;
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
