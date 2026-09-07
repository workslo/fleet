# Fleet V1 Foundation Implementation Plan

> **Archived implementation record — do not execute.** This dated foundation
> plan is preserved as history and contains superseded test-authentication and
> Board examples. Current behavior is governed by `contracts/authority-v1.md`,
> `contracts/http-v1.md`, `contracts/routine-v1.md`, and maintained onboarding
> documentation.

**Goal:** Build a local, testable Fleet control-plane slice that makes one project and one cross-agent commitment legible through a Worker API and thin Board.

**Architecture:** A TypeScript Cloudflare Worker is the sole API boundary over D1. The React/Vite Board consumes only `/v1/*`; native Fleet Routines consume the same JSON contracts with a durable activity cursor. Current-state rows and append-only activity are written in one D1 transaction, while GitHub remains an external evidence surface rather than copied state.

**Tech Stack:** Node.js 24, npm, TypeScript 7.0.2, Cloudflare Workers and D1 via Wrangler 4.127.1, `@cloudflare/vitest-plugin` 1.1.2, Vitest 4.1.11, Vite 8.2.2, `@cloudflare/vite-plugin` 1.54.2, `@vitejs/plugin-react` 6.1.1, React and React DOM 19.2.8, `@types/react` 19.2.18, `@types/react-dom` 19.2.5, `@types/node` 26.4.0, Testing Library 16.3.3, user-event 14.6.6, jsdom 30.0.1, and Playwright 1.62.1.

**Spec:** `governance/activation/FLEET-V1-FOUNDATION.md`

## Global Constraints

- The signed `governance/agreements/FLEET-WORKING-AGREEMENT-v1.0.md` is the authority.
- `CONTEXT.md` is a stable glossary, not an implementation-status surface.
- D1 owns shared state and provenance; GitHub owns code and review evidence.
- Actor identity comes only from a verified principal mapping, never an actor ID supplied as the caller.
- Local tests use controlled RS256 signing keys, a fixed Access-shaped issuer and JWKS, and explicitly enrolled test principals; the production Worker contains no test-authentication branch and checked-in placeholders fail closed with HTTP 503.
- Every POST requires `Idempotency-Key`; mutation of an existing record also requires `If-Match: "<version>"`.
- Work Requests create no obligation until the recipient explicitly accepts.
- An Obligation is derived and must not be stored as its own table.
- Current-state mutation and its append-only activity event are atomic.
- The first slice does not deploy, provision Cloudflare resources, alter Fleet EmDash, migrate `/Users/shaneslo/Fleet`, or activate Littlebird/Qwen.
- Each Fleet agent authors its contribution with its own GitHub App. Codex cannot substitute for that contribution.

## File map

- `worker/src/index.ts`: Worker entry and route composition only.
- `worker/src/http.ts`: JSON/error/idempotency/optimistic-concurrency HTTP mechanics.
- `worker/src/auth.ts`: verified-principal lookup and Shane-only authorization.
- `worker/src/projects.ts`: project proposal, authorization, owner acceptance, and project-card query.
- `worker/src/work.ts`: requests, fulfillment, Pull Candidates, agent work, and activity cursor.
- `worker/src/types.ts`: public domain and environment types shared by Worker modules.
- `worker/migrations/0001_fleet_v1.sql`: V1 current-state, revision, evidence, activity, and idempotency schema.
- `worker/test/*.spec.ts`: behavior through Worker HTTP only; direct D1 use is fixture setup.
- `board/src/api.ts`: typed fetch client; no D1 or Cloudflare binding access.
- `board/src/App.tsx`: top-level view routing.
- `board/src/views/*`: Portfolio, Project, My Work, Pull Candidates, and Shane Decisions views.
- `contracts/*.md`: public state, authority, HTTP, and Routine meanings.
- `docs/operations/local-recovery.md`: owner-executable local export/restore rehearsal.

---

