import { describe, expect, it, vi } from "vitest";
import { FleetRoutineClient, type AgentWorkSnapshot, type FetchLike, type WorkRequestSummary } from "./reference-client";

const accepted: WorkRequestSummary = {
  id: "request-1", project_id: null, requester: { id: "codex" }, recipient: { id: "juniorslo" },
  title: "Review", detail: "Review the bounded change", state: "Accepted", version: 3,
  accepted_at: "2026-09-09T00:00:00Z", fulfilled_at: null,
  created_at: "2026-09-08T00:00:00Z", updated_at: "2026-09-09T00:00:00Z",
  expires_at: "2026-09-10T00:00:00Z", expiry_due: false, ended_at: null, resolution: null,
  blocker: { reason: "Preview unavailable", resolution_condition: "Preview responds", actor: { id: "juniorslo" }, at: "2026-09-09T00:00:00Z" },
  accepted_scope: { title: "Review", detail: "Review the bounded change", artifact: null, expires_at: "2026-09-10T00:00:00Z" },
};

function response(body: unknown, status = 200) {
  return { status, json: async () => body, text: async () => JSON.stringify(body) };
}

function setup(fetchFn: FetchLike) {
  let credentials = 0;
  let cursor = "12";
  const write = vi.fn(async (value: string) => { cursor = value; });
  const client = new FleetRoutineClient({
    baseUrl: "https://fleet.test", fetchFn,
    auth: { mode: "access-pair", getCredentials: async () => ({ clientId: "fixture.access", clientSecret: `fixture-secret-${++credentials}` }) },
    cursorStore: { read: async () => cursor, write },
  });
  return { client, write };
}

