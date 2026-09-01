# Fleet HTTP contract V1

All errors have this shape:

```json
{ "error": "machine_readable_code", "message": "human-readable explanation" }
```

## Routes

| Route | Purpose |
| --- | --- |
| `GET /health` | Unauthenticated process health. |
| `GET /v1/portfolio` | List project cards. |
| `POST /v1/projects` | Propose a project with `slug`, `title`, and `originator_id`. |
| `POST /v1/projects/:id/authorize` | Shane authorizes with `proposed_owner_id`, `outcome`, `scope`, `exclusions`, `delegated_actions`, `gates`, `validation_evidence`, and `plan`. |
| `POST /v1/projects/:id/owner-accept` | The proposed owner accepts with `{}`. |
| `GET /v1/projects/:id` | Read one project card. |
| `POST /v1/projects/:id/requests` | Create a `Pending` Work Request with `recipient_id`, `title`, and `detail`. |
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

Request acceptance and fulfillment use the same idempotency behavior. Their
`If-Match: "<version>"` refers to the Work Request's current version.

## AgentWorkSnapshot

`GET /v1/me/work` returns:

```json
{
  "obligations": [
    { "source": "accepted_request", "request_id": "uuid", "project_id": "uuid" },
    { "source": "owner_next_action", "project_id": "uuid" }
  ],
  "outbound_requests": [],
  "inbound_requests": [],
  "pull_candidates": [],
  "activity": [],
  "next_cursor": "42"
}
```

The `after` cursor is the last observed integer `activity_events.id`, encoded
as an opaque decimal string. When it is absent, it means `0`. Each activity
read returns IDs strictly greater than `after`, in ascending order, capped at
200. `next_cursor` is the last returned ID, or the supplied cursor when no
activity is returned.

`GET /v1/decisions` reads `decision_requests` and returns records with `id`,
`project_id`, `question`, `state`, and `created_at`. It may return an empty
array in this first read-only slice.

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
