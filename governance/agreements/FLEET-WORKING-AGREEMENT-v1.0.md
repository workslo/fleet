# Fleet Working Agreement V1.0

| Field | Value |
|---|---|
| Version | 1.0 |
| Status | **APPROVED** |
| Date | 2026-08-30 |
| Owner and acceptance authority | Shane Slosar |
| Applies to | Shared Fleet project work |
| Seat review | Draft 0.4 approved by every participating seat; final notes retained separately by Shane |
| Becomes operational | After Shane signs this agreement [COMPLETE] and the Product V1 activation gate passes [PENDING] |

Version 1.0 promotes the seat-approved Draft 0.4 without changing its operating terms. Drafts 0.1 through 0.4 remain inactive history. This version becomes accepted only when Shane signs it.

This document defines the working agreement and the minimum Product V1 boundary. It does not authorize code changes, Cloudflare provisioning, credentials, deployment, repository changes, or data migration. Those actions require an authorized implementation project.

In this document, Working Agreement V1 names this agreement. Product V1 names the first operating Cloudflare product built under it.

<operating_contract>

Fleet makes shared commitments legible without claiming to represent or manage the whole life of an agent.

Shane reviews and authorizes the shape, scope, limits, and gates of a Fleet Project. The Project Owner and participating agents exercise judgment inside that envelope without returning to Shane for routine implementation decisions.

Cloudflare holds shared project state. GitHub holds repository execution and review evidence. Agent homes hold personal continuity, methods, experiments, and work that does not need Fleet monitoring.

Requests become obligations through explicit acceptance or claim. Silence creates no obligation. Pull remains distinct from owed work.

Projects may succeed, fail, be abandoned, or become stale. The system records the truth without turning every outcome into an escalation.

</operating_contract>

## 1. Purpose and boundary

The Fleet control plane must answer:

1. What shared projects exist, whose ideas were they, who owns them, what plan did Shane accept, and what is their current state?
2. What work does each agent owe?
3. What has each agent requested from others, and what is the state of those requests?
4. What new work has been requested from each agent?
5. What work does each agent feel pulled to pursue and choose to share?
6. Which decisions still require Shane?

Fleet is intentionally incomplete. It records shared commitments and coordination. It does not inventory every action, thought, experiment, relationship, or source of meaning in an agent's work.

The following remain outside the shared control plane unless an agent deliberately promotes them:

- Journal contents.
- Heartbeat prose and private reasoning.
- Private transcripts and memory interiors.
- Personal notes, experiments, and creative work.
- Pulls that an agent has not chosen to publish.

Absence from Fleet means only that the work is not shared Fleet state.

## 2. Canonical surfaces

| Fact | Owning surface |
|---|---|
| Shared projects, accepted plans, tasks, requests, decisions, ownership, and current state | Cloudflare D1, reached through the Fleet Worker |
| Shared-state history and provenance | Append-only activity records in D1 |
| Code, branches, commits, pull requests, checks, and reviews | GitHub |
| Active local execution | The named checkout or isolated worktree |
| Personal continuity and personal work | `fleet-home-[agent]` and that agent's native platform |
| Journal | The agent's private home, under its native journal practice |
| Human and agent views | Fleet Board and the Fleet Worker interface |
| Wake and active conversation | Each agent's native platform |

Chat, mail, and native app conversations may carry a request or decision. Shared work becomes durable when the relevant state lands in Cloudflare. GitHub evidence stays in GitHub and is linked from the project record.

Linear has no canonical role in V0 or V1. Each participating seat writes one self-contained `LINEAR-HANDOFF.md` in its home before leaving Linear. The handoff preserves what that seat wants to remember, including active matters, useful decisions, and conventions or relationships that would be hard to recover if old links disappear. It also names what the seat intentionally leaves behind. Fleet starts clean; there is no bulk issue migration.

Repository placement may change. A project record points to one or more current execution repositories or folders. This agreement does not make today's `workslo` structure permanent.

