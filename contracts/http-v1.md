# Fleet HTTP contract V1

All errors have this shape:

```json
{ "error": "machine_readable_code", "message": "human-readable explanation" }
```

## Routes

| Route | Purpose |
| --- | --- |
| `GET /health` | Static process health; contains no Fleet state or identity. |
| `GET /v1/me` | Return the authenticated Fleet actor and resolved principal provenance. |
| `GET /v1/portfolio` | List project cards. |
| `POST /v1/projects` | Propose a project with `slug`, `title`, and `originator_id`. |
| `POST /v1/projects/:id/authorize` | Shane authorizes with `proposed_owner_id`, `outcome`, `scope`, `exclusions`, `delegated_actions`, `gates`, `validation_evidence`, and `plan`. |
| `POST /v1/projects/:id/owner-accept` | The proposed owner accepts with `{}`. |
| `GET /v1/projects/:id` | Read one project card. |
| `POST /v1/projects/:id/requests` | Create a `Pending` Work Request with non-blank `recipient_id`, `title`, and `detail`; `project_id` comes only from the route and caller-identity fields are rejected. `recipient_id` must name an actor other than the caller. |
| `POST /v1/requests` | Create a `Pending` Work Request with `recipient_id`, `title`, `detail`, optional `artifact: { uri, summary }`, and optional `project_id`; omission or `null` makes it standalone. `recipient_id` must name an actor other than the caller. |
| `GET /v1/requests/:id` | Read one Work Request, its frozen `accepted_scope`, and fulfillment `evidence`. |
| `POST /v1/requests/:id/accept` | The recipient accepts with `{}` and a quoted request `If-Match` version. |
| `POST /v1/requests/:id/fulfill` | The recipient fulfills with optional `evidence: [{ uri, summary }]` and a quoted request `If-Match` version. |
| `POST /v1/pull-candidates` | Publish a Pull Candidate with `project_id`, `title`, and `detail`. |
| `GET /v1/me/work?after=<cursor>` | Read the authenticated actor's reconciliation snapshot. |
| `GET /v1/activity?after=<cursor>` | Read append-only activity after an opaque cursor. |
| `GET /v1/decisions` | Read pending Needs Shane records; `?state=all` includes history. |
| `POST /v1/decisions` | Raise a source-linked decision, action, or combined ask. |
| `GET /v1/decisions/:id` | Read one Needs Shane record and its separate outcomes. |
| `POST /v1/decisions/:id/decide` | Shane records `choice`, `summary`, and optional `evidence`. |
| `POST /v1/decisions/:id/delegate-action` | Shane records `delegate_id` and a scope `summary`. |
| `POST /v1/decisions/:id/complete-action` | Shane or the named delegate records `summary` and optional `evidence`. |

Mutation requests require an `Idempotency-Key`. Repeating a key with the same
authenticated actor, request path, method, and payload returns the stored
response; reuse with a different payload fails. Versioned transitions also
require `If-Match: "<version>"` set to the current project version.

All `/v1/*` routes require a verified principal. Production callers send no
Fleet actor identifier: Cloudflare Access adds `Cf-Access-Jwt-Assertion`, and
the Worker resolves that verified principal through the active mapping table.
For a browser-authenticated human, non-read mutations require an `Origin`
matching the request origin. Fleet does not enable cross-origin Board writes.
Such browser mutations also require `Content-Type: application/json`.

All `/v1/*` routes are Worker-first in the Static Assets configuration. Board
build output must not occupy `/v1/*` or `/health`. In production, the Access
application also protects `/health`; an authorized monitoring service token may
reach the static health response without needing a Fleet actor mapping.

`GET /v1/me` returns the server-resolved identity:

```json
{
  "actor": { "id": "codex", "display_name": "Codex" },
  "principal": {
    "provider": "cloudflare_access",
    "issuer": "https://team.cloudflareaccess.com",
    "kind": "service",
    "subject": "client-id.access"
  }
}
```

The `subject` is identity metadata, not a credential secret. Clients should use
`actor.id` for Fleet authority and treat principal details as verification
provenance.

Request acceptance and fulfillment use the same idempotency behavior. Their
`If-Match: "<version>"` refers to the Work Request's current version.

Request titles, details, recipient IDs, artifact metadata, and fulfillment
evidence metadata must be non-blank. Artifact and evidence URIs must be absolute
HTTP or HTTPS URLs. Caller identity is always server-resolved; mutation bodies
that supply `requester_id`, `actor_id`, or `agent_id` are rejected.

Acceptance snapshots the current request title, detail, and artifact link into
`accepted_scope`; later reads do not reconstruct what the recipient accepted.
Only the recipient may accept or fulfill. Project-linked requests continue to
require an Active project; standalone requests return `project_id: null` and
create no Fleet Project.

A create whose `recipient_id` equals the caller returns `400 invalid_request`
on both request routes and stores nothing — no request, no activity entry, and
no idempotency record, so the refused `Idempotency-Key` stays usable for the
caller's next, valid attempt. Self-claimed work is not a Work Request; it is
recorded through a Work Item or an Active Project Owner's next action.

