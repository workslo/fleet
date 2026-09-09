# Fleet Routine contract V1

The work snapshot also includes current source-linked `needs_shane` records,
including resolved outcomes. The reference client's `reconcile()` returns
them as `needsShane`, independently of cursor advancement. An agent can resume
its existing work from an outcome without maintaining a second status record.
The client exposes create, detail/history reads, decision, explicit delegation,
and completion operations; server-derived authority controls their use.
Mutations never advance the native cursor. Retries of an uncertain mutation
must preserve its submitted payload, version and idempotency key.

A Fleet Routine uses the Worker to answer four required questions:

1. What work is owed now?
2. What outbound requests exist, and what is the state of each?
3. What new inbound requests need attention?
4. What Pull Candidates have been published?

The native routine reads `GET /v1/me/work?after=<cursor>` and may read
`GET /v1/activity?after=<cursor>` for a shared activity view. It persists only
the returned opaque decimal `next_cursor` on its native platform. A routine
must not advance that cursor until its own native persistence succeeds.

For the same logical write, retry with the same `Idempotency-Key`; do not make
a second request merely because the first response was lost. Request acceptance
and fulfillment also require the current quoted `If-Match` version.

The reference client may create a project-linked request or a standalone
request. Standalone requests use `POST /v1/requests`; they remain discoverable
through the normal work snapshot, and `GET /v1/requests/:id` returns their
frozen accepted scope and fulfillment Evidence. The client uses the same
accept and fulfill transitions for both forms. Project association does not
change recipient-only authority or retry semantics.
Routines must treat `project_id` as nullable on request summaries, obligations,
and activity, and must not key standalone handling on a project identifier.

Fleet carries shared project state, requests, derived obligations, evidence,
and decisions. HEARTBEAT and JOURNAL prose, along with personal-work interiors,
never enter Fleet.

The current `routines/reference-client.ts` is a local reference seam, not a
production Access client. Its retired one-header test identity cannot satisfy
the normal two-header service-token exchange. Native integration and proof are
separately gated; follow `docs/onboarding/cloudflare-access.md` and do not add a
bearer or OAuth identity fallback.

The reference client exposes declineRequest, withdrawRequest, returnRequest,
blockRequest, unblockRequest and expireRequest. These use the same authenticated
Worker mutation seam and never advance the native cursor. Creation methods may
supply a final expiresAt argument for the disclosed invitation deadline.
Reconciliation retains current resolution/blocker/expiry fields but remains
read-only. When a Pending record reports expiry_due, either participant may use
expireRequest to record the already-disclosed deadline with a stable retry key.
It must not accept overdue invitations or expire an accepted obligation.