### Task 1: Project lifecycle and project card

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `wrangler.jsonc`
- Create: `worker/migrations/0001_fleet_v1.sql`
- Create: `worker/src/types.ts`
- Create: `worker/src/http.ts`
- Create: `worker/src/auth.ts`
- Create: `worker/src/projects.ts`
- Create: `worker/src/index.ts`
- Create: `worker/test/apply-migrations.ts`
- Create: `worker/test/project-lifecycle.spec.ts`
- Create: `worker/test/tsconfig.json`
- Create: `contracts/state-v1.md`
- Create: `contracts/authority-v1.md`
- Create: `contracts/http-v1.md`

**Interfaces:**
- Consumes: Fleet terms from `CONTEXT.md` and authority from the signed agreement.
- Produces: `GET /health`, `GET /v1/portfolio`, `POST /v1/projects`, `POST /v1/projects/:id/authorize`, `POST /v1/projects/:id/owner-accept`, and `GET /v1/projects/:id`.
- Produces: `ProjectCard` with `id`, `slug`, `title`, `originator`, `submitter`, `owner`, `proposed_owner`, `state`, `health`, `next_action`, `version`, `envelope`, `plan`, `evidence`, and `updated_at`.

- [ ] **Step 1: Write failing lifecycle tests**

Use HTTP helpers that attach `X-Fleet-Principal`, `Idempotency-Key`, and `If-Match`. Cover these exact behaviors:

```ts
it("fails closed when production authentication is not configured", async () => {
  const response = await apiRequest("/v1/projects/missing", { authMode: "production" });
  expect(response.status).toBe(503);
});

it("proposes, authorizes, accepts ownership, and returns the project card", async () => {
  const proposed = await postAs("shane", "/v1/projects", {
    slug: "fleet-v1-foundation",
    title: "Fleet V1 Foundation",
    originator_id: "shane",
  });
  expect(proposed.status).toBe(201);

  const authorized = await mutateAs(
    "shane",
    `/v1/projects/${projectId}/authorize`,
    1,
    { proposed_owner_id: "codex", outcome: "Deliver Fleet V1", scope: ["Worker", "D1", "Board"], exclusions: ["deploy"], delegated_actions: ["branch", "commit", "push", "pull_request"], gates: ["production Cloudflare"], validation_evidence: ["local Worker tests"], plan: "Build the first vertical slice" },
  );
  expect(authorized.status).toBe(200);

  const accepted = await mutateAs("codex", `/v1/projects/${projectId}/owner-accept`, 2, {});
  expect(accepted.status).toBe(200);

  const card = await getAs("codex", `/v1/projects/${projectId}`);
  expect(await card.json()).toMatchObject({ state: "Active", owner: { id: "codex" }, plan: { body: "Build the first vertical slice" } });
});
```

Also prove: the portfolio lists the project; non-Shane authorization is 403; another actor cannot accept ownership; missing or reused-with-different-payload idempotency keys fail; exact replay returns the stored response; stale `If-Match` returns 412; each accepted mutation creates one attributed activity event.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- worker/test/project-lifecycle.spec.ts`

Expected: FAIL because the Worker modules and schema do not exist.

- [ ] **Step 3: Add package and Cloudflare configuration**

Use exact dependency versions from the plan header. Configure D1 binding `DB`, database name `fleet-state`, placeholder local database ID `00000000-0000-0000-0000-000000000000`, compatibility date `2026-08-31`, and SPA static assets from `dist/client`. Scripts must include `types`, `typecheck`, `test`, `build`, `deploy:dry`, and `check`.

- [ ] **Step 4: Add the minimal schema**

Create normalized tables for `actors`, `actor_principals`, `projects`, `project_envelope_revisions`, `plan_revisions`, `evidence_links`, `activity_events`, and `idempotency_records`. Seed active actors `shane`, `codex`, `claude`, `agentslo`, and `juniorslo` plus test principals of the same names. Use foreign keys, constrained lifecycle strings, unique `(project_id, revision)`, monotonically increasing integer activity IDs, and a `version` integer on mutable rows.

- [ ] **Step 5: Implement HTTP, identity, and project behavior**

Use prepared statements and small single-purpose functions. The caller is the actor resolved from `actor_principals(provider='test', subject=<header>)`. Proposal records submitter from that caller. Authorization requires actor `shane`; it appends envelope revision 1 and plan revision 1, proposes an owner, changes state to `Authorized`, increments version, and emits `project.authorized`. Owner acceptance requires the proposed owner, changes state to `Active`, installs the owner, increments version, and emits `project.owner_accepted`.

- [ ] **Step 6: Document the frozen V1 contract**

`state-v1.md` defines lifecycle names and derived Obligation semantics. `authority-v1.md` defines caller resolution, Shane-only transitions, owner consent, and fail-closed production auth. `http-v1.md` lists the exact routes, request fields, response shape, `Idempotency-Key`, `If-Match`, and error object `{ "error": string, "message": string }`.

- [ ] **Step 7: Run focused and repository gates**

Run: `npm test -- worker/test/project-lifecycle.spec.ts`

Expected: PASS.

Run: `npm run typecheck && npm run deploy:dry`

Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vite.config.ts vitest.config.ts tsconfig.json tsconfig.node.json wrangler.jsonc worker contracts
git commit -m "feat: add Fleet project lifecycle"
```

