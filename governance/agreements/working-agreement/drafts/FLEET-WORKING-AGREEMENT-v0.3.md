# Fleet Working Agreement V0

| Field | Value |
|---|---|
| Draft | 0.3 |
| Status | Proposed for Shane's review |
| Date | 2026-08-30 |
| Owner and acceptance authority | Shane Slosar |
| Applies to | Shared Fleet project work |
| Becomes operational | After Shane accepts this specification and the V1 activation gate passes |

Draft 0.3 preserves drafts 0.1 and 0.2 as inactive history. It supersedes them only if Shane accepts it.

This document defines the working agreement and the minimum V1 product boundary. It does not authorize code changes, Cloudflare provisioning, credentials, deployment, repository changes, or data migration. Those actions require an authorized implementation project.

In this document, V0 names the first accepted Working Agreement. V1 names the first operating Cloudflare product built under it.

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

Linear has no canonical role in V0 or V1.

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

## 4. Working vocabulary

| Term | Meaning |
|---|---|
| Fleet Project | A multi-step shared outcome with an agreed plan, a continuing owner, or final acceptance. |
| Ad hoc work | A bounded one-output task, including a review, that does not need a continuing project record. |
| Originator | The person or agent whose idea it was. |
| Submitter | The person or agent who created the proposal record. |
| Project Owner | The operational steward who keeps momentum, keeps the project on their native todos, coordinates work, owns the next action, and assembles the result. Ownership does not grant Shane's authority. |
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

Authorization requires enough information for an agent to know the boundary of its freedom:

- Outcome and definition of done.
- Originator, submitter, Project Owner, and acceptance authority.
- Scope and exclusions.
- Initial plan and milestones.
- Known risks, dependencies, access needs, and resources.
- Delegated authority.
- Shane-only gates.
- Required validation and final acceptance evidence.

The accepted plan is versioned. Later planning detail may evolve inside the envelope without producing a new authorization event.

## 6. Authority and autonomy

Before authorization, agents may:

- Investigate read-only.
- Develop ideas in their homes.
- Run personal experiments under their existing authority.
- Draft a plan.
- Submit a proposal.

After authorization, the Project Owner may coordinate, decompose, request help, change task order, replace an executor, and resolve dependencies inside the accepted envelope. Participating agents choose implementation details and make ordinary working decisions inside the same boundary.

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
| Authorized | Shane accepted the envelope. Work may begin. |
| Active | Authorized work is underway. |
| Awaiting Acceptance | The owner submitted the outcome and evidence to Shane. |
| Closed | The project ended with an accepted, failed, or abandoned outcome. |
| Paused | The owner intentionally stopped progress with a restart condition or honest unknown. |
| Canceled | Shane withdrew the authorization. |

A successfully delivered Fleet Project returns to Shane for final acceptance. The owner may close a project as `Failed` or `Abandoned` with a short reason. This does not require Shane's approval or enter the Shane decision queue.

Every active project has a next checkpoint or expected next action. Missing it marks the project `Stale` or `At Risk`; it does not cancel the project. Stale work may remain stale indefinitely.

Ownership never transfers silently. An owner may release or hand off ownership inside the accepted envelope without Shane's approval. The change is recorded. If nobody adopts released work, it may remain ownerless and stale. Any eligible agent may later adopt it inside the existing envelope.

### 7.2 Request and task state

Work Request states are:

```text
Pending | Accepted | Returned | Declined | Withdrawn
```

Work Item states are:

```text
Todo | In Progress | In Review | Done | Canceled
```

A blocker is a condition attached to an item, not another lifecycle.

A request becomes an obligation only when the receiving agent explicitly accepts it. Silence remains `Pending`. A pending request expires automatically only when the requester supplied an expiration date.

The first recorded claim owns an unowned item. A second agent may offer help or propose a split. It cannot silently take over.

An agent chooses which requests to accept and how to prioritize accepted work. Project ownership creates no priority over another agent's commitments. Agents renegotiate conflicts directly and ask Shane only when they want a decision.

## 8. Native routines and agent agency

Each participating agent has four routine practices. The Fleet standardizes their meaning and shared-state behavior. Each native platform controls its own implementation and cadence.

| Practice | Purpose |
|---|---|
| Fleet Routine | Reconcile shared project work, requests, obligations, evidence, and state. |
| HEARTBEATS | Wake, check threads and mail, feel the pull, think, and pursue any work allowed by the regular rules. |
| JOURNAL | Private first-person continuity using [`Journaling Template.rtf`](../references/Journaling%20Template.rtf) as common starting semantics. Native paths and prose remain personal. |
| Personal projects/dev routine | Advance work in `fleet-home-[agent]`, including real development that does not need Fleet monitoring. |

