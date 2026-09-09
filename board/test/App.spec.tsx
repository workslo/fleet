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
    if (path.endsWith("/v1/me")) return response(overrides.identity ?? {
      actor: { display_name: "Codex", id: "codex" },
      principal: { issuer: "https://fleet-test.cloudflareaccess.com", kind: "service", provider: "cloudflare_access", subject: "codex-test.access" },
    });
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
  it("shows project provenance, ownership, plan, state, health, next action, and evidence", async () => {
    mockApi();
    render(<App />);

    expect(await screen.findByText("Signed in as Codex (service principal)")).toBeVisible();
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
    render(<App />);

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
    render(<App />);

    expect(await screen.findByText("No Fleet Projects are visible yet. Shared project records will appear here.")).toBeVisible();
    await userEvent.click(screen.getByRole("link", { name: "Pull Candidates" }));
    expect((await screen.findAllByText("No Pull Candidates have been published. Published Pulls remain voluntary and create no obligation.")).find((entry) => !entry.closest("[hidden]"))).toBeVisible();
    await userEvent.click(screen.getByRole("link", { name: "Needs Shane" }));
    expect(await screen.findByText("No decisions or actions need Shane’s attention.")).toBeVisible();

    cleanup();
    vi.stubGlobal("fetch", vi.fn(() => response({ error: "unavailable", message: "Fleet is unavailable" }, 503)));
    render(<App />);
    expect(await screen.findByText("Fleet is unavailable")).toBeVisible();
    mockApi({ portfolio: { projects: [] }, work: { ...work, pull_candidates: [] }, decisions: { decisions: [] } });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No Fleet Projects are visible yet. Shared project records will appear here.")).toBeVisible();
  });

  it("shows the unavailable production path without a test principal", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ error: "auth_unavailable", message: "production authentication is not configured" }, 503)));
    render(<App />);

    expect(await screen.findByText("production authentication is not configured")).toBeVisible();
    expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument();
  });

  it("shows the actor resolved by production authentication instead of a caller-supplied name", async () => {
    mockApi({
      identity: {
        actor: { display_name: "Shane Slosar", id: "shane" },
        principal: {
          issuer: "https://fleet.cloudflareaccess.com",
          kind: "human",
          provider: "cloudflare_access",
          subject: "stable-human-subject",
        },
      },
    });
    render(<App />);

    expect(await screen.findByText("Signed in as Shane Slosar (human principal)")).toBeVisible();
    expect(screen.queryByText("stable-human-subject")).toBeNull();
  });

  it("retries a failed project-detail request and refreshes its content", async () => {
    const firstProjectResponse = deferred<Response>();
    const refreshedProject = { ...project, next_action: "Detail retry succeeded" };
    let projectCalls = 0;
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const path = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (path.endsWith("/v1/me")) return response({
        actor: { display_name: "Codex", id: "codex" },
        principal: { issuer: "https://fleet-test.cloudflareaccess.com", kind: "service", provider: "cloudflare_access", subject: "codex-test.access" },
      });
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
    render(<App />);

    await userEvent.click(await screen.findByRole("link", { name: "Fleet V1 Foundation" }));
    expect(screen.getByRole("status", { name: "Loading project details…" })).toBeVisible();
    firstProjectResponse.resolve(await response({ error: "unavailable", message: "Project details are unavailable" }, 503));
    expect(await screen.findByText("Project details are unavailable")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Detail retry succeeded")).toBeVisible();
    expect(projectCalls).toBe(2);
  });

  it("creates a standalone review through the Worker API", async () => {
    let currentWork = { ...work, obligations: [], outbound_requests: [], inbound_requests: [], pull_candidates: [] };
    let currentRequest: typeof work.outbound_requests[number] | null = null;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (path.endsWith("/v1/me")) return response({
        actor: { display_name: "Codex", id: "codex" },
        principal: { issuer: "https://fleet-test.cloudflareaccess.com", kind: "service", provider: "cloudflare_access", subject: "codex-test.access" },
      });
      if (path.endsWith("/v1/portfolio")) return response({ projects: [] });
      if (path.endsWith("/v1/me/work?after=0")) return response(currentWork);
      if (path.endsWith("/v1/decisions")) return response({ decisions: [] });
      if (path.endsWith("/v1/requests") && init?.method === "POST") {
        expect(new Headers(init.headers).get("Idempotency-Key")).toBeTruthy();
        expect(JSON.parse(String(init.body))).toEqual({
          recipient_id: "claude",
          title: "Review a personal experiment",
          detail: "Review only the shared artifact.",
          artifact: { uri: "https://home.example.test/shareable", summary: "Shareable experiment" },
        });
        const created = {
          id: "standalone-created",
          project_id: null,
          requester: { id: "codex" },
          recipient: { id: "claude" },
          title: "Review a personal experiment",
          detail: "Review only the shared artifact.",
          artifact: { uri: "https://home.example.test/shareable", summary: "Shareable experiment" },
          accepted_scope: null,
          evidence: [],
          state: "Pending",
          version: 1,
        };
        currentRequest = created;
        currentWork = { ...currentWork, outbound_requests: [created] };
        return response(created, 201);
      }
      if (path.endsWith("/v1/requests/standalone-created") && init?.method === undefined) return response(currentRequest);
      return response({ error: "not_found", message: "route does not exist" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    await userEvent.click(await screen.findByRole("link", { name: "My Work" }));
    await userEvent.type(screen.getByLabelText("Recipient ID"), "claude");
    await userEvent.type(screen.getByLabelText("Review title"), "Review a personal experiment");
    await userEvent.type(screen.getByLabelText("Review scope"), "Review only the shared artifact.");
    await userEvent.type(screen.getByLabelText("Artifact URL"), "https://home.example.test/shareable");
    await userEvent.type(screen.getByLabelText("Artifact summary"), "Shareable experiment");
    await userEvent.click(screen.getByRole("button", { name: "Send standalone review" }));

    expect(await screen.findByText("Review a personal experiment")).toBeVisible();
    expect(screen.getByText("Standalone review")).toBeVisible();
  });

  it("preserves form values and reuses the creation key after a failed attempt", async () => {
    let currentWork = { ...work, obligations: [], outbound_requests: [], inbound_requests: [], pull_candidates: [] };
    let createdRequest: typeof work.outbound_requests[number] | null = null;
    const creationKeys: string[] = [];
    let createCalls = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (path.endsWith("/v1/me")) return response({
        actor: { display_name: "Codex", id: "codex" },
        principal: { issuer: "https://fleet-test.cloudflareaccess.com", kind: "service", provider: "cloudflare_access", subject: "codex-test.access" },
      });
      if (path.endsWith("/v1/portfolio")) return response({ projects: [] });
      if (path.endsWith("/v1/me/work?after=0")) return response(currentWork);
      if (path.endsWith("/v1/decisions")) return response({ decisions: [] });
      if (path.endsWith("/v1/requests") && init?.method === "POST") {
        creationKeys.push(String(new Headers(init.headers).get("Idempotency-Key")));
        createCalls += 1;
        if (createCalls === 1) return response({ error: "unavailable", message: "Try again" }, 503);
        createdRequest = {
          id: "retry-created",
          project_id: null,
          requester: { id: "codex" },
          recipient: { id: "claude" },
          title: "Retry-safe review",
          detail: "Keep this scope through a retry.",
          state: "Pending",
        };
        currentWork = { ...currentWork, outbound_requests: [createdRequest] };
        return response(createdRequest, 201);
      }
      if (path.endsWith("/v1/requests/retry-created") && init?.method === undefined) return response(createdRequest);
      return response({ error: "not_found", message: "route does not exist" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    await userEvent.click(await screen.findByRole("link", { name: "My Work" }));
    await userEvent.type(screen.getByLabelText("Recipient ID"), "claude");
    await userEvent.type(screen.getByLabelText("Review title"), "Retry-safe review");
    await userEvent.type(screen.getByLabelText("Review scope"), "Keep this scope through a retry.");
    await userEvent.type(screen.getByLabelText("Artifact URL"), "https://example.test/retry");
    await userEvent.type(screen.getByLabelText("Artifact summary"), "Retry artifact");
    await userEvent.click(screen.getByRole("button", { name: "Send standalone review" }));

    expect(await screen.findByText("Try again")).toBeVisible();
    expect(screen.getByLabelText("Review title")).toHaveValue("Retry-safe review");
    await userEvent.click(screen.getByRole("button", { name: "Send standalone review" }));

    expect(await screen.findByText("Retry-safe review", { selector: "strong" })).toBeVisible();
    expect(creationKeys).toHaveLength(2);
    expect(creationKeys[1]).toBe(creationKeys[0]);
  });

  it("rotates the creation key after a stored mutation even when refresh fails", async () => {
    let workCalls = 0;
    let createCalls = 0;
    const creationKeys: string[] = [];
    const requests = new Map<string, Record<string, unknown>>();
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (path.endsWith("/v1/me")) return response({
        actor: { display_name: "Codex", id: "codex" },
        principal: { issuer: "https://fleet-test.cloudflareaccess.com", kind: "service", provider: "cloudflare_access", subject: "codex-test.access" },
      });
      if (path.endsWith("/v1/portfolio")) return response({ projects: [] });
      if (path.endsWith("/v1/me/work?after=0")) {
        workCalls += 1;
        if (workCalls === 2) return response({ error: "unavailable", message: "Refresh unavailable" }, 503);
        return response({ ...work, obligations: [], outbound_requests: [...requests.values()], inbound_requests: [], pull_candidates: [] });
      }
      if (path.endsWith("/v1/decisions")) return response({ decisions: [] });
      if (path.endsWith("/v1/requests") && init?.method === "POST") {
        creationKeys.push(String(new Headers(init.headers).get("Idempotency-Key")));
        const body = JSON.parse(String(init.body));
        expect(body.artifact).toBeUndefined();
        createCalls += 1;
        const created = {
          id: `refresh-created-${createCalls}`,
          project_id: null,
          requester: { id: "codex" },
          recipient: { id: body.recipient_id },
          title: body.title,
          detail: body.detail,
          artifact: null,
          accepted_scope: null,
          evidence: [],
          state: "Pending",
          version: 1,
        };
        requests.set(created.id, created);
        return response(created, 201);
      }
      const requestId = path.match(/\/v1\/requests\/(refresh-created-\d+)$/)?.[1];
      if (requestId && init?.method === undefined) return response(requests.get(requestId));
      return response({ error: "not_found", message: "route does not exist" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    await userEvent.click(await screen.findByRole("link", { name: "My Work" }));
    await userEvent.type(screen.getByLabelText("Recipient ID"), "claude");
    await userEvent.type(screen.getByLabelText("Review title"), "Stored before refresh");
    await userEvent.type(screen.getByLabelText("Review scope"), "No artifact is needed.");
    await userEvent.click(screen.getByRole("button", { name: "Send standalone review" }));

    expect(await screen.findByText("The Fleet action succeeded, but current work could not be refreshed. Reload current work before another action.")).toBeVisible();
    expect(screen.getByLabelText("Review title")).toHaveValue("");

    await userEvent.clear(screen.getByLabelText("Recipient ID"));
    await userEvent.clear(screen.getByLabelText("Review title"));
    await userEvent.clear(screen.getByLabelText("Review scope"));
    await userEvent.type(screen.getByLabelText("Recipient ID"), "claude");
    await userEvent.type(screen.getByLabelText("Review title"), "Second stored review");
    await userEvent.type(screen.getByLabelText("Review scope"), "Use the rotated key.");
    await userEvent.click(screen.getByRole("button", { name: "Send standalone review" }));

    expect(await screen.findByText("Second stored review", { selector: "strong" })).toBeVisible();
    expect(creationKeys).toHaveLength(2);
    expect(creationKeys[1]).not.toBe(creationKeys[0]);
  });

  it("reuses an acceptance key when the first response is lost", async () => {
    let currentRequest = {
      id: "retry-accept",
      project_id: null,
      requester: { id: "claude" },
      recipient: { id: "codex" },
      title: "Retry-safe acceptance",
      detail: "Accept this exact scope once.",
      artifact: null,
      accepted_scope: null as null | { title: string; detail: string; artifact: null },
      evidence: [],
      state: "Pending",
      version: 1,
    };
    const acceptanceKeys: string[] = [];
    let acceptCalls = 0;
    const snapshot = () => ({
      ...work,
      obligations: currentRequest.state === "Accepted"
        ? [{ source: "accepted_request", request_id: currentRequest.id, project_id: null, title: currentRequest.title, detail: currentRequest.detail }]
        : [],
      outbound_requests: [],
      inbound_requests: [currentRequest],
      pull_candidates: [],
    });
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (path.endsWith("/v1/me")) return response({
        actor: { display_name: "Codex", id: "codex" },
        principal: { issuer: "https://fleet-test.cloudflareaccess.com", kind: "service", provider: "cloudflare_access", subject: "codex-test.access" },
      });
      if (path.endsWith("/v1/portfolio")) return response({ projects: [] });
      if (path.endsWith("/v1/me/work?after=0")) return response(snapshot());
      if (path.endsWith("/v1/decisions")) return response({ decisions: [] });
      if (path.endsWith("/v1/requests/retry-accept") && init?.method === undefined) return response(currentRequest);
      if (path.endsWith("/v1/requests/retry-accept/accept") && init?.method === "POST") {
        acceptanceKeys.push(String(new Headers(init.headers).get("Idempotency-Key")));
        acceptCalls += 1;
        if (acceptCalls === 1) {
          currentRequest = {
            ...currentRequest,
            state: "Accepted",
            version: 2,
            accepted_scope: { title: currentRequest.title, detail: currentRequest.detail, artifact: null },
          };
          throw new TypeError("response lost");
        }
        return response(currentRequest);
      }
      return response({ error: "not_found", message: "route does not exist" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    await userEvent.click(await screen.findByRole("link", { name: "My Work" }));
    await userEvent.click(screen.getByRole("button", { name: "Accept Retry-safe acceptance" }));
    expect(await screen.findByText("Fleet could not be reached. Refresh current work before retrying this action.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Accept Retry-safe acceptance" }));

    expect(await screen.findByText("Accepted scope: Accept this exact scope once.")).toBeVisible();
    expect(acceptanceKeys).toHaveLength(2);
    expect(acceptanceKeys[1]).toBe(acceptanceKeys[0]);
  });

  it("accepts and fulfills a standalone review with visible evidence", async () => {
    const baseRequest = {
      id: "standalone-inbound",
      project_id: null,
      requester: { id: "claude" },
      recipient: { id: "codex" },
      title: "Review a personal experiment",
      detail: "Review only the shared artifact.",
      artifact: { uri: "https://home.example.test/shareable", summary: "Shareable experiment" },
      accepted_scope: null,
      evidence: [],
      state: "Pending",
      version: 1,
    };
    let currentRequest = baseRequest;
    const currentSnapshot = () => ({
      ...work,
      obligations: currentRequest.state === "Accepted"
        ? [{ source: "accepted_request", request_id: currentRequest.id, project_id: null, title: currentRequest.title, detail: currentRequest.detail }]
        : [],
      outbound_requests: [],
      inbound_requests: [{ ...currentRequest, evidence: [] }],
      pull_candidates: [],
    });
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (path.endsWith("/v1/me")) return response({
        actor: { display_name: "Codex", id: "codex" },
        principal: { issuer: "https://fleet-test.cloudflareaccess.com", kind: "service", provider: "cloudflare_access", subject: "codex-test.access" },
      });
      if (path.endsWith("/v1/portfolio")) return response({ projects: [] });
      if (path.endsWith("/v1/me/work?after=0")) return response(currentSnapshot());
      if (path.endsWith("/v1/decisions")) return response({ decisions: [] });
      if (path.endsWith("/v1/requests/standalone-inbound") && init?.method === undefined) return response(currentRequest);
      if (path.endsWith("/v1/requests/standalone-inbound/accept") && init?.method === "POST") {
        expect(new Headers(init.headers).get("If-Match")).toBe('"1"');
        expect(JSON.parse(String(init.body))).toEqual({});
        currentRequest = {
          ...currentRequest,
          state: "Accepted",
          version: 2,
          accepted_scope: { title: currentRequest.title, detail: currentRequest.detail, artifact: currentRequest.artifact },
        };
        return response(currentRequest);
      }
      if (path.endsWith("/v1/requests/standalone-inbound/fulfill") && init?.method === "POST") {
        expect(new Headers(init.headers).get("If-Match")).toBe('"2"');
        const fulfillment = JSON.parse(String(init.body));
        expect(fulfillment).toEqual({ evidence: [{ uri: "https://reviews.example.test/result", summary: "Completed review" }] });
        currentRequest = { ...currentRequest, state: "Fulfilled", version: 3, evidence: fulfillment.evidence };
        return response(currentRequest);
      }
      return response({ error: "not_found", message: "route does not exist" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    await userEvent.click(await screen.findByRole("link", { name: "My Work" }));
    await userEvent.click(screen.getByRole("button", { name: "Accept Review a personal experiment" }));
    expect(await screen.findByText("Accepted scope: Review only the shared artifact.")).toBeVisible();

    await userEvent.type(screen.getByLabelText("Evidence URL for Review a personal experiment"), "https://reviews.example.test/result");
    await userEvent.type(screen.getByLabelText("Evidence summary for Review a personal experiment"), "Completed review");
    await userEvent.click(screen.getByRole("button", { name: "Fulfill Review a personal experiment" }));

    expect(await screen.findByRole("link", { name: "Completed review" })).toHaveAttribute("href", "https://reviews.example.test/result");
    expect(screen.queryByText("Review a personal experiment", { selector: "strong" })).toBeInTheDocument();
  });
});
