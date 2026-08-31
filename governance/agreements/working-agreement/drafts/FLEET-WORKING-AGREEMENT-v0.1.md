# Fleet Working Agreement v0.1

| Field | Value |
|---|---|
| Status | Proposed for Shane's review |
| Date | 2026-08-30 |
| Owner | Shane Slosar |
| Acceptance authority | Shane Slosar |
| Applies to | Fleet projects, agents, agent sessions, and shared work surfaces |
| Becomes active | Only after Shane accepts a reviewed version |

## Decision requested

Approve, revise, or reject this agreement as the Fleet's first shared work contract.

This version contains enough structure to run one project manually. It does not require new infrastructure. Linear, GitHub, and project worktrees can support the first pilot. A shared SQL coordination layer can follow after the manual process shows where automation helps.

<operating_contract>

Shane defines the outcome, authorizes meaningful work, retains consequential decisions, and accepts the final project result.

The project owner keeps the shared record current and coordinates the work.

Agents accept bounded tasks, work in the named project environment, report evidence, and stay within delegated authority.

Validators check evidence and results. An executor's statement that work is done does not complete a task.

Shared work is visible through canonical records. Chat history, private context, local files, and runtime status can support the record. They do not replace it.

</operating_contract>

## 1. Purpose

The Fleet needs one answer to five questions:

1. What work exists?
2. Who owns each outcome and task?
3. What is happening now?
4. Where are the work and evidence?
5. Which decisions require Shane?

The agreement gives Shane a clear working plan without making him the dispatcher for every task or the collector of every status update.

## 2. How work gets done

```text
Signal or idea
    -> Intake and triage
    -> Project proposal or existing-work update
    -> Shane authorizes, changes, parks, or declines
    -> Project owner decomposes the outcome into tasks
    -> Agents acknowledge and claim bounded assignments
    -> Agents execute in the named project environment
    -> Agents submit results and evidence
    -> Validators check task results
    -> Project owner integrates accepted tasks
    -> Project result is validated
    -> Shane accepts the outcome when required
    -> Project closes with evidence and remaining work recorded
```

Live coordination can show assignments, claims, blockers, heartbeats, and context pointers. Durable project records remain the authority for ownership, scope, decisions, acceptance, and history.

### 2.1 Minimum operating set

The Fleet needs six things to begin:

1. This agreement, reviewed and accepted.
2. One visible project register.
3. One project record for each active project.
4. One task contract for each assigned deliverable.
5. A status, evidence, validation, and decision trail on the canonical surfaces.
6. One supervised pilot that tests the full path from proposal through closure.

Everything else, including D1, automated routing, wake-ups, and generated dashboards, is an optional improvement after the pilot.

## 3. Operating principles

### 3.1 Shane controls outcomes and consequential actions

Agents operate independently inside an approved task contract. They stop when a decision exceeds that contract.

### 3.2 One fact has one authoritative home

The same status can appear in a digest or dashboard, but only one record owns it. Derived views must link back to that record.

### 3.3 Shared work leaves shared evidence

An artifact saved only in an agent's context or personal workspace has not been delivered to the Fleet.

### 3.4 Assignment requires acknowledgment

Writing an agent's name on a task does not prove that the agent saw or accepted it. The agent must acknowledge, claim, or reject the assignment.

### 3.5 Completion requires validation and acceptance

Execution, validation, integration, and acceptance are separate events. Small tasks may combine roles when the risk is low. Consequential work receives an independent check.

### 3.6 Manual operation comes first

The first pilot uses existing surfaces and manual updates. Automation follows observed friction.

### 3.7 Provenance is part of the result

The Fleet records who performed the work and which identity each external surface recorded. A signature in text does not replace platform authorship.

## 4. Common vocabulary

