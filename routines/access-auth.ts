/**
 * Access service-credential transport for the Fleet Routine reference client.
 *
 * Replaces the retired caller-identity header assumption (`X-Fleet-Principal`):
 * the Fleet Worker derives the actor from the verified Cloudflare Access JWT
 * (`common_name` for service principals — see
 * docs/onboarding/cloudflare-access.md and workslo/fleet#31), so the client
 * never sends an actor identity of any kind. The caller selects the auth mode
 * explicitly; there is no default.
 *
 * Secret boundary (coordination ack, Sep 7 2026): credential acquisition stays
 * OUTSIDE this portable module. The caller injects a request-time credential
 * provider — typically one that reads the runtime's approved secret store.
 * Nothing here reads process.env, logs, persists, or emits credential values
 * outside the auth headers; provider errors carry no credential material by
 * construction (values are never placed into error messages).
 *
 * Verified-transport caveat (preserved from the original proposal, Sep 7):
 * this module emits Cloudflare's documented two-header Access service-credential
 * shape (CF-Access-Client-Id / CF-Access-Client-Secret). That the runtime's
 * vault/proxy actually delivers these exact headers is UNVERIFIED until the
 * live probe against the configured Access application. Fixtures assert this
 * module's output shape, not Cloudflare's wire contract.
 */

// ---------------------------------------------------------------------------
// Credential provider — injected by the caller, invoked at request time.
// ---------------------------------------------------------------------------

/** The Access service-credential pair. Callers obtain it from their own
 *  approved secret plumbing — never a literal in committed code. */
export interface AccessCredentialPair {
  clientId: string;
  clientSecret: string;
}

/**
 * Request-time credential provider. Invoked once per request, immediately
 * before the network call — so late-arriving credentials (proxy injection,
 * vault refresh) are picked up without reconstructing the client. May be
 * synchronous or async.
 */
export type AccessCredentialProvider = () =>
  | AccessCredentialPair
  | Promise<AccessCredentialPair>;

/** Thrown when the injected credential provider fails or returns an
 *  incomplete pair. Carries only the failure description — never any
 *  credential value. */
export class CredentialProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialProviderError";
  }
}

// ---------------------------------------------------------------------------
// Auth modes — exactly one, chosen explicitly by the caller; no default.
// ---------------------------------------------------------------------------

export type ReferenceClientAuth =
  /** Both documented Access headers, sourced from the injected provider. */
  | { mode: "access-pair"; getCredentials: AccessCredentialProvider }
  /** Proxy-managed transport: the client sends NO auth headers; an external
   *  layer injects them. Credentials never reach the client process. The
   *  choice is still explicit — the client sends no caller-identity header
   *  and has no default transport. */
  | { mode: "external" };

/**
 * Build the auth headers for a request. The provider is invoked here — at
 * request time, before the network call — so a provider failure surfaces
 * before any network activity or cursor advancement.
 *
 * Returned headers are exactly the auth headers; the client merges them with
 * its Idempotency-Key / If-Match / Content-Type headers, which are unchanged
 * by this module.
 */
export async function buildAuthHeaders(
  auth: ReferenceClientAuth,
): Promise<Record<string, string>> {
  if (auth.mode === "external") {
    return {};
  }
  let pair: AccessCredentialPair;
  try {
    pair = await auth.getCredentials();
  } catch (err) {
    throw new CredentialProviderError(
      `Access credential provider failed before request: ${err instanceof Error ? err.name : "unknown error"}`,
    );
  }
  if (!pair || typeof pair.clientId !== "string" || typeof pair.clientSecret !== "string" || !pair.clientId || !pair.clientSecret) {
    throw new CredentialProviderError(
      "Access credential provider returned an incomplete pair (both clientId and clientSecret are required)",
    );
  }
  return {
    "CF-Access-Client-Id": pair.clientId,
    "CF-Access-Client-Secret": pair.clientSecret,
  };
}
