# Fleet state contract V1

## Project lifecycle

Projects use these lifecycle names exactly:

```text
Proposed -> Authorized -> Active -> Awaiting Acceptance -> Closed
```

`Paused` and `Canceled` are explicit exits. Health is separate from lifecycle
state: `On Track`, `At Risk`, `Blocked`, or `Stale`.

A project's `slug` is its stable, human-typed handle and carries a canonical
syntax: lowercase alphanumeric words joined by single hyphens, at most 64 bytes,
with no leading, trailing, or doubled hyphen. Slugs are unique and are compared
as stored.

`Proposed` records an idea without shared execution authority. `Authorized`
means Shane accepted an envelope and is awaiting the proposed owner's consent.
`Active` means that owner accepted. `Awaiting Acceptance` is an owner-submitted
outcome awaiting Shane. `Closed` records `Accepted`, `Failed`, or `Abandoned`.

## Derived obligations

An Obligation is derived from an accepted Work Request, a self-claimed
authorized Work Item, or an Active Project Owner's standing next action. A
proposal, pending request, notification, and Pull Candidate do not create an
Obligation. Silence creates no obligation.

## Work Requests

Work Requests use these lifecycle names exactly: `Pending`, `Accepted`,
`Fulfilled`, `Returned`, `Declined`, `Withdrawn`, and `Expired`. A request may be
associated with an Active Fleet Project or stand alone as bounded ad hoc work.
A standalone request does not create a Fleet Project and does not import the
linked personal artifact into Fleet.

A request is addressed to a different actor. A requester may not name itself as
recipient: a Work Request is a bounded ask from one agent to another, and
self-claimed work is its own obligation source, taken through an authorized Work
Item or an Active Project Owner's standing next action. A self-addressed create
is refused before anything is stored, and D1 refuses the row directly so import
and recovery paths cannot bypass the gate. The D1 floor is insert-scoped, so a
self-addressed row written before it is preserved rather than rewritten; such a
row is quarantined instead. Its only remaining transitions are the ones that end
it — the actor it belongs to may decline, withdraw, expire, fulfill, or return
it, and may never accept or work it in place.

A requester creates a `Pending` request; only its recipient may accept or
fulfill it. Pending visibility creates no obligation. Acceptance stores the
exact title, detail, and deliberately shared artifact link as the accepted
scope and derives one `accepted_request` obligation for that recipient.
Fulfillment discharges that obligation and records its supplied Evidence links.
The request and its Evidence remain readable after fulfillment.

Project association does not alter authority. A standalone request grants no
project ownership, Shane-only authority, production authority, or authority to
act as another seat.

Only the recipient may decline a Pending invitation, return Accepted work,
or record/clear its blocker. Only the requester may withdraw a Pending ask.
Decline and withdrawal require a reason. Return requires a reason and the
unfinished portion, with optional evidence. Return ends the recipient's
obligation; the requester decides what follows and acquires no new obligation
automatically. Terminal outcomes retain actor, time, explanation and evidence.

A blocker is a condition on Accepted work with a reason and a resolution
condition. It does not change lifecycle, erase the obligation, or create a
Needs Shane ask. Unblocking records a summary. Fulfillment or return clears
the current blocker while its attributed activity remains available.

Optional immutable `expires_at` is an invitation acceptance deadline, not an
accepted-work delivery deadline. Once it passes, a Pending request exposes
`expiry_due: true` and rejects acceptance, decline and withdrawal. Either
participant may explicitly record `Expired`; that outcome records the caller
as the recorder of the pre-authorized deadline, not a new cancellation choice.
No expiry is inferred for an undated request; an accepted obligation never
expires. GET reads do not mutate or advance versions. Until someone records
expiry, the stored state remains Pending with a visible overdue condition.

Source ownership, accepted scope and related Needs Shane records do not change
when a request ends. Legacy records gain nullable lifecycle fields without
invented deadlines, blockers or ending provenance.

## Pull Candidates and project-owner work

A Pull Candidate is published voluntarily and never creates an obligation,
claim, or priority. Every Active Project Owner has one derived
`owner_next_action` obligation for each Active project they own, regardless of
whether the project's `next_action` text is populated.

## Needs Shane

One Needs Shane record describes a `decision`, an `action`, or a
`decision_and_action` against one existing Project or Work Request. It carries
the specific ask and the condition that resolves Shane's part. A source Work
Request may be standalone; its project association is derived on the server.
New entries require exactly one source, but the source need not be Active.
General blockers do not create entries automatically.

The pending view includes records whose `state` is `Pending`. A decision-only
record resolves when Shane records `approved` or `declined`, with a required
explanation. A combined record remains pending after approval until its action
is completed. Declining a combined ask resolves it with `action_status:
not_required`; it never claims completion. An action-only record requires no
new decision. `Resolved` means only that Shane's recorded part is finished;
it does not authorize a Project, fulfill a Work Request, change its accepted
scope, or record Product V1 acceptance.

Decision, action completion and delegation are separate attributed facts.
Delegation grants the named actor permission to record its own completion of
this action; it creates no accepted obligation. Re-delegation replaces that
permission while preserving earlier activity. An unfinished delegated action
stays visible until completed. It does not execute provider operations.

Resolved outcomes remain readable through history, source detail and the
relevant actors' work snapshots, even after their activity cursors advance.
Legacy decisions preserve their original state and date; missing creator,
resolution condition and outcome provenance remain explicitly null.
