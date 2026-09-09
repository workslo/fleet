import { NeedsShaneOutcomes } from "./DecisionsView";
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

export function ProjectView({ project, onBack }: { project: ProjectCard; onBack: () => void }) {
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
      <ProjectEvidencePanel evidence={project.evidence} />
    </article>
  );
}
