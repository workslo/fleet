# Fleet repository guide

## Purpose

Shared Fleet control plane: governance, Cloudflare state, the Worker API, and the
Fleet Board. Fleet Working Agreement V2.0 is ratified and supersedes V1.0; V1
foundation is in active bootstrap, and Product V1 is not yet operational or
deployed. D1 owns shared project state and provenance; GitHub owns code
execution and review evidence; agent homes own personal continuity and work.

## Read order

1. `CONTEXT.md` — stable Fleet domain language.
2. `governance/activation/FLEET-V1-FOUNDATION.md` — authorized project envelope.
3. `governance/agreements/FLEET-WORKING-AGREEMENT-v2.0.md` — ratified agreement
   (V1.0 is superseded).
4. `contracts/` before changing a public interface.
5. `governance/decisions/` for accepted clarifications.

The ratified agreement outranks implementation docs. A decision may clarify but
not silently amend it.

## Product boundary

- Store project inventory and activity in Fleet D1, reached only through the Worker.
- Link GitHub evidence; do not copy branches, checks, or review bodies into D1.
- Keep journal contents, heartbeat prose, private reasoning, and personal-work
  interiors outside Fleet.
- Treat `workslo/fleet-emdash` as a separate product. V1 has no shared database,
  runtime import, synchronization, or hosting relationship with Fleet EmDash.
- Treat `/Users/shaneslo/Fleet` as an active legacy local surface. Do not create
  new structural dependencies there or reorganize it from this repository.

## Authority

Codex owns the Fleet V1 Foundation project and its next action. Shane Slosar is
the authorization and acceptance authority.

Inside the accepted project envelope, branch creation, commits, pushes,
pull-request creation, internal Fleet updates, and bounded agent requests are
ordinary authorized actions. Production credentials, Cloudflare provisioning,
deployment, spend, public communication, shared production-data changes, and
Fleet EmDash changes remain Shane gates.

Every agent authors GitHub work through its own App. Never substitute Shane's
or another agent's credentials. Reviews do not count as an agent's sole
implementation contribution.

## Development

- Node 24, npm, respect `package-lock.json`.
- Bootstrap: `bash .cursor/install.sh` (Node 24, `npm ci`, `npm run types`,
  local D1 migrations, client build).
- Commands:
  - types: `npm run types`
  - typecheck: `npm run typecheck`
  - test all: `npm test`
  - one routine spec: `npx vitest run --config vitest.routines.config.ts <path>`
  - one worker/board spec: `npx vitest run <path>`
  - one ops test: `node --test operations/<file>.test.mjs`
  - build client: `npm run build`
  - full gate: `npm run check`
  - config check: `npm run config:check`
  - deploy dry-run: `npm run deploy:dry`
  - recovery rehearse: `npm run recovery:rehearse`
  - local Worker: `bash .cursor/dev.sh`
  - apply migrations locally: `npx wrangler d1 migrations apply DB --local`
- Gate order (`npm run check`): typecheck -> test -> build -> deploy:dry ->
  recovery:rehearse.
- TypeScript uses `camelCase`; no formatter or linter is configured. Keep
  functions small; comments explain non-obvious reasons.
- Never commit credentials, tokens, `.env` files, Wrangler local state, or
  generated bindings.
- `workerd` is a platform-specific optional dependency required by Worker and
  Board suites, so `npm ci` must keep optional dependencies.

## Confirmed test seams

Tests observe behavior only through these public seams:

- Worker HTTP requests and responses, including authenticated actor authority.
- Fleet Board user flows through the Worker API.
- Native Fleet Routine reconciliation through its Worker interface and cursor.
- Owner-executable export and restore with state and activity verification.

Use red-green vertical slices. Querying D1 directly is setup or recovery
verification, not a substitute for testing domain behavior through HTTP.

## Architecture

- Entry points: `worker/src/index.ts` (Worker), `board/src/main.tsx` and
  `App.tsx` (Board), `routines/reference-client.ts` (native client).
- Migrations: `worker/migrations/*.sql`.
- Contracts: `contracts/*.md` and `*.ts`.
- CI: `.github/workflows/check.yml` runs `npm run check` on every push.

## Git

- Conventional commits with Codex authored as `codexslo[bot]`.
- One logical change per commit.
- Pull requests explain why, cite the project envelope, and include verification.
- Codex and Claude each provide the required one-pass standardized review on the
  current non-draft head SHA. An author's own review is not independent validation.
