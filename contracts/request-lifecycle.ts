export type RequestEnding = "Fulfilled" | "Returned" | "Declined" | "Withdrawn" | "Expired";
export type RequestEvidence = { uri: string; summary: string };
export type RequestResolution = {
  state: RequestEnding;
  actor: { id: string };
  at: string;
  reason: string | null;
  unfinished_work: string | null;
  evidence: RequestEvidence[];
};
export type RequestBlocker = {
  reason: string;
  resolution_condition: string;
  actor: { id: string };
  at: string;
};
export type RequestLifecycleFields = {
  expires_at: string | null;
  expiry_due: boolean;
  ended_at: string | null;
  resolution: RequestResolution | null;
  blocker: RequestBlocker | null;
};
export type RequestTransition = "decline" | "withdraw" | "return" | "expire" | "block" | "unblock";
export type EndRequestInput = { reason: string };
export type ReturnRequestInput = EndRequestInput & { unfinished_work: string; evidence?: RequestEvidence[] };
export type BlockRequestInput = { reason: string; resolution_condition: string };
export type UnblockRequestInput = { summary: string };
