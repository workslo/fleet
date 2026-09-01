import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App";
import { FleetApi } from "../src/api";

const project = {
  id: "project-1",
  slug: "fleet-v1-foundation",
  title: "Fleet V1 Foundation",
  originator: { id: "shane" },
  submitter: { id: "shane" },
  owner: { id: "codex" },
  proposed_owner: null,
  state: "Active",
  health: "On Track",
  next_action: "Build the Board",
  version: 3,
  envelope: {
    revision: 1,
    outcome: "Deliver Fleet V1",
    scope: ["Thin Board"],
    exclusions: ["Realtime"],
    delegated_actions: ["Local implementation"],
    gates: ["Shane acceptance"],
    validation_evidence: ["Board tests"],
  },
  plan: { revision: 1, body: "Build the first vertical slice" },
  evidence: [{ uri: "https://github.com/workslo/fleet", summary: "Foundation repository" }],
  activity: [],
  updated_at: "2026-08-31T00:00:00Z",
};

const work = {
  obligations: [{ source: "owner_next_action", project_id: "project-1", title: "Project owner next action", detail: "Build the Board" }],
  outbound_requests: [{ id: "outbound-1", project_id: "project-1", title: "Review Board", detail: "Review the read flow", state: "Pending", requester: { id: "codex" }, recipient: { id: "claude" } }],
  inbound_requests: [{ id: "inbound-1", project_id: "project-1", title: "Assess Board", detail: "Confirm the Board boundary", state: "Pending", requester: { id: "claude" }, recipient: { id: "codex" } }],
  pull_candidates: [{ id: "pull-1", project_id: "project-1", actor: { id: "claude" }, title: "Improve copy", detail: "Clarify the request language", created_at: "2026-08-31T00:00:00Z" }],
  activity: [],
  next_cursor: "0",
};

function response(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function deferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve: resolve! };
}

function mockApi(overrides: Record<string, unknown> = {}) {
  vi.stubGlobal("fetch", vi.fn((input: string | URL | Request) => {
    const path = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
    if (path.endsWith("/v1/portfolio")) return response(overrides.portfolio ?? { projects: [project] });
    if (path.endsWith("/v1/me/work?after=0")) return response(overrides.work ?? work);
    if (path.endsWith("/v1/decisions")) return response(overrides.decisions ?? { decisions: [{ id: "decision-1", project_id: "project-1", question: "Approve the Fleet Board?", state: "Pending", created_at: "2026-08-31T00:00:00Z" }] });
    if (path.endsWith("/v1/projects/project-1")) return response(overrides.project ?? project);
    return response({ error: "not_found", message: "route does not exist" }, 404);
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Fleet Board", () => {
  it("sends an explicit local test principal and omits it otherwise at the Worker HTTP boundary", async () => {
    const fetchMock = vi.fn(() => response({ projects: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await new FleetApi("codex").portfolio();
    await new FleetApi().portfolio();

    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("X-Fleet-Principal")).toBe("codex");
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).has("X-Fleet-Principal")).toBe(false);
  });

  it("shows project provenance, ownership, plan, state, health, next action, and evidence", async () => {
    mockApi();
    render(<App principal="codex" />);

    await userEvent.click(await screen.findByRole("link", { name: "Fleet V1 Foundation" }));

    expect(await screen.findByText("Originator: Shane Slosar")).toBeVisible();
    expect(screen.getByText("Owner: Codex")).toBeVisible();
    expect(screen.getByText("State: Active")).toBeVisible();
    expect(screen.getByText("Health: On Track")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Agreed plan" })).toBeVisible();
    expect(screen.getByText("Build the Board")).toBeVisible();
    expect(screen.getByRole("link", { name: "Foundation repository" })).toHaveAttribute("href", "https://github.com/workslo/fleet");
  });

  it("separates obligations, outbound requests, inbound requests, and Pull Candidates", async () => {
    mockApi();
    render(<App principal="codex" />);

    await userEvent.click(await screen.findByRole("link", { name: "My Work" }));

    expect(await screen.findByRole("heading", { name: "Obligations" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Outbound requests" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Inbound requests" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Pull Candidates" })).toBeVisible();
    expect(screen.getByText("Project owner next action")).toBeVisible();
    expect(screen.getByText("Review Board")).toBeVisible();
    expect(screen.getByText("Assess Board")).toBeVisible();
    expect(screen.getByText("Improve copy")).toBeVisible();
  });

  it("explains empty views and recovers global errors with retry", async () => {
    mockApi({ portfolio: { projects: [] }, work: { ...work, pull_candidates: [] }, decisions: { decisions: [] } });
    render(<App principal="codex" />);

    expect(await screen.findByText("No Fleet Projects are visible yet. Shared project records will appear here.")).toBeVisible();
    await userEvent.click(screen.getByRole("link", { name: "Pull Candidates" }));
    expect(await screen.findByText("No Pull Candidates have been published. Published Pulls remain voluntary and create no obligation.")).toBeVisible();
    await userEvent.click(screen.getByRole("link", { name: "Decisions" }));
    expect(await screen.findByText("No decisions need Shane’s attention.")).toBeVisible();

    cleanup();
    vi.stubGlobal("fetch", vi.fn(() => response({ error: "unavailable", message: "Fleet is unavailable" }, 503)));
    render(<App principal="codex" />);
    expect(await screen.findByText("Fleet is unavailable")).toBeVisible();
    mockApi({ portfolio: { projects: [] }, work: { ...work, pull_candidates: [] }, decisions: { decisions: [] } });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No Fleet Projects are visible yet. Shared project records will appear here.")).toBeVisible();
  });

  it("shows the unavailable production path without a test principal", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ error: "auth_unavailable", message: "production authentication is not configured" }, 503)));
    render(<App />);

    expect(await screen.findByText("Fleet Board is unavailable until production authentication is configured.")).toBeVisible();
    expect(screen.getByText("production authentication is not configured")).toBeVisible();
  });

  it("retries a failed project-detail request and refreshes its content", async () => {
    const firstProjectResponse = deferred<Response>();
    const refreshedProject = { ...project, next_action: "Detail retry succeeded" };
    let projectCalls = 0;
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const path = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (path.endsWith("/v1/portfolio")) return response({ projects: [project] });
      if (path.endsWith("/v1/me/work?after=0")) return response(work);
      if (path.endsWith("/v1/decisions")) return response({ decisions: [] });
      if (path.endsWith("/v1/projects/project-1")) {
        projectCalls += 1;
        return projectCalls === 1 ? firstProjectResponse.promise : response(refreshedProject);
      }
      return response({ error: "not_found", message: "route does not exist" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App principal="codex" />);

    await userEvent.click(await screen.findByRole("link", { name: "Fleet V1 Foundation" }));
    expect(screen.getByRole("status", { name: "Loading project details…" })).toBeVisible();
    firstProjectResponse.resolve(await response({ error: "unavailable", message: "Project details are unavailable" }, 503));
    expect(await screen.findByText("Project details are unavailable")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Detail retry succeeded")).toBeVisible();
    expect(projectCalls).toBe(2);
  });
});
