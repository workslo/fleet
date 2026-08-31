# Fleet contracts

Contracts translate the signed agreement into versioned implementation seams.
They must preserve these distinctions:

- Authorized Project Envelope is separate from the Agreed Plan.
- Project lifecycle is separate from project health.
- A Work Request is not an obligation until the recipient accepts it.
- A Pull Candidate never creates an obligation by itself.
- Current state is queryable; meaningful mutations also append attributable activity.
- Acting identity comes from the verified principal, never a request-body actor field.
- Shane-only decisions remain server-enforced gates.
- Existing-record mutations use optimistic concurrency; retries are idempotent.
- Routine cursors help find changes and never replace a refreshed current snapshot.

The first public seams are Worker HTTP, Board flows through that interface,
native routine reconciliation, and export/restore verification.

