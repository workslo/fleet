/**
 * Access service-credential transport for the Fleet Routine reference client.
 *
 * Replaces the retired caller-identity header assumption (`X-Fleet-Principal`):
 * the Fleet Worker derives the actor from the verified Cloudflare Access JWT
 * (`common_name` for service principals — see
 * docs/onboarding/cloudflare-access.md and workslo/fleet#31), so the client
 * never sends an actor identity of any kind.
 *
 * Secret boundary (brief, Sep 7 2026): credentials live in the agent's
 * approved secret store. Nothing here logs, persists, or emits them outside
 * the auth headers; error paths redact values by construction (they are never
 * read into the error).
 *
 * Single-header fallback shape follows the onboarding contract ("one
 * configured header containing the credential pair as JSON"); the exact key
 * names are confirmed against the configured Access application at the
 * live-probe gate — local fixtures assert JSON-ness, not Cloudflare's wire
 * contract.
 */

// ---------------------------------------------------------------------------
// Credential source — where the pair comes from. Never a literal in prod.
// ---------------------------------------------------------------------------

export type AccessCredentialSource =
  /** Explicit values. Intended for tests and callers that already hold the
   *  pair in their own secret plumbing. Never commit real values. */
  | { source: "explicit"; clientId: string; clientSecret: string }
  /** Read from the environment at REQUEST time (not construction), so
   *  late-arriving proxy injection is picked up. Defaults:
   *  CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET. This is the
   *  native-proxy-injection path — values stay outside model plaintext. */
  | { source: "env"; clientIdVar?: string; clientSecretVar?: string };

// ---------------------------------------------------------------------------
// Auth modes — exactly one; the client has no default.
// ---------------------------------------------------------------------------

export type ReferenceClientAuth =
  /** Both documented headers: CF-Access-Client-Id + CF-Access-Client-Secret. */
  | { mode: "access-pair"; credential: AccessCredentialSource }
  /** Documented fallback: one configured header carrying the pair as JSON. */
  | { mode: "access-single-header"; headerName: string; credential: AccessCredentialSource }
  /** Proxy-managed transport: the client sends NO auth headers; an external
   *  layer injects them. Credentials never reach the client process. */
  | { mode: "external" };

const ENV_CLIENT_ID = "CF_ACCESS_CLIENT_ID";
const ENV_CLIENT_SECRET = "CF_ACCESS_CLIENT_SECRET";

/** Thrown when a credential source cannot produce the pair. Carries only the
 *  variable NAME — never any value. */
export class MissingCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingCredentialError";
  }
}

interface ResolvedPair {
  clientId: string;
  clientSecret: string;
}

function resolvePair(credential: AccessCredentialSource): ResolvedPair {
  if (credential.source === "explicit") {
    return { clientId: credential.clientId, clientSecret: credential.clientSecret };
  }
  const idVar = credential.clientIdVar ?? ENV_CLIENT_ID;
  const secretVar = credential.clientSecretVar ?? ENV_CLIENT_SECRET;
  const env = typeof process !== "undefined" ? process.env : {};
  const clientId = env[idVar];
  const clientSecret = env[secretVar];
  if (!clientId || !clientSecret) {
    const missing = [
      ...(clientId ? [] : [idVar]),
      ...(clientSecret ? [] : [secretVar]),
    ].join(", ");
    throw new MissingCredentialError(
      `Access service credential not available: unset env var(s) ${missing}`,
    );
  }
  return { clientId, clientSecret };
}

/**
 * Build the auth headers for a request. Reads env-based credentials at
 * request time. Returned headers are exactly the auth headers — the client
 * merges them with its identity/idempotency/version headers, which are
 * unchanged by this module.
 */
export function buildAuthHeaders(auth: ReferenceClientAuth): Record<string, string> {
  if (auth.mode === "external") {
    return {};
  }
  const pair = resolvePair(auth.credential);
  if (auth.mode === "access-single-header") {
    return {
      [auth.headerName]: JSON.stringify({
        client_id: pair.clientId,
        client_secret: pair.clientSecret,
      }),
    };
  }
  return {
    "CF-Access-Client-Id": pair.clientId,
    "CF-Access-Client-Secret": pair.clientSecret,
  };
}
