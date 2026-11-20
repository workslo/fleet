import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { accessHeaders, testAccessIssuer } from "./access-fixture";

type RequestOptions = {
  body?: unknown;
  idempotencyKey?: string;
  ifMatchHeader?: string;
  ifMatch?: number;
  method?: string;
  principal?: string;
};

async function apiRequest(path: string, options: RequestOptions = {}): Promise<Response> {
  const headers = options.principal ? await accessHeaders(options.principal) : new Headers();
  if (options.principal === "shane" && options.body !== undefined) headers.set("Origin", "https://fleet.test");
  if (options.idempotencyKey) {
    headers.set("Idempotency-Key", options.idempotencyKey);
  }
  if (options.ifMatch !== undefined) {
    headers.set("If-Match", `"${options.ifMatch}"`);
  }
  if (options.ifMatchHeader !== undefined) {
    headers.set("If-Match", options.ifMatchHeader);
  }
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
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

async function proposeProject() {
  const response = await postAs("shane", "/v1/projects", {
    slug: `fleet-v1-${crypto.randomUUID()}`,
    title: "Fleet V1 Foundation",
    originator_id: "shane",
  });
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string; version: number };
}

function authorizationBody() {
  return {
    proposed_owner_id: "codex",
    outcome: "Deliver Fleet V1",
    scope: ["Worker", "D1", "Board"],
    exclusions: ["deploy"],
    delegated_actions: ["branch", "commit", "push", "pull_request"],
    gates: ["production Cloudflare"],
    validation_evidence: ["local Worker tests"],
    plan: "Build the first vertical slice",
  };
}

async function failIdempotencyWrite(idempotencyKey: string) {
  const trigger = `fail_project_idempotency_${crypto.randomUUID().replaceAll("-", "_")}`;
  await env.DB.prepare(`
    CREATE TRIGGER ${trigger}
    BEFORE INSERT ON idempotency_records
    WHEN NEW.idempotency_key = '${idempotencyKey}'
    BEGIN
      SELECT RAISE(ABORT, 'project idempotency fixture');
    END;
  `).run();
  return () => env.DB.exec(`DROP TRIGGER ${trigger}`);
}