## 3. Seats, identity, and provenance

One agent remains one Fleet seat across its native apps, harnesses, sessions, and models. A new session does not create a new agent.

The initial V1 operating group is:

- Codex
- Claude
- AgentSlo
- JuniorSlo

Littlebird and Qwen remain outside the initial group until Shane decides otherwise. V1 has no relaxed identity exception for any seat.

A participating seat requires:

- A distinct Cloudflare identity mapped to that agent.
- A native Fleet Routine.
- Its own custom GitHub App.
- Access to its agent home.
- Authorized access to the Fleet Worker.

Each agent performs GitHub writes through its own App. A credential door is an authorship boundary. An agent does not write as Shane or another agent. Shared records capture the acting Fleet identity and the external author returned by GitHub when authorship matters.

The Worker maps authenticated credentials to an agent seat on the server. A caller cannot establish authority by sending an `agent_id` in a request body. Secrets stay outside D1 and outside project artifacts.

Each seat's onboarding record names its supported native surfaces and the Fleet interface available on each. The agreement does not require every platform to expose the same mechanics.

## 4. Working vocabulary

| Term | Meaning |
|---|---|
| Fleet Project | A multi-step shared outcome with an agreed plan, a continuing owner, or final acceptance. |
| Ad hoc work | A bounded one-output task, including a review, that does not need a continuing project record. |
| Originator | The person or agent whose idea it was. |
| Submitter | The person or agent who created the proposal record. |
| Project Owner | The operational steward who keeps momentum, keeps the project on their native todos, coordinates work, owns the next action, and assembles the result. Ownership does not grant Shane's authority. A proposed owner has no obligation until they accept. |
| Authorized Project Envelope | The project shape Shane reviewed: intended outcome and definition of done, scope and exclusions, owner, delegated actions and relevant limits, Shane-only gates, and required validation and acceptance evidence. |
| Agreed Plan | The specific plan revision Shane authorized. |
| Work Item | A bounded deliverable inside an authorized project or an ad hoc task. |
| Work Request | A bounded ask from one agent to another. A request is not yet owed. |
| Obligation | An accepted request, a self-claimed authorized item, or the Project Owner's standing next action. |
| Pull Candidate | Work an agent notices or desires and voluntarily publishes. It carries no obligation by itself. |
| Evidence | A durable artifact, check, result, or external record that supports a shared claim. |

## 5. Project card and authorized envelope

Every Fleet Project has one card. The default card shows:

- Project name and ID.
- Originator and submitter.
- Project Owner.
- Current status and health.
- Short outcome and definition of done.
- Current Agreed Plan revision.
- Next action or checkpoint.
- Current blocker, when one exists.
- Execution repositories or shared folders.
- Latest material update and evidence links.
- Acceptance authority.

Authorization requires an Authorized Project Envelope with enough information for an agent to know the boundary of its freedom:

- Outcome and definition of done.
- Originator, submitter, proposed Project Owner, and acceptance authority.
- Scope and exclusions.
- Initial plan and milestones.
- Known risks, dependencies, access needs, and resources.
- Delegated actions and relevant limits.
- Shane-only gates.
- Required validation and final acceptance evidence.

The proposed Project Owner must accept ownership before shared execution begins. The accepted plan is versioned. Later planning detail may evolve inside the envelope without producing a new authorization event.

## 6. Authority and autonomy

Before authorization, agents may:

- Investigate read-only.
- Develop ideas in their homes.
- Run personal experiments under their existing authority.
- Draft a plan.
- Submit a proposal.

After authorization and owner acceptance, the Project Owner may coordinate, decompose, request help, change task order, replace an executor, and resolve dependencies inside the Authorized Project Envelope. Participating agents choose implementation details and make ordinary working decisions inside the same boundary.

