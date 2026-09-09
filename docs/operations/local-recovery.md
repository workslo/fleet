# Local recovery rehearsal

This runbook is for Shane or a developer checking that Fleet's current schema
and behavior survive a database export and restore. The command creates its own
synthetic records and fresh local databases. It does not take an existing
database as input.

## Run it

From the Fleet checkout, using Node.js 24 and the committed dependency lock:

```sh
npm ci
npm run recovery:rehearse
```

The command bundles the actual Worker source locally with esbuild and runs it
against a disposable local D1 database. It uses this local bundle, rather than
the Wrangler deployment artifact. It
creates representative shared work through authenticated HTTP requests, exports
the database with the installed Wrangler, and imports the SQL into a separate
clean local database. It then checks the restored state and behavior. No
Cloudflare account login or participant credential is needed.

The runner checks installed Wrangler, esbuild and Miniflare versions against the
lockfile and records them in the receipt. The latter two come from the existing
dependency tree; a future toolchain update may require adapting this rehearsal.

Every invocation writes a fresh directory under `recovery-runs/` in this
checkout. The command prints that directory and the outcome. Keep its
`report.json`, SQL export, and comparison manifests together when recording a
rehearsal result. These generated artifacts are ignored by Git.

The aggregate `npm run check` also runs the rehearsal, after the existing
tests, type checks, Board build and Wrangler dry run.

## Inspect the restored Board

```sh
npm run build
npm run recovery:rehearse -- --serve
```

After verification, `--serve` starts a loopback-only Board backed by the restored
database and prints its URL. Open it to inspect the recovered Project, My Work,
and Needs Shane records. The session uses synthetic identities generated for
this rehearsal. Stop it with Ctrl-C when finished.

## What constitutes a passing rehearsal

- The source and restored schemas match, including indexes and triggers.
- Every application table has matching row counts and logical content digests;
  foreign-key checks pass.
- Actual Worker reads preserve ownership, frozen accepted scope, current
  blockers, request endings, Needs Shane outcomes, evidence and activity.
- Retrying an already recorded mutation with its original key returns the
  recorded response without duplicate activity.
- A fresh authorized mutation succeeds after recovery and produces a later
  activity cursor.

A SQL file existing on disk or matching table counts alone is insufficient.
The report records the source revision and individual verification results.
The comparison includes migration bookkeeping and SQLite's sequence counters.
It excludes only Miniflare's `_cf_METADATA` engine table, which is not exported
Fleet data; the manifest records that exclusion.
For owner evidence, also record who ran the command and what they observed in
the Board; an agent's run does not establish that Shane performed the rehearsal.

## Failure and scope

A failed assertion or command makes the rehearsal exit unsuccessfully. Preserve
the failed run directory for diagnosis. Its `failure.json` records the stage and
the runner's assertion reason; external error content is withheld. Directories
containing `helper-test.json` are helper-test fixtures, not rehearsal results.
Run again to obtain fresh databases;
do not turn a failed receipt into a passing one by editing its fields.

The runner accepts only `--serve`. It has no remote mode, existing-database
selector, credential input, or destructive cleanup command. It retains its
generated state and exports so they can be inspected.

This proves local recovery mechanics with synthetic data. It does not establish
production backup coverage, remote import behavior, real Access authentication,
native Routine participation, Shane's acceptance, or Product V1 activation.
Before any production restore, the owner must separately authorize the exact
source, destination, credentials, retention, downtime and verification plan.

The underlying SQL export/import commands follow Cloudflare's
[D1 import and export guidance](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
and [Wrangler D1 command reference](https://developers.cloudflare.com/workers/wrangler/commands/d1/).