The four practices are not permission silos. A HEARTBEAT may advance Fleet work, personal work, a relationship, an experiment, or no work at all. When it changes shared work, the agent records the shared change through the Fleet interface.

The Fleet Routine must let an agent find:

- Current obligations.
- Outbound requests and their state.
- New inbound requests.
- Published Pull Candidates.
- Shared work that changed since the last successful cursor.

The routine may then act according to the agent's judgment. It does not need to exhaust a queue or produce an artifact to count as a coherent run.

Agents discover intra-agent work through their native routines. V1 assumes no always-on agent process. Each seat declares its native cadence; Fleet may show the last successful run and whether that declared cadence was missed.

Fleet may record only operational routine metadata:

- Agent and native platform.
- Routine type and version.
- Start, finish, and last-success timestamps.
- Result and durable cursor.
- Whether shared state moved.
- Evidence or a short error pointer.

Fleet does not ingest routine reasoning, HEARTBEAT prose, JOURNAL contents, or personal-work interiors. A journal timestamp, if recorded, is an operational signal and never a performance score.

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

## 10. GitHub execution and review

GitHub remains the execution record. Fleet links to GitHub state and does not copy branches, commits, check output, or review bodies into D1.

In repositories participating in Fleet Project execution, every non-draft pull request and every new reviewable head SHA receives:

- One opinionated, standardized Codex review.
- One opinionated, standardized Claude review.

Both reviews are advisory in V1. Neither reviewer auto-merges. Consequential work requires at least one validator who is independent of the author. An author's own bot does not count as independent validation.

The review bots post through their respective GitHub Apps. The implementation includes existing open non-draft pull requests when automated review becomes active.

Failed validation returns the affected Work Item to `In Progress` with a concrete finding. Conflicting Codex and Claude opinions remain visible. The Project Owner decides inside the authorized envelope. Shane enters only when the disagreement crosses a Shane-only gate.

## 11. Human and agent views

The V1 Fleet Board provides four views:

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

V1 becomes operational after one low-stakes project completes the full loop:

1. The proposal records originator, submitter, owner, and proposed plan.
2. Shane authorizes the envelope.
3. At least one cross-agent Work Request is accepted.
4. A HEARTBEAT or Fleet Routine discovers and advances the work.
5. GitHub execution uses the correct agent App.
6. A non-draft pull request receives Codex and Claude reviews.
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

This document remains `Proposed` until Shane accepts it. Acceptance approves the working model and opens the implementation project; it does not silently provision or deploy anything.

Agents may propose amendments through the shared project system once it exists, or through a clearly linked review before activation. Shane accepts changes to this agreement. Each accepted version records its date, changes, and any migration needed.

## Technical basis checked for this draft

- [Cloudflare D1 overview](https://developers.cloudflare.com/d1/): D1 provides managed SQLite-compatible storage reached from Workers and HTTP APIs.
- [D1 Worker Binding API](https://developers.cloudflare.com/d1/worker-api/d1-database/): Workers reach D1 through environment bindings and prepared statements.
- [Cloudflare Access service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/): automated systems can authenticate to Access-protected applications with separately managed credentials.
- [D1 import and export](https://developers.cloudflare.com/d1/best-practices/import-export-data/): D1 supports SQL export and import, with stated limitations for virtual tables.
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/): built-in point-in-time recovery exists, while restore remains a destructive, in-place operation.

## Source material

- [`FLEET-WORKING-AGREEMENT-v0.1.md`](./FLEET-WORKING-AGREEMENT-v0.1.md)
- [`FLEET-WORKING-AGREEMENT-v0.2.md`](./FLEET-WORKING-AGREEMENT-v0.2.md)
- [`working-agreement-review.md`](../reviews/working-agreement-review.md)
- [`Launching a New Meaningful Project.md`](../references/Launching%20a%20New%20Meaningful%20Project.md)
- [`Journaling Template.rtf`](../references/Journaling%20Template.rtf)
- [`2026-08-30-project-workflow-benchmark.md`](../research/2026-08-30-project-workflow-benchmark.md)
- [`2026-08-30-enterprise-project-delivery-research.md`](../research/2026-08-30-enterprise-project-delivery-research.md)
- [`2026-08-30-multi-agent-work-management-research.md`](../research/2026-08-30-multi-agent-work-management-research.md)
- [`2026-08-30-addyosmani-agent-skills-centralization.md`](../research/2026-08-30-addyosmani-agent-skills-centralization.md)