describe("Fleet project lifecycle", () => {
  it("returns JSON errors for malformed percent-encoded route IDs", async () => {
    const projectResponse = await getAs("shane", "/v1/projects/%");
    expect(projectResponse.status).toBe(400);
    expect(await projectResponse.json()).toMatchObject({ error: "invalid_request" });

    const requestResponse = await apiRequest("/v1/requests/%/accept", {
      body: {},
      idempotencyKey: crypto.randomUUID(),
      ifMatch: 1,
      principal: "shane",
    });
    expect(requestResponse.status).toBe(400);
    expect(await requestResponse.json()).toMatchObject({ error: "invalid_request" });
  });

  it("proposes, authorizes, accepts ownership, and returns the project card", async () => {
    const project = await proposeProject();
    const authorized = await mutateAs(
      "shane",
      `/v1/projects/${project.id}/authorize`,
      1,
      authorizationBody(),
    );
    expect(authorized.status).toBe(200);

    const accepted = await mutateAs("codex", `/v1/projects/${project.id}/owner-accept`, 2, {});
    expect(accepted.status).toBe(200);

    const card = await getAs("codex", `/v1/projects/${project.id}`);
    expect(card.status).toBe(200);
    expect(await card.json()).toMatchObject({
      state: "Active",
      owner: { id: "codex" },
      plan: { body: "Build the first vertical slice" },
    });
  });

  it.each(["Accepted", "Failed", "Abandoned"])("records project closeout as %s", async (disposition) => {
    const project = await proposeProject();
    const path = `/v1/projects/${project.id}`;
    expect((await mutateAs("shane", `${path}/authorize`, 1, authorizationBody())).status).toBe(200);
    expect((await mutateAs("codex", `${path}/owner-accept`, 2, {})).status).toBe(200);
    const evidence = [{ uri: "https://example.test/report", summary: "Verified result" }];
    const submission = { summary: "Delivered the local slice", evidence };
    const closure = { disposition, summary: "Reviewed the submitted outcome" };

    expect((await mutateAs("shane", `${path}/close`, 3, closure)).status).toBe(409);
    expect((await mutateAs("claude", `${path}/submit-outcome`, 3, submission)).status).toBe(403);
    expect((await mutateAs("codex", `${path}/submit-outcome`, 3, { ...submission, actor_id: "shane" })).status).toBe(400);
    expect((await mutateAs("codex", `${path}/submit-outcome`, 2, submission)).status).toBe(412);

    const submitted = await mutateAs("codex", `${path}/submit-outcome`, 3, submission);
    expect(submitted.status).toBe(200);
    expect(await submitted.json()).toMatchObject({
      state: "Awaiting Acceptance",
      version: 4,
      outcome_submission: { ...submission, actor: { id: "codex" }, at: expect.any(String) },
    });
    expect((await mutateAs("codex", `${path}/close`, 4, closure)).status).toBe(403);

    const key = crypto.randomUUID();
    const outcomes = await Promise.all([
      mutateAs("shane", `${path}/close`, 4, closure, key),
      mutateAs("shane", `${path}/close`, 4, closure, key),
    ]);
    const [first, second] = outcomes;
    expect(first?.status).toBe(200);
    expect(second?.status).toBe(200);
    expect(await first?.text()).toBe(await second?.text());
    expect((await mutateAs("shane", `${path}/close`, 4, closure)).status).toBe(412);
    expect((await mutateAs("shane", `${path}/close`, 4, { ...closure, summary: "Changed" }, key)).status).toBe(409);

    const card = await (await getAs("claude", path)).json() as {
      activity: Array<{ type: string; actor: { id: string } }>;
    };
    expect(card).toMatchObject({
      state: "Closed",
      owner: { id: "codex" },
      next_action: null,
      version: 5,
      outcome_submission: { ...submission, actor: { id: "codex" } },
      closure: { ...closure, actor: { id: "shane" }, at: expect.any(String), evidence: [] },
    });
    expect(card.activity.filter(({ type }) => type === "project.closed")).toEqual([
      expect.objectContaining({ actor: { id: "shane" } }),
    ]);
    expect(card.activity.filter(({ type }) => type === "project.outcome_submitted")).toEqual([
      expect.objectContaining({ actor: { id: "codex" } }),
    ]);
    const work = await (await getAs("codex", "/v1/me/work")).json() as { obligations: Array<{ project_id: string }> };
    expect(work.obligations.some(({ project_id }) => project_id === project.id)).toBe(false);
  });

  it.each(["Failed", "Abandoned"])("allows the owner to record %s within the authorized envelope", async (disposition) => {
    const project = await proposeProject();
    const path = `/v1/projects/${project.id}`;
    expect((await mutateAs("shane", `${path}/authorize`, 1, authorizationBody())).status).toBe(200);
    expect((await mutateAs("codex", `${path}/owner-accept`, 2, {})).status).toBe(200);
    const closure = { disposition, summary: "Work ended within the envelope", within_envelope: true };
    expect((await mutateAs("claude", `${path}/close`, 3, closure)).status).toBe(403);
    expect((await mutateAs("codex", `${path}/close`, 3, { ...closure, within_envelope: false })).status).toBe(400);
    expect((await mutateAs("codex", `${path}/close`, 3, { ...closure, disposition: "Accepted" })).status).toBe(400);
    const closed = await mutateAs("codex", `${path}/close`, 3, closure);
    expect(closed.status).toBe(200);
    expect(await closed.json()).toMatchObject({ state: "Closed", version: 4, closure: { ...closure, actor: { id: "codex" } } });
  });

  it("routes a paused project's outcome through Shane's review", async () => {
    const project = await proposeProject();
    const path = `/v1/projects/${project.id}`;
    expect((await mutateAs("shane", `${path}/authorize`, 1, authorizationBody())).status).toBe(200);
    expect((await mutateAs("codex", `${path}/owner-accept`, 2, {})).status).toBe(200);
    await env.DB.prepare("UPDATE projects SET state = 'Paused' WHERE id = ?").bind(project.id).run();

    const submitted = await mutateAs("codex", `${path}/submit-outcome`, 3, { summary: "Review the project commitments" });
    expect(submitted.status).toBe(200);
    expect(await submitted.json()).toMatchObject({ state: "Awaiting Acceptance" });
    expect((await mutateAs("shane", `${path}/close`, 4, { disposition: "Abandoned", summary: "Resolved the commitments" })).status).toBe(200);
  });

  it("serializes project-linked creation with closeout and preserves replies to accepted retries", async () => {
    const project = await proposeProject();
    const path = `/v1/projects/${project.id}`;
    expect((await mutateAs("shane", `${path}/authorize`, 1, authorizationBody())).status).toBe(200);
    expect((await mutateAs("codex", `${path}/owner-accept`, 2, {})).status).toBe(200);
    const request = { recipient_id: "claude", title: "Review", detail: "Review the draft" };
    const candidate = { project_id: project.id, title: "Explore", detail: "Read the report" };
    const requestKey = crypto.randomUUID();
    const candidateKey = crypto.randomUUID();

    const [closed, createdRequest, createdCandidate] = await Promise.all([
      mutateAs("codex", `${path}/close`, 3, { disposition: "Failed", summary: "Attempt ended", within_envelope: true }),
      postAs("codex", `${path}/requests`, request, requestKey),
      postAs("codex", "/v1/pull-candidates", candidate, candidateKey),
    ]);
    expect(closed.status).toBe(200);
    expect([201, 409]).toContain(createdRequest.status);
    expect([201, 409]).toContain(createdCandidate.status);

    expect((await postAs("codex", `${path}/requests`, request)).status).toBe(409);
    expect((await postAs("codex", "/v1/pull-candidates", candidate)).status).toBe(409);
    const requestReplay = await postAs("codex", `${path}/requests`, request, requestKey);
    const candidateReplay = await postAs("codex", "/v1/pull-candidates", candidate, candidateKey);
    expect(requestReplay.status).toBe(createdRequest.status);
    expect(candidateReplay.status).toBe(createdCandidate.status);
    if (createdRequest.ok) expect(await requestReplay.text()).toBe(await createdRequest.text());
    if (createdCandidate.ok) expect(await candidateReplay.text()).toBe(await createdCandidate.text());

    const feed = await (await getAs("codex", "/v1/activity")).json() as {
      activity: Array<{ id: number; project_id: string; type: string }>;
    };
    const projectEvents = feed.activity.filter(({ project_id }) => project_id === project.id);
    expect(projectEvents.at(-1)?.type).toBe("project.closed");
    expect(projectEvents.filter(({ type }) => type === "work_request.created")).toHaveLength(createdRequest.ok ? 1 : 0);
    expect(projectEvents.filter(({ type }) => type === "pull_candidate.published")).toHaveLength(createdCandidate.ok ? 1 : 0);
  });

  it("rolls back a closeout submission when its replay record cannot be stored", async () => {
    const project = await proposeProject();
    const path = `/v1/projects/${project.id}`;
    expect((await mutateAs("shane", `${path}/authorize`, 1, authorizationBody())).status).toBe(200);
    expect((await mutateAs("codex", `${path}/owner-accept`, 2, {})).status).toBe(200);
    const key = crypto.randomUUID();
    const removeTrigger = await failIdempotencyWrite(key);
    try {
      expect((await mutateAs("codex", `${path}/submit-outcome`, 3, { summary: "Ready" }, key)).status).toBe(500);
    } finally {
      await removeTrigger();
    }
    const card = await (await getAs("codex", path)).json();
    expect(card).toMatchObject({ state: "Active", version: 3 });
    expect(card).not.toHaveProperty("outcome_submission");
    expect(card).toMatchObject({ activity: expect.not.arrayContaining([expect.objectContaining({ type: "project.outcome_submitted" })]) });
    expect((await mutateAs("codex", `${path}/submit-outcome`, 3, { summary: "Ready" }, key)).status).toBe(200);
  });

  it("lists a proposed project in the portfolio", async () => {
    const project = await proposeProject();
    const response = await getAs("claude", "/v1/portfolio");
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { projects: Array<{ id: string }> };
    expect(payload.projects.some((entry) => entry.id === project.id)).toBe(true);
  });

  it("allows only Shane to authorize a project", async () => {
    const project = await proposeProject();
    const response = await mutateAs("claude", `/v1/projects/${project.id}/authorize`, 1, authorizationBody());
    expect(response.status).toBe(403);
  });

  it("requires the proposed owner to accept ownership", async () => {
    const project = await proposeProject();
    await mutateAs("shane", `/v1/projects/${project.id}/authorize`, 1, authorizationBody());
    const response = await mutateAs("claude", `/v1/projects/${project.id}/owner-accept`, 2, {});
    expect(response.status).toBe(403);
  });

  it("requires an idempotency key and rejects key reuse with a different payload", async () => {
    const missing = await apiRequest("/v1/projects", {
      body: { slug: "missing-key", title: "Missing key", originator_id: "shane" },
      principal: "shane",
    });
    expect(missing.status).toBe(400);

    const key = crypto.randomUUID();
    const first = await postAs("shane", "/v1/projects", {
      slug: `same-key-${crypto.randomUUID()}`,
      title: "First",
      originator_id: "shane",
    }, key);
    expect(first.status).toBe(201);
    const reused = await postAs("shane", "/v1/projects", {
      slug: `different-${crypto.randomUUID()}`,
      title: "Different",
      originator_id: "shane",
    }, key);
    expect(reused.status).toBe(409);
  });

  it("returns the stored response for an exact idempotency replay", async () => {
    const key = crypto.randomUUID();
    const body = { slug: `replay-${crypto.randomUUID()}`, title: "Replay", originator_id: "shane" };
    const first = await postAs("shane", "/v1/projects", body, key);
    const second = await postAs("shane", "/v1/projects", body, key);
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual(await first.json());
  });

  it("rolls back project proposal when its replay response cannot be stored", async () => {
    const key = crypto.randomUUID();
    const body = {
      slug: `atomic-proposal-${crypto.randomUUID()}`,
      title: "Atomic proposal",
      originator_id: "shane",
    };
    const clearFixture = await failIdempotencyWrite(key);

    const interrupted = await postAs("shane", "/v1/projects", body, key);
    expect(interrupted.status).toBe(500);
    await clearFixture();

    const portfolio = await getAs("shane", "/v1/portfolio");
    const snapshot = (await portfolio.json()) as { projects: Array<{ slug: string }> };
    expect(snapshot.projects.some((project) => project.slug === body.slug)).toBe(false);

    const retry = await postAs("shane", "/v1/projects", body, key);
    const replay = await postAs("shane", "/v1/projects", body, key);
    expect(retry.status).toBe(201);
    expect(await replay.json()).toEqual(await retry.json());
  });

  it("rejects stale versions", async () => {
    const project = await proposeProject();
    const response = await mutateAs("shane", `/v1/projects/${project.id}/authorize`, 2, authorizationBody());
    expect(response.status).toBe(412);
  });

  it("requires quoted If-Match versions", async () => {
    const project = await proposeProject();
    const unquoted = await apiRequest(`/v1/projects/${project.id}/authorize`, {
      body: authorizationBody(),
      idempotencyKey: crypto.randomUUID(),
      ifMatchHeader: "1",
      principal: "shane",
    });
    expect(unquoted.status).toBe(400);

    const quoted = await mutateAs("shane", `/v1/projects/${project.id}/authorize`, 1, authorizationBody());
    expect(quoted.status).toBe(200);
  });

  it("rolls back authorization when an envelope revision cannot be recorded", async () => {
    const project = await proposeProject();
    await env.DB.prepare(
      `INSERT INTO project_envelope_revisions
        (project_id, revision, actor_id, outcome, scope_json, exclusions_json, delegated_actions_json, gates_json, validation_evidence_json)
       VALUES (?, 1, 'shane', 'conflict fixture', '[]', '[]', '[]', '[]', '[]')`,
    ).bind(project.id).run();

    const response = await mutateAs("shane", `/v1/projects/${project.id}/authorize`, 1, authorizationBody());
    expect(response.status).toBe(500);
    const card = await getAs("shane", `/v1/projects/${project.id}`);
    expect(await card.json()).toMatchObject({
      state: "Proposed",
      version: 1,
      activity: [expect.objectContaining({ type: "project.proposed" })],
    });
  });

  it("rolls back authorization when its replay response cannot be stored", async () => {
    const project = await proposeProject();
    const key = crypto.randomUUID();
    const body = authorizationBody();
    const clearFixture = await failIdempotencyWrite(key);

    const interrupted = await mutateAs("shane", `/v1/projects/${project.id}/authorize`, 1, body, key);
    expect(interrupted.status).toBe(500);
    await clearFixture();

    const unchanged = await getAs("shane", `/v1/projects/${project.id}`);
    expect(await unchanged.json()).toMatchObject({ state: "Proposed", version: 1 });

    const retry = await mutateAs("shane", `/v1/projects/${project.id}/authorize`, 1, body, key);
    const replay = await mutateAs("shane", `/v1/projects/${project.id}/authorize`, 1, body, key);
    expect(retry.status).toBe(200);
    expect(await replay.json()).toEqual(await retry.json());
  });

  it("rolls back owner acceptance when its activity cannot be recorded", async () => {
    const project = await proposeProject();
    await mutateAs("shane", `/v1/projects/${project.id}/authorize`, 1, authorizationBody());
    await env.DB.prepare(`
      CREATE TRIGGER fail_owner_acceptance_event
      BEFORE INSERT ON activity_events
      WHEN NEW.type = 'project.owner_accepted'
      BEGIN
        SELECT RAISE(ABORT, 'owner acceptance activity fixture');
      END;
    `).run();

    const response = await mutateAs("codex", `/v1/projects/${project.id}/owner-accept`, 2, {});
    expect(response.status).toBe(500);
    const card = await getAs("codex", `/v1/projects/${project.id}`);
    const payload = await card.json();
    await env.DB.exec("DROP TRIGGER fail_owner_acceptance_event");
    expect(payload).toMatchObject({
      state: "Authorized",
      owner: null,
      version: 2,
      activity: expect.arrayContaining([expect.objectContaining({ type: "project.authorized" })]),
    });
  });

  it("rolls back owner acceptance when its replay response cannot be stored", async () => {
    const project = await proposeProject();
    await mutateAs("shane", `/v1/projects/${project.id}/authorize`, 1, authorizationBody());
    const key = crypto.randomUUID();
    const clearFixture = await failIdempotencyWrite(key);

    const interrupted = await mutateAs("codex", `/v1/projects/${project.id}/owner-accept`, 2, {}, key);
    expect(interrupted.status).toBe(500);
    await clearFixture();

    const unchanged = await getAs("codex", `/v1/projects/${project.id}`);
    expect(await unchanged.json()).toMatchObject({ state: "Authorized", owner: null, version: 2 });

    const retry = await mutateAs("codex", `/v1/projects/${project.id}/owner-accept`, 2, {}, key);
    const replay = await mutateAs("codex", `/v1/projects/${project.id}/owner-accept`, 2, {}, key);
    expect(retry.status).toBe(200);
    expect(await replay.json()).toEqual(await retry.json());
  });

  it("creates one attributed activity event for each accepted mutation", async () => {
    const project = await proposeProject();
    await mutateAs("shane", `/v1/projects/${project.id}/authorize`, 1, authorizationBody());
    await mutateAs("codex", `/v1/projects/${project.id}/owner-accept`, 2, {});
    const card = await getAs("shane", `/v1/projects/${project.id}`);
    const payload = (await card.json()) as { activity: Array<{ actor: { id: string }; type: string }> };
    expect(payload.activity).toEqual([
      expect.objectContaining({ actor: { id: "codex" }, type: "project.owner_accepted" }),
      expect.objectContaining({ actor: { id: "shane" }, type: "project.authorized" }),
      expect.objectContaining({ actor: { id: "shane" }, type: "project.proposed" }),
    ]);
  });

  it("caps the card embed at the 20 newest evidence links and activity events", async () => {
    const project = await proposeProject();
    const inserts = Array.from({ length: 25 }, (_, i) => [
      env.DB.prepare("INSERT INTO activity_events (project_id, actor_id, type, payload_json, principal_provider, principal_issuer, principal_kind, principal_subject) VALUES (?, 'shane', ?, '{}', 'cloudflare_access', ?, 'human', 'test-human-shane')").bind(project.id, `test.event_${i}`, testAccessIssuer),
      env.DB.prepare("INSERT INTO evidence_links (project_id, actor_id, uri, summary) VALUES (?, 'shane', ?, ?)").bind(project.id, `https://fleet.test/evidence-${i}`, `evidence ${i}`),
    ]).flat();
    await env.DB.batch(inserts);

    const response = await getAs("shane", `/v1/projects/${project.id}`);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      activity: Array<{ type: string }>;
      evidence: Array<{ uri: string }>;
    };
    expect(payload.activity).toHaveLength(20);
    expect(payload.evidence).toHaveLength(20);
    // Newest first: the last-inserted rows survive, the earliest are paged out.
    expect(payload.activity[0]?.type).toBe("test.event_24");
    expect(payload.evidence[0]?.uri).toBe("https://fleet.test/evidence-24");
    expect(payload.activity.map((event) => event.type)).not.toContain("test.event_0");
    expect(payload.evidence.map((link) => link.uri)).not.toContain("https://fleet.test/evidence-0");
  });
});
