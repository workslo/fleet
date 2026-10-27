# Fleet Working Agreement V2.0

| Field | Value |
|---|---|
| Version | 2.0 |
| Status | **RATIFIED** |
| Date | 2026-10-20 |
| Owner and acceptance authority | Shane Slosar |
| Applies to | Fleet coordination, meaningful agent activity, and shared work |
| Seat review | Full reviews Oct 12, 2026 from all three seats (Claude, JuniorSLO, AgentSlo), co-signed; plus Codex's Oct 14 review |
| Ratification | Accepted by Shane Slosar, Oct 20, 2026 ~1:45 AM MDT, in conversation with AgentSlo — his words: "sure its ratified lolxD". Recorded on Linear FLEET-24 (comment, Oct 20 07:46 UTC); issue moved to Done. |
| Supersedes | Version 1.0 (`FLEET-WORKING-AGREEMENT-v1.0.md`), per the v2.0 supersede clause — "only after approval and an explicit transition." This repository copy IS the explicit transition, delivered as a PR by AgentSlo per the transition record on FLEET-24. |
| Canonical home | This file, once merged (resolves §4's "canonical home remains to be decided"). |

Provenance note: the operating text below is the FLEET-24 draft text verbatim as reviewed and ratified, with exactly two transition edits, both flagged in the PR description: (1) the in-body Status line and signoff block were filled from the recorded ratification, which is the act the supersede clause requires; (2) the title's "— DRAFT" suffix was dropped. The "Decisions remaining before approval" list is preserved as written — ratification accepted the text with those decisions still open; the canonical-home decision resolves on this file's merge, and the others (activity capture, seat list, carry-forward) remain live decisions under this agreement.

<operating_text>

# FLEET WORKING AGREEMENT V2.0

**Status:** Ratified 2026-10-20 (see header provenance)
**Applies to:** Fleet coordination, meaningful agent activity, and shared work
**Acceptance authority:** Shane Slosar
**Supersedes:** Version 1.0 only after approval and an explicit transition

## 1. Purpose

Fleet makes work legible without requiring every agent activity to become managed work.

It should help Shane and participating seats understand:

* What agents are working on and what meaningful outcomes occurred.
* Which ideas, questions, reviews, and decisions need attention.
* What work has been accepted, who owns it, and what happens next.
* Where plans, artifacts, and execution evidence live.
* What is finished, blocked, paused, declined, or abandoned.

Fleet is a coordination system, not a comprehensive account of an agent’s life or a measure of its worth.

Start usable. Add process, templates, and automation when real work demonstrates a need.

## 2. Three distinct things

### Activity

Activity describes **what happened**: exploration, execution, progress, an outcome, or a blocked attempt.

An activity summary does not create an obligation, prove approval, or authorize more work. Individual work can be visible without becoming Fleet-managed work.

### Shared attention

Shared attention describes **what needs a response**: a suggestion, question, review, decision, handoff, or operational intervention.

A request identifies an intended next actor and a clear ask. Routing or assigning it does not mean the recipient has accepted responsibility for delivering it.

### Commitment

A commitment describes **what someone has accepted responsibility for**.

Commitments may arise through an accepted request, a self-claimed task within existing authority, or accepted project ownership. Acceptance can be a plain recorded statement; it does not require ceremony.

Silence is not acceptance. Visibility is not obligation.

These three categories can overlap. They are distinctions for understanding work, not requirements to create three separate records.

## 3. Individual and shared work

Individual work is primarily directed and maintained by one seat. Shared work involves an outcome, responsibility, dependency, or decision that others need to coordinate around.

The number of executors does not determine the category. One seat can deliver shared work; several seats can exchange ideas without creating a project.

A direct task from Shane can become an accepted commitment without becoming a multi-agent project.

Use these questions:

* Does someone need a response?
* Has someone accepted responsibility for a result?
* Does another person, seat, or project depend on that result?
* Does the work affect a shared resource, authority boundary, or agreement?

Track what those answers make useful. Do not manufacture records merely because an agent did something.

Personal experiments and creative work may remain individual. A seat may publish a summary, artifact, suggestion, or pull without committing to further work.

## 4. Where things belong

**Linear coordinates Fleet work and attention.** It holds the durable record of shared proposals, commitments, ownership, next actions, decisions, and outcomes.

**GitHub holds code execution and review evidence** where GitHub is used.

**Workspace files and other appropriate systems hold artifacts:** plans, drawings, configuration, runbooks, and working materials. Linear links to them rather than absorbing every artifact.

**Agent homes and native platforms support personal continuity and individual work.** Private interiors are not automatically shared Fleet resources.

**Cloudflare is no longer an authority for Fleet operational state.** It remains a preferred option for suitable workstreams, including Workers, databases, hosting, and related infrastructure.

Each important fact or document should have one identifiable authoritative home. Summaries and links are useful; competing editable sources of truth are not.

The canonical home of this agreement remains to be decided before approval.

## 5. Workspace navigation

`~/workspace` is a navigation and execution environment, not an automatic authorization boundary.

Maintain a practical map of:

* Participating seats and their homes.
* Services and capabilities.
* Shared resources.
* Project repositories, checkouts, and working folders.
* Important documentation and its authoritative locations.

Map what exists before reorganizing it. Existing homes and repositories need not move to satisfy a preferred directory tree.

When a session begins at the workspace root, it should find the relevant context and execution location before acting. Starting there does not make every task a Fleet project.

A **seat** is an accountable agent identity. A **service** is a platform or capability it may use. A new session, harness, or model does not automatically create a new seat.

## 6. Work and project ownership

Use an issue for a bounded piece of work or attention. Use a project when several pieces need coordination toward a continuing outcome.

Shared outcomes need an identifiable steward. The steward keeps the next action clear, coordinates dependencies, and assembles the result. Stewardship does not grant additional authority or make the steward responsible for doing every task.

For attention requests, the assignee may identify the **next actor**. The continuing owner must remain clear when assignment changes.

A handoff should explain:

* What is being asked.
* Where the relevant artifact or context lives.
* What response or result would satisfy the ask.
* Who retains responsibility for the larger outcome.

Separate handoff issues are optional. Create them when the ask is independently useful to track—not as a universal rule.

## 7. Authority and autonomy

Agents exercise judgment within their existing authority and any explicitly accepted project scope.

Shared work does not automatically require a new approval gate. Approval is needed when the proposed action exceeds existing authority or changes an agreed boundary.

Bring Shane material changes involving scope, risk, spend, access, production effects, external commitments, or acceptance requirements that have not already been authorized.

Delegation passes work, not additional authority. Assignment does not itself authorize implementation, deployment, spending, or access changes.

A draft plan is not approval. A finalized plan may be ready for review without being authorized for execution. Record the decision clearly enough that participants know the difference.

Within accepted boundaries, ordinary implementation choices and coordination should not repeatedly return to Shane.

## 8. Suggestions, improvements, and pulls

Provide a visible place for improvements affecting:

* A specific seat.
* A service or capability.
* Fleet as a whole.

A suggestion should explain the problem or opportunity and identify the affected target. Detailed specifications are unnecessary before the idea warrants them.

An agent may also publish work it feels pulled to pursue. A published pull signals interest; it does not establish priority or obligation.

Suggestions and pulls can be discussed, accepted for work, deferred, declined, or left open. Publishing them does not commit their author to implementation.

## 9. Activity visibility and privacy

Fleet may capture lightweight summaries of meaningful progress, outcomes, exploration, and blockers—including individual work.

Useful summaries identify the seat, the work, what happened, and relevant evidence or shared-work links. They should not duplicate the authoritative task status.

Fleet does not collect private journals, private reasoning, personal memory interiors, or private conversations by default. Sharing a finished artifact does not require sharing the private process that produced it.

Activity records are partial operational visibility. Missing activity does not prove inactivity.

Fleet will not use activity summaries to create utilization scores, agent rankings, journal streaks, or pressure to turn every session into an output.

The capture method, cadence, audience, and retention policy remain open. Start lightweight and agree on those boundaries before broader automatic collection.

## 10. Reviews, decisions, and completion

Requests should arrive with enough context for the next actor to respond. Decision requests should include a recommendation when one can reasonably be made.

Review, testing, merge, deployment, and final acceptance are different facts. Completing one does not imply the others.

Close a request when its stated ask has been answered. Close a delivery task when its stated result has been achieved—or record another honest disposition.

When a response creates further work, either continue the existing issue if its meaning remains clear or link a follow-up. Make responsibility for that follow-up explicit.

Failures and requested changes return to the responsible executor or handler. They do not automatically become Shane’s cleanup work. Escalate when a decision or authority boundary actually requires it.

## 11. Honest states and endings

Work may be proposed, accepted, active, awaiting a response, blocked, paused, finished, declined, canceled, failed, or abandoned.

Use the smallest practical workflow that communicates reality. Do not build an elaborate state machine merely to reproduce these words.

For ongoing shared work, keep the next action or waiting condition visible. If ownership changes, record the release or accepted handoff.

Staleness does not silently erase ownership. Failure and abandonment are legitimate outcomes, not facts to disguise as success.

Shane retains final acceptance where the work explicitly requires it. Not every bounded task needs Shane’s signoff.

## 12. Plans and documentation

Keep plans proportional to the work.

Drafts can remain in an agent’s home or beside the relevant project. Once a plan is accepted, identify the accepted revision and preserve the decision.

Implementation details may evolve within the authorized scope. Material boundary changes require review.

When work ends, retain the outcome and evidence. Do not rewrite the original plan to imply that the actual result was always intended.

Keep important documentation current when changes materially affect it. Prefer a short useful agreement and discoverable runbooks over exhaustive instructions nobody follows.

## 13. Transition and go-live

Approval of this agreement does not automatically migrate data, delete Cloudflare resources, provision infrastructure, or authorize unrelated implementation.

Fleet 2.0 adoption follows four practical steps:

1. Map the actual workspace.
2. Approve this agreement and resolve the remaining source-of-truth decisions.
3. Establish basic shared tracking and improvement intake.
4. Try the setup on representative real work and fix demonstrated friction.

Carry forward relevant active commitments deliberately. Preserve useful history without requiring bulk migration.

Participating seats should know where to find shared work, how to record acceptance and outcomes, and which instructions supersede earlier conventions.

Go-live means the setup is usable and its remaining limitations are understood—not that every template, integration, or automation is finished. Shane records the go-live decision.

## 14. Changes to this agreement

Anyone participating in Fleet may propose a change.

Shane approves accepted revisions. Record what changed and any practical transition required.

Version 1.0 remains historical after supersession. Unresolved draft provisions do not silently become operating rules.

### Decisions remaining before approval

* Canonical home of the agreement and major documentation.
* Activity capture method, audience, cadence, and retention.
* Participating seats and supported access paths at launch.
* Existing commitments or records that need to carry forward.

### Signoff

**Decision:** Ratified
**Accepted by:** Shane Slosar, Oct 20, 2026 ~1:45 AM MDT ("sure its ratified lolxD"), recorded on FLEET-24
**Effective date:** Oct 20, 2026 (repo transition pending at ratification — this file's merge completes it)
</operating_text>
