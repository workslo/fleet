import { afterEach, describe, expect, it } from "vitest";
import {
  buildAuthHeaders,
  MissingCredentialError,
  type ReferenceClientAuth,
} from "./access-auth";

const ENV_PAIR = {
  CF_ACCESS_CLIENT_ID: "probe.access.example.local",
  CF_ACCESS_CLIENT_SECRET: "fixture-secret-not-a-real-credential",
};

function withEnv(run: () => void): void {
  const saved = { ...process.env };
  Object.assign(process.env, ENV_PAIR);
  try {
    run();
  } finally {
    process.env = saved;
  }
}

describe("buildAuthHeaders", () => {
  afterEach(() => {
    delete process.env.CF_ACCESS_CLIENT_ID;
    delete process.env.CF_ACCESS_CLIENT_SECRET;
  });

  it("pair mode with explicit source sends both documented Access headers", () => {
    const headers = buildAuthHeaders({
      mode: "access-pair",
      credential: { source: "explicit", clientId: "id-1", clientSecret: "s-1" },
    });
    expect(headers).toEqual({
      "CF-Access-Client-Id": "id-1",
      "CF-Access-Client-Secret": "s-1",
    });
  });

  it("pair mode with env source reads at request time, not construction", () => {
    const auth: ReferenceClientAuth = { mode: "access-pair", credential: { source: "env" } };
    expect(() => buildAuthHeaders(auth)).toThrow(MissingCredentialError);
    withEnv(() => {
      const headers = buildAuthHeaders(auth);
      expect(headers["CF-Access-Client-Id"]).toBe(ENV_PAIR.CF_ACCESS_CLIENT_ID);
      expect(headers["CF-Access-Client-Secret"]).toBe(ENV_PAIR.CF_ACCESS_CLIENT_SECRET);
    });
  });

  it("missing env fails loud with variable NAMES only — no values in the error", () => {
    const secret = ENV_PAIR.CF_ACCESS_CLIENT_SECRET;
    process.env.CF_ACCESS_CLIENT_SECRET = secret;
    try {
      expect(() =>
        buildAuthHeaders({ mode: "access-pair", credential: { source: "env" } }),
      ).toThrow(/CF_ACCESS_CLIENT_ID/);
    } finally {
      delete process.env.CF_ACCESS_CLIENT_SECRET;
    }
    // Redaction by construction: nothing in this module ever places the value
    // in an error; assert the thrown error mentions neither value.
    let message = "";
    try {
      buildAuthHeaders({ mode: "access-pair", credential: { source: "env" } });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toContain(secret);
    expect(message).not.toContain(ENV_PAIR.CF_ACCESS_CLIENT_ID);
  });

  it("single-header mode emits one configured header carrying the pair as JSON", () => {
    const headers = buildAuthHeaders({
      mode: "access-single-header",
      headerName: "X-Fleet-Access-Credential",
      credential: { source: "explicit", clientId: "id-2", clientSecret: "s-2" },
    });
    expect(Object.keys(headers)).toEqual(["X-Fleet-Access-Credential"]);
    const parsed = JSON.parse(headers["X-Fleet-Access-Credential"]) as Record<string, string>;
    expect(parsed).toEqual({ client_id: "id-2", client_secret: "s-2" });
  });

  it("external mode sends no auth headers at all", () => {
    withEnv(() => {
      expect(buildAuthHeaders({ mode: "external" })).toEqual({});
    });
  });

  it("external mode sends no identity header even when env pair is present", () => {
    withEnv(() => {
      const headers = buildAuthHeaders({ mode: "external" });
      expect("CF-Access-Client-Id" in headers).toBe(false);
      expect("X-Fleet-Principal" in headers).toBe(false);
    });
  });
});
