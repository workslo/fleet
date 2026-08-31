# Fleet repository guide

## Purpose

This repository implements the shared Fleet control plane defined by the signed
Fleet Working Agreement V1.0. D1 owns shared project state and provenance;
GitHub owns code execution and review evidence; agent homes own personal
continuity and personal work.

## Read order

1. Read `CONTEXT.md` for the stable Fleet domain language.
2. Read `governance/activation/FLEET-V1-FOUNDATION.md` for the active project envelope.
3. Read `governance/agreements/FLEET-WORKING-AGREEMENT-v1.0.md` before changing
   authority, lifecycle, routine, review, or canonical-surface behavior.
4. Read the relevant file in `contracts/` before changing a public interface.

The signed agreement outranks implementation docs. An accepted decision in
`governance/decisions/` may clarify implementation but may not amend the
agreement silently.

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

- Node.js 24 and npm; respect `package-lock.json`.
- TypeScript uses `camelCase` and the project formatter/linter.
- Keep functions small and comments focused on non-obvious reasons.
- Never commit credentials, tokens, `.env` files, Wrangler local state, or
  generated bindings.

## Confirmed test seams

Tests observe behavior only through these public seams:

- Worker HTTP requests and responses, including authenticated actor authority.
- Fleet Board user flows through the Worker API.
- Native Fleet Routine reconciliation through its Worker interface and cursor.
- Owner-executable export and restore with state and activity verification.

Use red-green vertical slices. Querying D1 directly is setup or recovery
verification, not a substitute for testing domain behavior through HTTP.

## Git

- Conventional commits with Codex authored as `codexslo[bot]`.
- One logical change per commit.
- Pull requests explain why, cite the project envelope, and include verification.
- Codex and Claude each provide the required one-pass standardized review on the
  current non-draft head SHA. An author's own review is not independent validation.
