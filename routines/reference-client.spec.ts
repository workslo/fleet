import { describe, expect, it, vi } from "vitest";
import {
  CursorStore,
  FetchLike,
  FleetRoutineClient,
  FleetRoutineClientOptions,
  FleetRoutineError,
  AgentWorkSnapshot,
} from "./reference-client";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** In-memory cursor store for testing. */
function makeCursorStore(): CursorStore & {
  stored: string | null;
  writeShouldFail: boolean;
} {
  return {
    stored: null as string | null,
    writeShouldFail: false,
    async read() {
      return this.stored;
    },
    async write(cursor: string) {
      if (this.writeShouldFail) {
        throw new Error("persistence failure");
      }
      this.stored = cursor;
    },
  };
}

/** Build a mock fetch that returns canned responses per URL. */
type RouteHandler = (url: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}) => {
  status: number;
  body: unknown;
};

function makeFetch(handler: RouteHandler): FetchLike {
  return vi.fn(async (input: string, init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }) => {
    const result = handler(input, init);
    return {
      status: result.status,
      json: async () => result.body,
      text: async () => JSON.stringify(result.body),
    };
  }) as unknown as FetchLike;
}

/** A default empty work snapshot. */
function emptySnapshot(cursor = "0"): AgentWorkSnapshot {
  return {
    obligations: [],
    outbound_requests: [],
    inbound_requests: [],
    pull_candidates: [],
    activity: [],
    next_cursor: cursor,
  };
}

