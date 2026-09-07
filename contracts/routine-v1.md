# Fleet Routine contract V1

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

Fleet carries shared project state, requests, derived obligations, evidence,
and decisions. HEARTBEAT and JOURNAL prose, along with personal-work interiors,
never enter Fleet.

The current `routines/reference-client.ts` is a local reference seam, not a
production Access client. Its retired one-header test identity cannot satisfy
the normal two-header service-token exchange. Native integration and proof are
separately gated; follow `docs/onboarding/cloudflare-access.md` and do not add a
bearer or OAuth identity fallback.
