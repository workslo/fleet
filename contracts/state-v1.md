# Fleet state contract V1

## Project lifecycle

Projects use these lifecycle names exactly:

```text
Proposed -> Authorized -> Active -> Awaiting Acceptance -> Closed
```

`Paused` and `Canceled` are explicit exits. Health is separate from lifecycle
state: `On Track`, `At Risk`, `Blocked`, or `Stale`.

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
`Fulfilled`, `Returned`, `Declined`, `Withdrawn`, and `Expired`. This V1 slice
exposes only the create, accept, and fulfill transitions; the other endings are
reserved by the signed agreement and are not implemented here. A request may be
associated with an Active Fleet Project or stand alone as bounded ad hoc work.
A standalone request does not create a Fleet Project and does not import the
linked personal artifact into Fleet.

A requester creates a `Pending` request; only its recipient may accept or
fulfill it. Pending visibility creates no obligation. Acceptance stores the
exact title, detail, and deliberately shared artifact link as the accepted
scope and derives one `accepted_request` obligation for that recipient.
Fulfillment discharges that obligation and records its supplied Evidence links.
The request and its Evidence remain readable after fulfillment.

Project association does not alter authority. A standalone request grants no
project ownership, Shane-only authority, production authority, or authority to
act as another seat.

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