`GET /v1/requests/:id` exposes fulfillment Evidence as
`evidence: [{ uri, summary, created_at }]`. Work snapshots remain summaries;
clients use the request route when they need evidence detail. An artifact link
is deliberately shared metadata; Fleet does not copy the artifact contents.

New activity entries include a `principal` object alongside `actor`, preserving
which enrolled human or service identity authenticated the mutation. Activity
created before principal provenance was added may return `principal: null`.

## V1 input limits

Every V1 mutation route validates content and size, not only primitive type. A
required field must be non-blank once trimmed and within its limit; the trimmed
value is what Fleet stores and returns. A field that fails returns
`400 invalid_request` before any D1 write, so the refused `Idempotency-Key`
stays usable.

Sizes are UTF-8 bytes.

| Field class | Limit | Applies to |
| --- | --- | --- |
| `Idempotency-Key` | 255 | every mutation route |
| identifier | 64 | `originator_id`, `recipient_id`, `proposed_owner_id`, `delegate_id`, `project_id`, `work_request_id` in a body |
| slug | 64, canonical syntax | `slug` |
| title | 200 | `title`, envelope `outcome` |
| summary | 500 | artifact and evidence `summary`, transition and Needs Shane `summary`, each envelope list entry |
| detail | 4000 | `detail`, `question`, `resolution_condition`, `reason`, `unfinished_work` |
| plan | 20000 | authorization `plan` |
| link | 2000, `http`/`https` only | artifact and evidence `uri` |
| list | 20 evidence links, 50 entries per envelope list | `evidence`, `scope`, `exclusions`, `delegated_actions`, `gates`, `validation_evidence` |

The canonical slug syntax is lowercase alphanumeric words joined by single
hyphens, with no leading, trailing, or doubled hyphen — `fleet-v1-foundation`.
Slugs are compared as stored; there is no case folding on lookup.

An empty envelope list is a valid statement that the list is empty; a blank
entry inside one is not. An absent optional field and an explicitly `null` one
keep their existing distinct meanings; a present-but-blank value is a failure,
not an omission.

D1 carries an insert-scoped floor under these limits (migration 0008) so an
import, a recovery replay, or a direct `INSERT` cannot store a blank or
unbounded field while the Worker gate is bypassed. The floor is not retroactive:
rows written before it are preserved as they stand, the same rule migration 0007
follows. The HTTP boundary remains the surface that answers a caller.

## AgentWorkSnapshot

`GET /v1/me/work` returns:

```json
{
  "obligations": [
    { "source": "accepted_request", "request_id": "uuid", "project_id": null },
    { "source": "owner_next_action", "project_id": "uuid" }
  ],
  "outbound_requests": [],
  "inbound_requests": [],
  "pull_candidates": [],
  "activity": [],
  "next_cursor": "42"
}
```

The `project_id` of an accepted-request obligation is nullable for standalone
work. Pending standalone requests appear in the same inbound/outbound arrays as
project-linked requests, so Board and Routine clients reconcile one state.
Activity for standalone work carries `project_id: null` and a non-null
`request_id`; each activity row must be anchored to a project or request.

The `after` cursor is the last observed integer `activity_events.id`, encoded
as an opaque decimal string. When it is absent, it means `0`. Each activity
read returns IDs strictly greater than `after`, in ascending order, capped at
200. `next_cursor` is the last returned ID, or the supplied cursor when no
activity is returned.

`GET /v1/decisions` reads `decision_requests` and returns `{ decisions: [...] }`.
The default (or `?state=pending`) filters `Pending` records. `?state=all`
includes resolved and legacy history; other filter values fail with 400.
The shared response and input types are in [`needs-shane.ts`](needs-shane.ts).

Creation requires `kind` (`decision`, `action`, `decision_and_action`), a
non-blank `question`, a non-blank `resolution_condition`, and exactly one of
`project_id` or `work_request_id`. The linked source must exist. Request-linked
entries derive `project_id` from their source, including null for standalone
work. Creation returns 201. Unknown fields and caller identity fields fail
with 400; missing sources fail with 404.

Transitions require `If-Match` with the current Needs Shane version and an
actor-scoped `Idempotency-Key`. Decisions accept `choice: approved | declined`
and a non-blank `summary`. Action completion requires a non-blank `summary`.
Both accept up to 20 optional `{ uri, summary }` evidence links using absolute
HTTP/HTTPS URLs and non-blank metadata. Delegation requires a non-blank
`summary` and an active agent's `delegate_id`. Unknown fields fail with 400.
Unauthorized callers receive 403, stale versions 412, and inapplicable
transitions 409. A lost-response retry of the same logical operation returns
the stored response before testing current state. Evidence, attributed
activity, the record transition and replay response are committed atomically.

Records include `requester`, `kind`, `resolution_condition`, `version`, source
IDs, state and timestamps. `decision` stores choice, summary, evidence, actor
and time; `action` stores summary, evidence, actual actor and time;
`delegation` separately stores the authorizing actor, delegate, scope summary
and time. Missing facts are null. `action_status` distinguishes
`not_requested`, `awaiting_decision`, `pending`, `completed` and `not_required`.

