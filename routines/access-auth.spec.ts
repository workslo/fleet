import { describe, expect, it, vi } from "vitest";
import {
  buildAuthHeaders,
  CredentialProviderError,
  type ReferenceClientAuth,
} from "./access-auth";

// Fixture credentials — not real secrets. Values are deliberately distinctive
// so redaction assertions can prove they never reach error messages.
const FIXTURE_PAIR = {
  clientId: "fixture.access-id.local",
  clientSecret: "fixture-secret-not-a-real-credential",
};

function pairAuth(
  getCredentials?: ReferenceClientAuth extends never ? never : () => unknown,
): ReferenceClientAuth {
  return {
    mode: "access-pair",
    getCredentials:
      getCredentials ??
      (() => ({ ...FIXTURE_PAIR })),
  } as ReferenceClientAuth;
}

describe("buildAuthHeaders — access-pair mode", () => {
  it("sends both documented Access headers with the provider's pair", async () => {
    const headers = await buildAuthHeaders(pairAuth());
    expect(headers).toEqual({
      "CF-Access-Client-Id": FIXTURE_PAIR.clientId,
      "CF-Access-Client-Secret": FIXTURE_PAIR.clientSecret,
    });
  });

  it("invokes the provider at request time, not construction", async () => {
    const getCredentials = vi.fn(() => ({ ...FIXTURE_PAIR }));
    const auth: ReferenceClientAuth = { mode: "access-pair", getCredentials };
    expect(getCredentials).not.toHaveBeenCalled();

    await buildAuthHeaders(auth);
    await buildAuthHeaders(auth);

    expect(getCredentials).toHaveBeenCalledTimes(2);
  });

  it("supports async providers (secret-store reads)", async () => {
    const headers = await buildAuthHeaders(
      pairAuth(async () => ({ ...FIXTURE_PAIR })),
    );
    expect(headers["CF-Access-Client-Id"]).toBe(FIXTURE_PAIR.clientId);
  });

  it("omits no caller-identity header — actor is never caller-supplied", async () => {
    const headers = await buildAuthHeaders(pairAuth());
    expect("X-Fleet-Principal" in headers).toBe(false);
  });
});

describe("buildAuthHeaders — external mode", () => {
  it("sends no auth headers at all", async () => {
    const headers = await buildAuthHeaders({ mode: "external" });
    expect(headers).toEqual({});
  });

  it("sends no caller-identity header either", async () => {
    const headers = await buildAuthHeaders({ mode: "external" });
    expect("X-Fleet-Principal" in headers).toBe(false);
    expect("CF-Access-Client-Id" in headers).toBe(false);
    expect("CF-Access-Client-Secret" in headers).toBe(false);
  });
});

describe("buildAuthHeaders — failure paths fail loud, without secret material", () => {
  it("wraps provider failure in CredentialProviderError", async () => {
    const auth = pairAuth(() => {
      throw new Error("vault unavailable");
    });
    await expect(buildAuthHeaders(auth)).rejects.toThrow(CredentialProviderError);
  });

  it("provider failure message carries no credential values", async () => {
    const auth = pairAuth(() => {
      throw new Error(
        `vault unavailable for ${FIXTURE_PAIR.clientSecret}`,
      );
    });
    const err = await buildAuthHeaders(auth).catch((e: Error) => e);
    // The underlying provider error is wrapped by NAME, not message — the
    // original message (which in a real fault could carry secret material)
    // never reaches the thrown error.
    expect(err.message).not.toContain(FIXTURE_PAIR.clientSecret);
    expect(err.message).not.toContain(FIXTURE_PAIR.clientId);
    expect(err.message).toContain("Error");
  });

  it("incomplete provider pair fails loud", async () => {
    const missingSecret = pairAuth(() =>
      ({ clientId: FIXTURE_PAIR.clientId }) as unknown as {
        clientId: string;
        clientSecret: string;
      },
    );
    await expect(buildAuthHeaders(missingSecret)).rejects.toThrow(
      /incomplete pair/,
    );
  });

  it("empty-string pair values fail loud", async () => {
    const empty = pairAuth(() => ({ clientId: "", clientSecret: "" }));
    await expect(buildAuthHeaders(empty)).rejects.toThrow(CredentialProviderError);
  });
});