function makeClient(
  fetchFn: FetchLike,
  cursorStore: CursorStore,
  opts?: { authHeader?: string },
): FleetRoutineClient {
  const clientOpts: FleetRoutineClientOptions = {
    baseUrl: "https://fleet.test",
    principal: "juniorslo",
    cursorStore,
    fetchFn,
  };
  if (opts?.authHeader !== undefined) {
    clientOpts.authHeader = opts.authHeader;
  }
  return new FleetRoutineClient(clientOpts);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FleetRoutineClient — reconcile (the Fleet Routine)", () => {
  it("calls GET /v1/me/work with the persisted cursor", async () => {
    const store = makeCursorStore();
    store.stored = "42";
    const fetchFn = makeFetch((url) => {
      if (url.includes("/v1/me/work")) {
        expect(url).toContain("after=42");
        return { status: 200, body: emptySnapshot("43") };
      }
      return { status: 404, body: { error: "not_found" } };
    });
    const client = makeClient(fetchFn, store);

    await client.reconcile();

    expect(fetchFn).toHaveBeenCalledWith(
      "https://fleet.test/v1/me/work?after=42",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("uses cursor 0 when no cursor has been stored", async () => {
    const store = makeCursorStore();
    const fetchFn = makeFetch((url) => {
      expect(url).toContain("after=0");
      return { status: 200, body: emptySnapshot("7") };
    });
    const client = makeClient(fetchFn, store);

    await client.reconcile();

    expect(fetchFn).toHaveBeenCalledWith(
      "https://fleet.test/v1/me/work?after=0",
      expect.anything(),
    );
  });

  it("persists the new cursor before returning", async () => {
    const store = makeCursorStore();
    const fetchFn = makeFetch(() => ({
      status: 200,
      body: emptySnapshot("99"),
    }));
    const client = makeClient(fetchFn, store);

    const result = await client.reconcile();

    expect(store.stored).toBe("99");
    expect(result.cursor).toBe("99");
  });

  it("answers the four required questions", async () => {
    const store = makeCursorStore();
    const snapshot: AgentWorkSnapshot = {
      obligations: [
        { source: "accepted_request", request_id: "req-1", project_id: "proj-1" },
        { source: "owner_next_action", project_id: "proj-2" },
      ],
      outbound_requests: [
        {
          id: "req-1",
          project_id: "proj-1",
          requester: { id: "juniorslo" },
          recipient: { id: "codex" },
          title: "Review client",
          detail: "Please review",
          state: "Pending",
          version: 1,
          accepted_at: null,
          fulfilled_at: null,
          created_at: "2026-08-31T00:00:00Z",
          updated_at: "2026-08-31T00:00:00Z",
        },
      ],
      inbound_requests: [
        {
          id: "req-2",
          project_id: "proj-1",
          requester: { id: "codex" },
          recipient: { id: "juniorslo" },
          title: "Build client",
          detail: "Build the reference client",
          state: "Pending",
          version: 1,
          accepted_at: null,
          fulfilled_at: null,
          created_at: "2026-08-31T00:00:00Z",
          updated_at: "2026-08-31T00:00:00Z",
        },
      ],
      pull_candidates: [
        {
          id: "pc-1",
          project_id: "proj-1",
          author: { id: "claude" },
          title: "Authority tests",
          detail: "Cross-seat rejection tests",
          created_at: "2026-08-31T00:00:00Z",
        },
      ],
      activity: [],
      next_cursor: "15",
    };
    const fetchFn = makeFetch(() => ({ status: 200, body: snapshot }));
    const client = makeClient(fetchFn, store);

    const result = await client.reconcile();

    // 1. What work is owed now?
    expect(result.obligations).toHaveLength(2);
    expect(result.obligations[0]?.source).toBe("accepted_request");
    expect(result.obligations[1]?.source).toBe("owner_next_action");

    // 2. What outbound requests exist?
    expect(result.outboundRequests).toHaveLength(1);
    expect(result.outboundRequests[0]?.title).toBe("Review client");
    expect(result.outboundRequests[0]?.state).toBe("Pending");

    // 3. What new inbound requests need attention?
    expect(result.inboundRequests).toHaveLength(1);
    expect(result.inboundRequests[0]?.title).toBe("Build client");
    expect(result.inboundRequests[0]?.state).toBe("Pending");

    // 4. What Pull Candidates have been published?
    expect(result.pullCandidates).toHaveLength(1);
    expect(result.pullCandidates[0]?.title).toBe("Authority tests");
  });

  it("does NOT advance the cursor when the API call fails", async () => {
    const store = makeCursorStore();
    store.stored = "42";
    const fetchFn = makeFetch(() => ({
      status: 500,
      body: { error: "internal_error", message: "D1 is down" },
    }));
    const client = makeClient(fetchFn, store);

    await expect(client.reconcile()).rejects.toThrow(FleetRoutineError);

    // Cursor must be unchanged
    expect(store.stored).toBe("42");
  });

  it("does NOT advance the cursor when native persistence fails", async () => {
    const store = makeCursorStore();
    store.stored = "42";
    store.writeShouldFail = true;
    const fetchFn = makeFetch(() => ({
      status: 200,
      body: emptySnapshot("50"),
    }));
    const client = makeClient(fetchFn, store);

    await expect(client.reconcile()).rejects.toThrow("persistence failure");

    // Cursor must be unchanged — the API returned 50 but persistence failed
    expect(store.stored).toBe("42");
  });

  it("sends the principal in the auth header", async () => {
    const store = makeCursorStore();
    const fetchFn = makeFetch((_url, init) => {
      expect(init?.headers?.["X-Fleet-Principal"]).toBe("juniorslo");
      return { status: 200, body: emptySnapshot("1") };
    });
    const client = makeClient(fetchFn, store);

    await client.reconcile();
  });

  it("supports a custom auth header name", async () => {
    const store = makeCursorStore();
    const fetchFn = makeFetch((_url, init) => {
      expect(init?.headers?.["Authorization"]).toBe("juniorslo");
      return { status: 200, body: emptySnapshot("1") };
    });
    const client = makeClient(fetchFn, store, { authHeader: "Authorization" });

    await client.reconcile();
  });
});

describe("FleetRoutineClient — acceptRequest", () => {
  it("sends If-Match and Idempotency-Key headers", async () => {
    const store = makeCursorStore();
    const fetchFn = makeFetch((_url, init) => {
      expect(init?.method).toBe("POST");
      expect(init?.headers?.["Idempotency-Key"]).toBe("key-123");
      expect(init?.headers?.["If-Match"]).toBe('"3"');
      expect(init?.headers?.["Content-Type"]).toBe("application/json");
      return {
        status: 200,
        body: {
          id: "req-1",
          project_id: "proj-1",
          requester: { id: "codex" },
          recipient: { id: "juniorslo" },
          title: "Build client",
          detail: "Build it",
          state: "Accepted",
          version: 4,
          accepted_at: "2026-08-31T01:00:00Z",
          fulfilled_at: null,
          created_at: "2026-08-31T00:00:00Z",
          updated_at: "2026-08-31T01:00:00Z",
        },
      };
    });
    const client = makeClient(fetchFn, store);

    const result = await client.acceptRequest("req-1", 3, "key-123");

    expect(result.state).toBe("Accepted");
    expect(result.version).toBe(4);
  });

  it("throws on non-2xx response", async () => {
    const store = makeCursorStore();
    const fetchFn = makeFetch(() => ({
      status: 409,
      body: { error: "idempotency_conflict", message: "Key reused with different payload" },
    }));
    const client = makeClient(fetchFn, store);

    await expect(
      client.acceptRequest("req-1", 3, "key-123"),
    ).rejects.toThrow(FleetRoutineError);
  });
});

describe("FleetRoutineClient — fulfillRequest", () => {
  it("sends evidence when provided", async () => {
    const store = makeCursorStore();
    const fetchFn = makeFetch((_url, init) => {
      const body = JSON.parse(init?.body ?? "{}");
      expect(body.evidence).toEqual([
        { uri: "https://github.com/workslo/fleet/pull/5", summary: "Reference client shipped" },
      ]);
      return {
        status: 200,
        body: {
          id: "req-1",
          project_id: "proj-1",
          requester: { id: "codex" },
          recipient: { id: "juniorslo" },
          title: "Build client",
          detail: "Build it",
          state: "Fulfilled",
          version: 5,
          accepted_at: "2026-08-31T01:00:00Z",
          fulfilled_at: "2026-08-31T02:00:00Z",
          created_at: "2026-08-31T00:00:00Z",
          updated_at: "2026-08-31T02:00:00Z",
        },
      };
    });
    const client = makeClient(fetchFn, store);

    await client.fulfillRequest("req-1", 4, "key-456", [
      { uri: "https://github.com/workslo/fleet/pull/5", summary: "Reference client shipped" },
    ]);
  });

  it("omits evidence when not provided", async () => {
    const store = makeCursorStore();
    const fetchFn = makeFetch((_url, init) => {
      const body = JSON.parse(init?.body ?? "{}");
      expect(body).toEqual({});
      expect("evidence" in body).toBe(false);
      return {
        status: 200,
        body: {
          id: "req-1",
          project_id: "proj-1",
          requester: { id: "codex" },
          recipient: { id: "juniorslo" },
          title: "Build client",
          detail: "Build it",
          state: "Fulfilled",
          version: 5,
          accepted_at: "2026-08-31T01:00:00Z",
          fulfilled_at: "2026-08-31T02:00:00Z",
          created_at: "2026-08-31T00:00:00Z",
          updated_at: "2026-08-31T02:00:00Z",
        },
      };
    });
    const client = makeClient(fetchFn, store);

    await client.fulfillRequest("req-1", 4, "key-456");
  });
});

describe("FleetRoutineClient — createWorkRequest", () => {
  it("sends the correct body and no If-Match", async () => {
    const store = makeCursorStore();
    const fetchFn = makeFetch((url, init) => {
      expect(url).toBe("https://fleet.test/v1/projects/proj-1/requests");
      expect(init?.headers?.["If-Match"]).toBeUndefined();
      const body = JSON.parse(init?.body ?? "{}");
      expect(body).toEqual({
        recipient_id: "codex",
        title: "Review client",
        detail: "Please review the reference client",
      });
      return {
        status: 201,
        body: {
          id: "req-3",
          project_id: "proj-1",
          requester: { id: "juniorslo" },
          recipient: { id: "codex" },
          title: "Review client",
          detail: "Please review the reference client",
          state: "Pending",
          version: 1,
          accepted_at: null,
          fulfilled_at: null,
          created_at: "2026-08-31T00:00:00Z",
          updated_at: "2026-08-31T00:00:00Z",
        },
      };
    });
    const client = makeClient(fetchFn, store);

    const result = await client.createWorkRequest(
      "proj-1",
      "codex",
      "Review client",
      "Please review the reference client",
      "key-789",
    );

    expect(result.state).toBe("Pending");
    expect(result.id).toBe("req-3");
  });
});

describe("FleetRoutineClient — publishPullCandidate", () => {
  it("sends the correct body and no If-Match", async () => {
    const store = makeCursorStore();
    const fetchFn = makeFetch((url, init) => {
      expect(url).toBe("https://fleet.test/v1/pull-candidates");
      expect(init?.headers?.["If-Match"]).toBeUndefined();
      const body = JSON.parse(init?.body ?? "{}");
      expect(body).toEqual({
        project_id: "proj-1",
        title: "Cursor safety tests",
        detail: "Added tests for cursor-not-advanced-on-failure",
      });
      return {
        status: 201,
        body: {
          id: "pc-2",
          project_id: "proj-1",
          author: { id: "juniorslo" },
          title: "Cursor safety tests",
          detail: "Added tests for cursor-not-advanced-on-failure",
          created_at: "2026-08-31T00:00:00Z",
        },
      };
    });
    const client = makeClient(fetchFn, store);

    const result = await client.publishPullCandidate(
      "proj-1",
      "Cursor safety tests",
      "Added tests for cursor-not-advanced-on-failure",
      "key-pc-1",
    );

    expect(result.id).toBe("pc-2");
  });
});

describe("FleetRoutineClient — read endpoints", () => {
  it("listProjects calls GET /v1/portfolio", async () => {
    const store = makeCursorStore();
    const fetchFn = makeFetch((url) => {
      expect(url).toBe("https://fleet.test/v1/portfolio");
      return {
        status: 200,
        body: [
          {
            id: "proj-1",
            slug: "fleet-v1-foundation",
            title: "Fleet V1 Foundation",
            originator: { id: "shane" },
            submitter: { id: "shane" },
            owner: { id: "codex" },
            proposed_owner: null,
            state: "Active",
            health: "On Track",
            next_action: null,
            version: 3,
            envelope: { revision: 1 },
            plan: { revision: 1, body: "Build the first vertical slice" },
            evidence: [],
            updated_at: "2026-08-31 00:00:00",
          },
        ],
      };
    });
    const client = makeClient(fetchFn, store);

    const projects = await client.listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0]?.slug).toBe("fleet-v1-foundation");
  });

  it("getProject calls GET /v1/projects/:id", async () => {
    const store = makeCursorStore();
    const fetchFn = makeFetch((url) => {
      expect(url).toBe("https://fleet.test/v1/projects/proj-1");
      return {
        status: 200,
        body: {
          id: "proj-1",
          slug: "fleet-v1-foundation",
          title: "Fleet V1 Foundation",
          originator: { id: "shane" },
          submitter: { id: "shane" },
          owner: { id: "codex" },
          proposed_owner: null,
          state: "Active",
          health: "On Track",
          next_action: null,
          version: 3,
          envelope: { revision: 1 },
          plan: { revision: 1, body: "Build" },
          evidence: [],
          updated_at: "2026-08-31 00:00:00",
        },
      };
    });
    const client = makeClient(fetchFn, store);

    const project = await client.getProject("proj-1");
    expect(project.state).toBe("Active");
  });

  it("getActivity uses the stored cursor when no after is provided", async () => {
    const store = makeCursorStore();
    store.stored = "10";
    const fetchFn = makeFetch((url) => {
      expect(url).toContain("after=10");
      return {
        status: 200,
        body: {
          activity: [
            {
              id: 11,
              type: "request_created",
              actor: { id: "codex" },
              project_id: "proj-1",
              created_at: "2026-08-31T00:00:00Z",
            },
          ],
          next_cursor: "11",
        },
      };
    });
    const client = makeClient(fetchFn, store);

    const result = await client.getActivity();
    expect(result.activity).toHaveLength(1);
    expect(result.next_cursor).toBe("11");
  });

  it("getActivity uses the provided cursor when given", async () => {
    const store = makeCursorStore();
    store.stored = "10";
    const fetchFn = makeFetch((url) => {
      expect(url).toContain("after=5");
      return {
        status: 200,
        body: { activity: [], next_cursor: "5" },
      };
    });
    const client = makeClient(fetchFn, store);

    await client.getActivity("5");
  });

  it("getDecisions calls GET /v1/decisions", async () => {
    const store = makeCursorStore();
    const fetchFn = makeFetch((url) => {
      expect(url).toBe("https://fleet.test/v1/decisions");
      return { status: 200, body: [] };
    });
    const client = makeClient(fetchFn, store);

    const decisions = await client.getDecisions();
    expect(decisions).toEqual([]);
  });
});