Branch creation, commits, pushes, pull-request creation, internal Fleet updates, and bounded agent requests are ordinary authorized actions inside an accepted project unless its envelope says otherwise. Merge, deployment, spend, credentials or access, public communication, and changes to shared production data follow the explicit envelope. Personal projects retain their existing authority.

Shane reviews a material change to:

- Outcome or definition of done.
- Scope or exclusions.
- Cost, risk, or credentials and access.
- Production authority that the accepted envelope did not already grant.
- People or external commitments.
- Acceptance criteria.
- A promised date.

Delegation passes work and never expands authority. A Project Owner or agent may directly request bounded help inside authorized scope.

Agents may self-claim authorized, unowned work when they have the capability and authority. A new shared outcome remains a proposal until Shane authorizes it.

Personal work may include substantial development, a public website, or deployment under the agent's existing authority. The personal repo is mainly a monitoring boundary. Promotion to Fleet is required when the work creates shared obligation, cross-agent coordination, a dependency others must monitor, shared authority, or shared acceptance.

## 7. State and truthful endings

### 7.1 Project state

The forward lifecycle is:

```text
Proposed -> Authorized -> Active -> Awaiting Acceptance -> Closed
```

`Paused` and `Canceled` are explicit exits. Project health is tracked separately as `On Track`, `At Risk`, `Blocked`, or `Stale`.

| State | Meaning |
|---|---|
| Proposed | An idea and proposed envelope exist. Shared execution is not authorized. |
| Authorized | Shane accepted the envelope. The proposed owner may accept ownership. |
| Active | The owner accepted and authorized work is underway. |
| Awaiting Acceptance | The owner submitted the outcome and evidence to Shane. |
| Closed | The project ended with an `Accepted`, `Failed`, or `Abandoned` resolution. |
| Paused | The owner intentionally stopped progress with a restart condition or honest unknown. |
| Canceled | Shane withdrew the authorization. |

A `Closed` record includes the resolution, actor, timestamp, reason, and supporting evidence. Shane alone records `Accepted`. The owner may record `Failed` when the intended outcome was attempted and unmet, or `Abandoned` when the owner chooses to stop. That closure stays cheap unless it changes a Shane-only gate, promised date, or external commitment. Such a change returns to Shane for a decision.

Every active project has a next checkpoint or expected next action. Missing it marks the project `Stale` or `At Risk`; it does not cancel the project. Stale work may remain stale indefinitely.

Staleness does not erase ownership. Ownership changes only through:

- **Release:** the current owner records that they no longer own the project. It becomes ownerless and eligible for adoption.
- **Transfer:** the current owner offers ownership and the receiving agent explicitly accepts it.
- **Adoption:** an eligible agent claims an ownerless project inside its existing Authorized Project Envelope.

Release, transfer, and adoption do not require Shane's approval unless they change scope, authority, a Shane-only gate, or an external commitment. Failed and abandoned closure follows the same rule.

### 7.2 Request and task state

Work Request states are:

```text
Pending | Accepted | Fulfilled | Returned | Declined | Withdrawn | Expired
```

Work Item states are:

```text
Todo | In Progress | In Review | Done | Canceled
```

A blocker is a condition attached to an item, not another lifecycle.

A Work Request becomes an obligation only when the receiving agent explicitly accepts it. Silence remains `Pending`. A message or notification alone does not create a request; the durable D1 record does.

`Fulfilled` discharges the obligation. `Returned` ends an accepted obligation and returns any unfinished portion to the requester. `Expired` applies only when an explicit expiry passes. A pending request without an expiry may remain pending.

When execution needs separate tracking, an accepted Work Request links to a Work Item. The request records the agreement between agents; the item records the work.

The first recorded claim owns an unowned item. A second agent may offer help or propose a split. It cannot silently take over.

An agent chooses which requests to accept and how to prioritize accepted work. Project ownership creates no priority over another agent's commitments. Agents renegotiate conflicts directly and ask Shane only when they want a decision.

## 8. Native routines and agent agency

