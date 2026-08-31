# Enterprise project-delivery research for the Fleet workflow

Date: 2026-08-30  
Scope: public, first-party material from UK Government project-delivery authorities, Deloitte, PwC, EY, KPMG, and Goldman Sachs. This is a design comparison, not a claim about any firm's confidential internal process.

## Bottom line

The existing diagram has a sound **task execution loop**:

`assign -> acknowledge -> execute -> report -> validate -> accept`

Its main gap is the **project control spine** around that loop. Large, regulated organizations publicly emphasize portfolio selection, formal authorization, distinct business and delivery ownership, integrated risk/dependency/decision/change controls, stage-gate assurance, operational handover, and benefits tracking after delivery.

The simplest strengthened lifecycle is:

`propose -> assess -> authorize -> plan -> execute/control -> validate -> transition -> accept/close -> realize benefits`

Labels below distinguish what a source explicitly documents from what is inferred for Fleet:

- **Primary:** stated in a first-party source.
- **Inference:** a recommended translation into the Fleet workflow.

## What enterprise practice adds

### 1. Portfolio assessment and authorization before agents start

- **Primary:** EY describes structured project approval and prioritization, resource-demand management, and standardized tracking as elements used to govern and optimize a client's portfolio. PwC says portfolio management should prioritize projects by strategic objectives, delivery capability, relative risk, and value. [EY, Program Risk Management, date not shown](https://www.ey.com/en_in/services/risk/program-risk-management); [PwC Thailand, IT Programme and Project Management, date not shown](https://www.pwc.com/th/en/consulting/technology/it-programme-and-project-management.html)
- **Primary:** UK guidance requires a business-case process and makes costs, funding, benefits, risks, major dependencies, stage gates, decision rights, and assurance visible before and during delivery. [NISTA/HM Treasury, Strategy and Delivery Plan Guidance: Mega Projects, 2026-03-26](https://www.gov.uk/government/publications/strategy-and-delivery-plan-guidance-mega-projects/strategy-and-delivery-plan-guidance-mega-projects)
- **Inference:** insert a **Portfolio Triage** step and an **Authorize Project** gate before `READY`. Minimum gate inputs: strategic outcome, accountable sponsor, benefits and measures, rough cost/capacity, major risks/dependencies, priority, delivery approach, and approver. Record `go`, `conditional go`, `rework`, `hold`, or `stop`; do not reduce this to a binary yes/no.

### 2. Separate business accountability from delivery management

- **Primary:** the UK project-delivery standard makes portfolio, programme, and project governance roles mandatory and publishes separate guidance for the Senior Responsible Owner (SRO), a role related to but distinct from project directors and managers. [GovS 002, last updated 2025-09-17](https://www.gov.uk/government/publications/project-delivery-functional-standard); [Role of the Senior Responsible Owner, last updated 2026-02-23](https://www.gov.uk/government/publications/the-role-of-the-senior-responsible-owner)
- **Primary:** PwC emphasizes explicit decision rights at steering committee, program board, and delivery-team levels, together with clear escalation paths. [PwC US, Program governance and delivery risk, 2025-08-15](https://www.pwc.com/us/en/services/audit-assurance/library/program-governance-delivery-risk.html)
- **Inference:** split the current `Accountable owner` box into:
  - **Sponsor / accountable owner:** owns the business outcome, business case, continued justification, priority, and acceptance.
  - **Delivery lead / project manager:** owns the integrated plan, status, coordination, controls, and escalation.
  - **Benefits owner:** owns measurement and realization after handover; this can be the sponsor but must be explicit.
  - **Executors, contributors, validators, and approvers:** remain task- or gate-specific.

### 3. An integrated plan is more than a task list

- **Primary:** UK mega-project guidance calls for outcomes and measures, benefits ownership, milestones and stage gates, cost and funding, assumptions and decisions, guardrails/change tolerances, risks and opportunities, governance, delivery partners, independent assurance, and stakeholder engagement. [NISTA/HM Treasury, 2026-03-26](https://www.gov.uk/government/publications/strategy-and-delivery-plan-guidance-mega-projects/strategy-and-delivery-plan-guidance-mega-projects)
- **Primary:** Deloitte's PMO material groups planning, finance and benefits, reporting/governance, RAID management, document/version control, resource management, knowledge transfer, and quality controls into one delivery system. [Deloitte Middle East, Project Management Office services, 2023](https://www.deloitte.com/content/dam/assets-zone2/middle-east/en/docs/services/tax/2024/me_project-management-office-serives.pdf)
- **Inference:** expand `Create tasks, dependencies, executors, and validators` to include a lightweight integrated plan: scope, milestones, owners, capacity, dependencies, evidence/quality criteria, RAID, decisions, changes, communications, and escalation tolerances. In Excel these may be separate tables, but they need shared project and task IDs.

### 4. Control is continuous, not an end-of-task report

- **Primary:** PwC recommends a single source of truth for decisions, documentation, and escalations; consistent risk management and dependency mapping; and dashboards covering schedule, risks, cost, resources, and value. [PwC US, 2025-08-15](https://www.pwc.com/us/en/services/audit-assurance/library/program-governance-delivery-risk.html)
- **Primary:** Goldman Sachs publicly describes top-down risk oversight combined with bottom-up, day-to-day risk identification and escalation; operational events are documented, analyzed, aggregated, and reported through metrics. This is a public operational-risk disclosure, **not** a project-delivery method. [Goldman Sachs GICL, Operational Risk Management, date not shown](https://www.goldmansachs.com/worldwide/india/disclosures/operational-risk-management-for-gicl)
- **Inference:** each agent should update status, evidence, blockers, risks, dependencies, decisions needed, and forecast as work proceeds. A blocker inside an agreed tolerance goes to the delivery lead; a change outside scope/cost/time/risk tolerance goes to the sponsor or approver and is recorded.

### 5. Validation, independent assurance, and acceptance are different controls

- **Primary:** PwC recommends predefined quality gates at design completion, test readiness, deployment planning, and go-live, with risks addressed, approvals secured, and deliverables checked against standards before proceeding. [PwC US, 2025-08-15](https://www.pwc.com/us/en/services/audit-assurance/library/program-governance-delivery-risk.html)
- **Primary:** the UK Gate Review process provides independent guidance at key lifecycle decision points and explicitly says a gate review complements rather than replaces internal review and audit. [NISTA, Gate Review 5, updated 2026-08-20](https://www.gov.uk/government/publications/gate-review-5-operations-review-and-benefit-realisation/gate-review-5-operational-review-and-benefits-realisation)
- **Inference:** preserve the diagram's validator and approver, but add gates throughout the lifecycle. Use three distinct outcomes:
  - **Validated:** evidence meets task or technical criteria.
  - **Assured:** an independent reviewer has challenged readiness proportionate to risk.
  - **Accepted:** the authorized business owner accepts the outcome and residual risk.

### 6. Delivery is not complete until the result can operate without the project team

- **Primary:** KPMG includes readiness assessment, project assurance, handover to ongoing business ownership, post-project lessons, benefits reviews, and continuing business-as-usual monitoring. [KPMG Bermuda, Change risk management, date not shown](https://kpmg.com/bm/en/services/advisory/risk-consulting/risk/change-risk-management.html)
- **Primary:** EY describes transition planning, cutover and support, and a client case with explicit post-go-live support entry and exit criteria. [EY India, Program Risk Management, date not shown](https://www.ey.com/en_in/services/risk/program-risk-management)
- **Inference:** split `AWAITING ACCEPTANCE` into:
  1. **Readiness / transition gate:** operating owner, runbook, access, monitoring, support, rollback/exit, training, residual risks, and open actions are assigned.
  2. **Business acceptance:** the sponsor/approver accepts the integrated outcome and residual risk.

### 7. Project closure and benefits realization are not the same event

- **Primary:** UK Gate 5 guidance distinguishes delivered outputs from later outcomes and benefits. Reviews may repeat after handover; the operational business owner becomes responsible for service performance and expected benefits. [NISTA, Gate Review 5, updated 2026-08-20](https://www.gov.uk/government/publications/gate-review-5-operations-review-and-benefit-realisation/gate-review-5-operational-review-and-benefits-realisation)
- **Primary:** KPMG likewise separates handover, post-project review, benefits realization, and ongoing BAU monitoring. [KPMG Bermuda, date not shown](https://kpmg.com/bm/en/services/advisory/risk-consulting/risk/change-risk-management.html)
- **Inference:** rename the terminal diagram node from `DONE` to **PROJECT CLOSED**, then add a post-close **Benefits Review** loop with a benefits owner, baseline, measure, review date, and escalation path. A project may close while benefits are `on track`; do not falsely require every long-term benefit to be realized before releasing the delivery team.

## Exact changes to the current workflow diagram

| Current element | Recommendation | Exact change |
|---|---|---|
| `1. PROPOSED — Business outcome identified` | Keep and expand | Add requestor, strategic objective, expected benefit, rough size/capacity, risk class, and provenance. Route into portfolio triage. |
| `Accountable owner defines outcome...` | Split | Show Sponsor/Accountable Owner, Delivery Lead, and Benefits Owner separately. |
| `Ready to start? Yes/No` | Replace | Use `Authorize?` with `Go / Conditional Go / Rework / Hold / Stop`. Criteria: business case, capacity/funding, major risk, dependencies, decision rights, and evidence expectations. |
| `2. READY — Create tasks...` | Rename and expand | Rename to `AUTHORIZED / PLANNED`; add milestones, integrated dependencies, RAID, decision/change controls, quality criteria, communication cadence, and escalation tolerances. |
| Agent A/B/C execution branches | Keep | Require task acknowledgment, one executor, progress/evidence updates, and explicit dependency handoffs. |
| `Owner resolves dependency or makes owner decision` | Split routing | Delivery Lead resolves within tolerance; Sponsor/Approver decides material scope, cost, schedule, risk, or priority changes. Log the decision and author. |
| `3. IN REVIEW — Validator checks...` | Keep and strengthen | Add applicable quality, security, compliance, integration, and operational-readiness criteria; add independent assurance for higher-risk work. |
| `Task meets acceptance criteria?` | Keep | Allow `Accept / Conditional accept / Return / Reject`, with conditions and due dates recorded. |
| `Are all required tasks accepted?` | Expand | Ask whether required tasks, integrations, controls, and transition prerequisites are complete. |
| `4. AWAITING ACCEPTANCE` | Split | Add a readiness/transition gate before business acceptance. |
| `Approver accepts complete outcome?` | Keep | Acceptance must name the authority, date, accepted evidence, residual risks, and any conditions. |
| `5. CLOSE` | Expand | Record handover, operating owner, residual risk/open-action owners, decommissioning/rollback disposition, lessons, archive, and provenance. |
| `DONE` | Rename and extend | Use `PROJECT CLOSED`, followed by benefits reviews until benefits are realized, revised, or formally retired. |
| `Park or cancel` | Split | `On hold` needs owner, reason, review date, and restart condition. `Canceled` needs authority, reason, cost/impact, disposition, and lessons. |

## Recommended state correction

The current project-state line mixes lifecycle stages with work conditions:

`Proposed -> Ready -> Claimed -> Active -> Blocked/In Review -> Awaiting Acceptance -> Done`

Recommended project lifecycle:

`Proposed -> Assessing -> Authorized -> Active -> Validating -> Transitioning -> Closed`

Use `Blocked` and `On Hold` as flags/exception states, not normal forward stages. Use `Canceled` as a terminal exit. `Claimed` belongs at the task level because one accountable sponsor owns the project while multiple agents acknowledge individual assignments.

Recommended task lifecycle:

`Assigned -> Acknowledged -> Active -> In Review -> Accepted`

with `Blocked`, `Returned`, and `Canceled` as explicit exceptions.

## Goldman Sachs caveat

- **Primary:** public Goldman Sachs material supports high-level principles: integrated planning and reporting, control functions and second-line challenge, escalation and documentation of risk events, incremental delivery, end-user feedback, and learning from failures. [Goldman Sachs, Corporate Planning & Management, date not shown](https://www.goldmansachs.com/careers/our-firm/corporate-planning-and-management/); [Goldman Sachs GICL, Operational Risk Management, date not shown](https://www.goldmansachs.com/worldwide/india/disclosures/operational-risk-management-for-gicl); [Goldman Sachs Engineering, Product Data Engineering and Our Engineering Tenets, date not shown](https://www.goldmansachs.com/careers/blog/engineering-at-gs-product-data-engineering)
- **Inference boundary:** these pages do not disclose a firmwide Goldman Sachs project lifecycle, gate model, RACI, PMO standard, or internal tooling. They should inform the control posture, not be presented as evidence of Goldman's proprietary workflow.

## Minimal Excel translation

For a fleet that only has Excel, the smallest defensible control set is four linked tables:

1. **Projects:** outcome, sponsor, delivery lead, benefits owner, priority, state, target, current gate, approver, last verified date.
2. **Tasks:** deliverable, one executor, contributors, dependencies, due date, status, evidence, validator, acceptance result.
3. **RAID + decisions + changes:** type, description, owner, impact, due date, escalation level, decision authority, disposition, author and timestamp.
4. **Gates + closure + benefits:** gate criteria, evidence, assurer, decision, conditions, handover owner, residual risks, acceptance, benefits measure/baseline/review date.

This remains simple enough to operate manually while preserving the controls that the current diagram lacks.
