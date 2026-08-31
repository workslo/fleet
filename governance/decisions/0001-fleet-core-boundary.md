# Decision 0001: Fleet Core repository and product boundary

- **Status:** Accepted
- **Date:** August 31, 2026
- **Authority:** Shane Slosar

## Decision

`workslo/fleet` is the shared Fleet control-plane repository. Its sole canonical
checkout is `/Users/shaneslo/github/workslo/fleet`.

The repository owns governance, contracts, Worker code, D1 migrations, the
Fleet Board, and owner-operable operations documentation. Live project
inventory belongs in D1 rather than repository files.

`/Users/shaneslo/Fleet` remains an active legacy local surface. Established
workflows may continue there, but Fleet V1 creates no new structural dependency
under that path and performs no migration from it in this project.

`workslo/fleet-emdash` remains a separate product. Fleet Projects may link its
issues, pull requests, and repositories as execution evidence. V1 does not
share databases, bindings, credentials, deployments, packages, or runtime state
with Fleet EmDash.

`workslo/fleet-ops` remains untouched during the first vertical slice. Neutral
Worker/D1 mechanics may be adapted with provenance; its Linear-first model is
not imported.