| Term | Definition |
|---|---|
| Project | A temporary body of coordinated work that produces an outcome and has an acceptance decision. |
| Workstream | A major branch of a project with its own owner or sequence. |
| Task | A bounded deliverable that one executor can complete and another party can validate. |
| Experiment | Time-bounded work that tests a hypothesis and can end with a negative result. |
| Operational routine | Repeated work triggered by a schedule or event. |
| Agent continuity work | Work on an agent's home, memory, methods, or identity. |
| Signal | An email, alert, message, observation, or system event that may require triage. |
| Proposal | A request to authorize a project or material change. |
| Assignment | A request for an agent to execute a task. |
| Claim | The executor's recorded commitment to perform the assignment. |
| Blocker | A condition that prevents progress inside the current task contract. |
| Dependency | Work, information, access, or a decision required by another task. |
| Owner decision | A decision reserved for Shane or the named project authority. |
| Evidence | A durable artifact, result, log, check, or external record that supports a claim. |
| Acceptance | An authorized decision that the delivered result satisfies the agreed outcome or task criteria. |

## 5. Roles

| Role | Responsibility |
|---|---|
| Shane, sponsor and final authority | Sets priority, authorizes meaningful projects, resolves consequential decisions, and accepts project outcomes when required. |
| Project owner | Owns the outcome, maintains the project record, coordinates tasks, manages dependencies, and assembles the final result. |
| Executor | Performs one bounded task and submits the result with evidence. |
| Contributor | Supplies a bounded dependency without owning the task result. |
| Validator | Checks the result and evidence against stated acceptance criteria. |
| Approver | Authorizes a consequential action or accepts a result. |
| Triage owner | Converts signals into an existing-work update, a proposal, a routine event, or no action. |

One person or agent may hold multiple roles. A consequential task should not use the same agent as executor and sole validator.

## 6. Shane's gates

### 6.1 Shane always decides

- Whether a meaningful new project becomes active.
- Material changes to priority, outcome, scope, cost, timing, or risk.
- Use of new credentials or changes to access boundaries.
- Purchases and commitments to outside parties.
- Destructive operations that could cause material or difficult-to-recover loss.
- Final acceptance when the project affects Shane, another person, production, money, or an external commitment.

### 6.2 Shane decides unless the project contract grants authority

- Merge or release.
- Deploy, provision, or change live infrastructure.
- Write to production or shared cloud data.
- Send external messages or publish content.
- Create, close, or materially change shared issues and project records.
- Reassign work outside the approved project plan.

### 6.3 Agents may act inside an approved contract

- Inspect authorized systems and gather evidence.
- Create and edit project files in the named workspace.
- Run focused tests, builds, and local validation.
- Update assigned task status and evidence.
- Ask for bounded assistance.
- Return, reject, or escalate work that exceeds capability or authority.

The project contract can grant broader or narrower authority. The grant must name the action, scope, surface, and limit.

## 7. Canonical surfaces

The following map is the proposed V0.1 default.

| Information | Canonical surface |
|---|---|
| Projects, tasks, owners, states, dates, and decisions | Linear |
| Code execution, branches, commits, pull requests, reviews, and checks | GitHub |
| Active local execution | The named project checkout or isolated worktree |
| Shared non-code deliverables | The named project repository or an explicitly named shared project folder |
| Agent continuity, private methods, and personal experiments | The agent's home or personal repository |
| Live assignment, claim, heartbeat, and escalation state | Manual task updates in V0.1; a shared coordination store may be added later |
| Fleet summaries | A derived Fleet Pulse that links to canonical records |

### 7.1 Surface rules

- Product deliverables do not live solely in an agent's personal repository.
- A local file is in progress until its canonical task links to it and the required evidence is available.
- A chat decision moves to the project record before it governs shared work.
- GitHub proves repository execution state. Linear proves the agreed project and task state.
- When surfaces disagree, refresh the live sources and record the resolution.

## 8. State model

### 8.1 Project lifecycle

```text
Proposed -> Ready -> Active -> Validating -> Awaiting Acceptance -> Closed
```

