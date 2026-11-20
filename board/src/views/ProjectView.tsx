import { PROJECT_DISPOSITIONS, type ProjectClosureInput, type ProjectDisposition, type ProjectOutcome, type ProjectOutcomeInput } from "../../../contracts/project-closeout";
import { MutationForm, NeedsShaneOutcomes, OutcomeFields, evidence } from "./DecisionsView";
import type { ActorRef, ProjectCard } from "../api";
import { ProjectEvidencePanel } from "../components/ProjectEvidencePanel";

function displayActor(actor: ActorRef | null): string {
  if (!actor) return "Unassigned";
  const names: Record<string, string> = { shane: "Shane Slosar", codex: "Codex", claude: "Claude", agentslo: "AgentSlo", juniorslo: "JuniorSLO" };
  return names[actor.id] ?? actor.id;
}

function List({ items }: { items: string[] }) {
  return items.length === 0 ? <p>None recorded.</p> : <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

type Props = {
  project: ProjectCard;
  actorId: string;
  ready: boolean;
  onBack: () => void;
  onSubmitOutcome: (input: ProjectOutcomeInput, key: string) => Promise<void>;
  onClose: (input: ProjectClosureInput, key: string) => Promise<void>;
};

function OutcomeRecord({ record }: { record: ProjectOutcome }) {
  return <>
    <p>{record.summary}</p>
    <p>Recorded by {displayActor(record.actor)} <time dateTime={record.at}>{record.at}</time></p>
    {record.evidence.length > 0 ? <ul>{record.evidence.map((link, index) =>
      <li key={index}><a href={link.uri}>{link.summary}</a></li>,
    )}</ul> : null}
  </>;
}

export function ProjectView({ project, actorId, ready, onBack, onSubmitOutcome, onClose }: Props) {
  const owner = ready && project.owner?.id === actorId;
  const canSubmit = owner && ["Active", "Paused"].includes(project.state);
  const canReview = ready && actorId === "shane" && project.state === "Awaiting Acceptance";
  const canOwnerClose = owner && !canReview && ["Active", "Awaiting Acceptance", "Paused"].includes(project.state);
  const dispositions = canReview ? PROJECT_DISPOSITIONS : PROJECT_DISPOSITIONS.filter((value) => value !== "Accepted");
  return (
    <article aria-labelledby="project-heading">
      <p><a href="#portfolio" onClick={(event) => { event.preventDefault(); onBack(); }}>Portfolio</a></p>
      <h1 id="project-heading">{project.title}</h1>
      <dl className="project-details">
        <div><dt>Originator</dt><dd>Originator: {displayActor(project.originator)}</dd></div>
        <div><dt>Submitter</dt><dd>Submitter: {displayActor(project.submitter)}</dd></div>
        <div><dt>Project owner</dt><dd>Owner: {displayActor(project.owner)}</dd></div>
        <div><dt>Project state</dt><dd>State: {project.state}</dd></div>
        <div><dt>Project health</dt><dd>Health: {project.health}</dd></div>
        <div><dt>Next action</dt><dd>{project.next_action ?? "No next action is recorded."}</dd></div>
      </dl>

      <section aria-labelledby="plan-heading">
        <h2 id="plan-heading">Agreed plan</h2>
        <p>{project.plan ? project.plan.body : "No agreed plan has been recorded."}</p>
      </section>

      <section aria-labelledby="envelope-heading">
        <h2 id="envelope-heading">Authorized Project Envelope</h2>
        {project.envelope ? (
          <>
            <p>{project.envelope.outcome}</p>
            <h3>Scope</h3><List items={project.envelope.scope} />
            <h3>Exclusions</h3><List items={project.envelope.exclusions} />
            <h3>Shane-only gates</h3><List items={project.envelope.gates} />
          </>
        ) : <p>No authorized envelope has been recorded.</p>}
      </section>

      {project.needs_shane?.length ? <section aria-label="Project Needs Shane records"><h2>Needs Shane</h2><NeedsShaneOutcomes entries={project.needs_shane} /></section> : null}
      {project.outcome_submission || project.closure || canSubmit || canReview || canOwnerClose ? <section aria-labelledby="project-outcome-heading">
        <h2 id="project-outcome-heading">Project outcome</h2>
        {project.outcome_submission ? <OutcomeRecord record={project.outcome_submission} /> : null}
        {project.closure ? <>
          <h3>Final disposition: {project.closure.disposition}</h3>
          <OutcomeRecord record={project.closure} />
        </> : null}
        {canSubmit ? <MutationForm
          label="Submit project outcome" prepare={(data, key) => {
            const input = { summary: String(data.get("summary") ?? "").trim(), evidence: evidence(data) };
            return () => onSubmitOutcome(input, key);
          }}>
          <OutcomeFields prefix="Outcome" />
        </MutationForm> : null}
        {canReview || canOwnerClose ? <MutationForm
          label="Close project" prepare={(data, key) => {
            const input = {
              disposition: data.get("disposition") as ProjectDisposition,
              summary: String(data.get("summary") ?? "").trim(),
              evidence: evidence(data),
              ...(data.get("within_envelope") === "on" ? { within_envelope: true as const } : {}),
            };
            return () => onClose(input, key);
          }}>
          <label>Final disposition<select name="disposition" defaultValue="" required>
            <option value="" disabled>Choose a disposition</option>
            {dispositions.map((disposition) => <option key={disposition}>{disposition}</option>)}
          </select></label>
          {canOwnerClose ? <label className="checkbox-label">
            <input type="checkbox" name="within_envelope" required />
            This closure stays within the authorized envelope and preserves Shane-only gates, promised dates, and external commitments.
          </label> : null}
          <OutcomeFields prefix="Closeout" />
        </MutationForm> : null}
      </section> : null}
      <ProjectEvidencePanel evidence={project.evidence} />
    </article>
  );
}
