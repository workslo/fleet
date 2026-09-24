import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { accessHeaders } from "./access-fixture";
import { SLUG_PATTERN, V1_LIMITS } from "../src/limits";

// workslo/fleet#9. The V1 decoders checked primitive types but not content or size, so an
// authenticated seat could store empty slugs and titles, blank asks and evidence, unbounded
// text and arrays, and an unbounded Idempotency-Key. Every control below is a boundary pair
// where that is cheap: the largest accepted value passes, one byte more fails.

const OVER = (limit: number) => "x".repeat(limit + 1);
const AT = (limit: number) => "x".repeat(limit);

async function api(principal: string, path: string, body?: unknown, options: { key?: string; version?: number } = {}) {
  const headers = await accessHeaders(principal);
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    headers.set("Idempotency-Key", options.key ?? crypto.randomUUID());
    if (principal === "shane") headers.set("Origin", "https://fleet.test");
  }
  if (options.version !== undefined) headers.set("If-Match", `"${options.version}"`);
  return exports.default.fetch(`https://fleet.test${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function proposal(overrides: Record<string, unknown> = {}) {
  return { slug: `bounded-${crypto.randomUUID()}`, title: "Bounded inputs", originator_id: "shane", ...overrides };
}

const envelope = {
  proposed_owner_id: "codex",
  outcome: "Deliver bounded inputs",
  scope: ["Worker"],
  exclusions: ["deploy"],
  delegated_actions: ["commit"],
  gates: ["production Cloudflare"],
  validation_evidence: ["local Worker tests"],
  plan: "Validate at the boundary",
};

async function activeProject() {
  const proposed = await api("shane", "/v1/projects", proposal());
  expect(proposed.status).toBe(201);
  const project = (await proposed.json()) as { id: string };
  expect((await api("shane", `/v1/projects/${project.id}/authorize`, envelope, { version: 1 })).status).toBe(200);
  expect((await api("codex", `/v1/projects/${project.id}/owner-accept`, {}, { version: 2 })).status).toBe(200);
  return project.id;
}

async function pendingRequest() {
  const created = await api("codex", "/v1/requests", {
    recipient_id: "claude",
    title: "Review the bounded-input change",
    detail: "Return an honest reading of the boundary controls.",
  });
  expect(created.status).toBe(201);
  return (await created.json()) as { id: string; version: number };
}

describe("Idempotency-Key is bounded, not merely present", () => {
  it("accepts a key at the limit and refuses one byte more", async () => {
    const ok = await api("shane", "/v1/projects", proposal(), { key: AT(V1_LIMITS.idempotency_key) });
    expect(ok.status).toBe(201);
    const over = await api("shane", "/v1/projects", proposal(), { key: OVER(V1_LIMITS.idempotency_key) });
    expect(over.status).toBe(400);
    expect(((await over.json()) as { error: string }).error).toBe("invalid_request");
  });

  it("refuses a whitespace-only key", async () => {
    const blank = await api("shane", "/v1/projects", proposal(), { key: "   " });
    expect(blank.status).toBe(400);
  });

  it("bounds the key on the Needs Shane routes too", async () => {
    const projectId = await activeProject();
    const over = await api("codex", "/v1/decisions", {
      project_id: projectId, kind: "decision", question: "Ship?", resolution_condition: "Shane answers",
    }, { key: OVER(V1_LIMITS.idempotency_key) });
    expect(over.status).toBe(400);
  });
});

describe("POST /v1/projects", () => {
  it("refuses a blank or whitespace-only required field", async () => {
    for (const body of [proposal({ slug: "" }), proposal({ title: "  " }), proposal({ originator_id: " " })]) {
      expect((await api("shane", "/v1/projects", body)).status).toBe(400);
    }
  });

  it("enforces the canonical slug syntax", async () => {
    const rejected = ["Fleet-V1", "fleet_v1", "-fleet", "fleet-", "fleet--v1", "fleet v1", "fleet.v1"];
    for (const slug of rejected) {
      expect(SLUG_PATTERN.test(slug)).toBe(false);
      expect((await api("shane", "/v1/projects", proposal({ slug }))).status).toBe(400);
    }
    expect((await api("shane", "/v1/projects", proposal({ slug: "fleet-v1-foundation-2" }))).status).toBe(201);
  });

  it("accepts a slug and title at their limits and refuses one byte more", async () => {
    expect((await api("shane", "/v1/projects", proposal({ slug: "a".repeat(V1_LIMITS.slug) }))).status).toBe(201);
    expect((await api("shane", "/v1/projects", proposal({ slug: "a".repeat(V1_LIMITS.slug + 1) }))).status).toBe(400);
    expect((await api("shane", "/v1/projects", proposal({ title: AT(V1_LIMITS.title) }))).status).toBe(201);
    expect((await api("shane", "/v1/projects", proposal({ title: OVER(V1_LIMITS.title) }))).status).toBe(400);
  });

  it("counts a limit in UTF-8 bytes, not code units", async () => {
    // "é" is two bytes; half the limit in them is exactly the limit.
    expect((await api("shane", "/v1/projects", proposal({ title: "é".repeat(V1_LIMITS.title / 2) }))).status).toBe(201);
    expect((await api("shane", "/v1/projects", proposal({ title: "é".repeat(V1_LIMITS.title / 2 + 1) }))).status).toBe(400);
  });

  it("stores the trimmed value it validated", async () => {
    const slug = `bounded-${crypto.randomUUID()}`;
    const created = await api("shane", "/v1/projects", { slug: `  ${slug}  `, title: "  Padded title  ", originator_id: "shane" });
    expect(created.status).toBe(201);
    const card = (await created.json()) as { id: string; slug: string; title: string };
    expect(card.slug).toBe(slug);
    expect(card.title).toBe("Padded title");
    const row = await env.DB.prepare("SELECT slug, title FROM projects WHERE id = ?").bind(card.id).first<{ slug: string; title: string }>();
    expect(row).toEqual({ slug, title: "Padded title" });
  });
});

describe("POST /v1/projects/:id/authorize", () => {
  it("refuses a blank entry inside an envelope list but allows an empty list", async () => {
    const blank = await api("shane", "/v1/projects", proposal());
    const blankId = ((await blank.json()) as { id: string }).id;
    expect((await api("shane", `/v1/projects/${blankId}/authorize`, { ...envelope, scope: ["Worker", " "] }, { version: 1 })).status).toBe(400);
    expect((await api("shane", `/v1/projects/${blankId}/authorize`, { ...envelope, exclusions: [] }, { version: 1 })).status).toBe(200);
  });

  it("bounds envelope list length and entry size", async () => {
    const created = await api("shane", "/v1/projects", proposal());
    const id = ((await created.json()) as { id: string }).id;
    const tooMany = Array.from({ length: V1_LIMITS.envelope_items + 1 }, (_, index) => `scope ${index}`);
    expect((await api("shane", `/v1/projects/${id}/authorize`, { ...envelope, scope: tooMany }, { version: 1 })).status).toBe(400);
    expect((await api("shane", `/v1/projects/${id}/authorize`, { ...envelope, gates: [OVER(V1_LIMITS.summary)] }, { version: 1 })).status).toBe(400);
    expect((await api("shane", `/v1/projects/${id}/authorize`, { ...envelope, plan: OVER(V1_LIMITS.plan) }, { version: 1 })).status).toBe(400);
    expect((await api("shane", `/v1/projects/${id}/authorize`, { ...envelope, outcome: "   " }, { version: 1 })).status).toBe(400);
    expect((await api("shane", `/v1/projects/${id}/authorize`, { ...envelope, gates: [AT(V1_LIMITS.summary)] }, { version: 1 })).status).toBe(200);
  });
});

describe("POST /v1/requests", () => {
  it("bounds title, detail and the artifact link", async () => {
    const base = { recipient_id: "claude", title: "Bounded ask", detail: "Bounded detail" };
    expect((await api("codex", "/v1/requests", { ...base, title: OVER(V1_LIMITS.title) })).status).toBe(400);
    expect((await api("codex", "/v1/requests", { ...base, detail: OVER(V1_LIMITS.detail) })).status).toBe(400);
    expect((await api("codex", "/v1/requests", { ...base, recipient_id: OVER(V1_LIMITS.identifier) })).status).toBe(400);
    expect((await api("codex", "/v1/requests", {
      ...base, artifact: { uri: `https://example.test/${"a".repeat(V1_LIMITS.uri)}`, summary: "Draft" },
    })).status).toBe(400);
    expect((await api("codex", "/v1/requests", {
      ...base, artifact: { uri: "https://example.test/draft", summary: OVER(V1_LIMITS.summary) },
    })).status).toBe(400);
    expect((await api("codex", "/v1/requests", {
      ...base, title: AT(V1_LIMITS.title), artifact: { uri: "https://example.test/draft", summary: AT(V1_LIMITS.summary) },
    })).status).toBe(201);
  });

  it("keeps absent and explicitly null optional fields distinct", async () => {
    const base = { recipient_id: "claude", title: "Optional fields", detail: "Bounded detail" };
    expect((await api("codex", "/v1/requests", { ...base, project_id: null, expires_at: null })).status).toBe(201);
    expect((await api("codex", "/v1/requests", { ...base, project_id: "  " })).status).toBe(400);
  });
});

