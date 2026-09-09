import { describe, expect, it } from "vitest";
import { FleetRoutineClient, type FetchLike, type NeedsShane } from "./reference-client";

const resolved: NeedsShane = {
  id: "need-1", project_id: null, work_request_id: "request-1", requester: { id: "juniorslo" },
  kind: "action", question: "Enable access", resolution_condition: "Access enabled", state: "Resolved", version: 2,
  decision: null, delegation: null, action_status: "completed",
  action: { actor: { id: "shane" }, summary: "Enabled", evidence: [], at: "2026-09-09T00:00:00Z" },
  created_at: "2026-09-08T00:00:00Z", updated_at: "2026-09-09T00:00:00Z",
};

describe("Needs Shane routine access", () => {
  it("keeps resolved source outcomes discoverable after activity cursor advancement", async () => {
    let cursor: string | null = null;
    let calls = 0;
    const client = new FleetRoutineClient({
      baseUrl: "https://fleet.test", auth: { mode: "external" },
      cursorStore: { read: async () => cursor, write: async (value) => { cursor = value; } },
      fetchFn: async (url) => {
        expect(url).toBe(`https://fleet.test/v1/me/work?after=${calls++ === 0 ? "0" : "12"}`);
        const body = { needs_shane: [resolved], obligations: [{ source: "accepted_request", request_id: "request-1", project_id: null }], outbound_requests: [], inbound_requests: [], pull_candidates: [], activity: [], next_cursor: "12" };
        return { status: 200, json: async () => body, text: async () => JSON.stringify(body) };
      },
    });
    const first = await client.reconcile();
    const second = await client.reconcile();
    expect(first.needsShane).toEqual([resolved]);
    expect(second.needsShane).toEqual(first.needsShane);
    expect(second.obligations).toEqual([{ source: "accepted_request", request_id: "request-1", project_id: null }]);
    expect(cursor).toBe("12");
  });

  it("uses fresh authentication for reads and exact keys, versions and bodies for retrying mutations", async () => {
    const sent: { url: string; init: Parameters<FetchLike>[1] }[] = [];
    let credentials = 0;
    let lost = true;
    const client = new FleetRoutineClient({
      baseUrl: "https://fleet.test", auth: { mode: "access-pair", getCredentials: () => ({ clientId: "fixture.access", clientSecret: `fixture-secret-${++credentials}` }) },
      cursorStore: { read: async () => null, write: async () => { throw new Error("mutation must not move the cursor"); } },
      fetchFn: async (url, init) => {
        sent.push({ url, init });
        if (url.endsWith("/complete-action") && lost) { lost = false; throw new Error("response lost"); }
        const body = url.endsWith("?state=all") ? { decisions: [resolved] } : resolved;
        return { status: 200, json: async () => body, text: async () => JSON.stringify(body) };
      },
    });
    expect(await client.getDecisions("all")).toEqual([resolved]);
    expect(await client.getDecision("need /1")).toEqual(resolved);
    const input = { summary: "Enabled", evidence: [{ uri: "https://example.test/receipt", summary: "Receipt" }] };
    await expect(client.completeAction("need /1", 2, input, "same-logical-action")).rejects.toThrow("response lost");
    await client.completeAction("need /1", 2, input, "same-logical-action");
    const attempts = sent.filter((call) => call.url.endsWith("/complete-action"));
    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.init?.body).toBe(JSON.stringify(input));
    expect(attempts[1]?.init?.body).toBe(attempts[0]?.init?.body);
    for (const attempt of attempts) {
      expect(attempt.url).toBe("https://fleet.test/v1/decisions/need%20%2F1/complete-action");
      expect(attempt.init?.headers).toMatchObject({ "Idempotency-Key": "same-logical-action", "If-Match": '"2"' });
    }
    expect(credentials).toBe(4);
    expect(attempts[0]?.init?.headers?.["CF-Access-Client-Secret"]).not.toBe(attempts[1]?.init?.headers?.["CF-Access-Client-Secret"]);
    await client.createNeedsShane({ work_request_id: "request-1", kind: "decision", question: "Proceed?", resolution_condition: "A decision is recorded" }, "create-key");
    await client.recordDecision("need-1", 1, { choice: "approved", summary: "Proceed" }, "decision-key");
    await client.delegateAction("need-1", 2, { delegate_id: "codex", summary: "This action only" }, "delegation-key");
    expect(sent.slice(-3).map((call) => [call.url, call.init?.headers?.["Idempotency-Key"]])).toEqual([
      ["https://fleet.test/v1/decisions", "create-key"], ["https://fleet.test/v1/decisions/need-1/decide", "decision-key"], ["https://fleet.test/v1/decisions/need-1/delegate-action", "delegation-key"],
    ]);
  });
});
