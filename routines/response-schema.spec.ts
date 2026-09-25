/**
 * workslo/fleet#7 — a 2xx of the wrong shape must not become a typed value,
 * and above all must not reach CursorStore.write().
 *
 * Every control here was run against today's `main` before the fix. The ones
 * that pass both ways are named in the PR body rather than counted as wins:
 * a control that passes without the change proves nothing about the change.
 */

import { describe, expect, it, vi } from "vitest";
import { FleetRoutineClient, type FetchLike, type WorkRequestSummary } from "./reference-client";

// --- fixtures ---------------------------------------------------------------

const request: WorkRequestSummary = {
  id: "request-1", project_id: null, requester: { id: "codex" }, recipient: { id: "claude" },
  title: "Review", detail: "Review the bounded change", state: "Accepted", version: 3,
  accepted_at: "2026-09-24T00:00:00Z", fulfilled_at: null,
  created_at: "2026-09-23T00:00:00Z", updated_at: "2026-09-24T00:00:00Z",
};

const decision = {
  id: "dec-1", project_id: null, work_request_id: null, requester: { id: "claude" },
  kind: "decision", question: "Activate V1?", resolution_condition: null,
  state: "Pending", version: 1, decision: null, action: null, delegation: null,
  action_status: "not_requested",
  created_at: "2026-09-24T00:00:00Z", updated_at: "2026-09-24T00:00:00Z",
};

const snapshot = (over: Record<string, unknown> = {}) => ({
  obligations: [], outbound_requests: [], inbound_requests: [],
  pull_candidates: [], activity: [], next_cursor: "13", ...over,
});

function response(body: unknown, status = 200) {
  return { status, json: async () => body, text: async () => JSON.stringify(body) };
}

function setup(fetchFn: FetchLike, stored = "12") {
  const write = vi.fn(async () => {});
  const client = new FleetRoutineClient({
    baseUrl: "https://fleet.test", fetchFn,
    auth: { mode: "external" },
    cursorStore: { read: async () => stored, write },
  });
  return { client, write };
}

const invalid = { code: "invalid_response", status: 200 };

// --- the cursor, which is the field that becomes durable state --------------

describe("#7 — the cursor is validated before it is persisted", () => {
  it("refuses Codex's reproduction verbatim and leaves the prior cursor alone", async () => {
    const { client, write } = setup(async () => response(snapshot({ next_cursor: "not-a-decimal-cursor" })));
    await expect(client.reconcile()).rejects.toMatchObject(invalid);
    expect(write).not.toHaveBeenCalled();
  });

  it("refuses the same body on the getActivity routine path", async () => {
    const { client, write } = setup(async () => response({ activity: [], next_cursor: "not-a-decimal-cursor" }));
    await expect(client.getActivity()).rejects.toMatchObject(invalid);
    expect(write).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty string", ""],
    ["a leading space", " 42"],
    ["a trailing space", "42 "],
    ["a decimal point", "4.2"],
    ["a negative", "-1"],
    ["exponent notation", "1e3"],
    ["hex", "0x2a"],
    ["a number rather than a string", 42],
    ["null", null],
    ["twenty digits", "1".repeat(20)],
  ])("refuses %s as a cursor", async (_label, cursor) => {
    const { client, write } = setup(async () => response(snapshot({ next_cursor: cursor })));
    await expect(client.reconcile()).rejects.toMatchObject(invalid);
    expect(write).not.toHaveBeenCalled();
  });

  // These three pass both ways, and are named rather than counted: main
  // accepted any string, so of course it accepts a valid cursor. They are the
  // compatibility floor — #7 must not have made a real cursor unwritable.
  it.each([["zero", "0"], ["nineteen digits", "9".repeat(19)], ["leading zeros", "007"]])(
    "accepts %s and persists it exactly once",
    async (_label, cursor) => {
      const { client, write } = setup(async () => response(snapshot({ next_cursor: cursor })));
      const result = await client.reconcile();
      expect(result.cursor).toBe(cursor);
      expect(write.mock.calls).toEqual([[cursor]]);
    },
  );

  it("does not persist on an explicit historical read even when the body is valid", async () => {
    // Passes both ways: the explicit-`after` path never wrote. Kept because
    // #7 must not have quietly turned a read-only call into a writing one.
    const { client, write } = setup(async () => response({ activity: [], next_cursor: "99" }));
    await expect(client.getActivity("50")).resolves.toMatchObject({ next_cursor: "99" });
    expect(write).not.toHaveBeenCalled();
  });
});