describe("POST /v1/pull-candidates", () => {
  it("refuses blank and oversized fields that used to be accepted", async () => {
    const projectId = await activeProject();
    const base = { project_id: projectId, title: "Bounded candidate", detail: "Bounded detail" };
    expect((await api("codex", "/v1/pull-candidates", { ...base, title: "" })).status).toBe(400);
    expect((await api("codex", "/v1/pull-candidates", { ...base, detail: "   " })).status).toBe(400);
    expect((await api("codex", "/v1/pull-candidates", { ...base, title: OVER(V1_LIMITS.title) })).status).toBe(400);
    expect((await api("codex", "/v1/pull-candidates", { ...base, detail: OVER(V1_LIMITS.detail) })).status).toBe(400);
    expect((await api("codex", "/v1/pull-candidates", { ...base, project_id: "" })).status).toBe(400);
    expect((await api("codex", "/v1/pull-candidates", base)).status).toBe(201);
  });
});

describe("POST /v1/requests/:id/:action", () => {
  it("bounds a decline reason", async () => {
    const created = await pendingRequest();
    const over = await api("claude", `/v1/requests/${created.id}/decline`, { reason: OVER(V1_LIMITS.detail) }, { version: created.version });
    expect(over.status).toBe(400);
    const ok = await api("claude", `/v1/requests/${created.id}/decline`, { reason: AT(V1_LIMITS.detail) }, { version: created.version });
    expect(ok.status).toBe(200);
  });

  it("bounds fulfillment evidence count, link and summary", async () => {
    const created = await pendingRequest();
    expect((await api("claude", `/v1/requests/${created.id}/accept`, {}, { version: created.version })).status).toBe(200);
    const version = created.version + 1;
    const tooMany = Array.from({ length: V1_LIMITS.evidence_items + 1 }, (_, index) => ({ uri: `https://example.test/${index}`, summary: "Evidence" }));
    expect((await api("claude", `/v1/requests/${created.id}/fulfill`, { evidence: tooMany }, { version })).status).toBe(400);
    expect((await api("claude", `/v1/requests/${created.id}/fulfill`, {
      evidence: [{ uri: `https://example.test/${"a".repeat(V1_LIMITS.uri)}`, summary: "Evidence" }],
    }, { version })).status).toBe(400);
    expect((await api("claude", `/v1/requests/${created.id}/fulfill`, {
      evidence: [{ uri: "https://example.test/proof", summary: OVER(V1_LIMITS.summary) }],
    }, { version })).status).toBe(400);
    expect((await api("claude", `/v1/requests/${created.id}/fulfill`, {
      evidence: [{ uri: "  https://example.test/proof  ", summary: "  Evidence  " }],
    }, { version })).status).toBe(200);
    const stored = await env.DB.prepare("SELECT uri, summary FROM evidence_links WHERE request_id = ?").bind(created.id).first<{ uri: string; summary: string }>();
    expect(stored).toEqual({ uri: "https://example.test/proof", summary: "Evidence" });
  });
});

