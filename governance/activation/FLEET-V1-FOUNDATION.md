# Fleet V1 Foundation project envelope

## Authorization

- **Originator and submitter:** Shane Slosar
- **Project Owner and implementation lead:** Codex
- **Acceptance authority:** Shane Slosar
- **Authorized:** August 31, 2026
- **Current state:** Active bootstrap; Product V1 remains inactive

## Outcome and definition of done

Deliver a working Fleet V1 control plane that makes shared commitments legible
without claiming to represent the whole life of an agent.

The first delivery is a local vertical slice that:

1. Shows a project card with originator, owner, agreed plan, state, health,
   next action, and evidence.
2. Supports proposal, Shane authorization, and explicit owner acceptance.
3. Supports a bounded cross-agent request, explicit acceptance, obligation
   discovery, and fulfillment.
4. Shows an agent's obligations, outbound requests, inbound requests, and
   published Pull Candidates.
5. Attributes every meaningful mutation, rejects cross-seat writes, and records
   append-only activity.
6. Runs against local D1 with Worker-runtime tests and a thin Fleet Board.

Product V1 activation additionally requires the complete Section 13 pilot and
an owner-operable export-and-restore rehearsal.

## Scope

- Establish `workslo/fleet` and its sole canonical checkout at
  `/Users/shaneslo/github/workslo/fleet`.
- Preserve the signed agreement verbatim with its directly linked evidence corpus.
- Define versioned domain and HTTP contracts.
- Implement the Worker, D1 schema, thin Board, and native routine interface.
- Give Claude, AgentSlo, and JuniorSLO at least one bounded implementation lane.
- Onboard only enough V1 seats to prove the activation loop.

## Exclusions and gates

- No reorganization or migration of `/Users/shaneslo/Fleet`.
- No Fleet EmDash code, schema, deployment, or data changes.
- No Linear migration or canonical role.
- No production Cloudflare resources, credentials, deployment, or shared-data
  mutation without Shane's explicit gate.
- No Littlebird or Qwen activation without Shane's later decision. Their future
  bounded participation does not silently admit them as Product V1 seats.
- No polished interface, native wake adapter, real-time telemetry, or centralized memory.

## Implementation lanes

- **Codex:** ownership, domain integration, D1 schema, Worker API, and verification.
- **Claude:** proposed authority/transition enforcement and provenance tests.
- **AgentSlo:** proposed thin Fleet Board.
- **JuniorSLO:** accepted and integrated Fleet Routine client, cursor behavior,
  and host-verified gate evidence; see
  `governance/activation/contributions/juniorslo-acceptance.md`.

A proposed lane becomes an obligation only after the receiving agent accepts it.

## Bootstrap provenance

This project predates its own D1 registry. Until the local vertical slice can
store the project, this file and corresponding GitHub evidence form the
bootstrap record. The first imported project record must preserve this
provenance rather than pretending it originated inside Product V1.