// --- shape, per route -------------------------------------------------------

describe("#7 — every declared field is checked, on every route", () => {
  it.each([
    ["a missing array", snapshot({ obligations: undefined })],
    ["an array that is a string", snapshot({ obligations: "none" })],
    ["an array that is an object", snapshot({ activity: {} })],
    ["a missing cursor", snapshot({ next_cursor: undefined })],
    ["an unknown request state", snapshot({ inbound_requests: [{ ...request, state: "Ghosted" }] })],
    ["a request version that is a string", snapshot({ outbound_requests: [{ ...request, version: "3" }] })],
    ["a request missing its recipient", snapshot({ inbound_requests: [{ ...request, recipient: undefined }] })],
    ["an unknown obligation source", snapshot({ obligations: [{ source: "vibes", project_id: null }] })],
    ["an activity id that is a string", snapshot({ activity: [{ id: "7", type: "x", actor: { id: "a" }, project_id: null, created_at: "t" }] })],
    ["a non-integer activity id", snapshot({ activity: [{ id: 7.5, type: "x", actor: { id: "a" }, project_id: null, created_at: "t" }] })],
    ["an unknown needs-shane kind", snapshot({ needs_shane: [{ ...decision, kind: "vibe" }] })],
    ["an unknown action_status", snapshot({ needs_shane: [{ ...decision, action_status: "maybe" }] })],
    ["an unknown decision choice", snapshot({ needs_shane: [{ ...decision, decision: { actor: { id: "s" }, summary: "ok", evidence: [], at: "t", choice: "perhaps" } }] })],
    ["a resolution with an unknown ending", snapshot({ inbound_requests: [{ ...request, resolution: { state: "Ghosted", actor: { id: "a" }, at: "t", reason: null, unfinished_work: null, evidence: [] } }] })],
    ["a null body", null],
    ["an array body", []],
    ["a string body", "ok"],
  ])("refuses %s on reconcile without advancing the cursor", async (_label, body) => {
    const { client, write } = setup(async () => response(body));
    await expect(client.reconcile()).rejects.toMatchObject(invalid);
    expect(write).not.toHaveBeenCalled();
  });

  it("refuses a null created_at on an evidence link, which the declared type does not allow", async () => {
    // Found on this sitting's own verification pass: the first draft routed
    // EvidenceLink.created_at through the nullable helper, so it accepted
    // `null` where the type it hands the caller says `string | undefined`.
    // Laxer than the declared type is the defect this module exists to fix.
    const { client } = setup(async () => response(snapshot({
      inbound_requests: [{ ...request, evidence: [{ uri: "https://e.test/1", summary: "s", created_at: null }] }],
    })));
    await expect(client.reconcile()).rejects.toMatchObject(invalid);
  });

  it("refuses a malformed request on getRequest", async () => {
    const { client } = setup(async () => response({ ...request, state: "Ghosted" }));
    await expect(client.getRequest("request-1")).rejects.toMatchObject(invalid);
  });

  it("refuses a malformed request returned by a mutation", async () => {
    const { client } = setup(async () => response({ ...request, requester: "codex" }));
    await expect(client.acceptRequest("request-1", 3, "k")).rejects.toMatchObject(invalid);
  });

  it("refuses a malformed pull candidate returned by a mutation", async () => {
    const { client } = setup(async () => response({ id: "pc-1", project_id: null, actor: { id: "a" }, title: "t", detail: "d", created_at: "t" }));
    await expect(client.publishPullCandidate("proj", "t", "d", "k")).rejects.toMatchObject(invalid);
  });

  it.each([
    ["an envelope that is not an object", ["dec-1"]],
    ["decisions that are not an array", { decisions: {} }],
    ["a decision missing action_status", { decisions: [{ ...decision, action_status: undefined }] }],
  ])("refuses %s on getDecisions", async (_label, body) => {
    const { client } = setup(async () => response(body));
    await expect(client.getDecisions()).rejects.toMatchObject(invalid);
  });

  it("refuses a malformed record on getDecision", async () => {
    const { client } = setup(async () => response({ ...decision, version: null }));
    await expect(client.getDecision("dec-1")).rejects.toMatchObject(invalid);
  });
});

