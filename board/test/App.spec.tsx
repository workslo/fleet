import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App";

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
  updated_at: "2026-08-31 00:00:00",
};

const work = {
  obligations: [{ source: "owner_next_action", project_id: "project-1", title: "Project owner next action", detail: "Build the Board" }],
  outbound_requests: [{ id: "outbound-1", project_id: "project-1", title: "Review Board", detail: "Review the read flow", state: "Pending", requester: { id: "codex" }, recipient: { id: "claude" } }],
  inbound_requests: [{ id: "inbound-1", project_id: "project-1", title: "Assess Board", detail: "Confirm the Board boundary", state: "Pending", requester: { id: "claude" }, recipient: { id: "codex" } }],
  pull_candidates: [{ id: "pull-1", project_id: "project-1", actor: { id: "claude" }, title: "Improve copy", detail: "Clarify the request language", created_at: "2026-08-31 00:00:00" }],
  activity: [],
  next_cursor: "0",
};

function response(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function mockApi(overrides: Record<string, unknown> = {}) {
  vi.stubGlobal("fetch", vi.fn((input: string | URL | Request) => {
    const path = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
    if (path.endsWith("/v1/portfolio")) return response(overrides.portfolio ?? { projects: [project] });
    if (path.endsWith("/v1/me/work?after=0")) return response(overrides.work ?? work);
    if (path.endsWith("/v1/decisions")) return response(overrides.decisions ?? { decisions: [{ id: "decision-1", project_id: "project-1", question: "Approve the Fleet Board?", state: "Pending", created_at: "2026-08-31 00:00:00" }] });
    if (path.endsWith("/v1/projects/project-1")) return response(overrides.project ?? project);
    return response({ error: "not_found", message: "route does not exist" }, 404);
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Fleet Board", () => {
  it("shows project provenance, ownership, plan, state, health, next action, and evidence", async () => {
    mockApi();
    render(<App principal="codex" />);

    await userEvent.click(await screen.findByRole("link", { name: "Fleet V1 Foundation" }));

    expect(await screen.findByText("Originator: Shane Slosar")).toBeTruthy();
    expect(screen.getByText("Owner: Codex")).toBeTruthy();
    expect(screen.getByText("State: Active")).toBeTruthy();
    expect(screen.getByText("Health: On Track")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Agreed plan" })).toBeTruthy();
    expect(screen.getByText("Build the Board")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Foundation repository" }).getAttribute("href")).toBe("https://github.com/workslo/fleet");
  });

  it("separates obligations, outbound requests, inbound requests, and Pull Candidates", async () => {
    mockApi();
    render(<App principal="codex" />);

    await userEvent.click(await screen.findByRole("link", { name: "My Work" }));

    expect(await screen.findByRole("heading", { name: "Obligations" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Outbound requests" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Inbound requests" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pull Candidates" })).toBeTruthy();
    expect(screen.getByText("Project owner next action")).toBeTruthy();
    expect(screen.getByText("Review Board")).toBeTruthy();
    expect(screen.getByText("Assess Board")).toBeTruthy();
    expect(screen.getByText("Improve copy")).toBeTruthy();
  });

  it("explains empty views and keeps errors visible with retry", async () => {
    mockApi({ portfolio: { projects: [] }, work: { ...work, pull_candidates: [] }, decisions: { decisions: [] } });
    render(<App principal="codex" />);

    expect(await screen.findByText("No Fleet Projects are visible yet. Shared project records will appear here.")).toBeTruthy();
    await userEvent.click(screen.getByRole("link", { name: "Pull Candidates" }));
    expect(await screen.findByText("No Pull Candidates have been published. Published Pulls remain voluntary and create no obligation.")).toBeTruthy();
    await userEvent.click(screen.getByRole("link", { name: "Decisions" }));
    expect(await screen.findByText("No decisions need Shane’s attention.")).toBeTruthy();

    cleanup();
    vi.stubGlobal("fetch", vi.fn(() => response({ error: "unavailable", message: "Fleet is unavailable" }, 503)));
    render(<App principal="codex" />);
    expect(await screen.findByText("Fleet is unavailable")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
