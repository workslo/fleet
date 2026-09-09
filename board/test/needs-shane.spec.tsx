import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import type { NeedsShane } from "../src/api";

const initial: NeedsShane = {
  id: "need-1", project_id: null, work_request_id: "request-1", requester: { id: "codex" },
  kind: "decision_and_action", question: "Enable agreed access", resolution_condition: "Access is enabled",
  state: "Pending", version: 1, decision: null, action: null, delegation: null,
  action_status: "awaiting_decision", created_at: "2026-09-09T00:00:00Z", updated_at: "2026-09-09T00:00:00Z",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const work = { obligations: [{ source: "accepted_request", project_id: null, request_id: "request-1", title: "Verify access" }], inbound_requests: [], outbound_requests: [], pull_candidates: [], activity: [], next_cursor: "0" };

function fixture(actor = "shane", seed = initial, loseDecision = false, loseCreate = false, options: { staleCompletion?: "pending" | "resolved"; extraRecord?: NeedsShane } = {}) {
  let record = structuredClone(seed);
  const attempts: Array<{ key: string | null; version: string | null; body: string }> = [];
  let created: unknown;
  const completionAttempts: Array<{ key: string | null; version: string | null }> = [];
  const records = () => [record, ...(options.extraRecord ? [options.extraRecord] : [])];
  const creationAttempts: Array<{ key: string | null; body: string }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/v1/me") return json({ actor: { id: actor, display_name: actor }, principal: { kind: actor === "shane" ? "human" : "service" } });
    if (url === "/v1/portfolio") return json({ projects: [] });
    if (url === "/v1/me/work?after=0") return json({ ...work, needs_shane: [record] });
    if (url === "/v1/decisions?state=all") return json({ decisions: records() });
    if (url === "/v1/decisions" && init?.method !== "POST") return json({ decisions: records().filter((entry) => entry.state === "Pending") });
    if (url === "/v1/decisions" && init?.method === "POST") {
      creationAttempts.push({ key: new Headers(init.headers).get("Idempotency-Key"), body: String(init.body) });
      created = JSON.parse(String(init.body));
      if (loseCreate && creationAttempts.length === 1) throw new Error("response lost");
      return json({ ...initial, id: "need-new", ...created as object }, 201);
    }
    if (url === "/v1/decisions/need-1/decide") {
      attempts.push({ key: new Headers(init?.headers).get("Idempotency-Key"), version: new Headers(init?.headers).get("If-Match"), body: String(init?.body) });
      const body = JSON.parse(String(init?.body));
      record = { ...record, version: 2, decision: { ...body, actor: { id: actor }, at: "2026-09-09T01:00:00Z" }, action_status: "pending" };
      if (loseDecision && attempts.length === 1) throw new Error("response lost");
      return json(record);
    }
    if (url === "/v1/decisions/need-1/complete-action") {
      completionAttempts.push({ key: new Headers(init?.headers).get("Idempotency-Key"), version: new Headers(init?.headers).get("If-Match") });
      if (options.staleCompletion && completionAttempts.length === 1) {
        record = { ...record, version: 2, delegation: { actor: { id: "shane" }, delegate: { id: "codex" }, summary: "Delegated in another session", at: initial.created_at } };
        if (options.staleCompletion === "resolved") record = { ...record, state: "Resolved", action_status: "completed", action: { actor: { id: "codex" }, summary: "Completed elsewhere", at: initial.created_at, evidence: [] } };
        return json({ message: "Needs Shane version is stale" }, 412);
      }
      expect(new Headers(init?.headers).get("If-Match")).toBe(`"${record.version}"`);
      const body = JSON.parse(String(init?.body));
      record = { ...record, version: record.version + 1, state: "Resolved", action_status: "completed", action: { ...body, actor: { id: actor }, at: "2026-09-09T02:00:00Z" } };
      return json(record);
    }
    return json({ message: "unexpected request" }, 404);
  }));
  return { attempts, creationAttempts, completionAttempts, record: () => record, created: () => created };
}
async function open() {
  render(<App />);
  await screen.findByText(/Signed in as/);
  await userEvent.click(screen.getByRole("link", { name: "Needs Shane" }));
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Needs Shane Board actions", () => {
  it("keeps an approved action pending, records completion and retains history while original work remains owed", async () => {
    fixture(); await open();
    await userEvent.type(screen.getByLabelText("Decision summary"), "Approved agreed access");
    await userEvent.click(screen.getByRole("button", { name: "Record decision for Enable agreed access" }));
    expect(await screen.findByText("State: Pending. Action: pending.")).toBeVisible();
    expect(screen.getByText(/Decision approved by shane at/)).toBeVisible();
    await userEvent.type(screen.getByLabelText("Action completion summary"), "Access enabled");
    await userEvent.type(screen.getByLabelText("Action completion evidence URL"), "https://example.test/receipt");
    await userEvent.type(screen.getByLabelText("Action completion evidence summary"), "Provisioning receipt");
    await userEvent.click(screen.getByRole("button", { name: "Complete action for Enable agreed access" }));
    expect(await screen.findByText("No decisions or actions need Shane’s attention.")).toBeVisible();
    await userEvent.click(screen.getByLabelText("Include resolved history"));
    expect(await screen.findByText(/Action completed by shane at/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Provisioning receipt" })).toHaveAttribute("href", "https://example.test/receipt");
    await userEvent.click(screen.getByRole("link", { name: "My Work" }));
    expect(screen.getByText("Verify access")).toBeVisible();
    expect(screen.getByText(/Action completed by shane: Access enabled/)).toBeVisible();
  });

  it("offers no Shane-only controls to an agent and permits only a named delegate to record its own action", async () => {
    fixture("codex"); await open();
    expect(screen.queryByRole("button", { name: /Record decision for/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Delegate action for/ })).toBeNull();
    cleanup();
    fixture("codex", { ...initial, kind: "action", action_status: "pending", delegation: { actor: { id: "shane" }, delegate: { id: "claude" }, summary: "Enable agreed access", at: initial.created_at } }); await open();
    expect(screen.queryByRole("button", { name: /Complete action for/ })).toBeNull();
    cleanup();
    fixture("claude", { ...initial, kind: "action", action_status: "pending", delegation: { actor: { id: "shane" }, delegate: { id: "claude" }, summary: "Enable agreed access", at: initial.created_at } }); await open();
    await userEvent.type(screen.getByLabelText("Action completion summary"), "Enabled within delegation");
    await userEvent.click(screen.getByRole("button", { name: "Complete action for Enable agreed access" }));
    await screen.findByText("No decisions or actions need Shane’s attention.");
    await userEvent.click(screen.getByLabelText("Include resolved history"));
    expect(await screen.findByText(/Action completed by claude at/)).toBeVisible();
  });

  it("retries an uncertain decision using its original payload, version and key and freezes edits", async () => {
    const state = fixture("shane", initial, true); await open();
    await userEvent.type(screen.getByLabelText("Decision summary"), "Approved exact scope");
    await userEvent.click(screen.getByRole("button", { name: "Record decision for Enable agreed access" }));
    const retry = await screen.findByRole("button", { name: "Retry Record decision for Enable agreed access" });
    expect(screen.getByLabelText("Decision summary")).toBeDisabled();
    expect(screen.getByLabelText("Decision choice")).toBeDisabled();
    await userEvent.click(retry);
    expect(await screen.findByText("State: Pending. Action: pending.")).toBeVisible();
    expect(state.attempts).toHaveLength(2);
    expect(state.attempts[1]).toEqual(state.attempts[0]);
    expect(state.attempts[0]?.key).toBeTruthy();
    expect(state.attempts[0]?.version).toBe('"1"');
  });

  it("creates a specific source-linked ask with an explicit resolution condition", async () => {
    const state = fixture("codex"); await open();
    await userEvent.click(screen.getByText("Request Shane’s involvement", { selector: "summary" }));
    const form = within(screen.getByRole("form", { name: "Request Shane’s involvement" }));
    await userEvent.type(form.getByLabelText("Source ID"), "standalone-request");
    await userEvent.selectOptions(form.getByLabelText("What is needed"), "action");
    await userEvent.type(form.getByLabelText("Specific ask"), "Enable the approved route");
    await userEvent.type(form.getByLabelText("What resolves Shane’s part"), "Route is enabled");
    await userEvent.click(form.getByRole("button", { name: "Request Shane’s involvement" }));
    expect(await screen.findByRole("heading", { name: "Enable the approved route" })).toBeVisible();
    expect(state.created()).toEqual({ work_request_id: "standalone-request", kind: "action", question: "Enable the approved route", resolution_condition: "Route is enabled" });
  });

  it("keeps an uncertain creation payload and key across in-app navigation", async () => {
    const state = fixture("codex", initial, false, true); await open();
    expect(screen.getByText("Request Shane’s involvement", { selector: "summary" }).parentElement).not.toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: "Enable agreed access" })).toBeVisible();
    await userEvent.click(screen.getByText("Request Shane’s involvement", { selector: "summary" }));
    await userEvent.type(screen.getByLabelText("Source ID"), "request-1");
    await userEvent.type(screen.getByLabelText("Specific ask"), "Enable agreed route");
    await userEvent.type(screen.getByLabelText("What resolves Shane’s part"), "Route is enabled");
    await userEvent.click(screen.getByRole("button", { name: "Request Shane’s involvement" }));
    await screen.findByRole("button", { name: "Retry Request Shane’s involvement" });
    await userEvent.click(screen.getByRole("link", { name: "My Work" }));
    expect(screen.queryByRole("button", { name: "Retry Request Shane’s involvement" })).toBeNull();
    await userEvent.click(screen.getByRole("link", { name: "Needs Shane" }));
    expect(screen.getByLabelText("Specific ask")).toHaveValue("Enable agreed route");
    expect(screen.getByLabelText("Specific ask")).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Retry Request Shane’s involvement" }));
    expect(await screen.findByRole("heading", { name: "Enable agreed route" })).toBeVisible();
    expect(state.creationAttempts).toHaveLength(2);
    expect(state.creationAttempts[1]).toEqual(state.creationAttempts[0]);
    expect(state.creationAttempts[0]?.key).toBeTruthy();
  });


  it("requires both evidence fields when either is supplied and allows clearing the optional pair", async () => {
    const state = fixture(); await open();
    await userEvent.type(screen.getByLabelText("Decision summary"), "Approved within scope");
    const uri = screen.getByLabelText("Decision evidence URL");
    const summary = screen.getByLabelText("Decision evidence summary");
    const submit = screen.getByRole("button", { name: "Record decision for Enable agreed access" });
    await userEvent.type(uri, "https://example.test/receipt");
    await userEvent.click(submit);
    expect(summary).toBeRequired();
    expect(summary).toBeInvalid();
    expect(state.attempts).toHaveLength(0);
    await userEvent.clear(uri);
    expect(summary).not.toBeRequired();
    await userEvent.type(summary, "Approval receipt");
    await userEvent.click(submit);
    expect(uri).toBeRequired();
    expect(uri).toBeInvalid();
    expect(state.attempts).toHaveLength(0);
    await userEvent.type(uri, "https://example.test/receipt");
    await userEvent.click(submit);
    expect(await screen.findByText("State: Pending. Action: pending.")).toBeVisible();
    expect(JSON.parse(state.attempts[0]?.body ?? "null").evidence).toEqual([{ uri: "https://example.test/receipt", summary: "Approval receipt" }]);
  });

  it("refreshes a stale entry and waits for a new user action with its current version and a new key", async () => {
    const state = fixture("shane", { ...initial, kind: "action", action_status: "pending" }, false, false, { staleCompletion: "pending" }); await open();
    await userEvent.type(screen.getByLabelText("Action completion summary"), "Access enabled");
    await userEvent.click(screen.getByRole("button", { name: "Complete action for Enable agreed access" }));
    expect(await screen.findByText(/Action delegated to codex by shane/)).toBeVisible();
    expect(screen.getAllByText(/Review the refreshed entry/).length).toBeGreaterThan(0);
    expect(state.completionAttempts).toHaveLength(1);
    expect(screen.getByLabelText("Action completion summary")).not.toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Complete action for Enable agreed access" }));
    expect(await screen.findByText("No decisions or actions need Shane’s attention.")).toBeVisible();
    expect(state.completionAttempts).toHaveLength(2);
    expect(state.completionAttempts.map((attempt) => attempt.version)).toEqual(['"1"', '"2"']);
    expect(state.completionAttempts[1]?.key).not.toBe(state.completionAttempts[0]?.key);
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
  });

  it("keeps a global stale-entry explanation when refreshed work is already resolved", async () => {
    const state = fixture("shane", { ...initial, kind: "action", action_status: "pending" }, false, false, { staleCompletion: "resolved" }); await open();
    await userEvent.type(screen.getByLabelText("Action completion summary"), "Access enabled");
    await userEvent.click(screen.getByRole("button", { name: "Complete action for Enable agreed access" }));
    expect(await screen.findByText("No decisions or actions need Shane’s attention.")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("resolved entries are in history");
    expect(state.completionAttempts).toHaveLength(1);
  });

  it("retains server creation ordering when an older combined ask is approved", async () => {
    fixture("shane", initial, false, false, { extraRecord: { ...initial, id: "need-2", question: "Later request", created_at: "2026-09-10T00:00:00Z" } }); await open();
    const first = within(screen.getByRole("form", { name: "Record decision for Enable agreed access" }));
    await userEvent.type(first.getByLabelText("Decision summary"), "Approved");
    await userEvent.click(first.getByRole("button", { name: "Record decision for Enable agreed access" }));
    await screen.findByText("State: Pending. Action: pending.");
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["Enable agreed access", "Later request"]);
  });

});