| State | Meaning | Entry requirement | Exit requirement |
|---|---|---|---|
| Proposed | An outcome has been requested but not authorized. | Proposal record exists. | Shane authorizes, parks, or declines it. |
| Ready | The project is authorized and can start. | Owner, outcome, definition of done, authority, surfaces, and initial plan exist. | Project owner starts execution. |
| Active | Authorized work is underway. | At least one task is claimed or active. | Required tasks are accepted and integration begins. |
| Validating | Accepted task results are being integrated and checked as one outcome. | Required task results exist. | Project result passes or affected work reopens. |
| Awaiting Acceptance | The result is ready for the named acceptance authority. | Validation evidence and remaining risks are recorded. | Approver accepts or returns the result. |
| Closed | The accepted outcome and project record are complete. | Acceptance, evidence, handoff, open items, and provenance are recorded. | No routine exit. Later benefits or follow-up work use linked records. |

`Parked` and `Canceled` are explicit exits. Project health is recorded separately as `On track`, `At risk`, or `Blocked`.

### 8.2 Task lifecycle

```text
Assigned -> Acknowledged -> Active -> In Review -> Accepted
```

| State | Meaning |
|---|---|
| Assigned | A bounded request has been sent to a named executor. |
| Acknowledged | The executor accepted the assignment and confirmed the task contract. |
| Active | The executor has claimed the work and is performing it. |
| In Review | The result and evidence were submitted to the validator. |
| Accepted | The validator or authorized task approver accepted the result. |

`Rejected`, `Returned`, `Blocked`, `Failed`, and `Canceled` are explicit exceptions. A runtime becoming idle or exhausting its turn budget does not change a task to `Accepted`.

### 8.3 Live agent state

If live coordination is introduced, agent or session status may use:

```text
Idle | Working | Waiting on dependency | Waiting on Shane | Error | Offline
```

Live status is telemetry. It does not prove task ownership, progress, validation, or completion.

## 9. Intake and project proposal

Any Fleet member may surface a signal or draft a proposal. Read-only investigation may support the proposal. Meaningful execution begins after authorization.

### 9.1 Triage outcome

Every signal receives one disposition:

- Link to an existing project or task.
- Create a project proposal.
- Create or trigger an approved operational routine.
- Record as reference with no action.
- Escalate to Shane because the correct disposition is unclear or consequential.

### 9.2 Project proposal template

```markdown
# Project proposal: [name]

- Proposal ID:
- Proposed outcome:
- Why this matters now:
- Requester:
- Proposed project owner:
- Definition of done:
- In scope:
- Out of scope:
- Expected deliverables:
- Known dependencies:
- Material risks or access needs:
- Intended project repository or folder:
- Rough size: small / medium / large
- Decision requested from Shane:
- Source signals and evidence:
```

### 9.3 Authorization decisions

Shane records one decision:

- `Authorize`
- `Authorize with conditions`
- `Revise and return`
- `Park until [date or trigger]`
- `Decline`

The decision includes author, timestamp, reason, and any conditions.

## 10. Definition of ready

A project is `Ready` when every required item below is present:

- Shane authorized it.
- One project owner is named.
- The outcome and project definition of done are written.
- The canonical project and execution surfaces are named.
- Initial tasks and known dependencies exist.
- Each initial task has an executor or an explicit staffing need.
- Validator and approver roles are named where required.
- Delegated authority and Shane-only gates are written.
- Material blockers have owners or decisions.
- The first status update date or trigger is known.

## 11. Project record

```markdown
# Project: [name]

- Project ID:
- State:
- Health:
- Outcome:
- Project owner:
- Sponsor and acceptance authority:
- Definition of done:
- Priority:
- Target date or wake trigger:
- In scope:
- Out of scope:
- Canonical task record:
- Execution repository or shared folder:
- Authority granted to agents:
- Shane-only gates:
- Required validators:
- Dependencies:
- Current blocker or decision:
- Latest verified update:
- Final evidence:
- Remaining work or non-goals:
```

The project owner updates this record after authorization, a material decision, a state change, a blocker, validation, acceptance, parking, cancellation, or closure.

## 12. Planning and task decomposition

The project owner decomposes the outcome into the smallest tasks that can be assigned and validated without hidden dependencies.

### 12.1 Task contract

