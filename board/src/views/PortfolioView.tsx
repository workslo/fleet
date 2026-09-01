import type { ProjectCard } from "../api";

type PortfolioViewProps = {
  projects: ProjectCard[];
  onSelectProject: (projectId: string) => void;
};

export function PortfolioView({ projects, onSelectProject }: PortfolioViewProps) {
  return (
    <section aria-labelledby="portfolio-heading">
      <h1 id="portfolio-heading">Portfolio</h1>
      {projects.length === 0 ? (
        <p>No Fleet Projects are visible yet. Shared project records will appear here.</p>
      ) : (
        <ul className="card-list">
          {projects.map((project) => (
            <li key={project.id} className="project-card">
              <h2><a href={`#project-${project.id}`} onClick={(event) => { event.preventDefault(); onSelectProject(project.id); }}>{project.title}</a></h2>
              <dl className="summary-list">
                <div><dt>State</dt><dd>{project.state}</dd></div>
                <div><dt>Health</dt><dd>{project.health}</dd></div>
                <div><dt>Next action</dt><dd>{project.next_action ?? "No next action is recorded."}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
