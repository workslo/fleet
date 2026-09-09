export type NeedsShaneKind = "decision" | "action" | "decision_and_action";
export type DecisionChoice = "approved" | "declined";
export type NeedsShaneEvidence = { uri: string; summary: string };
export type NeedsShaneOutcome = {
  actor: { id: string };
  summary: string;
  evidence: NeedsShaneEvidence[];
  at: string;
};
export type NeedsShane = {
  id: string;
  project_id: string | null;
  work_request_id: string | null;
  requester: { id: string } | null;
  kind: NeedsShaneKind;
  question: string;
  resolution_condition: string | null;
  state: string;
  version: number;
  decision: (NeedsShaneOutcome & { choice: DecisionChoice }) | null;
  action: NeedsShaneOutcome | null;
  delegation: { actor: { id: string }; delegate: { id: string }; summary: string; at: string } | null;
  action_status: "not_requested" | "awaiting_decision" | "pending" | "completed" | "not_required";
  created_at: string;
  updated_at: string;
};
export type CreateNeedsShane = {
  project_id?: string;
  work_request_id?: string;
  kind: NeedsShaneKind;
  question: string;
  resolution_condition: string;
};
export type RecordDecision = { choice: DecisionChoice; summary: string; evidence?: NeedsShaneEvidence[] };
export type CompleteAction = { summary: string; evidence?: NeedsShaneEvidence[] };
export type DelegateAction = { delegate_id: string; summary: string };