describe("Request lifecycle routine access", () => {
  it("retries a returned obligation with identical evidence, key and version and fresh authentication", async () => {
    const result: WorkRequestSummary = {
      ...accepted, state: "Returned", version: 4, blocker: null, ended_at: "2026-09-09T01:00:00Z",
      resolution: { state: "Returned", actor: { id: "juniorslo" }, at: "2026-09-09T01:00:00Z", reason: "Cannot finish", unfinished_work: "Mobile review", evidence: [{ uri: "https://example.test/review", summary: "Partial review" }] },
    };
    const sent: { url: string; init: Parameters<FetchLike>[1] }[] = [];
    const { client, write } = setup(async (url, init) => {
      sent.push({ url, init });
      if (sent.length === 1) throw new Error("response lost");
      return response(result);
    });
    const input = { reason: "Cannot finish", unfinished_work: "Mobile review", evidence: result.resolution!.evidence };

    await expect(client.returnRequest("request /1", 3, "return-key", input)).rejects.toThrow("response lost");
    expect(await client.returnRequest("request /1", 3, "return-key", input)).toEqual(result);

    expect(sent).toHaveLength(2);
    for (const [index, call] of sent.entries()) {
      expect(call.url).toBe("https://fleet.test/v1/requests/request%20%2F1/return");
      expect(call.init).toMatchObject({ method: "POST", body: JSON.stringify(input), headers: {
        "Content-Type": "application/json", "If-Match": '"3"', "Idempotency-Key": "return-key",
        "CF-Access-Client-Id": "fixture.access", "CF-Access-Client-Secret": `fixture-secret-${index + 1}`,
      } });
    }
    expect(write).not.toHaveBeenCalled();
  });

  it("sends explicit versioned lifecycle actions without advancing the activity cursor", async () => {
    const fetchFn = vi.fn<FetchLike>(async () => response(accepted));
    const { client, write } = setup(fetchFn);
    const reason = { reason: "Unavailable" };
    const blocker = { reason: "Preview unavailable", resolution_condition: "Preview responds" };
    const cleared = { summary: "Preview restored" };

    await client.declineRequest("r1", 2, "decline-key", reason);
    await client.withdrawRequest("r1", 2, "withdraw-key", reason);
    await client.blockRequest("r1", 2, "block-key", blocker);
    await client.unblockRequest("r1", 2, "unblock-key", cleared);
    await client.expireRequest("r1", 2, "expire-key");

    expect(fetchFn.mock.calls.map(([url, init]) => [url, init?.method, init?.body, init?.headers?.["If-Match"], init?.headers?.["Idempotency-Key"]])).toEqual([
      ["https://fleet.test/v1/requests/r1/decline", "POST", JSON.stringify(reason), '"2"', "decline-key"],
      ["https://fleet.test/v1/requests/r1/withdraw", "POST", JSON.stringify(reason), '"2"', "withdraw-key"],
      ["https://fleet.test/v1/requests/r1/block", "POST", JSON.stringify(blocker), '"2"', "block-key"],
      ["https://fleet.test/v1/requests/r1/unblock", "POST", JSON.stringify(cleared), '"2"', "unblock-key"],
      ["https://fleet.test/v1/requests/r1/expire", "POST", "{}", '"2"', "expire-key"],
    ]);
    expect(write).not.toHaveBeenCalled();
  });

  it("discloses optional deadlines when creating either request form and omits them otherwise", async () => {
    const fetchFn = vi.fn<FetchLike>(async () => response(accepted, 201));
    const { client, write } = setup(fetchFn);
    const deadline = "2026-09-10T00:00:00Z";
    const artifact = { uri: "https://example.test/diff", summary: "Diff" };

    await client.createWorkRequest("project /1", "juniorslo", "Review", "Detail", "project-key", deadline);
    await client.createStandaloneRequest("juniorslo", "Review", "Detail", "standalone-key", artifact, deadline);
    await client.createWorkRequest("p1", "juniorslo", "Review", "Detail", "no-deadline");
    await client.createStandaloneRequest("juniorslo", "Review", "Detail", "no-deadline");

    const bodies = fetchFn.mock.calls.map(([, init]) => JSON.parse(init!.body!));
    expect(bodies[0]).toEqual({ recipient_id: "juniorslo", title: "Review", detail: "Detail", expires_at: deadline });
    expect(bodies[1]).toEqual({ ...bodies[0], artifact });
    expect(bodies[2]).not.toHaveProperty("expires_at");
    expect(bodies[3]).not.toHaveProperty("expires_at");
    expect(fetchFn.mock.calls[0]?.[0]).toBe("https://fleet.test/v1/projects/project%20%2F1/requests");
    expect(fetchFn.mock.calls[1]?.[0]).toBe("https://fleet.test/v1/requests");
    expect(write).not.toHaveBeenCalled();
  });

  it("retains blockers, deadline signals and endings across read-only reconciliation", async () => {
    const pending: WorkRequestSummary = { ...accepted, id: "pending", state: "Pending", accepted_at: null, accepted_scope: null, expiry_due: true, blocker: null };
    const returned: WorkRequestSummary = { ...accepted, id: "returned", state: "Returned", blocker: null, ended_at: "2026-09-09T01:00:00Z", resolution: {
      state: "Returned", actor: { id: "juniorslo" }, at: "2026-09-09T01:00:00Z", reason: "Unavailable", unfinished_work: "Review", evidence: [],
    } };
    const snapshot: AgentWorkSnapshot = {
      obligations: [{ source: "accepted_request", request_id: accepted.id, project_id: null, blocker: accepted.blocker ?? null }],
      inbound_requests: [accepted, pending], outbound_requests: [returned], pull_candidates: [], activity: [], next_cursor: "13",
    };
    const fetchFn = vi.fn<FetchLike>(async () => response(snapshot));
    const { client, write } = setup(fetchFn);

    for (let index = 0; index < 2; index++) {
      const result = await client.reconcile();
      expect(result.inboundRequests).toEqual([accepted, pending]);
      expect(result.outboundRequests).toEqual([returned]);
      expect(result.obligations).toEqual(snapshot.obligations);
    }
    expect(fetchFn.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([
      "https://fleet.test/v1/me/work?after=12", "https://fleet.test/v1/me/work?after=13",
    ]);
    expect(write.mock.calls).toEqual([["13"], ["13"]]);
  });

  it("preserves the cursor on malformed success and non-JSON transition failures", async () => {
    const fetchFn = vi.fn<FetchLike>()
      .mockResolvedValueOnce({ status: 200, json: async () => { throw new SyntaxError("invalid JSON"); }, text: async () => "{" })
      .mockResolvedValueOnce({ status: 502, json: async () => { throw new SyntaxError("invalid JSON"); }, text: async () => "upstream unavailable" })
      .mockResolvedValueOnce(response({ error: "version_conflict", message: "Refresh the request" }, 409));
    const { client, write } = setup(fetchFn);

    // Changed by #7, and it is another hand's test: a 200 whose body will not
    // parse used to surface the parser's own SyntaxError message verbatim, and
    // a JSON parse error quotes the offending bytes — which can be another
    // actor's data. It is now a stable code. The guarantee this test exists
    // for, that the cursor is untouched, is asserted unchanged below.
    await expect(client.expireRequest("r1", 2, "expire-key")).rejects.toMatchObject({ code: "invalid_response", status: 200 });
    await expect(client.expireRequest("r1", 2, "expire-key")).rejects.toMatchObject({ code: "request_failed", status: 502 });
    await expect(client.expireRequest("r1", 2, "expire-key")).rejects.toMatchObject({ code: "version_conflict", status: 409 });
    expect(write).not.toHaveBeenCalled();
  });
});