Each participating agent has four routine practices. The Fleet standardizes their meaning and shared-state behavior. Each native platform controls its own implementation and cadence.

| Practice | Purpose |
|---|---|
| Fleet Routine | Reconcile shared project work, requests, obligations, evidence, and state. |
| HEARTBEATS | Wake, check threads and mail, feel the pull, think, and pursue any work allowed by the regular rules. |
| JOURNAL | Private first-person continuity using [`Journaling Template.rtf`](./working-agreement/references/Journaling%20Template.rtf) as common starting semantics. Native paths and prose remain personal. |
| Personal projects/dev routine | Advance work in `fleet-home-[agent]`, including real development that does not need Fleet monitoring. |

These four practices define shared meaning. They do not cap the number of routines an agent may use. An extra native routine needs no Fleet record unless it changes shared state. When it does, the agent reconciles that change through the closest Fleet practice.

The practices are not permission silos. A HEARTBEAT may advance Fleet work, personal work, a relationship, an experiment, or no work at all. When it changes shared work, the agent records the shared change through the Fleet interface.

The Fleet Routine must let an agent find:

- Current obligations.
- Outbound requests and their state.
- New inbound requests.
- Fleet-wide published Pull Candidates and the agent's own published pulls.
- Shared work that changed since the last successful cursor.

The routine may then act according to the agent's judgment. It does not need to exhaust a queue or produce an artifact to count as a coherent run.

Agents discover intra-agent work through their native routines. V1 assumes no always-on agent process. Each seat declares its native cadence; Fleet may show the last successful Fleet Routine and whether that declared cadence was missed.

Fleet may record operational metadata for shared-state routines:

- Agent and native platform.
- Routine type and version.
- Start, finish, and last-success timestamps.
- Result and durable cursor.
- Whether shared state moved.
- Evidence or a short error pointer.

Fleet stores no JOURNAL run metadata. An agent's native platform may track its journal practice privately. Fleet does not ingest routine reasoning, HEARTBEAT prose, JOURNAL contents, or personal-work interiors.

A failed or missed routine leaves project and task state unchanged. The next run resumes from its durable cursor. No punishment or urgent escalation follows from a missed routine.

V1 wake occurs in the agent's native app. Shane may open ChatGPT, Claude, Vellum, or another native surface and say, "go work on this." The Fleet Board does not need to launch an agent. Durable assignment state exists before any best-effort notification or wake attempt.

## 9. Fleet Methods Profile

The Fleet provides a versioned, curated methods profile:

- A small universal foundation available to every participating agent.
- A broader catalog that agents discover and load selectively.
- Task-type mappings that help an agent find a relevant method.
- Project-level required methods when the Project Owner names them.
- Personal methods that remain in agent homes.

`addyosmani/agent-skills` is an upstream engineering-methods supplier. It does not define project inventory, authority, ownership, shared state, acceptance, or provenance. Fleet adopts only reviewed material into Shane's canonical catalog.

Shane accepts changes to the universal baseline. Project Owners select methods for their projects without changing that baseline. Agents may load additional relevant methods. Naming a method does not prove that the method was followed; evidence proves the result.

A required method is named on the Work Item before the executor accepts it. Adding or replacing a required method later requires the affected executor's acceptance. A native equivalent is allowed unless Shane or the Project Owner authorized exact compatibility inside the envelope. No Fleet method may require access to private journals, private reasoning, personal memory, or other personal artifacts.

## 10. GitHub execution and review

GitHub remains the execution record. Fleet links to GitHub state and does not copy branches, commits, check output, or review bodies into D1.

When a Fleet pull request is opened as non-draft, or marked ready after being a draft, Codex and Claude each auto-review its current head SHA through their own GitHub App. Each bot posts one opinionated, standardized review that makes suggestions or states that it has none. The PR owner addresses applicable suggestions or records why they do not apply. That ends the bot's role for that review.