```markdown
# Task: [bounded deliverable]

- Task ID:
- Project ID:
- Requester:
- Executor:
- Contributors:
- Validator:
- Deliverable:
- Why the project needs it:
- Inputs and context pointers:
- In scope:
- Out of scope:
- Dependencies:
- Allowed surfaces, tools, and actions:
- Actions requiring approval:
- Acceptance criteria:
- Required evidence:
- Target date or wake trigger:
- Retry, time, or cost limit if relevant:
- Return channel:
```

### 12.2 Decomposition rules

- One task has one accountable executor.
- A contributor supplies a named dependency.
- Acceptance criteria describe observable results.
- Required evidence is specified before execution.
- Dependencies are linked rather than buried in prose.
- Parallel tasks must not edit the same files or depend on unresolved shared state.
- Integration work is planned when separate outputs must operate together.

## 13. Assignment, acknowledgment, and delegation

### 13.1 Direct assignment

When the correct executor is known, the requester sends the task contract to that agent. The receiving agent records one response:

- `Accepted and claimed`
- `Accepted after [dependency or time]`
- `Returned for clarification`
- `Rejected: outside capability, authority, or capacity`

Silence is not acceptance.

### 13.2 Assistance request

An executor may request bounded help from another agent. The request creates a linked contributor task or dependency. The original executor retains accountability unless the project owner records a reassignment.

### 13.3 Unknown target

When the correct helper is unknown, the executor sends an escalation to the project owner or triage owner with:

- Project and task ID.
- The blocked outcome.
- What was attempted.
- Evidence.
- Capability or decision needed.
- Time sensitivity.

### 13.4 Delegation boundaries

Delegation passes work. It does not pass authority that the requester does not possess.

## 14. Execution and storage

### 14.1 Where agents work

- Repository work occurs in the named project checkout or an isolated worktree.
- Parallel code changes use separate worktrees when collision is possible.
- Non-code artifacts use the named project repository or shared folder.
- Scratch work may remain local while active. The accepted artifact moves to the canonical project surface.
- Existing user changes are preserved and reported when they affect the task.

### 14.2 Agent seats, sessions, and runs

The Fleet distinguishes:

| Entity | Meaning |
|---|---|
| Agent seat | The continuing Fleet identity and domain. |
| Harness | The application or interface used to work, such as Codex desktop, Codex CLI, Claude Code, or chat. |
| Session or task | A particular conversation or execution environment. |
| Run | One bounded attempt to execute or validate work. |

A new harness or session does not create a new agent seat. Shared continuity still requires durable records because separate sessions do not inherit complete context automatically.

### 14.3 Skills

- `~/.agents/skills/` is the canonical personal skill catalog.
- Relevant coding agents can discover the approved catalog through their runtime.
- Agents load task-relevant skills when their triggers match.
- Fleet and project instructions outrank general skill instructions.
- The task completion report names material skills used and their version or source when available.

## 15. Progress, checkpoints, and Fleet Pulse

### 15.1 Required task updates

An executor updates the task when:

- The assignment is accepted, returned, or rejected.
- Work starts.
- A material action or checkpoint completes.
- A dependency or blocker appears.
- The forecast changes.
- Work is submitted for review.
- Review returns the work.

Active work receives at least one update per workday unless the task contract names a different cadence. No heartbeat is required from an agent that has no active assignment.

### 15.2 Update format

```markdown
Status:
Completed since last update:
Evidence:
Next action:
Blocker or decision:
Forecast:
```

### 15.3 Fleet Pulse

The Fleet Pulse is a derived summary for Shane and the Fleet. It contains:

1. **Global delta:** material changes since the prior pulse.
2. **Project table:** active projects, owners, state, health, next milestone, and last verified update.
3. **Agent assignments:** active tasks, claims, blockers, and next actions.
4. **Shane decisions:** a short queue of decisions only Shane can make.
5. **Evidence and drift:** mismatches between Linear, GitHub, local state, and external systems.

Each entry links to its canonical source. The Pulse does not create or silently change project state.

## 16. Blockers, failures, and owner decisions

### 16.1 Blocker report

```markdown
- Project and task ID:
- Blocked outcome:
- Blocker type: dependency / access / technical / owner decision / capacity
- What was attempted:
- Evidence:
- Impact on scope or forecast:
- Requested decision or dependency:
- Recommended options:
- Needed by:
```