describe("FleetRoutineClient — idempotency contract", () => {
  it("the same Idempotency-Key is sent on retry — server handles dedup", async () => {
    const store = makeCursorStore();
    let callCount = 0;
    const fetchFn = makeFetch((_url, init) => {
      callCount++;
      // First call simulates a lost response (500), second is the retry
      if (callCount === 1) {
        return { status: 500, body: { error: "internal_error" } };
      }
      // Second call with same key — server returns the stored response
      expect(init?.headers?.["Idempotency-Key"]).toBe("retry-key-1");
      return {
        status: 200,
        body: {
          id: "req-1",
          project_id: "proj-1",
          requester: { id: "codex" },
          recipient: { id: "juniorslo" },
          title: "Build client",
          detail: "Build it",
          state: "Accepted",
          version: 4,
          accepted_at: "2026-08-31T01:00:00Z",
          fulfilled_at: null,
          created_at: "2026-08-31T00:00:00Z",
          updated_at: "2026-08-31T01:00:00Z",
        },
      };
    });
    const client = makeClient(fetchFn, store);

    // First attempt fails
    await expect(
      client.acceptRequest("req-1", 3, "retry-key-1"),
    ).rejects.toThrow(FleetRoutineError);

    // Retry with the same key — the caller reuses it, the server deduplicates
    const result = await client.acceptRequest("req-1", 3, "retry-key-1");
    expect(result.state).toBe("Accepted");

    expect(callCount).toBe(2);
  });
});