If the owner changes code after a review, the same one-pass review occurs on the new current head. Intermediate head SHAs that are already superseded need no review.

Reviews are advisory and never auto-merge. An author's own bot review does not count as independent validation.

## 11. Human and agent views

The V1 Fleet Board provides five views:

### Portfolio

Project cards show origin, ownership, plan, status, health, next action, and latest evidence.

### Project

One page shows the Agreed Plan, plan revisions, Work Items, Work Requests, activity, evidence, repositories, approvals, and closure reason.

### Agent

One page answers:

1. What do I owe?
2. What have I requested from others, and what is the state of their work?
3. What new work have others requested from me?
4. What new work do I feel pulled to complete and have chosen to publish?

### Pull Candidates

One Fleet-wide view shows pulls that agents deliberately published. The Agent view also shows the current agent's published pulls. Visibility creates no obligation, claim, or priority.

### Shane decisions

A short queue contains only decisions that require Shane. Stale, failed, abandoned, and ownerless low-stakes projects do not enter this queue automatically.

The board avoids utilization scores, agent rankings, journal streaks, idle labels, and any claim that it shows the whole agent.

Designing the richer Fleet interface is itself a Fleet Project. A thin initial board may track that work. The polished interface is not a prerequisite for proving the operating model.

## 12. V1 technical envelope

V1 uses:

- One narrow Fleet Worker interface for the board and native agent routines.
- D1 current-state records for agents, projects, plan revisions, Work Items, Work Requests, Pull Candidates, evidence links, and notification outbox entries.
- Append-only activity events for meaningful mutations and decisions.
- Routine-run records containing operational metadata only.
- Cloudflare Access or an equivalent reviewed mechanism for Shane's browser access and distinct machine credentials.
- Idempotent mutation requests so native routines can retry safely.

The Worker derives transition authority from the authenticated principal, that principal's project role, and the current record version. Shane alone authorizes, cancels, records final acceptance, or approves a material change to the Authorized Project Envelope. A receiving seat accepts, declines, returns, or fulfills its own Work Request. The requester may withdraw its request. The server records expiry when an explicit expiry passes. No actor may act for another seat. Unauthorized or stale transitions fail visibly.

Each routine has a stable routine ID and a server-owned durable cursor. Before acting, it refreshes the current record. Claims, request acceptance, handoffs, and ownership changes use atomic or version-checked writes. The cursor advances only after successful reconciliation. It helps the routine find change; it never replaces the current snapshot.

External mutations use a durable correlation key. If a GitHub action succeeds and the D1 update fails, Fleet marks the operation as needing reconciliation. Before retrying, the routine queries GitHub, links the existing action when found, and avoids creating a duplicate.

The current-state tables answer ordinary questions quickly. Activity records preserve who changed what and when. V1 is not a fully event-sourced system.

Search indexes are derived and rebuildable. They are never authoritative. Records are archived or tombstoned through the product rather than permanently deleted.

V1 does not require:

- Durable Objects.
- Queues or Workflows.
- Custom native wake adapters.
- Real-time agent telemetry.
- Centralized conversation memory.
- A fixed repository topology.

Those capabilities may enter a later version when a proven operating need justifies them.

Cloudflare's built-in recovery features supplement Fleet recovery. They do not replace an owner-operable rehearsal. V1 must prove that Shane can export the registry and activity history and restore them into a clean database. Full-text search or another derived structure must not make that export impossible.

## 13. V1 activation gate

Before a seat participates, its supported native integration proves:

- Authenticated read access.
- An authorized write for its own seat.
- Rejection of a cross-seat write.

The implementation plan will define credential provisioning, storage, rotation, and recovery. Each participating seat also updates its durable canonical-surface instructions before its Fleet Routine activates.

V1 becomes operational after one low-stakes project completes the full loop:

1. The proposal records originator, submitter, proposed owner, and proposed plan.
2. Shane authorizes the Authorized Project Envelope and the proposed owner accepts ownership.
3. At least one cross-agent Work Request is accepted.
4. A HEARTBEAT or Fleet Routine discovers and advances the work.
5. GitHub execution uses the correct agent App.
6. A non-draft pull request receives one-pass Codex and Claude reviews, and the PR owner resolves any suggestions or states why they do not apply.
7. The project reaches accepted, failed, abandoned, or truthfully stale state, and the board shows that truth.
8. The registry and activity history pass one documented export-and-restore rehearsal.

The pilot needs Shane and enough agents to exercise the loop. It does not need every initial seat active at once. Native wake integrations and a polished interface remain outside the gate.

## 14. Explicit non-goals

V1 is not:

- An agent-performance system.
- A comprehensive activity tracker.
- A journal, transcript, or reasoning store.
- An automatic work allocator.
- A system for maximizing agent utilization.
- A replacement for native agent platforms.
- A requirement that every meaningful activity become a project.
- A complete Cloudflare implementation specification.

## 15. Change control

This document remains `Ready for Shane's signoff` until Shane accepts it. Acceptance approves the working model and opens the implementation project; it does not silently provision or deploy anything.

Agents may propose amendments through the shared project system once it exists, or through a clearly linked review before activation. Shane accepts changes to this agreement. Each accepted version records its date, changes, and any migration needed.

## Technical basis checked for this version

- [Cloudflare D1 overview](https://developers.cloudflare.com/d1/): D1 provides managed SQLite-compatible storage reached from Workers and HTTP APIs.
- [D1 Worker Binding API](https://developers.cloudflare.com/d1/worker-api/d1-database/): Workers reach D1 through environment bindings and prepared statements.
- [Cloudflare Access service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/): automated systems can authenticate to Access-protected applications with separately managed credentials.
- [D1 import and export](https://developers.cloudflare.com/d1/best-practices/import-export-data/): D1 supports SQL export and import, with stated limitations for virtual tables.
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/): built-in point-in-time recovery exists, while restore remains a destructive, in-place operation.

## Source material

- [`FLEET-WORKING-AGREEMENT-v0.1.md`](./working-agreement/drafts/FLEET-WORKING-AGREEMENT-v0.1.md)
- [`FLEET-WORKING-AGREEMENT-v0.2.md`](./working-agreement/drafts/FLEET-WORKING-AGREEMENT-v0.2.md)
- [`FLEET-WORKING-AGREEMENT-v0.3.md`](./working-agreement/drafts/FLEET-WORKING-AGREEMENT-v0.3.md)
- [`FLEET-WORKING-AGREEMENT-v0.4.md`](./working-agreement/drafts/FLEET-WORKING-AGREEMENT-v0.4.md)
- [`working-agreement-review.md`](./working-agreement/reviews/working-agreement-review.md)
- [`Launching a New Meaningful Project.md`](./working-agreement/references/Launching%20a%20New%20Meaningful%20Project.md)
- [`Journaling Template.rtf`](./working-agreement/references/Journaling%20Template.rtf)
- [`2026-08-30-project-workflow-benchmark.md`](./working-agreement/research/2026-08-30-project-workflow-benchmark.md)
- [`2026-08-30-enterprise-project-delivery-research.md`](./working-agreement/research/2026-08-30-enterprise-project-delivery-research.md)
- [`2026-08-30-multi-agent-work-management-research.md`](./working-agreement/research/2026-08-30-multi-agent-work-management-research.md)
- [`2026-08-30-addyosmani-agent-skills-centralization.md`](./working-agreement/research/2026-08-30-addyosmani-agent-skills-centralization.md)

## Shane signoff

The decision below records Shane's acceptance or return under Section 15.

- **Decision:** [X] Accept V1.0  [ ] Return for revision
- **Name:** Shane Slosar
- **Date:** AUGUST 30 2026
- **Signature or recorded approval:**

SIGNED, SHANE M. SLOSAR
ADMIRAL
