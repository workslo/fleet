import { useCallback, useEffect, useMemo, useState } from "react";
import { FleetApi, FleetApiError, type AgentWorkSnapshot, type Decision, type ProjectCard } from "./api";
import { DecisionsView } from "./views/DecisionsView";
import { MyWorkView } from "./views/MyWorkView";
import { PortfolioView } from "./views/PortfolioView";
import { ProjectView } from "./views/ProjectView";
import { PullCandidatesView } from "./views/PullCandidatesView";

type View = "portfolio" | "my-work" | "pull-candidates" | "decisions" | "project";
type BoardData = { projects: ProjectCard[]; work: AgentWorkSnapshot; decisions: Decision[] };
type BoardError = { message: string; scope: "global" | "project" };

const emptyWork: AgentWorkSnapshot = { obligations: [], outbound_requests: [], inbound_requests: [], pull_candidates: [], activity: [], next_cursor: "0" };
const emptyData: BoardData = { projects: [], work: emptyWork, decisions: [] };

export function App({ principal }: { principal?: string }) {
  const api = useMemo(() => new FleetApi(principal), [principal]);
  const [data, setData] = useState<BoardData>(emptyData);
  const [view, setView] = useState<View>("portfolio");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectCard | null>(null);
  const [error, setError] = useState<BoardError | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectLoading, setProjectLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [portfolio, work, decisions] = await Promise.all([api.portfolio(), api.myWork(), api.decisions()]);
      setData({ projects: portfolio.projects, work, decisions: decisions.decisions });
    } catch (caught) {
      setError({ message: caught instanceof FleetApiError ? caught.message : "Fleet could not be loaded. Retry the request.", scope: "global" });
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const loadProject = useCallback(async (projectId: string) => {
    setProjectLoading(true);
    setError(null);
    try {
      setSelectedProject(await api.project(projectId));
    } catch (caught) {
      setError({ message: caught instanceof FleetApiError ? caught.message : "The project could not be loaded. Retry the request.", scope: "project" });
    } finally {
      setProjectLoading(false);
    }
  }, [api]);

  const selectProject = useCallback((projectId: string) => {
    setView("project");
    setSelectedProjectId(projectId);
    const knownProject = data.projects.find((project) => project.id === projectId) ?? null;
    setSelectedProject(knownProject);
    void loadProject(projectId);
  }, [data.projects, loadProject]);

  const retry = useCallback(() => {
    if (error?.scope === "project" && selectedProjectId) {
      void loadProject(selectedProjectId);
      return;
    }
    void load();
  }, [error, load, loadProject, selectedProjectId]);

  return (
    <div className="app-shell">
      <header className="site-header">
        <p className="eyebrow">Fleet Board</p>
        {principal ? <p className="principal">Viewing shared work for {principal}</p> : <p className="principal" role="note">Fleet Board is unavailable until production authentication is configured.</p>}
        <nav aria-label="Fleet Board views">
          <a href="#portfolio" aria-current={view === "portfolio" ? "page" : undefined} onClick={(event) => { event.preventDefault(); setView("portfolio"); }}>Portfolio</a>
          <a href="#my-work" aria-current={view === "my-work" ? "page" : undefined} onClick={(event) => { event.preventDefault(); setView("my-work"); }}>My Work</a>
          <a href="#pull-candidates" aria-current={view === "pull-candidates" ? "page" : undefined} onClick={(event) => { event.preventDefault(); setView("pull-candidates"); }}>Pull Candidates</a>
          <a href="#decisions" aria-current={view === "decisions" ? "page" : undefined} onClick={(event) => { event.preventDefault(); setView("decisions"); }}>Decisions</a>
        </nav>
      </header>
      <main>
        {error ? <aside className="error" role="alert"><p>{error.message}</p><button type="button" onClick={retry}>Retry</button></aside> : null}
        {loading ? <p role="status">Loading Fleet Board…</p> : null}
        {projectLoading ? <p role="status" aria-label="Loading project details…">Loading project details…</p> : null}
        {!loading && view === "portfolio" ? <PortfolioView projects={data.projects} onSelectProject={(id) => void selectProject(id)} /> : null}
        {!loading && view === "project" && selectedProject ? <ProjectView project={selectedProject} onBack={() => setView("portfolio")} /> : null}
        {!loading && view === "project" && !selectedProject && !error ? <p>Choose a Fleet Project from the portfolio.</p> : null}
        {!loading && view === "my-work" ? <MyWorkView work={data.work} /> : null}
        {!loading && view === "pull-candidates" ? <PullCandidatesView candidates={data.work.pull_candidates} /> : null}
        {!loading && view === "decisions" ? <DecisionsView decisions={data.decisions} /> : null}
      </main>
    </div>
  );
}