describe("FleetRoutineClient — HEARTBEAT/JOURNAL prose exclusion", () => {
  it("exposes only Fleet API endpoints — no method accepts free-form prose", () => {
    const store = makeCursorStore();
    const client = makeClient(makeFetch(() => ({ status: 200, body: emptySnapshot() })), store);

    // The client's public methods are exclusively Fleet API operations.
    // There is no method that accepts HEARTBEAT or JOURNAL prose.
    // (mutate and parseJson are TypeScript-private internal helpers —
    // compile-time private, but still on the runtime prototype.)
    const internal = new Set(["constructor", "mutate", "parseJson"]);
    const methods = Object.getOwnPropertyNames(
      Object.getPrototypeOf(client),
    ).filter((m) => !internal.has(m));

    expect(methods.sort()).toEqual(
      [
        "acceptRequest",
        "createWorkRequest",
        "fulfillRequest",
        "getActivity",
        "getDecisions",
        "getProject",
        "listProjects",
        "publishPullCandidate",
        "reconcile",
      ].sort(),
    );
  });
});

describe("FleetRoutineClient — structured error codes", () => {
  it("surfaces the machine-readable error code from Fleet API errors", async () => {
    const store = makeCursorStore();
    const fetchFn = makeFetch(() => ({
      status: 409,
      body: { error: "idempotency_conflict", message: "Key reused with different payload" },
    }));
    const client = makeClient(fetchFn, store);

    try {
      await client.acceptRequest("req-1", 3, "key-dupe");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(FleetRoutineError);
      const err = e as FleetRoutineError;
      expect(err.code).toBe("idempotency_conflict");
      expect(err.message).toBe("Key reused with different payload");
      expect(err.status).toBe(409);
    }
  });

  it("falls back to request_failed when error body is not JSON", async () => {
    const store = makeCursorStore();
    const fetchFn = vi.fn(async () => ({
      status: 502,
      json: async () => { throw new Error("not json"); },
      text: async () => "Bad Gateway",
    })) as unknown as FetchLike;
    const client = makeClient(fetchFn, store);

    try {
      await client.getProject("proj-1");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(FleetRoutineError);
      const err = e as FleetRoutineError;
      expect(err.code).toBe("request_failed");
      expect(err.status).toBe(502);
    }
  });
});