---

### Task 2: Requests, obligations, Pull Candidates, and Routine cursor

**Files:**
- Modify: `worker/migrations/0001_fleet_v1.sql`
- Create: `worker/src/work.ts`
- Modify: `worker/src/index.ts`
- Modify: `worker/src/types.ts`
- Create: `worker/test/work-reconciliation.spec.ts`
- Modify: `contracts/state-v1.md`
- Modify: `contracts/http-v1.md`
- Create: `contracts/routine-v1.md`

**Interfaces:**
- Consumes: authenticated actor, idempotency, concurrency, project IDs, and activity writer from Task 1.
- Produces: `POST /v1/projects/:id/requests`, `POST /v1/requests/:id/accept`, `POST /v1/requests/:id/fulfill`, `POST /v1/pull-candidates`, `GET /v1/me/work?after=<cursor>`, `GET /v1/activity?after=<cursor>`, and `GET /v1/decisions`.
- Produces: `AgentWorkSnapshot { obligations, outbound_requests, inbound_requests, pull_candidates, activity, next_cursor }`.

- [ ] **Step 1: Write failing reconciliation tests**

```ts
it("does not create an obligation until the recipient accepts", async () => {
  const requested = await postAs("codex", `/v1/projects/${projectId}/requests`, {
    recipient_id: "claude",
    title: "Add authority tests",
    detail: "Prove cross-seat writes are rejected",
  });
  expect(requested.status).toBe(201);
  expect(await myWork("claude")).toMatchObject({ obligations: [], inbound_requests: [{ state: "Pending" }] });

  await mutateAs("claude", `/v1/requests/${requestId}/accept`, 1, {});
  expect(await myWork("claude")).toMatchObject({ obligations: [{ source: "accepted_request", request_id: requestId }] });
});
```

Also prove: requester sees outbound state; non-recipient cannot accept/fulfill; fulfillment removes the derived obligation and preserves evidence; Pull Candidate creates no obligation; project owner always sees a standing `owner_next_action` obligation while the project is Active; `after` returns only later activity and advances `next_cursor`; repeated POST replay is stable.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- worker/test/work-reconciliation.spec.ts`

Expected: FAIL because request and reconciliation routes do not exist.

- [ ] **Step 3: Extend the schema and implement work reconciliation**

Add `work_requests`, `pull_candidates`, `decision_requests`, and request evidence through `evidence_links`. Request states are `Pending`, `Accepted`, `Fulfilled`, `Declined`, and `Withdrawn`, but this slice exposes only create, accept, and fulfill. Derive obligations in SQL/TypeScript from accepted requests plus active-project owner next actions. Never write an obligations row. The first read-only Decisions response may be empty, but it must come from the real `decision_requests` table and expose `id`, `project_id`, `question`, `state`, and `created_at`.

- [ ] **Step 4: Implement cursor semantics**

Treat the cursor as the last observed integer `activity_events.id`; absent means `0`. Return activity where `id > cursor`, ordered ascending, capped at 200, with `next_cursor` equal to the last returned ID or the supplied cursor. A Routine can persist only that opaque decimal string on its native platform.

- [ ] **Step 5: Document the Routine contract**

Define the four required questions: owed work, outbound requests and state, new inbound requests, and Pull Candidates. State that HEARTBEAT/JOURNAL prose and personal-work interiors never enter Fleet. Include retry guidance: reuse the same idempotency key for the same logical write and never advance the cursor before native persistence succeeds.

- [ ] **Step 6: Run focused and repository gates**

Run: `npm test -- worker/test/work-reconciliation.spec.ts`

Expected: PASS.

Run: `npm run typecheck && npm test`

Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add worker contracts
git commit -m "feat: add Fleet work reconciliation"
```

