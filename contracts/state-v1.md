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
`Fulfilled`, `Declined`, and `Withdrawn`. This V1 slice creates, accepts, and
fulfills requests. A requester creates a `Pending` request; only its recipient
may accept or fulfill it. Acceptance derives an `accepted_request` obligation.
Fulfillment discharges that obligation and records its supplied Evidence links.

## Pull Candidates and project-owner work

A Pull Candidate is published voluntarily and never creates an obligation,
claim, or priority. Every Active Project Owner has one derived
`owner_next_action` obligation for each Active project they own, regardless of
whether the project's `next_action` text is populated.
