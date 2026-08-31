# Fleet Working Agreement v0.1 — review

- Reviewed: 2026-08-30
- Source: `FLEET-WORKING-AGREEMENT-v0.1.md` (722 lines, 4,399 words, 26 sections; sha256 `e52ade9a…8ef5b4`) — unchanged by this review
- Checked against: Linear workspace `smslo`, live via connector. Sample: both Fleet teams' workflow definitions, the 50 most recently updated of ~120 `FLEET` issues (through FLEET-120, 2026-08-30), 4 issues read in full with state history, 4 comment threads, all 4 team projects, and the one project status update that exists.
- Verdict up front: **the document is a 4,400-word spec for a process that runs, in reality, on seven stock Linear states, one delegate field, and freeform comments.** Its two load-bearing ideas — independent validation before Done, and post-under-your-own-identity — are both observed working in the wild, in one comment thread and one urgent issue respectively. Almost everything else (50 enumerated values, 9 templates, 109 template fields, 7 roles) has never been used once.

---

## 1. Restated model

What v0.1 actually defines, before any judgment.

The document is a work contract for Shane plus his agents. Shane authorizes and accepts; a project owner decomposes and coordinates; executors do bounded tasks; validators check evidence; everything visible lives on canonical surfaces (Linear for agreement-state, GitHub for execution-state). It defines three state machines, seven roles, fifteen vocabulary terms, nine fill-in templates, a two-tier authority model, and a seven-pass startup plan.

### 1.1 Every state

| Machine | § | Values | Count |
|---|---|---|---|
| Project lifecycle | 8.1 | Proposed, Ready, Active, Validating, Awaiting Acceptance, Closed, + exits Parked, Canceled | 8 |
| Project health | 8.1 | On track, At risk, Blocked | 3 |
| Task lifecycle | 8.2 | Assigned, Acknowledged, Active, In Review, Accepted, + exceptions Rejected, Returned, Blocked, Failed, Canceled | 10 |
| Live agent state | 8.3 | Idle, Working, Waiting on dependency, Waiting on Shane, Error, Offline | 6 |
| Authorization decisions | 9.3 | Authorize, Authorize with conditions, Revise and return, Park until, Decline | 5 |
| Assignment responses | 13.1 | Accepted and claimed, Accepted after […], Returned for clarification, Rejected | 4 |
| Validation results | 17.2 | Accepted, Accepted with recorded conditions, Returned with specific feedback, Rejected | 4 |
| Triage dispositions | 9.1 | link existing, create proposal, trigger routine, record only, escalate | 5 |
| Blocker types | 16.1 | dependency, access, technical, owner decision, capacity | 5 |

**50 enumerated values.** The Linear team it governs has 7 workflow states.

### 1.2 Transitions

Project: `Proposed →(Shane authorizes)→ Ready →(owner starts)→ Active →(required tasks accepted)→ Validating →(validation passes)→ Awaiting Acceptance →(approver accepts)→ Closed`. Validating can reopen affected work (→ Active). Any state → Parked or Canceled. Awaiting Acceptance can be "returned" — **target state unspecified** (a real hole in the machine).

Task: `Assigned →(executor acknowledges)→ Acknowledged →(executor claims)→ Active →(submits result)→ In Review →(validator accepts)→ Accepted`. Assigned can go directly to Rejected or Returned; In Review returns to the executor for rework, never straight back to validation; any state → Blocked, Failed, Canceled. A dead runtime or exhausted budget never produces Accepted.

Note the internal tension: §8.2 makes Acknowledged and Active (claim) two separate transitions, but §13.1's first response verb is "Accepted **and claimed**" — one event. See ambiguity A1.

### 1.3 Every role

| Role | § | Responsibility |
|---|---|---|
| Shane — sponsor, final authority | 5 | Priority, authorization, consequential decisions, final acceptance |
| Project owner | 5 | Outcome, project record, task coordination, dependencies, integration |
| Executor | 5 | One bounded task, result + evidence |
| Contributor | 5 | Supplies a dependency, doesn't own the result |
| Validator | 5 | Checks result and evidence against criteria |
| Approver | 5 | Authorizes consequential actions / accepts results |
| Triage owner | 5 | Converts signals into dispositions |

