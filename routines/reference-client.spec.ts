import { describe, expect, it, vi } from "vitest";
import {
  CursorStore,
  FetchLike,
  FleetRoutineClient,
  FleetRoutineClientOptions,
  FleetRoutineError,
  AgentWorkSnapshot,
} from "./reference-client";
import { CredentialProviderError, type ReferenceClientAuth } from "./access-auth";

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
  auth?: ReferenceClientAuth,
): FleetRoutineClient {
  const clientOpts: FleetRoutineClientOptions = {
    baseUrl: "https://fleet.test",
    cursorStore,
    fetchFn,
    auth: auth ?? {
      mode: "access-pair",
      getCredentials: () => ({
        clientId: "fixture.access-id.local",
        clientSecret: "fixture-secret-not-a-real-credential",
      }),
    },
  };
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
          state: "Returned",
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
          actor: { id: "claude" },
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
    expect(result.outboundRequests[0]?.state).toBe("Returned");

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

  it("sends both exact Access headers from the injected provider (pair mode)", async () => {
    const store = makeCursorStore();
    const fetchFn = makeFetch((_url, init) => {
      expect(init?.headers?.["CF-Access-Client-Id"]).toBe("fixture.access-id.local");
      expect(init?.headers?.["CF-Access-Client-Secret"]).toBe(
        "fixture-secret-not-a-real-credential",
      );
      expect("X-Fleet-Principal" in (init?.headers ?? {})).toBe(false);
      return { status: 200, body: emptySnapshot("1") };
    });
    const client = makeClient(fetchFn, store);

    await client.reconcile();
  });

  it("sends NO auth headers in external mode — the proxy injects them", async () => {
    const store = makeCursorStore();
    const fetchFn = makeFetch((_url, init) => {
      const headers = init?.headers ?? {};
      expect("CF-Access-Client-Id" in headers).toBe(false);
      expect("CF-Access-Client-Secret" in headers).toBe(false);
      expect("X-Fleet-Principal" in headers).toBe(false);
      return { status: 200, body: emptySnapshot("1") };
    });
    const client = makeClient(fetchFn, store, { mode: "external" });

    await client.reconcile();
  });

  it("fails BEFORE any network call or cursor write when the provider fails", async () => {
    const store = makeCursorStore();
    store.stored = "42";
    const fetchFn = vi.fn(() => {
      throw new Error("network must not be reached");
    }) as unknown as FetchLike;
    const client = makeClient(fetchFn, store, {
      mode: "access-pair",
      getCredentials: () => {
        throw new Error("vault unavailable");
      },
    });

    await expect(client.reconcile()).rejects.toThrow(CredentialProviderError);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(store.stored).toBe("42");
  });

  it("does NOT advance the cursor on auth denial (401)", async () => {
    const store = makeCursorStore();
    store.stored = "42";
    const fetchFn = makeFetch(() => ({
      status: 401,
      body: { error: "unauthorized", message: "Access denied" },
    }));
    const client = makeClient(fetchFn, store);

    await expect(client.reconcile()).rejects.toThrow(FleetRoutineError);

    expect(store.stored).toBe("42");
  });

  it("keeps Idempotency-Key and If-Match alongside the auth headers on mutations", async () => {
    const store = makeCursorStore();
    const seen: Array<Record<string, string>> = [];
    const fetchFn = makeFetch((_url, init) => {
      seen.push(init?.headers ?? {});
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

    await client.acceptRequest("req-1", 3, "key-123");

    const headers = seen[0] ?? {};
    // Auth headers and retry-safety headers coexist — neither clobbers the other.
    expect(headers["CF-Access-Client-Id"]).toBe("fixture.access-id.local");
    expect(headers["Idempotency-Key"]).toBe("key-123");
    expect(headers["If-Match"]).toBe('"3"');
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

describe("FleetRoutineClient — standalone review requests", () => {
  /**
   * These transport tests assert headers, not response shape, and their
   * fixture used to be `{ id, project_id }` — two fields out of fourteen.
   * It passed because the client cast its body instead of decoding it (#7).
   * A contract-valid record keeps the tests about what they are about.
   */
  const standaloneRequestBody = () => ({
    id: "standalone/1",
    project_id: null,
    requester: { id: "claude" },
    recipient: { id: "codex" },
    title: "Review artifact",
    detail: "Review the shared link",
    state: "Pending",
    version: 1,
    accepted_at: null,
    fulfilled_at: null,
    created_at: "2026-09-25T00:00:00Z",
    updated_at: "2026-09-25T00:00:00Z",
  });

  const standalonePaths = [
    {
      name: "create",
      call: (client: FleetRoutineClient) => client.createStandaloneRequest(
        "codex", "Review artifact", "Review the shared link", "create-key",
      ),
      path: "/v1/requests",
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "create-key" },
    },
    {
      name: "read",
      call: (client: FleetRoutineClient) => client.getRequest("standalone/1"),
      path: "/v1/requests/standalone%2F1",
      method: "GET",
      headers: {},
    },
    {
      name: "accept",
      call: (client: FleetRoutineClient) => client.acceptRequest("standalone/1", 1, "accept-key"),
      path: "/v1/requests/standalone%2F1/accept",
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "accept-key", "If-Match": '"1"' },
    },
    {
      name: "fulfill",
      call: (client: FleetRoutineClient) => client.fulfillRequest("standalone/1", 2, "fulfill-key"),
      path: "/v1/requests/standalone%2F1/fulfill",
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "fulfill-key", "If-Match": '"2"' },
    },
  ];

  describe.each(standalonePaths)("$name transport", ({ call, path, method, headers }) => {
    it("waits for credentials and refreshes both Access headers on every call", async () => {
      const store = makeCursorStore();
      store.stored = "42";
      const gate = Promise.withResolvers<void>();
      let requestNumber = 0;
      const getCredentials = vi.fn(async () => {
        await gate.promise;
        requestNumber += 1;
        return {
          clientId: `fixture-id-${requestNumber}`,
          clientSecret: `fixture-secret-${requestNumber}`,
        };
      });
      const fetchFn = makeFetch(() => ({
        status: 200, body: standaloneRequestBody(),
      }));
      const client = makeClient(fetchFn, store, { mode: "access-pair", getCredentials });
      expect(getCredentials).not.toHaveBeenCalled();

      const firstRequest = call(client);
      expect(getCredentials).toHaveBeenCalledTimes(1);
      await Promise.resolve();
      expect(fetchFn).not.toHaveBeenCalled();
      gate.resolve();
      await firstRequest;
      await call(client);

      expect(getCredentials).toHaveBeenCalledTimes(2);
      expect(fetchFn).toHaveBeenCalledTimes(2);
      for (const number of [1, 2]) {
        expect(fetchFn).toHaveBeenNthCalledWith(number, `https://fleet.test${path}`, expect.objectContaining({
          method,
          headers: {
            ...headers,
            "CF-Access-Client-Id": `fixture-id-${number}`,
            "CF-Access-Client-Secret": `fixture-secret-${number}`,
          },
        }));
      }
      expect(store.stored).toBe("42");
    });

    it("keeps only operation headers in external mode", async () => {
      const fetchFn = makeFetch((_url, init) => {
        expect(init?.headers).toEqual(headers);
        return { status: 200, body: standaloneRequestBody() };
      });
      const client = makeClient(fetchFn, makeCursorStore(), { mode: "external" });

      await call(client);

      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it.each(["rejected", "incomplete"])("stops before fetch for %s credentials", async (failure) => {
      const store = makeCursorStore();
      store.stored = "42";
      const fetchFn = makeFetch(() => ({ status: 200, body: {} }));
      const getCredentials = vi.fn(async () => {
        if (failure === "rejected") throw new Error("fixture-secret-provider-failure");
        return { clientId: "fixture-id", clientSecret: "" };
      });
      const client = makeClient(fetchFn, store, { mode: "access-pair", getCredentials });

      await expect(call(client)).rejects.toThrow(CredentialProviderError);

      expect(getCredentials).toHaveBeenCalledTimes(1);
      expect(fetchFn).not.toHaveBeenCalled();
      expect(store.stored).toBe("42");
    });
  });

  it("creates a standalone request without inventing a Fleet Project", async () => {
    const store = makeCursorStore();
    const fetchFn = makeFetch((url, init) => {
      expect(url).toBe("https://fleet.test/v1/requests");
      expect(init?.headers?.["If-Match"]).toBeUndefined();
      expect(JSON.parse(init?.body ?? "{}")).toEqual({
        recipient_id: "codex",
        title: "Review a personal experiment",
        detail: "Review only the deliberately shared artifact.",
        artifact: {
          uri: "https://home.example.test/shareable",
          summary: "Shareable experiment",
        },
      });
      return {
        status: 201,
        body: {
          id: "standalone-1",
          project_id: null,
          requester: { id: "juniorslo" },
          recipient: { id: "codex" },
          title: "Review a personal experiment",
          detail: "Review only the deliberately shared artifact.",
          artifact: { uri: "https://home.example.test/shareable", summary: "Shareable experiment" },
          accepted_scope: null,
          evidence: [],
          state: "Pending",
          version: 1,
          accepted_at: null,
          fulfilled_at: null,
          created_at: "2026-09-07T00:00:00Z",
          updated_at: "2026-09-07T00:00:00Z",
        },
      };
    });
    const client = makeClient(fetchFn, store);

    const result = await client.createStandaloneRequest(
      "codex",
      "Review a personal experiment",
      "Review only the deliberately shared artifact.",
      "standalone-create-key",
      { uri: "https://home.example.test/shareable", summary: "Shareable experiment" },
    );

    expect(result).toMatchObject({ id: "standalone-1", project_id: null, state: "Pending" });
  });

  it("reads fulfilled standalone evidence through the supported request surface", async () => {
    const store = makeCursorStore();
    const fetchFn = makeFetch((url, init) => {
      expect(url).toBe("https://fleet.test/v1/requests/standalone%2F1");
      expect(init?.method).toBe("GET");
      return {
        status: 200,
        body: {
          id: "standalone/1",
          project_id: null,
          requester: { id: "juniorslo" },
          recipient: { id: "codex" },
          title: "Review a personal experiment",
          detail: "Review only the deliberately shared artifact.",
          artifact: null,
          accepted_scope: {
            title: "Review a personal experiment",
            detail: "Review only the deliberately shared artifact.",
            artifact: null,
          },
          evidence: [{ uri: "https://reviews.example.test/1", summary: "Completed review", created_at: "2026-09-07T02:00:00Z" }],
          state: "Fulfilled",
          version: 3,
          accepted_at: "2026-09-07T01:00:00Z",
          fulfilled_at: "2026-09-07T02:00:00Z",
          created_at: "2026-09-07T00:00:00Z",
          updated_at: "2026-09-07T02:00:00Z",
        },
      };
    });
    const client = makeClient(fetchFn, store);

    const result = await client.getRequest("standalone/1");

    expect(result.evidence).toEqual([{ uri: "https://reviews.example.test/1", summary: "Completed review", created_at: "2026-09-07T02:00:00Z" }]);
    expect(result.accepted_scope?.title).toBe("Review a personal experiment");
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
          actor: { id: "juniorslo" },
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

  it("getActivity persists the returned cursor through CursorStore", async () => {
    const store = makeCursorStore();
    store.stored = "10";
    const fetchFn = makeFetch(() => ({
      status: 200,
      body: { activity: [], next_cursor: "20" },
    }));
    const client = makeClient(fetchFn, store);

    await client.getActivity();

    expect(store.stored).toBe("20");
  });

  it("getActivity does NOT advance the cursor when the API call fails", async () => {
    const store = makeCursorStore();
    store.stored = "10";
    const fetchFn = makeFetch(() => ({
      status: 500,
      body: { error: "internal_error", message: "D1 is down" },
    }));
    const client = makeClient(fetchFn, store);

    await expect(client.getActivity()).rejects.toThrow(FleetRoutineError);

    expect(store.stored).toBe("10");
  });

  it("getActivity does NOT advance the cursor when native persistence fails", async () => {
    const store = makeCursorStore();
    store.stored = "10";
    store.writeShouldFail = true;
    const fetchFn = makeFetch(() => ({
      status: 200,
      body: { activity: [], next_cursor: "20" },
    }));
    const client = makeClient(fetchFn, store);

    await expect(client.getActivity()).rejects.toThrow("persistence failure");

    expect(store.stored).toBe("10");
  });

  it("getActivity uses the provided cursor when given", async () => {
    const store = makeCursorStore();
    store.stored = "10";
    const fetchFn = makeFetch((url) => {
      expect(url).toContain("after=5");
      return { status: 200, body: { activity: [], next_cursor: "5" } };
    });
    const client = makeClient(fetchFn, store);

    await client.getActivity("5");
  });

  it("getActivity with explicit cursor does NOT advance the durable cursor (fast-forward guard)", async () => {
    const store = makeCursorStore();
    store.stored = "10";
    const fetchFn = makeFetch((url) => {
      expect(url).toContain("after=1000");
      return {
        status: 200,
        body: { activity: [], next_cursor: "1000" },
      };
    });
    const client = makeClient(fetchFn, store);

    const result = await client.getActivity("1000");
    expect(result.next_cursor).toBe("1000");

    // Durable cursor must remain 10 — a historical read must not make
    // later reconcile() skip unseen activity 11–1000.
    expect(store.stored).toBe("10");
  });

  it("getDecisions unwraps the { decisions: [...] } envelope", async () => {
    const store = makeCursorStore();
    const fetchFn = makeFetch((url) => {
      expect(url).toBe("https://fleet.test/v1/decisions");
      return {
        status: 200,
        body: { decisions: [] },
      };
    });
    const client = makeClient(fetchFn, store);

    const decisions = await client.getDecisions();
    expect(decisions).toEqual([]);
  });

  it("getDecisions returns records from the envelope", async () => {
    const store = makeCursorStore();
    const fetchFn = makeFetch(() => ({
      status: 200,
      body: {
        decisions: [
          {
            id: "dec-1",
            project_id: "proj-1",
            work_request_id: null,
            requester: { id: "claude" },
            kind: "decision",
            question: "Should we activate V1?",
            resolution_condition: null,
            state: "Open",
            version: 1,
            decision: null,
            action: null,
            delegation: null,
            action_status: "not_requested",
            created_at: "2026-08-31T00:00:00Z",
            updated_at: "2026-08-31T00:00:00Z",
          },
        ],
      },
    }));
    const client = makeClient(fetchFn, store);

    const decisions = await client.getDecisions();
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.id).toBe("dec-1");
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
      await client.getDecisions();
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

describe("FleetRoutineClient — reconcile does not destroy activity events", () => {
  // Regression: Claude's PR #2 review found that reconcile() advanced the
  // shared cursor past activity events without exposing them in the return
  // type. getActivity() (which shares the same CursorStore) could then never
  // retrieve them — the events were fetched, dropped, and made unreachable.
  // This is the same bug class as the fast-forward guard (b04c41b), in the
  // opposite direction.

  it("reconcile() exposes activity events from the consumed cursor window", async () => {
    const store = makeCursorStore();
    store.stored = "0";
    const snapshot: AgentWorkSnapshot = {
      ...emptySnapshot("3"),
      activity: [
        { id: 1, type: "project_proposed", actor: { id: "codex" }, project_id: "proj-1", created_at: "2026-08-31T00:00:00Z" },
        { id: 2, type: "request_created", actor: { id: "codex" }, project_id: "proj-1", created_at: "2026-08-31T00:00:01Z" },
        { id: 3, type: "request_accepted", actor: { id: "juniorslo" }, project_id: "proj-1", created_at: "2026-08-31T00:00:02Z" },
      ],
    };
    const fetchFn = makeFetch((url) => {
      if (url.includes("/v1/me/work")) return { status: 200, body: snapshot };
      return { status: 404, body: { error: "not_found" } };
    });
    const client = makeClient(fetchFn, store);

    const result = await client.reconcile();

    // Activity events must be exposed on the result, not silently dropped
    expect(result.activity).toHaveLength(3);
    expect(result.activity[0]?.id).toBe(1);
    expect(result.activity[2]?.id).toBe(3);
  });

  it("reconcile() then getActivity() does not lose events (the probed scenario)", async () => {
    const store = makeCursorStore();
    store.stored = "0";

    // Stub server: /v1/me/work holds events 1–3, /v1/activity returns events
    // after the cursor. After reconcile() advances cursor to 3, getActivity()
    // should see only new events (4+), NOT re-get 1–3.
    let activityAfterCursor = (after: string) => {
      const all = [
        { id: 1, type: "project_proposed", actor: { id: "codex" }, project_id: "proj-1", created_at: "2026-08-31T00:00:00Z" },
        { id: 2, type: "request_created", actor: { id: "codex" }, project_id: "proj-1", created_at: "2026-08-31T00:00:01Z" },
        { id: 3, type: "request_accepted", actor: { id: "juniorslo" }, project_id: "proj-1", created_at: "2026-08-31T00:00:02Z" },
      ];
      const n = parseInt(after, 10);
      return all.filter((e) => e.id > n);
    };

    const fetchFn = makeFetch((url) => {
      if (url.includes("/v1/me/work")) {
        const events = activityAfterCursor("0");
        return {
          status: 200,
          body: {
            ...emptySnapshot("3"),
            activity: events,
          },
        };
      }
      if (url.includes("/v1/activity")) {
        const afterMatch = url.match(/after=(\d+)/);
        const after = afterMatch?.[1] ?? "0";
        const events = activityAfterCursor(after);
        return {
          status: 200,
          body: { activity: events, next_cursor: events.length > 0 ? String(events[events.length - 1]!.id) : after },
        };
      }
      return { status: 404, body: { error: "not_found" } };
    });
    const client = makeClient(fetchFn, store);

    // Step 1: reconcile() consumes events 1–3, advances cursor to 3
    const reconcileResult = await client.reconcile();
    expect(reconcileResult.activity).toHaveLength(3);
    expect(store.stored).toBe("3");

    // Step 2: getActivity() reads from cursor 3 — should see NO events
    // (nothing new since reconcile). The events 1–3 are NOT lost because
    // they were exposed on reconcileResult.activity.
    const activityResult = await client.getActivity();
    expect(activityResult.activity).toHaveLength(0);

    // The combined view (reconcile activity + getActivity activity) = 3 events
    // Before the fix, reconcile dropped activity and getActivity saw nothing
    // — total 0 events from a window that contained 3.
    const totalEvents = reconcileResult.activity.length + activityResult.activity.length;
    expect(totalEvents).toBe(3);
  });
});
