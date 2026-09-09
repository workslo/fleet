import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import type { WorkRequest } from "../src/api";

const pending: WorkRequest = {
  id: "request-one", project_id: null, requester: { id: "claude" }, recipient: { id: "codex" },
  title: "Review access", detail: "Verify agreed access", artifact: null, accepted_scope: null,
  state: "Pending", version: 1, evidence: [], expires_at: null, expiry_due: false, ended_at: null, resolution: null, blocker: null,
};
const accepted = { ...pending, state: "Accepted", version: 2, accepted_scope: { title: pending.title, detail: pending.detail, artifact: null } };
const at = "2026-09-09T12:00:00.000Z";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
type Attempt = { path: string; version: string | null; key: string | null; body: Record<string, unknown> };
function fixture(actor = "codex", seed = pending, options: { lose?: string; stale?: string; unrelated?: boolean; deadlinePassed?: boolean; creationConflict?: boolean } = {}) {
  let current = structuredClone(seed);
  const attempts: Attempt[] = [];
  const replay = new Map<string, WorkRequest>();
  const snapshot = () => ({
    obligations: current.state === "Accepted" && actor === current.recipient.id ? [{ source: "accepted_request", request_id: current.id, project_id: null, title: "Owed review", detail: current.detail }] : [],
    inbound_requests: actor === current.recipient.id || options.unrelated ? [current] : [],
    outbound_requests: actor === current.requester.id ? [current] : [],
    pull_candidates: [], activity: [], next_cursor: "0",
    needs_shane: [{ id: "need-independent", question: "Enable agreed route", state: "Pending", decision: null, action: null }],
  });
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    if (path === "/v1/me") return json({ actor: { id: actor, display_name: actor }, principal: { kind: actor === "shane" ? "human" : "service" } });
    if (path === "/v1/portfolio") return json({ projects: [] });
    if (path === "/v1/decisions") return json({ decisions: [] });
    if (path === "/v1/me/work?after=0") return json(snapshot());
    if (path === `/v1/requests/${current.id}`) return json(current);
    if (init?.method !== "POST" || !path.startsWith("/v1/requests")) return json({ message: "Unexpected request" }, 404);
    const headers = new Headers(init.headers);
    const body = JSON.parse(String(init.body));
    const attempt = { path, version: headers.get("If-Match"), key: headers.get("Idempotency-Key"), body };
    attempts.push(attempt);
    const action = path === "/v1/requests" ? "create" : path.split("/").at(-1) ?? "";
    const nth = attempts.filter((entry) => entry.path === path).length;
    if (options.creationConflict && action === "create") return json({ message: "Creation conflicts with an earlier submission" }, 409);
    if (options.deadlinePassed && action === "accept") { current = { ...current, expiry_due: true }; return json({ message: "The invitation deadline has passed" }, 409); }
    if (options.stale === action && nth === 1) { current = { ...current, version: current.version + 1 }; return json({ message: "Request version is stale" }, 412); }
    const stored = replay.get(attempt.key ?? "");
    if (stored) return json(stored, action === "create" ? 201 : 200);
    if (action === "create") current = { ...pending, id: "new-request", requester: { id: actor }, recipient: { id: body.recipient_id }, title: body.title, detail: body.detail, expires_at: body.expires_at ?? null };
    else {
      expect(attempt.version).toBe(`"${current.version}"`);
      current = { ...current, version: current.version + 1 };
      if (action === "block") current.blocker = { reason: body.reason, resolution_condition: body.resolution_condition, actor: { id: actor }, at };
      else if (action === "unblock") current.blocker = null;
      else if (action === "accept") { current.state = "Accepted"; current.accepted_scope = { title: current.title, detail: current.detail, artifact: null }; }
      else {
        const endings = { decline: "Declined", withdraw: "Withdrawn", return: "Returned", expire: "Expired", fulfill: "Fulfilled" } as const;
        const state = endings[action as keyof typeof endings];
        if (!state) return json({ message: "Unexpected action" }, 404);
        current = { ...current, state, blocker: null, expiry_due: false, ended_at: at,
          resolution: { state, actor: { id: actor }, at, reason: body.reason ?? null, unfinished_work: body.unfinished_work ?? null, evidence: body.evidence ?? [] }, evidence: body.evidence ?? [] };
      }
    }
    replay.set(attempt.key ?? "", structuredClone(current));
    if (options.lose === action && nth === 1) throw new TypeError("response lost");
    return json(current, action === "create" ? 201 : 200);
  }));
  return { attempts, current: () => current };
}
async function open() { render(<App />); await screen.findByText(/Signed in as/); await userEvent.click(screen.getByRole("link", { name: "My Work" })); }
async function expand(label: string) { await userEvent.click(screen.getByText(label, { selector: "summary" })); return within(screen.getByRole("form", { name: label })); }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Work Request lifecycle on the Board", () => {
  it("records and clears a blocker while keeping the accepted obligation, then returns unfinished work without clearing Needs Shane", async () => {
    fixture("codex", accepted); await open();
    const block = await expand("Record blocker for Review access");
    await userEvent.type(block.getByLabelText("Blocker reason for Review access"), "Missing access");
    await userEvent.type(block.getByLabelText("Unblocking condition for Review access"), "Route enabled");
    await userEvent.click(block.getByRole("button", { name: "Record blocker for Review access" }));
    expect(await screen.findByText("Blocked: Missing access")).toBeVisible();
    expect(screen.getByText("Owed review")).toBeVisible();
    expect(screen.getByText(/accepted obligation remains owed/)).toBeVisible();
    const unblock = await expand("Clear blocker for Review access");
    await userEvent.type(unblock.getByLabelText("Unblocking summary for Review access"), "Access restored");
    await userEvent.click(unblock.getByRole("button", { name: "Clear blocker for Review access" }));
    await screen.findByText("Record blocker for Review access", { selector: "summary" });
    expect(screen.queryByText("Blocked: Missing access")).toBeNull();
    expect(screen.getByText("Owed review")).toBeVisible();
    const returned = await expand("Return Review access");
    await userEvent.type(returned.getByLabelText("Return reason for Review access"), "Cannot finish this week");
    await userEvent.type(returned.getByLabelText("Unfinished work for Review access"), "Native verification remains");
    await userEvent.type(returned.getByLabelText("Return evidence URL for Review access"), "https://example.test/partial");
    await userEvent.type(returned.getByLabelText("Return evidence summary for Review access"), "Partial checks");
    await userEvent.click(returned.getByRole("button", { name: "Return Review access" }));
    expect(await screen.findByText("Unfinished work: Native verification remains")).toBeVisible();
    expect(screen.getByText(`Returned recorded by codex at ${at}.`)).toBeVisible();
    expect(screen.getByText("Accepted scope: Verify agreed access")).toBeVisible();
    expect(screen.getByText("No obligations are owed now.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Partial checks" })).toHaveAttribute("href", "https://example.test/partial");
    expect(screen.getByText("Enable agreed route")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Fulfill Review access" })).toBeNull();
  });

  it("lets only the recipient decline and only the requester withdraw pending work", async () => {
    fixture(); await open();
    expect(screen.queryByText("Withdraw Review access", { selector: "summary" })).toBeNull();
    const decline = await expand("Decline Review access");
    await userEvent.type(decline.getByLabelText("Decline reason for Review access"), "Outside my scope");
    await userEvent.click(decline.getByRole("button", { name: "Decline Review access" }));
    expect(await screen.findByText(`Declined recorded by codex at ${at}.`)).toBeVisible();
    expect(screen.getByText("Reason: Outside my scope")).toBeVisible();
    cleanup(); fixture("claude"); await open();
    expect(screen.queryByRole("button", { name: "Accept Review access" })).toBeNull();
    expect(screen.queryByText("Decline Review access", { selector: "summary" })).toBeNull();
    const withdraw = await expand("Withdraw Review access");
    await userEvent.type(withdraw.getByLabelText("Withdrawal reason for Review access"), "No longer needed");
    await userEvent.click(withdraw.getByRole("button", { name: "Withdraw Review access" }));
    expect(await screen.findByText(`Withdrawn recorded by claude at ${at}.`)).toBeVisible();
  });

  it("offers no mutation controls to an unrelated actor even when a request is visible", async () => {
    fixture("shane", accepted, { unrelated: true }); await open();
    expect(screen.queryByRole("button", { name: "Fulfill Review access" })).toBeNull();
    expect(screen.queryByText("Return Review access", { selector: "summary" })).toBeNull();
    expect(screen.queryByText("Record blocker for Review access", { selector: "summary" })).toBeNull();
  });

  it("requires explicit expiry recording for an overdue pending invitation and never expires accepted work", async () => {
    const due = { ...pending, expires_at: "2026-01-01T00:00:00.000Z", expiry_due: true };
    const state = fixture("codex", due); await open();
    expect(screen.getByText(/The invitation deadline has passed/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Accept Review access" })).toBeNull();
    expect(screen.queryByText("Decline Review access", { selector: "summary" })).toBeNull();
    expect(screen.queryByText("Withdraw Review access", { selector: "summary" })).toBeNull();
    expect(state.attempts).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Record expiry for Review access" }));
    expect(await screen.findByText(`Expired recorded by codex at ${at}.`)).toBeVisible();
    expect(state.attempts[0]?.body).toEqual({});
    cleanup(); fixture("claude", due); await open();
    expect(screen.queryByText("Withdraw Review access", { selector: "summary" })).toBeNull();
    expect(screen.queryByText("Decline Review access", { selector: "summary" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Accept Review access" })).toBeNull();
    expect(screen.getByRole("button", { name: "Record expiry for Review access" })).toBeVisible();
    cleanup(); fixture("codex", { ...accepted, expires_at: due.expires_at }); await open();
    expect(screen.queryByRole("button", { name: /Record expiry/ })).toBeNull();
    expect(screen.getByText("Owed review")).toBeVisible();
  });

  it("converts an optional local invitation deadline to the submitted UTC timestamp", async () => {
    const state = fixture(); await open();
    await userEvent.type(screen.getByLabelText("Recipient ID"), "claude");
    await userEvent.type(screen.getByLabelText("Review title"), "Dated invitation");
    await userEvent.type(screen.getByLabelText("Review scope"), "Review if still timely");
    await userEvent.type(screen.getByLabelText("Accept before (optional, your local time)"), "2030-01-02T15:30");
    await userEvent.click(screen.getByRole("button", { name: "Send standalone review" }));
    expect(await screen.findByText("Dated invitation", { selector: "strong" })).toBeVisible();
    expect(state.attempts[0]?.body.expires_at).toBe(new Date("2030-01-02T15:30").toISOString());
  });

  it("keeps an unknown return payload and version through navigation and reuses its key", async () => {
    const state = fixture("codex", accepted, { lose: "return" }); await open();
    const returned = await expand("Return Review access");
    await userEvent.type(returned.getByLabelText("Return reason for Review access"), "Unavailable");
    await userEvent.type(returned.getByLabelText("Unfinished work for Review access"), "Verification remains");
    await userEvent.click(returned.getByRole("button", { name: "Return Review access" }));
    await screen.findByText(/Fleet could not be reached/);
    expect(returned.getByLabelText("Return reason for Review access")).toBeDisabled();
    await userEvent.click(screen.getByRole("link", { name: "Needs Shane" }));
    await userEvent.click(screen.getByRole("link", { name: "My Work" }));
    await userEvent.click(screen.getByRole("button", { name: "Return Review access" }));
    expect(await screen.findByText("Unfinished work: Verification remains")).toBeVisible();
    expect(state.attempts).toHaveLength(2);
    expect(state.attempts[1]).toEqual(state.attempts[0]);
  });

  it("refreshes a stale request before an explicit new-version retry", async () => {
    const state = fixture("codex", accepted, { stale: "return" }); await open();
    const returned = await expand("Return Review access");
    await userEvent.type(returned.getByLabelText("Return reason for Review access"), "Unavailable");
    await userEvent.type(returned.getByLabelText("Unfinished work for Review access"), "Verification remains");
    await userEvent.click(returned.getByRole("button", { name: "Return Review access" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Review the refreshed request");
    expect(state.attempts).toHaveLength(1);
    expect(returned.getByLabelText("Return reason for Review access")).not.toBeDisabled();
    await userEvent.click(returned.getByRole("button", { name: "Return Review access" }));
    expect(await screen.findByText("Unfinished work: Verification remains")).toBeVisible();
    expect(state.attempts.map((entry) => entry.version)).toEqual(['"2"', '"3"']);
    expect(state.attempts[1]?.key).not.toBe(state.attempts[0]?.key);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("refreshes overdue controls after an acceptance conflict without automatically resubmitting", async () => {
    const state = fixture("codex", { ...pending, expires_at: "2026-09-09T12:00:00.000Z", expiry_due: false }, { deadlinePassed: true }); await open();
    await userEvent.click(screen.getByRole("button", { name: "Accept Review access" }));
    expect(await screen.findByRole("button", { name: "Record expiry for Review access" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Accept Review access" })).toBeNull();
    expect(screen.queryByText("Decline Review access", { selector: "summary" })).toBeNull();
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent("The invitation deadline has passed. Review the refreshed request before another attempt");
    expect(state.attempts).toHaveLength(1);
    expect(state.attempts[0]?.path).toBe("/v1/requests/request-one/accept");
  });


  it("still displays a creation conflict locally when no existing request can be refreshed", async () => {
    fixture("codex", pending, { creationConflict: true }); await open();
    await userEvent.type(screen.getByLabelText("Recipient ID"), "claude");
    await userEvent.type(screen.getByLabelText("Review title"), "Conflicting invitation");
    await userEvent.type(screen.getByLabelText("Review scope"), "Bounded review");
    await userEvent.click(screen.getByRole("button", { name: "Send standalone review" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Creation conflicts with an earlier submission");
    expect(screen.getByLabelText("Review title")).not.toBeDisabled();
  });

});
