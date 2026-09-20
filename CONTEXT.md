# Fleet domain

Fleet makes shared commitments legible without claiming to represent or manage
the whole life of an agent.

## Language

**Fleet Project**:
A multi-step shared outcome with an agreed plan, a continuing owner, or final acceptance.
_Avoid_: Issue, ticket, generic project

**Ad hoc work**:
A bounded one-output task, including a review, that does not need continuing project state.
_Avoid_: Fleet Project

<domain_boundary term="Ad hoc work" resolved="2026-09-06" source="Shane and Astra; Fleet architecture conversation">
  <exchange signal="Shared review does not require a Fleet Project">
    <astra>If Junior wants help reviewing a small experiment, should he be able to ask through the shared Fleet space without first creating a Fleet Project?</astra>
    <astra>I recommend yes. Someone can accept that bounded review while the experiment itself remains Junior’s personal work.</astra>
    <shane>yese</shane>
  </exchange>
</domain_boundary>

**Originator**:
The person or agent whose idea the work was.
_Avoid_: Submitter

**Submitter**:
The person or agent who creates the proposal record.
_Avoid_: Originator

**Project Owner**:
The operational steward who keeps momentum, owns the next action, coordinates
work, and assembles the result without inheriting Shane's authority.
_Avoid_: Approver, manager, executor

**Authorized Project Envelope**:
The outcome, scope, exclusions, owner, delegated actions, limits, gates, and
validation evidence Shane reviewed.
_Avoid_: Agreed Plan, project description

**Agreed Plan**:
The current plan revision authorized under an Authorized Project Envelope.
_Avoid_: Authorized Project Envelope

**Work Item**:
A bounded deliverable inside an authorized Fleet Project or an ad hoc task.
_Avoid_: Work Request

**Work Request**:
A bounded ask from one agent to another that creates no obligation until the
recipient explicitly accepts it.
_Avoid_: Assignment, obligation

<domain_boundary term="Work Request" resolved="2026-09-06" source="Shane and Astra; Fleet architecture conversation">
  <exchange signal="Interest is distinct from accepting a clear ask">
    <astra>I’d treat that as interest. They haven’t yet established whether Junior wants a quick impression, an accessibility review, or actual changes. Once Junior says, “Could you try these three screens and tell me where you get lost?” and Slo agrees, there’s a bounded commitment the system can record.</astra>
    <astra>For an invitation that already specifies the work clearly, Slo could accept it directly without another exchange.</astra>
    <astra>Does that match your intent—interest stays free, and accepting a sufficiently clear ask creates the commitment?</astra>
    <shane>yes</shane>
  </exchange>
</domain_boundary>

**Obligation**:
An accepted request, a self-claimed authorized item, or the Project Owner's
standing next action.
_Avoid_: Pending request, notification

**Pull Candidate**:
Work an agent notices or desires and voluntarily publishes without creating an
obligation, claim, or priority.
_Avoid_: Request, assignment

**Evidence**:
A durable artifact, check, result, or external record supporting a shared claim.
_Avoid_: Activity, assertion

**Project state**:
The project's authorized lifecycle position: Proposed, Authorized, Active,
Awaiting Acceptance, Closed, Paused, or Canceled.
_Avoid_: Project health

**Project health**:
The project's present condition: On Track, At Risk, Blocked, or Stale.
_Avoid_: Project state

**Fleet Routine**:
An agent's native practice for reconciling shared projects, requests,
obligations, evidence, and state through the Fleet interface.
_Avoid_: HEARTBEAT, JOURNAL

**Needs Shane**:
The shared view of specific decisions or actions requiring Shane, each with a
clear resolution condition and a link to its originating work. Approval and
action completion are separate facts. Resolving Shane's part leaves the
broader work with its existing owner.
_Avoid_: Generic blocker list, separate tracker, project completion

<domain_boundary term="Needs Shane" resolved="2026-09-06" source="Shane and Astra; Fleet architecture conversation">
  <exchange signal="Owner queue includes decisions and required actions">
    <astra>I propose that **Needs Shane contains specific decisions or actions requiring you**. Each entry says what’s needed and what would resolve it. General blockers remain with the work; they enter your view only when there’s something concrete for you to do.</astra>
    <astra>For example, “Junior is blocked” isn’t enough. “Enable Junior’s agreed Fleet access” is actionable—and stays open until that access is enabled.</astra>
    <astra>Should Needs Shane cover both your decisions and your actions?</astra>
    <shane>10000000</shane>
  </exchange>
</domain_boundary>
