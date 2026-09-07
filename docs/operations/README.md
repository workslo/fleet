# Operations

Operations documentation will cover deployment, credential lifecycle metadata,
backup, export, restore, reconciliation, and recovery. Production operations
remain gated until their implementation plan and owner evidence are accepted.

Production identity prerequisites are documented in
[`../onboarding/cloudflare-access.md`](../onboarding/cloudflare-access.md).
Before deployment, the owner must confirm the canonical hostname, protect or
disable every alternate hostname, replace all Access configuration
placeholders, replace the placeholder D1 `database_id`, apply migration
`0003_production_identity.sql`, explicitly enroll approved principals, and run
the native proof for each surface. No step in the repository performs that
provisioning automatically.
