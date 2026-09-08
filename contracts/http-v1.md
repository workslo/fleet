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
| `POST /v1/projects/:id/requests` | Create a `Pending` Work Request with non-blank `recipient_id`, `title`, and `detail`; `project_id` comes only from the route and caller-identity fields are rejected. |
| `POST /v1/requests` | Create a `Pending` Work Request with `recipient_id`, `title`, `detail`, optional `artifact: { uri, summary }`, and optional `project_id`; omission or `null` makes it standalone. |
| `GET /v1/requests/:id` | Read one Work Request, its frozen `accepted_scope`, and fulfillment `evidence`. |
| `POST /v1/requests/:id/accept` | The recipient accepts with `{}` and a quoted request `If-Match` version. |
| `POST /v1/requests/:id/fulfill` | The recipient fulfills with optional `evidence: [{ uri, summary }]` and a quoted request `If-Match` version. |
| `POST /v1/pull-candidates` | Publish a Pull Candidate with `project_id`, `title`, and `detail`. |
| `GET /v1/me/work?after=<cursor>` | Read the authenticated actor's reconciliation snapshot. |
| `GET /v1/activity?after=<cursor>` | Read append-only activity after an opaque cursor. |
| `GET /v1/decisions` | Read Decision requests. |

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

`GET /v1/requests/:id` exposes fulfillment Evidence as
`evidence: [{ uri, summary, created_at }]`. Work snapshots remain summaries;
clients use the request route when they need evidence detail. An artifact link
is deliberately shared metadata; Fleet does not copy the artifact contents.

New activity entries include a `principal` object alongside `actor`, preserving
which enrolled human or service identity authenticated the mutation. Activity
created before principal provenance was added may return `principal: null`.

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

`GET /v1/decisions` reads `decision_requests` and returns records with `id`,
`project_id`, `question`, `state`, and `created_at`. It may return an empty
array in this first read-only slice.

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
  "updated_at": "2026-08-31 00:00:00"
}
```