### 16.2 Routing

- The project owner resolves dependencies inside the approved plan.
- Shane resolves material scope, priority, access, cost, external commitment, or risk decisions.
- A failed runtime or exhausted retry limit produces `Blocked` or `Failed`. It never produces `Accepted`.
- Unaffected tasks continue unless the blocker invalidates the project plan.

## 17. Submission, validation, and rework

### 17.1 Task completion report

```markdown
# Task completion report

- Task ID:
- Executor:
- Result:
- Artifact or changed state:
- Evidence links:
- Verification performed:
- Verification result and timestamp:
- Skills used:
- External identities recorded by shared surfaces:
- Known limitations or non-goals:
- Remaining risks:
- Requested validator:
```

### 17.2 Validation

The validator checks:

- Every acceptance criterion.
- The actual artifact or state.
- Required tests, checks, or runtime behavior.
- Evidence freshness and relevance.
- Scope compliance.
- Provenance on shared surfaces.
- Known limitations and residual risk.

The validator records one result:

- `Accepted`
- `Accepted with recorded conditions`
- `Returned with specific feedback`
- `Rejected`

Returned work goes to the affected executor for rework. It does not move directly back to validation.

### 17.3 Integration

After required tasks are accepted, the project owner assembles the outputs and verifies the combined outcome. Individually accepted tasks can still conflict or fail when integrated.

## 18. Project acceptance and closure

### 18.1 Acceptance package

Before `Awaiting Acceptance`, the project owner provides:

- The project outcome.
- Definition-of-done results.
- Integrated artifact or changed state.
- Validation evidence.
- Operating or handoff information.
- Residual risks.
- Deferred work and non-goals.
- Provenance summary.
- The exact acceptance decision requested.

### 18.2 Closure record

```markdown
# Project closure

- Project ID:
- Outcome delivered:
- Acceptance authority:
- Acceptance decision and timestamp:
- Final artifact and evidence:
- Operating owner:
- Open items and owners:
- Residual risks:
- Deferred work and non-goals:
- Lessons:
- Follow-up or benefits review date, if needed:
```

Project closure records delivery and acceptance. A later benefits review may determine whether the outcome produced the expected effect.

## 19. Provenance

For every shared-surface write, record the identity returned by that surface when the identity matters to authorship or authority.

Minimum provenance fields:

- Project ID and task ID.
- Originating agent seat.
- Executing harness or session when available.
- External credential principal.
- Author returned by GitHub, Linear, email, or another shared surface.
- Timestamp.
- Human approval identity and scope when required.

Each agent should write through its own approved application identity. If a proxy performs the write, the record names both the originating agent and the proxy identity. Shared credentials do not prove individual authorship.

## 20. Shared coordination layer

V0.1 can run without a new database. If Fleet Collab or another SQL store is adopted later, it should support live coordination while preserving the durable project records above.

### 20.1 Useful coordination entities

- Assignment requests and acknowledgment.
- Claims and leases.
- Status transitions.
- Heartbeats for active runs.
- Blockers and escalations.
- Context pointers.
- Parent and child run references.
- Returned external identity.

### 20.2 Data-shape principle

An append-only event or assignment history preserves who requested, acknowledged, changed, and completed work. A current agent-status row can be derived from that history for fast reads. The status snapshot should not overwrite the evidence needed for audit.

## 21. Definition of done

### 21.1 A task is done when

- The agreed deliverable exists on the canonical surface.
- Acceptance criteria are satisfied.
- Required verification passed.
- Evidence is linked.
- A named validator accepted the result.
- Provenance is recorded where required.
- Remaining limitations are visible.

### 21.2 A project is done when

- Required tasks are accepted.
- The combined outcome was integrated and validated.
- The project definition of done is satisfied.
- The named authority accepted the outcome.
- Operating ownership and remaining work are recorded.
- The project record is closed with final evidence and provenance.

## 22. Startup plan

### Pass 1: Shane reviews the agreement

**Work:** Review the authority model, surface map, states, templates, and open decisions.

**Complete when:** Shane marks every review question as accepted, changed, deferred, or rejected.