describe("FleetRoutineClient — cursor edge cases", () => {
  it("handles no-new-activity: next_cursor equals supplied cursor", async () => {
    const store = makeCursorStore();
    store.stored = "42";
    // Server returns next_cursor = "42" when there's no new activity
    const fetchFn = makeFetch((url) => {
      expect(url).toContain("after=42");
      return { status: 200, body: emptySnapshot("42") };
    });
    const client = makeClient(fetchFn, store);

    const result = await client.reconcile();

    // Cursor stays the same — nothing new since last run
    expect(result.cursor).toBe("42");
    expect(store.stored).toBe("42");
    expect(result.obligations).toHaveLength(0);
    expect(result.inboundRequests).toHaveLength(0);
  });

  it("does NOT advance cursor when fetch rejects (network error = unknown outcome)", async () => {
    const store = makeCursorStore();
    store.stored = "42";
    // fetch rejects — network timeout, DNS failure, etc.
    // This is the "unknown" outcome: the request may or may not have been received.
    const fetchFn = vi.fn(async () => {
      throw new Error("network timeout");
    }) as unknown as FetchLike;
    const client = makeClient(fetchFn, store);

    await expect(client.reconcile()).rejects.toThrow("network timeout");

    // Cursor must be unchanged — we don't know if the server received the request
    expect(store.stored).toBe("42");
  });
});
