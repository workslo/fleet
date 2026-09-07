import { describe, expect, it } from "vitest";
import { exports } from "cloudflare:workers";
import { accessHeaders } from "./access-fixture";

// Claude seat contribution — the bounded authority-test lane requested by the
// Project Owner (Fleet V1 Foundation): HTTP-level cross-seat and Shane-only
// transition coverage against contracts/authority-v1.md. Behavior is observed
// only through the Worker HTTP seam, per AGENTS.md. Helpers mirror
// project-lifecycle.spec.ts so the suite reads as one house.

type RequestOptions = {
  body?: unknown;
  idempotencyKey?: string;
  ifMatch?: number;
  method?: string;
  principal?: string;
};

async function apiRequest(path: string, options: RequestOptions = {}): Promise<Response> {
  const headers = options.principal ? await accessHeaders(options.principal) : new Headers();
  if (options.principal === "shane" && options.body !== undefined) headers.set("Origin", "https://fleet.test");
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
  if (options.ifMatch !== undefined) headers.set("If-Match", `"${options.ifMatch}"`);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  return exports.default.fetch(`https://fleet.test${path}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

function postAs(principal: string, path: string, body: unknown, key = crypto.randomUUID()) {
  return apiRequest(path, { body, idempotencyKey: key, principal });
}

function mutateAs(
  principal: string,
  path: string,
  version: number,
  body: unknown,
  key = crypto.randomUUID(),
) {
  return apiRequest(path, { body, idempotencyKey: key, ifMatch: version, principal });
}

function getAs(principal: string, path: string) {
  return apiRequest(path, { principal });
}

function authorizationBody() {
  return {
    proposed_owner_id: "codex",
    outcome: "Deliver Fleet V1",
    scope: ["Worker", "D1"],
    exclusions: ["deploy"],
    delegated_actions: ["branch", "commit", "push", "pull_request"],
    gates: ["production Cloudflare"],
    validation_evidence: ["local Worker tests"],
    plan: "Authority lane coverage",
  };
}

async function proposeProject(): Promise<{ id: string; version: number }> {
  const response = await postAs("shane", "/v1/projects", {
    slug: `authority-lane-${crypto.randomUUID()}`,
    title: "Authority lane",
    originator_id: "shane",
  });
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string; version: number };
}

async function activeProjectOwnedByCodex(): Promise<{ id: string }> {
  const project = await proposeProject();
  const authorized = await mutateAs("shane", `/v1/projects/${project.id}/authorize`, 1, authorizationBody());
  expect(authorized.status).toBe(200);
  const accepted = await mutateAs("codex", `/v1/projects/${project.id}/owner-accept`, 2, {});
  expect(accepted.status).toBe(200);
  return { id: project.id };
}

async function pendingRequestToClaude(projectId: string): Promise<{ id: string }> {
  const created = await postAs("codex", `/v1/projects/${projectId}/requests`, {
    recipient_id: "claude",
    title: "Authority test lane",
    detail: "Cross-seat and Shane-only transition coverage",
  });
  expect(created.status).toBe(201);
  return (await created.json()) as { id: string };
}

describe("Authority contract — cross-seat and Shane-only transitions (Claude lane)", () => {
  it("rejects a principal that is not an active Fleet actor", async () => {
    const response = await getAs("quinn", "/v1/portfolio");
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "unauthorized" });
  });

  it("resolves authority from the principal, never from the request body", async () => {
    const project = await proposeProject();
    // The body names Shane every way a body could; the principal is claude.
    const response = await mutateAs("claude", `/v1/projects/${project.id}/authorize`, 1, {
      ...authorizationBody(),
      agent_id: "shane",
      caller: { id: "shane" },
      actor_id: "shane",
    });
    expect(response.status).toBe(403);
    const card = await getAs("shane", `/v1/projects/${project.id}`);
    expect(await card.json()).toMatchObject({ state: "Proposed", version: 1 });
  });

  it("does not let project ownership stand in for Shane's authorization authority", async () => {
    await activeProjectOwnedByCodex();
    const other = await proposeProject();
    const response = await mutateAs("codex", `/v1/projects/${other.id}/authorize`, 1, authorizationBody());
    expect(response.status).toBe(403);
    const card = await getAs("shane", `/v1/projects/${other.id}`);
    expect(await card.json()).toMatchObject({ state: "Proposed", version: 1 });
  });

  it("does not let even Shane accept ownership for another seat", async () => {
    const project = await proposeProject();
    const authorized = await mutateAs("shane", `/v1/projects/${project.id}/authorize`, 1, authorizationBody());
    expect(authorized.status).toBe(200);
    const response = await mutateAs("shane", `/v1/projects/${project.id}/owner-accept`, 2, {});
    expect(response.status).toBe(403);
    const card = await getAs("shane", `/v1/projects/${project.id}`);
    expect(await card.json()).toMatchObject({ state: "Authorized", owner: null, version: 2 });
  });

  it("lets only the recipient accept a work request — not a sibling, not Shane", async () => {
    const project = await activeProjectOwnedByCodex();
    const workRequest = await pendingRequestToClaude(project.id);

    const sibling = await mutateAs("agentslo", `/v1/requests/${workRequest.id}/accept`, 1, {});
    expect(sibling.status).toBe(403);
    const admiral = await mutateAs("shane", `/v1/requests/${workRequest.id}/accept`, 1, {});
    expect(admiral.status).toBe(403);

    // Positive control: the recipient's acceptance succeeds at the same
    // version, proving the rejections above moved nothing.
    const recipient = await mutateAs("claude", `/v1/requests/${workRequest.id}/accept`, 1, {});
    expect(recipient.status).toBe(200);
    expect(await recipient.json()).toMatchObject({ state: "Accepted", version: 2 });
  });

  it("lets only the recipient fulfill an accepted work request", async () => {
    const project = await activeProjectOwnedByCodex();
    const workRequest = await pendingRequestToClaude(project.id);
    const accepted = await mutateAs("claude", `/v1/requests/${workRequest.id}/accept`, 1, {});
    expect(accepted.status).toBe(200);

    const requester = await mutateAs("codex", `/v1/requests/${workRequest.id}/fulfill`, 2, {
      evidence: [{ uri: "https://example.test/pr", summary: "not the recipient" }],
    });
    expect(requester.status).toBe(403);

    const recipient = await mutateAs("claude", `/v1/requests/${workRequest.id}/fulfill`, 2, {
      evidence: [{ uri: "https://example.test/pr", summary: "delivered by the recipient" }],
    });
    expect(recipient.status).toBe(200);
    expect(await recipient.json()).toMatchObject({ state: "Fulfilled", version: 3 });
  });

  it("keeps attributed activity clean of failed authority checks", async () => {
    const project = await proposeProject();
    const rejected = await mutateAs("claude", `/v1/projects/${project.id}/authorize`, 1, authorizationBody());
    expect(rejected.status).toBe(403);
    const card = await getAs("shane", `/v1/projects/${project.id}`);
    const payload = (await card.json()) as { activity: Array<{ actor: { id: string }; type: string }> };
    expect(payload.activity).toEqual([
      expect.objectContaining({ actor: { id: "shane" }, type: "project.proposed" }),
    ]);
  });

  it("scopes idempotency keys to the authenticated actor", async () => {
    const key = crypto.randomUUID();
    const first = await postAs("shane", "/v1/projects", {
      slug: `actor-scoped-${crypto.randomUUID()}`,
      title: "Shane's proposal",
      originator_id: "shane",
    }, key);
    expect(first.status).toBe(201);
    const shaneProject = (await first.json()) as { id: string };

    // The same key under a different principal is that actor's own fresh key,
    // not a handle on Shane's stored response.
    const second = await postAs("claude", "/v1/projects", {
      slug: `actor-scoped-${crypto.randomUUID()}`,
      title: "Claude's proposal",
      originator_id: "claude",
    }, key);
    expect(second.status).toBe(201);
    const claudeProject = (await second.json()) as { id: string };
    expect(claudeProject.id).not.toBe(shaneProject.id);
  });
});