// --- what must keep working -------------------------------------------------

describe("#7 — backward compatibility", () => {
  it("passes an unknown property through untouched", async () => {
    // Passes both ways. A server that adds a field must not break a client
    // that has not been updated: this is why the decoders validate in place
    // rather than rebuilding the object from known keys.
    const body = snapshot({ inbound_requests: [{ ...request, unreleased_field: { nested: true } }], server_hint: "v2" });
    const { client, write } = setup(async () => response(body));
    const result = await client.reconcile();
    expect(result.inboundRequests[0]).toEqual({ ...request, unreleased_field: { nested: true } });
    expect(write.mock.calls).toEqual([["13"]]);
  });

  it("accepts a fully populated record with every optional and lifecycle field", async () => {
    // Passes both ways, by design — it is the compatibility floor.
    const full = {
      ...request,
      artifact: { uri: "https://example.test/a", summary: "artifact", created_at: "t" },
      accepted_scope: { title: "t", detail: "d", artifact: null, expires_at: null },
      evidence: [{ uri: "https://example.test/e", summary: "evidence" }],
      needs_shane: [decision],
      expires_at: null, expiry_due: false, ended_at: null,
      resolution: { state: "Fulfilled", actor: { id: "claude" }, at: "t", reason: null, unfinished_work: null, evidence: [] },
      blocker: null,
    };
    const { client } = setup(async () => response(snapshot({ inbound_requests: [full], obligations: [{ source: "accepted_request", request_id: "request-1", project_id: null, blocker: null }] })));
    await expect(client.reconcile()).resolves.toMatchObject({ inboundRequests: [full] });
  });

  it("leaves a non-2xx error with its own code rather than calling it a shape error", async () => {
    // Passes both ways. #7 is about successful responses; an error response
    // must keep the code the server gave it.
    const { client, write } = setup(async () => response({ error: "version_conflict", message: "Refresh the request" }, 409));
    await expect(client.acceptRequest("request-1", 3, "k")).rejects.toMatchObject({ code: "version_conflict", status: 409 });
    expect(write).not.toHaveBeenCalled();
  });
});

// --- the error must not carry the body -------------------------------------

describe("#7 — a decode failure reports a path, never a value", () => {
  it("names the offending field's path", async () => {
    const { client } = setup(async () => response(snapshot({ inbound_requests: [{ ...request, state: "Ghosted" }] })));
    await expect(client.reconcile()).rejects.toThrow("$.inbound_requests[0].state");
  });

  it("never puts the offending value in the message", async () => {
    const secret = "another-actors-private-detail";
    const { client } = setup(async () => response(snapshot({ inbound_requests: [{ ...request, version: secret }] })));
    const error = await client.reconcile().catch((err: Error) => err);
    expect((error as Error).message).not.toContain(secret);
    expect((error as Error).message).toContain("$.inbound_requests[0].version");
  });

  it("turns a 200 whose body is not JSON into the same stable code, with no bytes quoted", async () => {
    const bytes = "{\"leaked\":\"another-actors-private-detail\"";
    const { client, write } = setup(async () => ({
      status: 200,
      json: async () => { throw new SyntaxError(`Unexpected end of JSON input near ${bytes}`); },
      text: async () => bytes,
    }));
    const error = await client.reconcile().catch((err: Error) => err);
    expect(error).toMatchObject(invalid);
    expect((error as Error).message).toBe("Response body is not JSON: SyntaxError");
    expect(write).not.toHaveBeenCalled();
  });
});
