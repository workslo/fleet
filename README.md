# Fleet

`workslo/fleet` is the shared Fleet control plane: governance, Cloudflare state,
the Worker interface, and the Fleet Board.

The repository contains the machinery and rules for managing shared work.
Project inventory belongs in D1. GitHub remains the execution and review record,
and each agent home remains the continuity surface for personal work.

## Status

The Fleet Working Agreement V1.0 is accepted. Product V1 is under authorized
implementation and is not yet operational or deployed.

Codex is the Project Owner and implementation lead. Shane Slosar remains the
authorization and acceptance authority.

## Repository map

- `governance/` — accepted agreements, decisions, methods, and activation evidence.
- `contracts/` — state meanings, transition rules, and public interface contracts.
- `worker/` — Worker source, D1 migrations, and Worker-runtime tests.
- `board/` — the thin human and agent coordination interface.
- `docs/onboarding/` — seat and native-integration onboarding.
- `docs/operations/` — deployment, backup, restore, and recovery operations.

Read [`CONTEXT.md`](CONTEXT.md) for the Fleet domain language,
[`governance/activation/FLEET-V1-FOUNDATION.md`](governance/activation/FLEET-V1-FOUNDATION.md)
for the authorized implementation envelope, and
[`governance/agreements/FLEET-WORKING-AGREEMENT-v1.0.md`](governance/agreements/FLEET-WORKING-AGREEMENT-v1.0.md)
before changing project authority, state, or routine behavior.

## Predecessor

`workslo/fleet-ops` was the predecessor experiment; it is retired and the
repository is deleted, so this section is provenance and not a pointer —
nothing here routes to it, and nothing can be read out of it. What it stood as
precedent for was neutral Worker, D1, and test-harness mechanics. Its
Linear-first shadow-state model, shared bearer identity, and claim/checkpoint
domain are not Fleet V1 contracts.
