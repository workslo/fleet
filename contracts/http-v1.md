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

Mutation requests require an `Idempotency-Key`. Repeating a key with the same
authenticated actor, request path, method, and payload returns the stored
response; reuse with a different payload fails. Versioned transitions also
require `If-Match: "<version>"` set to the current project version.

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