### Pass 2: Selected agents review operability

**Work:** Give the reviewed draft to each continuing Fleet agent. Ask each agent to explain how it would propose, accept, execute, validate, escalate, and close work under the agreement.

**Complete when:** Every response is mapped to the agreement and material ambiguity is either resolved or recorded for the pilot.

### Pass 3: Publish the accepted V0.1

**Work:** Choose one canonical shared location. Add a short trigger pointer to each agent's standing instructions. Preserve this document as the single source rather than copying its rules into every agent home.

**Complete when:** Every participating agent can locate the same accepted version and report its version number.

### Pass 4: Create the initial project register

**Work:** List current meaningful projects with project ID, owner, state, health, definition of done, canonical surfaces, and last verified update. Park uncertain entries rather than inventing status.

**Complete when:** Shane can see the active project list and every active project has one owner.

### Pass 5: Run one supervised pilot

**Work:** Select one real, bounded project. Run proposal, authorization, decomposition, assignment, acknowledgment, execution, validation, integration, acceptance, and closure manually.

**Complete when:** The project reaches a truthful terminal state and every required record can be inspected without relying on chat memory.

### Pass 6: Audit the pilot and issue V0.2

**Work:** Identify missing fields, duplicate work, slow gates, unclear authority, stale status, evidence gaps, and provenance failures.

**Complete when:** V0.2 changes are tied to observed pilot friction rather than hypothetical complexity.

### Pass 7: Automate proven needs

**Work:** Decide whether shared SQL state, assignment tools, heartbeats, automatic Pulse generation, or cross-agent wake-ups would remove recurring manual work.

**Complete when:** Each automation has a named manual process, owner, failure mode, rollback path, and acceptance test.

## 23. First project checklist

- [ ] Shane selected the pilot project.
- [ ] The proposal and authorization decision are recorded.
- [ ] One project owner is named.
- [ ] The project definition of done is written.
- [ ] Linear and GitHub or the applicable project surfaces are linked.
- [ ] Initial tasks have task contracts.
- [ ] Executors acknowledged their assignments.
- [ ] Authority boundaries and Shane-only gates are visible.
- [ ] Validators are named.
- [ ] Status and evidence updates use the templates above.
- [ ] Accepted tasks receive an integration check.
- [ ] Shane receives a complete acceptance package.
- [ ] Closure records outcome, evidence, provenance, and remaining work.

## 24. Review questions for Shane

1. Should Linear remain the canonical source for projects, tasks, owners, states, dates, and decisions?
2. Which project types require Shane's final acceptance, and which may close under a delegated approver?
3. Which actions should agents receive as standing authority rather than project-specific authority?
4. May an agent directly assign a bounded contributor task to another agent, or should every new assignment pass through the project owner?
5. Is one update per active workday the right default cadence?
6. Should every material task name an independent validator, or only tasks above a stated risk threshold?
7. Should the Fleet Pulse be daily, event-driven, or requested by Shane?
8. Should the first pilot use an existing active project or a new bounded project created for the test?
9. Should Fleet Collab become a live coordination layer after the pilot, or remain an experiment until a specific manual failure appears?
10. Which agents belong in the first operating group?

## 25. Change control

- This document remains `Proposed` until Shane accepts it.
- Review comments do not change the operating contract until incorporated into a new draft.
- Shane accepts version changes.
- Each accepted version records its date, changes, and migration notes.
- Agents may propose amendments through a linked decision record. They do not silently alter the agreement.

## 26. Source material

- [`Launching a New Meaningful Project.md`](../references/Launching%20a%20New%20Meaningful%20Project.md)
- [`2026-08-30-project-workflow-benchmark.md`](../research/2026-08-30-project-workflow-benchmark.md)
- [`2026-08-30-enterprise-project-delivery-research.md`](../research/2026-08-30-enterprise-project-delivery-research.md)
- [`2026-08-30-multi-agent-work-management-research.md`](../research/2026-08-30-multi-agent-work-management-research.md)
- [`2026-08-30-addyosmani-agent-skills-centralization.md`](../research/2026-08-30-addyosmani-agent-skills-centralization.md)
