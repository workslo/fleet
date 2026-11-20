export const PROJECT_DISPOSITIONS = ["Accepted", "Failed", "Abandoned"] as const;

export type ProjectDisposition = typeof PROJECT_DISPOSITIONS[number];

export type ProjectOutcomeInput = {
  summary: string;
  evidence?: Array<{ uri: string; summary: string }>;
};

export type ProjectClosureInput = ProjectOutcomeInput & { disposition: ProjectDisposition; within_envelope?: true };

export type ProjectOutcome = Required<ProjectOutcomeInput> & {
  actor: { id: string };
  at: string;
};

export type ProjectClosure = ProjectOutcome & { disposition: ProjectDisposition; within_envelope?: true };