describe("Needs Shane routes", () => {
  it("bounds the question, the resolution condition and the source id", async () => {
    const projectId = await activeProject();
    const base = { project_id: projectId, kind: "decision", question: "Ship it?", resolution_condition: "Shane answers" };
    expect((await api("codex", "/v1/decisions", { ...base, question: OVER(V1_LIMITS.detail) })).status).toBe(400);
    expect((await api("codex", "/v1/decisions", { ...base, resolution_condition: "  " })).status).toBe(400);
    expect((await api("codex", "/v1/decisions", { ...base, project_id: OVER(V1_LIMITS.identifier) })).status).toBe(400);
    expect((await api("codex", "/v1/decisions", base)).status).toBe(201);
  });

  it("bounds the outcome summary and stores it trimmed", async () => {
    const projectId = await activeProject();
    const created = await api("codex", "/v1/decisions", {
      project_id: projectId, kind: "decision", question: "Ship it?", resolution_condition: "Shane answers",
    });
    const record = (await created.json()) as { id: string; version: number };
    expect((await api("shane", `/v1/decisions/${record.id}/decide`, {
      choice: "approved", summary: OVER(V1_LIMITS.summary),
    }, { version: record.version })).status).toBe(400);
    const ok = await api("shane", `/v1/decisions/${record.id}/decide`, {
      choice: "approved", summary: "  Approved with conditions  ",
    }, { version: record.version });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { decision: { summary: string } }).decision.summary).toBe("Approved with conditions");
  });
});

