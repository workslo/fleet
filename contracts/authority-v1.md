# Fleet authority contract V1

The Worker resolves the acting Fleet identity from an authenticated principal;
request bodies do not establish authority.

Production uses the Cloudflare Access application token from
`Cf-Access-Jwt-Assertion`. The Worker verifies the RS256 signature against the
configured fixed JWKS URL and requires the configured issuer, Fleet application
audience, expiry, any present not-before boundary, and an application token `type` of
`app`. Access issues application tokens without a protected `typ` header; when
one is present it must name a JWT. Configuration or claim ambiguity fails
closed. The Access issuer is configuration, never a value discovered from the
submitted token.

An Access identity with a non-empty `sub` is a `human` principal whose stable
key is `(issuer, sub)`. A service token has an empty `sub` and is a `service`
principal whose stable key is `(issuer, common_name)`, where `common_name` is
the Access Client ID. Those kinds are distinct: Shane accepts only human
principals, and every agent actor accepts only service principals. Only an
explicitly enrolled, active principal mapped to an active existing Fleet actor
is authorized.
Email, display name, request-body actor fields, and other untrusted headers do
not enroll or select an actor. Multiple principals of the actor's required kind
may be deliberately mapped to one actor. The service Client ID is an identifier
and may be stored for enrollment and provenance; the Client Secret is a
credential and must never enter D1 or an artifact.

The production Worker has no test-authentication branch and never honors a
caller-supplied identity header. Worker-runtime tests use controlled signing
keys, a fixed test issuer and JWKS, and explicitly enrolled Access-shaped
principals to exercise the same resolver as production.

Shane alone may authorize or cancel a project, record final acceptance, or
approve a material Authorized Project Envelope change. A proposed Project
Owner has no obligation until that same actor explicitly accepts ownership. No
actor may act for another seat. Authenticated browser mutations additionally
require an `Origin` matching the request origin; service principals do not use
the browser CSRF boundary.

A standalone Work Request is bounded ad hoc work, not a Fleet Project or an
authority envelope. Its recipient alone may accept or fulfill it. Acceptance
creates only the obligation described by the frozen accepted scope; it grants
no project ownership, Shane-only authority, production authority, or authority
to act as another seat.

Every active Fleet actor may read shared Fleet records. Mutation authority
continues to follow the actor-specific domain rules. Access-specific claims are
confined to the authentication boundary; domain handlers receive a resolved
actor and provider-agnostic principal provenance.

Mutations require a current version and a durable idempotency key. Stale or
unauthorized transitions fail visibly and attributed activity remains append
only. New activity captures both the resolved Fleet actor and the exact
principal kind, issuer, and subject that authenticated the mutation.

For Needs Shane, every active actor may create an explicitly source-linked ask
or read shared records. Shane alone records decisions or names/replaces an
action's delegate. Only Shane or that currently named, authenticated delegate
may record action completion, always attributed to the actual caller. An
action contingent on approval cannot be delegated or completed before Shane
approves it. Bodies cannot nominate the deciding or performing actor.

Decision outcomes document the bounded ask; they do not bypass the existing
Project authorization, cancellation, final-acceptance or production gates.
Recording an action does not perform it. Its summary and evidence state what
was done under the applicable authority.

For request endings, the recipient alone declines Pending asks or returns
Accepted work; the requester alone withdraws Pending asks. The recipient alone
records or clears blockers on Accepted work. Shane has no cross-seat override.
Either request participant may record expiry after its originally disclosed
invitation deadline. Accepted work cannot be withdrawn or expired in this slice.
All these operations preserve the authenticated actor and principal, require
quoted If-Match and an actor-scoped idempotency key, and atomically store the
state change, evidence, activity and replay response.