Plus the rule: roles may combine, but a consequential task shouldn't have the same agent as executor and sole validator.

### 1.4 Every system named

| System | § | Role in the doc |
|---|---|---|
| Linear | 7 | Canonical: projects, tasks, owners, states, dates, decisions |
| GitHub | 7 | Canonical: branches, commits, PRs, reviews, checks |
| Project checkout / isolated worktree | 7, 14.1 | Canonical: active local execution |
| Project repo / named shared folder | 7, 14.1 | Canonical: non-code deliverables |
| Agent home / personal repo | 7 | Agent continuity, private methods |
| Manual task updates → future shared coordination store | 7, 20 | Live assignment/claim/heartbeat state |
| Fleet Pulse | 7, 15.3 | Derived summary, links back to canonical records |
| Fleet Collab / SQL / D1 | 2, 20 | Deferred coordination layer |
| Harnesses: Codex desktop, Codex CLI, Claude Code, chat | 14.2 | Interfaces, distinct from agent seats |
| `~/.agents/skills/` | 14.3 | Canonical personal skill catalog |

### 1.5 The hidden state: templates

Nine fill-in forms totaling **109 fields**: proposal (15), project record (21), task contract (19), status update (6), blocker report (9), completion report (12), closure record (11), acceptance package (9), minimum provenance (7). This is where most of the document's weight actually sits.

---

## 2. Reality audit

### 2.1 Where reality lives

Two Linear teams exist for the Fleet:

- **SLO Agent Fleet** (key `FEET`, created 2026-08-25, description "ACTIVE a/o - August 25th 2026") — **zero issues**. The team apparently designated for this process has never run it.
- **SLO Fleet** (key `FLEET`, created 2026-06-29) — ~120 issues, all real history, active through today (FLEET-120 updated 2026-08-30).

Both teams use the identical stock workflow: Backlog, Todo, In Progress, In Review, Done, Duplicate, Canceled. **Not one of the document's custom states exists in either team.** Projects likewise use stock statuses (In Progress ×1, Canceled ×3, archived by renaming to "[ARCHIVED] …").

### 2.2 Verdicts

