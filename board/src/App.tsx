import { useCallback, useEffect, useMemo, useState } from "react";
import { FleetApi, FleetApiError, type AgentWorkSnapshot, type Decision, type FleetIdentity, type ProjectCard, type WorkRequest } from "./api";
import { DecisionsView } from "./views/DecisionsView";
import { MyWorkView } from "./views/MyWorkView";
import { PortfolioView } from "./views/PortfolioView";
import { ProjectView } from "./views/ProjectView";
import { PullCandidatesView } from "./views/PullCandidatesView";

type View = "portfolio" | "my-work" | "pull-candidates" | "decisions" | "project";
type BoardData = { identity: FleetIdentity | null; projects: ProjectCard[]; work: AgentWorkSnapshot; decisions: Decision[] };
type BoardError = { message: string; scope: "global" | "project" };

const emptyWork: AgentWorkSnapshot = { obligations: [], outbound_requests: [], inbound_requests: [], pull_candidates: [], activity: [], next_cursor: "0" };
const emptyData: BoardData = { identity: null, projects: [], work: emptyWork, decisions: [] };

function upsertDecision(records: Decision[], changed: Decision): Decision[] {
  return [...records.filter((entry) => entry.id !== changed.id), changed].sort((left, right) => {
    if (left.created_at !== right.created_at) return left.created_at < right.created_at ? -1 : 1;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

export function App() {
  const api = useMemo(() => new FleetApi(), []);
  const [data, setData] = useState<BoardData>(emptyData);
  const [view, setView] = useState<View>("portfolio");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectCard | null>(null);
  const [error, setError] = useState<BoardError | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectLoading, setProjectLoading] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [requestDetails, setRequestDetails] = useState<Record<string, WorkRequest>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [identity, portfolio, work, decisions] = await Promise.all([
        api.identity(),
        api.portfolio(),
        api.myWork(),
        api.decisions(),
      ]);
      setData({ identity, projects: portfolio.projects, work, decisions: decisions.decisions });
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

  const runWorkAction = useCallback(async (action: () => Promise<WorkRequest>, requestId?: string): Promise<boolean> => {
    setActionPending(true);
    setError(null);
    try {
      let changedRequest: WorkRequest;
      try {
        changedRequest = await action();
      } catch (caught) {
        if (!(caught instanceof FleetApiError) || ![409, 412].includes(caught.status) || !requestId) throw caught;
        let message = `${caught.message}. Review the refreshed request before another attempt; no action was resubmitted.`;
        try {
          const [work, detail] = await Promise.all([api.myWork(), api.request(requestId)]);
          setData((current) => ({ ...current, work }));
          setRequestDetails((current) => ({ ...current, [requestId]: detail }));
        } catch {
          message = `${caught.message}. Current work could not be refreshed. Reload My Work before trying again.`;
        }
        setError({ message, scope: "global" });
        throw new FleetApiError(message, caught.status, true);
      }
      setRequestDetails((current) => ({ ...current, [changedRequest.id]: changedRequest }));
      try {
        const [work, requestDetail] = await Promise.all([api.myWork(), api.request(changedRequest.id)]);
        setData((current) => ({ ...current, work }));
        setRequestDetails((current) => ({ ...current, [changedRequest.id]: requestDetail }));
      } catch {
        setError({ message: "The Fleet action succeeded, but current work could not be refreshed. Reload current work before another action.", scope: "global" });
      }
      return true;
    } finally {
      setActionPending(false);
    }
  }, [api]);

  const runNeedsShaneAction = useCallback(async (action: () => Promise<Decision>) => {
    setError(null);
    let changed: Decision;
    try {
      changed = await action();
    } catch (caught) {
      if (!(caught instanceof FleetApiError) || caught.status !== 412) throw caught;
      let message = "This entry changed before your action was recorded. Review the refreshed entry before trying again; resolved entries are in history.";
      try {
        const refreshed = await api.decisions(true);
        setData((current) => ({ ...current, decisions: refreshed.decisions }));
      } catch {
        message = "This entry changed, and current records could not be refreshed. Refresh Needs Shane before trying again.";
      }
      setError({ message, scope: "global" });
      throw new FleetApiError(message, 412);
    }
    setData((current) => ({ ...current, decisions: upsertDecision(current.decisions, changed) }));
    setRequestDetails((current) => {
      const source = changed.work_request_id ? current[changed.work_request_id] : undefined;
      return source ? { ...current, [source.id]: { ...source, needs_shane: upsertDecision(source.needs_shane ?? [], changed) } } : current;
    });
    setSelectedProject((current) => current?.id === changed.project_id
      ? { ...current, needs_shane: upsertDecision(current.needs_shane ?? [], changed) } : current);
    try {
      const work = await api.myWork();
      setData((current) => ({ ...current, work }));
    } catch {
      setError({ message: "The action was recorded, but current work could not be refreshed. Retry loading current work.", scope: "global" });
    }
  }, [api]);

  const loadRequest = useCallback(async (requestId: string) => {
    setActionPending(true);
    setError(null);
    try {
      const request = await api.request(requestId);
      setRequestDetails((current) => ({ ...current, [requestId]: request }));
    } catch (caught) {
      setError({ message: caught instanceof FleetApiError ? caught.message : "The request could not be loaded. Retry from current work.", scope: "global" });
    } finally {
      setActionPending(false);
    }
  }, [api]);

  return (
    <div className="app-shell">
      <header className="site-header">
        <p className="eyebrow">Fleet Board</p>
        {data.identity
          ? <p className="principal">Signed in as {data.identity.actor.display_name} ({data.identity.principal.kind} principal)</p>
          : null}
        <nav aria-label="Fleet Board views">
          <a href="#portfolio" aria-current={view === "portfolio" ? "page" : undefined} onClick={(event) => { event.preventDefault(); setView("portfolio"); }}>Portfolio</a>
          <a href="#my-work" aria-current={view === "my-work" ? "page" : undefined} onClick={(event) => { event.preventDefault(); setView("my-work"); }}>My Work</a>
          <a href="#pull-candidates" aria-current={view === "pull-candidates" ? "page" : undefined} onClick={(event) => { event.preventDefault(); setView("pull-candidates"); }}>Pull Candidates</a>
          <a href="#decisions" aria-current={view === "decisions" ? "page" : undefined} onClick={(event) => { event.preventDefault(); setView("decisions"); }}>Needs Shane</a>
        </nav>
      </header>
      <main>
        {error ? <aside className="error" role="alert"><p>{error.message}</p><button type="button" onClick={retry}>Retry</button></aside> : null}
        {loading ? <p role="status">Loading Fleet Board…</p> : null}
        {projectLoading ? <p role="status" aria-label="Loading project details…">Loading project details…</p> : null}
        {!loading && view === "portfolio" ? <PortfolioView projects={data.projects} onSelectProject={(id) => void selectProject(id)} /> : null}
        {!loading && view === "project" && selectedProject ? <ProjectView project={selectedProject} onBack={() => setView("portfolio")} /> : null}
        {!loading && view === "project" && !selectedProject && !error ? <p>Choose a Fleet Project from the portfolio.</p> : null}
        <div hidden={loading || view !== "my-work"}>
          <MyWorkView
            work={data.work}
            actorId={data.identity?.actor.id ?? ""}
            requestDetails={requestDetails}
            busy={actionPending}
            onCreate={(input, idempotencyKey) => runWorkAction(() => api.createStandaloneRequest(input, idempotencyKey))}
            onAccept={(request, idempotencyKey) => runWorkAction(() => api.acceptRequest(request.id, request.version, idempotencyKey), request.id)}
            onFulfill={(request, evidence, idempotencyKey) => runWorkAction(() => api.fulfillRequest(request.id, request.version, evidence, idempotencyKey), request.id)}
            onTransition={(request, transition, input, key) => runWorkAction(() => api.transitionRequest(request.id, request.version, transition, input, key), request.id)}
            onView={(request) => loadRequest(request.id)}
          />
        </div>
        {!loading && view === "pull-candidates" ? <PullCandidatesView candidates={data.work.pull_candidates} /> : null}
        <div hidden={loading || view !== "decisions"}><DecisionsView decisions={data.decisions} actorId={data.identity?.actor.id ?? ""}
          onHistory={async () => { const history = await api.decisions(true); setData((current) => ({ ...current, decisions: history.decisions })); }}
          onCreate={(input, key) => runNeedsShaneAction(() => api.createNeedsShane(input, key))}
          onDecide={(id, version, input, key) => runNeedsShaneAction(() => api.decide(id, version, input, key))}
          onComplete={(id, version, input, key) => runNeedsShaneAction(() => api.completeAction(id, version, input, key))}
          onDelegate={(id, version, input, key) => runNeedsShaneAction(() => api.delegateAction(id, version, input, key))}
        /></div>
      </main>
    </div>
  );
}
