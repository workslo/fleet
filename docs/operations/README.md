# Operations

The [local recovery rehearsal](local-recovery.md) gives the owner a repeatable
way to export synthetic Fleet state, restore it into a clean local D1 database,
and check the recovered records through the Worker and Board.

Production deployment, credential lifecycle, backup retention, and restoration
of existing data still require their own accepted operations plan and evidence.

Production identity prerequisites are documented in
[`../onboarding/cloudflare-access.md`](../onboarding/cloudflare-access.md).
Before deployment, the owner must confirm the canonical hostname, protect or
disable every alternate hostname, replace all Access configuration
placeholders, replace the placeholder D1 `database_id`, apply migration
`0003_production_identity.sql`, explicitly enroll approved principals, and run
the native proof for each surface. No step in the repository performs that
provisioning automatically.