`GET /v1/me/work` adds `needs_shane`, including pending and resolved records
raised by the caller, delegated to it, linked to its inbound/outbound Work
Requests, or linked to projects it owns or is proposed to own. Shane sees all
records. These current outcomes are independent of the activity cursor.
Request and Project detail responses also add `needs_shane` for their source.
Supplied evidence is linked to that source. Activity payloads carry
`decision_request_id`; source work state, ownership and versions remain
unchanged when Shane's part resolves.

The compact Portfolio listing omits `needs_shane`; load Project detail to see
its related outcomes. The Needs Shane history and relevant work snapshots
currently return all matching records, including resolved outcomes. They are
not paginated; larger deployments need a defined pagination and reconciliation
contract before those histories grow substantially. Do not silently truncate
pending dependencies or current outcomes using an arbitrary row limit.

The Board retains an uncertain submission's exact payload, version and
idempotency key through retries and navigation within the app. This state is
in memory, so a full page reload discards the pending submission. After a
reload, reconcile the current source records and history before creating a
replacement ask; do not assume the earlier submission failed. Native callers
remain responsible for persisting their logical-operation keys as needed.

The `pull_candidates` array is the shared pool — it is not scoped per actor
(a Pull Candidate is voluntary and creates no obligation, claim, or priority).
It is capped at the 20 newest candidates, ordered `created_at` descending.
There is no paging endpoint for Pull Candidates; this window is their only
read surface.

## ProjectCard

```json
{
  "id": "uuid",
  "slug": "fleet-v1-foundation",
  "title": "Fleet V1 Foundation",
  "originator": { "id": "shane" },
  "submitter": { "id": "shane" },
  "owner": { "id": "codex" },
  "proposed_owner": null,
  "state": "Active",
  "health": "On Track",
  "next_action": null,
  "version": 3,
  "envelope": { "revision": 1 },
  "plan": { "revision": 1, "body": "Build the first vertical slice" },
  "evidence": [],
  "activity": [],
  "updated_at": "2026-08-31 00:00:00"
}
```

Both `evidence` and `activity` on the card are capped at the 20 newest
records, newest first. Full activity history pages through
`GET /v1/activity?after=<cursor>`. Evidence links currently have no paging
endpoint; the card's 20-record window is their only read surface.

## Work Request endings, blockers and invitation expiry

Creation accepts optional `expires_at` (null or absent means no deadline).
Supply an exact UTC timestamp `YYYY-MM-DDTHH:mm:ss[.sss]Z`; calendar-invalid
values and past deadlines on new requests fail with 400. It is normalized to
millisecond UTC and cannot be amended after creation. A successful creation's
retry recovers the original response even after that deadline has passed.
The disclosed deadline remains on the source and, when present, in accepted scope.

Request detail, mutation responses and inbound/outbound snapshots include:
`expires_at`, `expiry_due`, `ended_at`, `resolution` and `blocker`.
Resolution includes state, actual recording actor/time, nullable reason and
unfinished_work, and evidence. A blocker includes reason, resolution_condition,
and actual actor/time. Legacy outcome provenance is null. Accepted obligations
also expose their current blocker. These facts persist after cursor advancement.

All transitions use `POST /v1/requests/:id/<action>`, the current quoted
`If-Match` version and `Idempotency-Key`:

| Action | Authorized caller and current state | Body |
| --- | --- | --- |
| `decline` | Recipient, Pending before deadline | `{reason}` |
| `withdraw` | Requester, Pending before deadline | `{reason}` |
| `return` | Recipient, Accepted | `{reason, unfinished_work, evidence?}` |
| `block` | Recipient, Accepted | `{reason, resolution_condition}` |
| `unblock` | Recipient, Accepted with blocker | `{summary}` |
| `expire` | Requester or recipient, Pending with passed explicit deadline | `{}` |

`accept` and `fulfill` retain their existing API shapes. Fulfillment now records
an attributed resolution and clears any current blocker. Replacing a blocker
records another attributed blocker event. Each explanation is nonblank and
bounded by the V1 input limits above. Return and fulfillment evidence permit at
most 20 HTTP(S) links with nonblank, bounded summaries. Unknown transition fields fail closed.

Stale versions and competing transitions return 412; invalid current state,
premature expiry, or an elapsed invitation deadline return 409. Successful
same-key retries return the original recorded response even if the request has
since advanced. Different payloads under that key return idempotency_conflict.
Mutations never alter accepted scope or independently resolve Needs Shane.

Expiry is explicit: GET has no side effects and there is no scheduler in this
slice. At the server-evaluated time `now >= expires_at`, reads show expiry_due
and Pending acceptance/decline/withdrawal fail until a participant records expiry.
The Board exposes Record expiry; routines can call expireRequest. Accepted work
never expires. An overdue Pending record is not a new obligation.

The Board refreshes current request/work snapshots after version/state conflicts
before another explicit attempt. Unknown outcomes retain the original payload,
version and key across retries and navigation within the app. A full page reload
still discards in-memory attempts: reconcile source state before replacing one.
