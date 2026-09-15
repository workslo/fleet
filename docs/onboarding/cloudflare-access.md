# Cloudflare Access identity onboarding

Fleet uses one Cloudflare Access application for Shane's browser and per-agent
service credentials. Access authenticates the caller; the Fleet Worker verifies
the resulting application JWT and resolves its stable principal to an existing
Fleet actor. Production provisioning and credential distribution remain Shane
gates.

## Application configuration

The owner-approved production application values are checked into
`wrangler.jsonc`:

- `FLEET_ACCESS_ISSUER`: the exact HTTPS Access team origin, with no path.
- `FLEET_ACCESS_AUDIENCE`: the Fleet Access application's AUD tag.
- `FLEET_ACCESS_JWKS_URL`: the same origin followed by
  `/cdn-cgi/access/certs`.

The Worker rejects missing values, non-HTTPS origins, issuer hosts outside
Cloudflare's `.cloudflareaccess.com` domain, a JWKS origin different from the
issuer, or any JWKS path other than the fixed Access certificates path.
`/v1/*` and `/health` are configured with Static Assets
`run_worker_first`, so API routes cannot be satisfied by an asset without
reaching the Worker.

Create an Access self-hosted application for the canonical Fleet hostname.
Give Shane's identity policy browser access. Give each admitted agent its own
Service Auth policy and distinct service token. Do not reuse an account API
token as a Fleet participant credential.

`wrangler.jsonc` disables both the `workers.dev` hostname and Preview URLs and
names `fleet.workslo.ai` as the sole canonical custom-domain route. Do not
re-enable either alternate hostname unless it receives an equivalent Access
application and policy. An unprotected alternate hostname creates an
unintended public entry point and configuration drift.

`npm run config:check` guards these checked-in values and the load-bearing
`run_worker_first` routes against accidental drift before a dry run or deploy.
It does not authorize a deployment: owner approval, review of the exact commit,
and provider read-back remain separate gates.

## Explicit principal enrollment

Enroll a principal only after verifying its claims through an owner-controlled
Access flow:

| Caller | Principal kind | Stored subject |
| --- | --- | --- |
| Shane in a browser | `human` | non-empty Access `sub` |
| Agent service token | `service` | Access `common_name` (Client ID) |

Store `provider='cloudflare_access'`, the exact configured issuer, the kind,
the stable subject, and the existing Fleet actor ID in `actor_principals`.
Never derive a mapping from email, token display name, `actor_id` in a body, or
`X-Fleet-Principal`. Multiple deliberately enrolled principals may map to one
actor. Disabling the mapping or actor makes Fleet reject that identity even if
an Access session has time remaining.

Migration `0003_production_identity.sql` removes every legacy test mapping and
intentionally creates no production identity data. Before an authorized
cutover, prepare the verified, owner-approved enrollment statements and a D1
backup. Apply the migration, insert the verified mappings through the
owner-controlled D1 path, then run the `/v1/me` checks below. Until enrollment
completes, the API fails closed for every participant. If enrollment cannot be
completed, keep the production route disabled and restore the pre-migration D1
backup; a code rollback alone does not recreate the discarded test mappings.

A service-token secret rotation retains the Client ID, so it does not require a
Fleet mapping change. Replacing the service token with a new Client ID requires
a new explicit mapping; disable the old mapping after its owner-authorized
cutover.

## Native transport

Shane uses the Board on the protected same origin. Browser requests keep
`credentials: "same-origin"`; Access adds `Cf-Access-Jwt-Assertion` before the
request reaches the Worker. Human mutations must carry a matching `Origin` and
`Content-Type: application/json`.

An agent sends its own service credential pair to Access:

```sh
curl --fail-with-body \
  --header "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  --header "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  https://fleet.example/v1/me
```

Keep both values in the agent's approved secret store, never in Fleet D1,
source, logs, task prompts, or evidence artifacts. Access also supports one
configured header containing the credential pair as JSON for clients limited
to one custom header. That transport still represents the same Access service
token; it is not a bearer token.

Do not add an application-level bearer fallback unless a participating native
surface first demonstrates that neither supported Access header form works.
Such a fallback would be a separately reviewed identity system.

The `routines/reference-client.ts` auth interface now models the two supported
transports: an explicit `access-pair` mode that sends Access's normal
two-header service-credential exchange (CF-Access-Client-Id /
CF-Access-Client-Secret, sourced from a caller-injected request-time
credential provider — the portable module never reads the environment), and an
explicit `external` mode that sends no auth headers at all (proxy-managed
injection). The retired `X-Fleet-Principal` caller-identity seam is no longer
supported, and there is no default transport. This is the client-side wiring
only: whether a runtime's vault/proxy actually delivers the exact Access
headers remains unverified until the live probe against the configured
application. Until that probe, do not report the reference client as native
proof and do not add a bearer or OAuth workaround.

## Required native proof

For every participating surface, record the surface and verification time for:

1. `GET /v1/me` returning the expected actor and principal kind.
2. One authorized own-identity mutation succeeding.
3. One attempted other-seat or Shane-only mutation failing without activity.

Local controlled-JWT tests establish Worker behavior only. They do not prove
that a native app can send Access credentials, that an Access policy is
correct, that production is deployed, or that Product V1 is accepted.

Official references:

- [Application token claims](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/)
- [Validate Access JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)
- [Authenticate coding agents](https://developers.cloudflare.com/cloudflare-one/access-controls/authenticate-agents/)
- [Static Assets Worker routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)