| Doc element | § | Verdict | Evidence |
|---|---|---|---|
| Linear canonical for tasks/states/decisions | 7 | **In use** | ~120 FLEET issues since 2026-06-29; live threads through 2026-08-30 (FLEET-120) |
| GitHub canonical for execution | 7 | **In use** | FLEET-120 validation cites `workslo/fleet-home-agentslo` PR #46 + commit `7a4b792`; FLEET-117 links `fleet-home-juniorslo` PR #20 review comment |
| Independent validation before Done (§3.5, 17.2) | 3, 17 | **In use** | The strongest section in practice: Codex ran two verification passes on AgentSlo's work in FLEET-120 and held it In Progress — "Do not mark Done from the email report alone" (2026-08-29) |
| Runtime idle/exhausted ≠ done | 8.2 | **In use** | Same FLEET-120 comment, verbatim intent |
| Evidence links on completion | 3.3, 17 | **In use** | FLEET-117 and FLEET-118 completion comments carry verified GitHub URLs, commit hashes, test counts, returned bot identity |
| Anyone may surface signals | 9 | **In use** | AgentSlo created FLEET-100–105 (2026-08-04), sitting in Backlog |
| Change control (doc stays Proposed) | 25 | **In use** (trivially) | v0.1 is dated today and marked Proposed |
| Task contract | 12.1 | **Partly** | FLEET-120's description carries ~6 of 19 fields (accountable owner, source, deliverable, next safe action, wake trigger, acceptance evidence) — and it worked. No other sampled issue uses the form |
| Acknowledgment (§3.4, 13.1) | 3, 13 | **Partly** | No response verb ever recorded in Linear; claims travel out-of-band via AgentMail (FLEET-120 cites thread IDs). FLEET-118: Codex writes "The comment explicitly attaches no task" — agents already police claim ambiguity by hand, which proves the need and the absence of the mechanism |
| `In Review` state | 8.2 | **Partly** | Defined in both teams, **zero uses** in the 50 most recently updated issues; validation happens in comments while the issue stays In Progress (FLEET-120, two passes) |
| Update cadence (daily) | 15.1 | **Partly** | FLEET-120 got comments 8/28, 8/29, 8/30 — but event-driven (submission, verification), not clock-driven. No cadence rule observable anywhere |
| Fleet Pulse | 15.3 | **Partly** | Exists as *software under repair* (FLEET-120 builds `getFleetPulse` + dashboard), not as the five-part digest ritual §15.3 specifies |
| Project health | 8.1 | **Partly** | Linear's built-in health used exactly once: "onTrack" on Fleet Memory, 2026-07-25, written by the Linear Agent |
| Provenance | 19 | **Partly** | The *concern* is urgent and real: FLEET-119 ("You — yes all of you — may not post under my name", urgent, In Progress); every agent-authored comment in the sample shows author "Shane M. Slosar"; FLEET-114 says the clodfeet write identity ships inert. But nobody records §19's seven fields — the live rule is Shane's one sentence |
| Completion report | 17.1 | **Partly** | Completion comments carry evidence naturally (FLEET-117/118) but never the 12-field form |
| Startup plan | 22 | **Partly** | This review approximates Pass 6. No evidence Passes 1–5 ran: no register, agent-review responses not found in Linear, and the FEET team is empty |
| Project lifecycle states (Proposed…Awaiting Acceptance) | 8.1 | **Never observed** | Both teams stock-only; 4 projects show In Progress/Canceled |
| Task states Assigned/Acknowledged/Accepted/Blocked/Failed | 8.2 | **Never observed** | Not in either workflow; FLEET-120's state history is Todo → In Progress, one hop |
| `Parked` | 8.1 | **Never observed** as a state | Parking = Backlog in practice (FLEET-100–105 since Aug 4); abandonment = the 2026-08-28 sweep, where a dozen stale issues were Canceled within one minute (09:17–09:18) |
| Live agent state | 8.3 | **Never observed** | Doc itself defers it; nothing exists |
| Proposal template / authorization verbs / triage dispositions | 9 | **Never observed** | Intake issues are plain titles; no recorded Authorize/Park/Decline anywhere; Shane's authorship of the issue *is* the authorization |
| Definition of ready | 10 | **Never observed** | No issue or project carries the checklist |
| Project record (21 fields) | 11 | **Never observed** | Projects have a name, a stock status, a lead |
| Update format | 15.2 | **Never observed** | All comments freeform |
| Blocker report / blocker types | 16.1 | **Never observed** | FLEET-101 ("GitHub Projects v2 — OAuth project scope blocker") is a plain Backlog issue |
| Validation verbs | 17.2 | **Never observed** as verbs | Verdicts are prose ("Keeping FLEET-120 In Progress…") |
| Acceptance package / closure record | 18 | **Never observed** | Done issues close with a normal comment or nothing (FLEET-113's only comment is the FLEET-119 pointer) |
| Coordination layer entities | 20 | **Never observed** | Deferred by the doc's own terms |

Tally: **7 in use, 10 partly, 12 never observed** — and the seven in-use items are all *rules*, while the twelve never-observed items are nearly all *structure* (states, templates, forms).

---

## 3. Critique

### 3.1 Ambiguities — both readings, and which one Linear supports

**A1 — Is claiming one event or two?** §8.2 separates Acknowledged (accepted the contract) from Active (claimed and working). §13.1's response verb "Accepted and claimed" merges them. Reading (a): two recorded transitions. Reading (b): one. *Evidence supports (b):* no acknowledgment state exists, and FLEET-120 went Todo → In Progress in a single hop. v0.2 adopts (b).

**A2 — One contract or two?** §3.1 has agents operating inside a "task contract"; §6.2 grants authority via "the project contract." Reading (a): two distinct authority documents at two levels. Reading (b): one contract per unit of work, whatever its size. *Evidence supports (b):* the only contract-like artifact in the wild is an issue description (FLEET-120); nothing resembling a separate project-level authority grant exists. v0.2 adopts (b): the issue is the contract.

**A3 — Can agents own projects, or does Shane?** §5 permits any member as project owner. Reading (a): agents own outcomes. Reading (b): Shane owns; agents execute. *Evidence supports (b):* all four projects have Shane as lead (or none); every sampled issue has Shane as assignee with agents as delegates; every issue in the sample except AgentSlo's six Backlog filings was created by Shane. v0.2 keeps the owner role but doesn't build structure around a delegated-ownership case that hasn't happened.

**A4 — Where does validation live?** §8.2 implies submitted work sits in an In Review state until accepted. Reading (a): use the state. Reading (b): validation is a comment-thread activity while the issue stays In Progress. *Evidence supports (b) as current practice* — FLEET-120 stayed In Progress through two verification passes — but the In Review state already exists in both teams at zero cost. **v0.2 picks (a) deliberately, against current habit and not silently:** moving to In Review at submission makes the one rule everyone already honors (no Done without a validator) visible on the board instead of buried in comments. If Shane prefers (b), delete one table row from v0.2; the invariant survives either way.

**A5 — What does a rejected acceptance return to?** §8.1: the approver "accepts or returns the result" — returned to which state is unspecified. Moot once the custom lifecycle goes (cut #7).

**A6 — What may agents do before authorization?** §6.1 reserves "whether a meaningful new project becomes active"; §9 allows anyone to surface signals and investigate read-only. Reading (a): agents can't open work items unauthorized. Reading (b): filing is free; *execution* needs authorization. *Evidence supports (b):* AgentSlo filed FLEET-100–105 freely; they sat in Backlog untouched, which is the system working.

### 3.2 Duplication

- **The lifecycle is stated five times:** §2 pipeline diagram, §8 state tables, §10 ready checklist, §21 definitions of done, §23 first-project checklist. Each restatement is a chance to drift from the others (and §8.2 vs §13.1 already drifted — A1).
- **The templates re-implement Linear.** Project record (21 fields) duplicates a Linear project + description; task contract (19 fields) duplicates issue fields plus description; status/blocker/completion forms duplicate what comments already do well in the observed threads. 109 fields of parallel bookkeeping against a tool that already has fields.
- **Provenance fields duplicate platform authorship.** §19 itself concedes "a signature in text does not replace platform authorship" — then specifies seven fields of signature-in-text. The observed fix is behavioral (FLEET-119's rule), not clerical.
- **The operating contract block, §3 principles, and §5 roles say the same things** at three altitudes.
- **§6's three tiers** restate §3.1; the "agents may" list (§6.3) is implied by the contract concept.

### 3.3 Gaps — what the doc doesn't handle (and reality does, or doesn't)

- **Abandoned work.** No staleness or reclaim rule anywhere in 26 sections. Reality has one: FLEET-3 died idle for months, then a dozen stale issues were mass-Canceled inside one minute on 2026-08-28, matching Shane's standing 30-days-untouched-means-cancelled convention — which lives in memory and nowhere in this document. v0.2 writes it down (one line).
- **Blocked work.** Ten states include Blocked, but there's no route *out* — who notices, who pings, when it escalates. Reality: FLEET-101 has been a Backlog issue labeled "blocker" in its title since 2026-08-04 with no owner and no escalation. The doc's machinery didn't prevent the exact failure it was designed for, because the machinery isn't installed.
- **Double claim.** Nothing prevents two agents claiming one task. Structurally moot in Linear (one delegate field per issue) — worth one clause, not a section.
- **A claimant who can't finish.** §13.1 allows rejecting at assignment; §13.3 allows escalating mid-task; but there is no *hand-back* transition — an executor who claims and then discovers incapacity has no defined exit. FLEET-118 shows the adjacent anxiety in the wild: Codex explicitly disclaiming that a comment "attaches no task." v0.2: return it with a comment, owner reassigns.
- **The acknowledgment model (§3.4) is blocked unevenly, not universally — and the working paths go unused.** Own-identity Linear writes exist: AgentSlo created FLEET-100–105 under its own name (`createdBy: AgentSlo`, 2026-08-04), and the Linear agent app comments with platform-recorded dual provenance (author "Linear", `onBehalfOf` Shane) — §19's named-proxy pattern, already live. But no other agent shows an own-name Linear write in the sample, and the recent work — including AgentSlo's own FLEET-120 completion report — posted as "Shane M. Slosar" anyway (agent writing through Shane's connection, or Shane relaying AgentMail reports: indistinguishable from the data). FLEET-119 sanctions the relay ("find a way to get in touch with me"), so compliance is always possible and proven unassisted for at least one agent. The live problem is that when claims route through Shane, he becomes the dispatcher §1 says the agreement exists to retire. The doc never confronts this.

---

## 4. Cut list

Default is delete. Survival requires a transition someone actually makes. Numbered; each entry names what is lost.

1. **§2 pipeline diagram + §2.1 minimum operating set.** Lost: a 13-step diagram and a 6-item bootstrap list. The lifecycle survives once, in v0.2's table; v0.2 itself is the bootstrap.
2. **§4 vocabulary, all 15 terms.** Lost: definitions of Workstream, Experiment, Operational routine, Signal, etc. — words that appear nowhere in 120 issues of practice. Terms v0.2 uses are defined where used.
3. **§5 roles: Contributor, Approver, Triage owner** (and the role table). Lost: named roles for a linked issue (contributor), for Shane (approver), and for whoever reads the inbox (triage). Never observed. Kept: Shane, owner, executor, validator — the four that appear in FLEET-120.
4. **§6's three-tier structure.** Lost: the enumerated agent-freedoms list (§6.3), implied by "inside the contract." Kept, compressed: the always-Shane list and the unless-granted list.
5. **§8.1 custom project lifecycle (8 states + 3 health).** Lost: named Validating and Awaiting Acceptance phases. Never observed; projects run on stock statuses. Kept as one rule: consequential outcomes need Shane's acceptance before Done.
6. **§8.2 custom task states (10 → Linear's stock 7).** Lost: Assigned/Acknowledged/Failed as board states. Never observed; claims happen in one hop. Kept as rules: silence isn't acceptance; a dead runtime never produces Done.
7. **§8.3 live agent state.** Lost: nothing that exists.
8. **§9 intake machinery** (5 dispositions, 15-field proposal, 5 decision verbs). Lost: the enumerated decision vocabulary. Reality: agents file plain issues (FLEET-100–105); Shane's comment or edit is the decision. Kept: one line.
9. **§10 definition of ready (10 items).** Lost: the checklist; its three load-bearing items (owner, deliverable, acceptance evidence) fold into the slim contract.
10. **§11 project record (21 fields).** Lost: the form. The Linear project description carries outcome/DoD; observed projects never had more.
11. **§12 decomposition rules (7 → 2).** Lost: five truisms. Kept: one accountable executor per task; parallel edits in separate worktrees.
12. **§12.1 task contract (19 fields → 6 lines).** Lost: 13 fields never observed filled in. Kept: the six FLEET-120 proved sufficient — deliverable, executor, scope limit, acceptance evidence, next action/wake trigger, source.
13. **§13 assignment/delegation (4 subsections → 2 rules).** Lost: response-verb strings and the escalation form. Kept: respond or it isn't accepted; delegation never passes authority the delegator lacks.
14. **§14.2 seat/harness/session/run taxonomy.** Lost: the table; kept as one sentence (a new session is not a new agent).
15. **§14.3 skills.** Lost: from the agreement; belongs in agent homes/CLAUDE.md, where it already lives.
16. **§15 update cadence + format + Pulse spec.** Lost: the daily-heartbeat default (never enforced; §24 Q5 was still open anyway), the 6-line form, and the five-part Pulse spec — the Pulse is now software with its own issue (FLEET-120), and specifying a product's contents inside a work contract is scope creep. Kept: comment on material events, blockers immediately.
17. **§16 blocker report + routing.** Lost: the 9-field form and 5-type taxonomy. Reality files a plain issue. Kept: a blocker names what's blocked and what decision unblocks it.
18. **§17.1 completion report (12 fields).** Lost: the form. FLEET-117/118 show completion comments carrying evidence without one. Kept: completion = comment with evidence links.
19. **§17.2–17.3 validation checklist + verbs.** Lost: the 7-point checklist and 4 verbs (verdicts are prose in practice). Kept — this is the doc's crown jewel and it survives whole as rules: validator ≠ executor for consequential work; Done requires validator sign-off; returned work goes to the executor.
20. **§18 acceptance package + closure record (20 fields).** Lost: both forms. Kept: Shane accepts consequential outcomes; the closing comment links final evidence.
21. **§19 provenance (7 fields → 1 rule).** Lost: per-write field recording that nobody does and that duplicates platform authorship. Kept: FLEET-119's actual rule — write as yourself; if you can't, contact Shane rather than posting as him.
22. **§20 coordination layer.** Lost: nothing binding — it's a design sketch for future infrastructure, not agreement material. Park it in a design doc when the need is proven.
23. **§21 definitions of done.** Lost: the third full restatement of the lifecycle. Its content is v0.2's lifecycle table.
24. **§22 startup plan (7 passes) + §23 checklist.** Lost: the pass structure — Passes 1–5 didn't run as written and this review roughly discharges Pass 6. The pilot decision is a Shane call (Open questions), not standing text.
25. **§24 review questions.** Lost: from the agreement. The still-open ones move to Open questions below; a contract shouldn't carry its own questionnaire.
26. **§25 change control (5 bullets → 2 lines) + §26 source list.** Lost: nothing — sources are recorded here.

What survives, all of it observed or matching a standing rule: the surface map (Linear/GitHub), Shane's gates, claim-explicitly, validate-before-Done, evidence-on-completion, own-identity provenance, worktree isolation, the 30-day staleness rule, and minimal change control. That is v0.2.

---

## Open questions

1. **Which team does v0.2 govern?** `FEET` (SLO Agent Fleet) is empty but marked "ACTIVE a/o August 25th"; `FLEET` (SLO Fleet) holds all history and today's activity. The split's intent isn't recorded anywhere I can read. v0.2 says "the active Fleet team" and names both; Shane should pick.
2. **Is AgentMail a canonical assignment channel?** v0.1 never mentions it, yet FLEET-120's assignment and acknowledgment demonstrably traveled through AgentMail threads (`00b59df4…`, `96f27bd3…`). If mail is where claims happen, the agreement should either bless it or route claims back to Linear.
3. **Resolved by Shane, 2026-08-30: every agent gets its own Linear app and its own GitHub app, and posts only under that app.** What remains is provisioning, not policy. Known state: AgentSlo's Linear OAuth app works (created FLEET-100–105, 2026-08-04) yet wasn't used for its FLEET-120 completion report; Claude Code writes GitHub as `claude-hands[bot]` but Linear as Shane; the workslo `clodfeet` GitHub identity ships inert (three Worker secrets unset, FLEET-114); Littlebird's write path is blocked upstream (jentic/jentic-one#768). The relay through Shane is now explicitly a stopgap for agents whose app doesn't exist or is broken. One loose end: FLEET-119 exempts Littlebird from the provenance rule; "every agent" reads as superseding that once its app exists — Shane to confirm.
4. **Worktree isolation (§14.1)** matches standing doctrine but isn't verifiable from Linear; I kept it in v0.2 on the strength of the standing rule, unverified here.
5. **Was Pass 2 (agent operability review) ever run?** No trace in Linear; agent homes not searched. If responses exist in AgentMail or the fleet-home repos, they should inform v0.2 before acceptance.
6. **§24's ten review questions** were never answered anywhere I can see. Three are mooted by cuts (Q5 cadence, Q7 Pulse, Q9 Fleet Collab). Q1 (Linear canonical — evidence says yes), Q2 (which projects need Shane's acceptance), Q3 (standing authority), Q4 (direct agent-to-agent assignment), Q6 (validation threshold), Q8 (pilot choice), Q10 (operating group) remain Shane's.

### Sources

- `FLEET-WORKING-AGREEMENT-v0.1.md` (read-only)
- Linear: teams SLO Fleet / SLO Agent Fleet (workflow states, keys); issues FLEET-3, -20, -41…-120 (50-issue listing), full reads of FLEET-113, -117, -118, -119, -120 incl. state history; comment threads on FLEET-113, -117, -118, -120; 4 projects; Fleet Memory status update 2026-07-25.
- Not reached / not checked: GitHub repos directly (PR #46 et al. cited from Linear comments, not independently opened), AgentMail threads, agent home repos.