describe("the D1 floor under the boundary", () => {
  const insertProject = (slug: string, title: string) => env.DB.prepare(
    "INSERT INTO projects (id, slug, title, originator_id, submitter_id, state) VALUES (?, ?, ?, 'shane', 'shane', 'Proposed')",
  ).bind(crypto.randomUUID(), slug, title).run();

  it("refuses a direct INSERT that bypasses the Worker gate", async () => {
    await expect(insertProject("Not-Canonical", "Title")).rejects.toThrow();
    await expect(insertProject(`ok-${crypto.randomUUID()}`, "   ")).rejects.toThrow();
    await expect(insertProject(`ok-${crypto.randomUUID()}`, OVER(V1_LIMITS.title))).rejects.toThrow();
    await expect(env.DB.prepare(
      "INSERT INTO idempotency_records (actor_id, idempotency_key, method, path, request_hash, response_status, response_body) VALUES ('shane', ?, 'POST', '/v1/projects', 'hash', 201, '{}')",
    ).bind(OVER(V1_LIMITS.idempotency_key)).run()).rejects.toThrow();
    await expect(env.DB.prepare(
      "INSERT INTO evidence_links (project_id, actor_id, uri, summary) SELECT id, 'shane', ?, 'Evidence' FROM projects LIMIT 1",
    ).bind(OVER(V1_LIMITS.uri)).run()).rejects.toThrow();
  });

  it("still admits a canonical row", async () => {
    await expect(insertProject(`floor-ok-${crypto.randomUUID()}`, "Canonical title")).resolves.toBeTruthy();
  });

  // The alignment criterion on #9, read off the shipped objects rather than retyped: the
  // numbers the triggers enforce are the numbers worker/src/limits.ts exports.
  it("enforces the same numbers as V1_LIMITS", async () => {
    const triggers = await env.DB.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name LIKE '%_bounded'",
    ).all<{ name: string; sql: string }>();
    expect(triggers.results.map((row) => row.name).sort()).toEqual([
      "decision_request_fields_are_bounded",
      "evidence_link_fields_are_bounded",
      "idempotency_key_is_bounded",
      "project_fields_are_bounded",
      "pull_candidate_fields_are_bounded",
      "work_request_fields_are_bounded",
    ]);
    const sql = triggers.results.map((row) => row.sql).join("\n");
    for (const [column, limit] of [
      ["NEW.title", V1_LIMITS.title],
      ["NEW.detail", V1_LIMITS.detail],
      ["NEW.uri", V1_LIMITS.uri],
      ["NEW.summary", V1_LIMITS.summary],
      ["NEW.slug", V1_LIMITS.slug],
      ["NEW.idempotency_key", V1_LIMITS.idempotency_key],
      ["NEW.question", V1_LIMITS.detail],
    ] as const) {
      expect(sql).toContain(`length(CAST(${column} AS BLOB)) > ${limit}`);
    }
  });
});
