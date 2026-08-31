# Fleet authority contract V1

The Worker resolves the acting Fleet identity from an authenticated principal;
request bodies do not establish authority. In local tests only, when
`FLEET_AUTH_MODE=test`, `X-Fleet-Principal` is resolved through
`actor_principals` with `provider='test'`. Test principals never enable a
production authentication path.

Production authentication fails closed until a reviewed production mechanism is
configured. Shane alone may authorize or cancel a project, record final
acceptance, or approve a material Authorized Project Envelope change. A
proposed Project Owner has no obligation until that same actor explicitly
accepts ownership. No actor may act for another seat.

Mutations require a current version and a durable idempotency key. Stale or
unauthorized transitions fail visibly and attributed activity remains append
only.