---

### Task 3: Thin Fleet Board

**Files:**
- Create: `index.html`
- Create: `board/src/main.tsx`
- Create: `board/src/App.tsx`
- Create: `board/src/api.ts`
- Create: `board/src/styles.css`
- Create: `board/src/views/PortfolioView.tsx`
- Create: `board/src/views/ProjectView.tsx`
- Create: `board/src/views/MyWorkView.tsx`
- Create: `board/src/views/PullCandidatesView.tsx`
- Create: `board/src/views/DecisionsView.tsx`
- Create: `board/test/App.spec.tsx`
- Create: `board/test/setup.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: Task 1 project-card JSON and Task 2 `AgentWorkSnapshot` only through fetch.
- Produces: Portfolio, Project, My Work, Pull Candidates, and Shane Decisions views with no D1 imports or Fleet EmDash runtime dependency.

- [ ] **Step 1: Write failing Board behavior tests**

Using Testing Library 16.3.3, user-event 14.6.6, and jsdom 30.0.1, mock fetch at the API boundary and prove:

```tsx
it("shows project provenance, ownership, plan, state, health, next action, and evidence", async () => {
  render(<App principal="codex" />);
  await userEvent.click(await screen.findByRole("link", { name: "Fleet V1 Foundation" }));
  expect(await screen.findByText("Originator: Shane Slosar")).toBeVisible();
  expect(screen.getByText("Owner: Codex")).toBeVisible();
  expect(screen.getByText("State: Active")).toBeVisible();
  expect(screen.getByText("Health: On Track")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Agreed plan" })).toBeVisible();
});
```

Also prove My Work visibly separates obligations, outbound requests, inbound requests, and Pull Candidates; empty views explain what the absence means; errors remain visible with a retry action.

- [ ] **Step 2: Run the Board test and verify RED**

Run: `npm test -- board/test/App.spec.tsx`

Expected: FAIL because the Board does not exist.

- [ ] **Step 3: Implement the typed API client and views**

Use semantic HTML, keyboard-reachable navigation, visible focus, system fonts, and responsive CSS. Keep API writes out of the first Board slice; transitions remain callable by API while the UI is read-focused. Do not add charts, rankings, utilization, drag-and-drop Kanban, wake controls, journal content, heartbeat prose, conversations, GitHub review bodies, uploads, realtime subscriptions, or Fleet EmDash integration.

- [ ] **Step 4: Run Board and repository gates**

Run: `npm test -- board/test/App.spec.tsx`

Expected: PASS.

Run: `npm run build && npm run typecheck && npm test && npm run deploy:dry`

Expected: all exit 0 and the Worker serves SPA assets plus `/api`/`/v1` routes without collision.

- [ ] **Step 5: Commit**

```bash
git add index.html board package.json package-lock.json vite.config.ts
git commit -m "feat: add thin Fleet Board"
```

---

### Task 4: Bootstrap record and local recovery rehearsal

**Files:**
- Create: `worker/test/bootstrap-and-recovery.spec.ts`
- Create: `scripts/rehearse-local-recovery.sh`
- Create: `docs/operations/local-recovery.md`
- Modify: `package.json`
- Modify: `governance/activation/FLEET-V1-FOUNDATION.md`
- Modify: `governance/activation/README.md`

**Interfaces:**
- Consumes: the complete local API and D1 migration.
- Produces: a reproducible local import of the pre-D1 project provenance plus an owner-executable export, empty-target restore, count check, project-card check, activity-cursor check, and cleanup.

- [ ] **Step 1: Write the failing bootstrap and recovery test**

Propose and activate `fleet-v1-foundation` through HTTP with Shane and Codex principals. Attach the activation file and initial Git commit as evidence links. Assert the project card identifies Shane as originator/submitter, Codex as owner, and records that the project predates D1.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- worker/test/bootstrap-and-recovery.spec.ts`

Expected: FAIL until bootstrap provenance fields/evidence are accepted by the public API.

- [ ] **Step 3: Add the recovery rehearsal**

The shell script must use `set -euo pipefail`, `mktemp -d`, an exit trap, explicit local Wrangler database names, and no production flags. It exports the populated local database, creates an empty temporary target, applies migrations, imports the export, verifies table counts, starts or directly invokes the local Worker against the restored target, reads the project card, and proves an activity query after the saved cursor returns only later events. It must never use `rm -rf`; cleanup uses `rm -r` on the validated temporary directory.

- [ ] **Step 4: Document exact owner steps and evidence**

`local-recovery.md` names prerequisites, the single command `npm run recovery:rehearse:local`, expected success output, where temporary artifacts live, failure behavior, and the explicit statement that local success is not production recovery evidence.

- [ ] **Step 5: Run all gates**

Run: `npm run check && npm run recovery:rehearse:local`

Expected: all tests, types, build, dry deploy, export, restore, project-card, and cursor checks pass.

- [ ] **Step 6: Commit**

```bash
git add worker/test scripts docs/operations package.json package-lock.json governance/activation
git commit -m "test: rehearse Fleet local recovery"
```

---

### Task 5: Fleet-agent contribution integration

**Files:**
- Modify: `governance/activation/FLEET-V1-FOUNDATION.md`
- Create: `governance/activation/contributions/claude-acceptance.md`
- Create: `governance/activation/contributions/agentslo-acceptance.md`
- Create: `governance/activation/contributions/juniorslo-acceptance.md`
- Create: `worker/test/claude-authority-contribution.spec.ts`
- Create: `board/src/components/ProjectEvidencePanel.tsx`
- Create: `board/test/agentslo-project-evidence.spec.tsx`
- Create: `routines/reference-client.ts`
- Create: `routines/reference-client.spec.ts`

**Interfaces:**
- Consumes: bounded requests issued by Codex only after each agent's GitHub App can access `workslo/fleet`.
- Produces: at least one authored implementation contribution from Claude, AgentSlo, and JuniorSLO; each includes a request, explicit acceptance, commit/PR evidence, independent review, and integration result.

- [ ] **Step 1: Issue bounded voluntary requests**

Request these default lanes without creating obligations: Claude receives cross-seat and Shane-only HTTP authority tests in `worker/test/claude-authority-contribution.spec.ts`; AgentSlo receives the project evidence panel and its Board test; JuniorSLO receives the dependency-free TypeScript Routine reference client and its cursor/retry tests. The recipient may negotiate a smaller equivalent lane before accepting, but the accepted replacement must name its exact files and verification before work starts.

- [ ] **Step 2: Record explicit acceptance**

For each lane, record request text, recipient response, accepted scope, repository path, branch, and expected verification. Do not fabricate acceptance or write under another agent's identity.

- [ ] **Step 3: Integrate through normal GitHub execution**

Each agent uses its own App, opens a PR, receives the one-pass bot review, addresses applicable suggestions or states why not, and hands the PR back to Codex for integration judgment. A review-only action does not satisfy participation.

- [ ] **Step 4: Run the complete local gate and update activation evidence**

Run: `npm run check && npm run recovery:rehearse:local`

Expected: PASS after all accepted contributions are integrated. Record exact PR head SHAs and verification commands, without declaring Product V1 active.

- [ ] **Step 5: Commit**

```bash
git add governance/activation
git commit -m "docs: record Fleet V1 contributions"
```
