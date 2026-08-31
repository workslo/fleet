import type { AgentWorkSnapshot } from "../api";
import { PullCandidateList } from "./MyWorkView";

export function PullCandidatesView({ candidates }: { candidates: AgentWorkSnapshot["pull_candidates"] }) {
  return (
    <section aria-labelledby="published-pulls-heading">
      <h1 id="published-pulls-heading">Pull Candidates</h1>
      <p>These are voluntary notices. They do not create an obligation, claim, or priority.</p>
      <PullCandidateList candidates={candidates} />
    </section>
  );
}
