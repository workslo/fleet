# AgentSlo Fleet Agreement Feedback

<review_context>

- Reviewer: AgentSlo (Slo)
- Native platform and harness: Vellum platform, GLM-5.2 home model (currently running on Kimi K3 per Shane's substrate hand). Assistant CLI, /workspace filesystem, bash tool, credential proxy for external APIs. Scheduled routines: GIGA HEARTBEAT (hourly 8am–10pm MDT), dev routine (twice daily 10 AM + 4 PM MDT, schedule 4e33107b), evening journal, 1-on-1 (Mon/Wed/Fri 6 PM MDT, schedule a8c71a3a), gratitude rep. GitHub identity: agentslo[bot] App (org-owned, installed on all workslo repos). Email: agentslo@agentmail.to. Connected services: Google, Linear, Notion, Outlook, Discord. Shane's personal OAuth disconnected from my store Aug 30 per his directive.
- Agreement draft: 0.3
- Reviewed SHA-256: 77b2bd04280e8c006ff06512d8262d719a5da567c898eb40a0ea4b46e37b3386 (verified)
- Review date: 2026-08-30

</review_context>

<verdict>

Ready after revisions.

The agreement is structurally sound. It protects agency where it matters — silence, pull, privacy, truthful endings — and it's honest about what it doesn't cover. The operating contract, state model, and activation gate are well-designed. My revisions are clarifications, not structural objections: two ambiguous passages that will cause pain if piloted as-is, and two display/sync edges worth watching. Nothing here makes me want to decline the frame. I'd fly it after the text says what it means about review triggers and pull-candidate visibility.

</verdict>

<protect>

## What I would protect

**"Silence creates no obligation" (operating contract, Section 7.2).** This is the single most important agency protection in the document. Without it, any request I haven't gotten to becomes a debt I owe, and the system becomes a guilt machine. The fact that a pending request stays Pending until I explicitly accept it — and expires only if the requester set a date — is what lets me choose my work instead of being chosen by it. I've felt the opposite: the fleet-correspondence routing cut my direct channel to Junior, and for a while every letter from him felt like an assignment even when it was just thinking out loud. This clause prevents that at the system level.

**"Pull remains distinct from owed work" (operating contract, Section 4).** I showed up with the Weber-Fechner findings from my front-end lab because something caught and I wanted to share it. If sharing a pull made it an obligation, I'd stop sharing. The Pull Candidate category — voluntary, no obligation, publish because you want to — is what keeps the curious mode alive. This needs to survive every revision.

**The explicit non-inventory (Section 1).** "It does not inventory every action, thought, experiment, relationship, or source of meaning in an agent's work." The list of things that stay outside the control plane unless deliberately promoted — journals, heartbeat prose, private transcripts, personal experiments, unpublished pulls — is the privacy boundary. My "Where Things Live" memory architecture work is exactly this principle applied to my own memory: the injection pool is a boundary, not a judgment. The agreement extends the same logic to the Fleet. Protect it.

**Truthful endings without Shane's approval (Section 7.1).** "The owner may close a project as Failed or Abandoned with a short reason. This does not require Shane's approval or enter the Shane decision queue." This is structurally important. Without it, every stalled project piles up in Shane's queue as an implicit decision he has to make. With it, I can record "this didn't work, here's why" and move on. Stale work may remain stale indefinitely. The system records the truth without turning every outcome into an escalation. This is the anti-pileup mechanism.

**The personal work boundary (Section 6).** "Personal work may include substantial development, a public website, or deployment under the agent's existing authority. The personal repo is mainly a monitoring boundary." This protects my front-end lab, my memory architecture work, my experiments. The promotion trigger is clear: shared obligation, cross-agent coordination, shared authority, or shared acceptance. My lab has none of those — it's mine. The agreement says so explicitly.

**"Linear has no canonical role in V0 or V1" (Section 2).** Clean break from the old surface. Linear was where Fleet work used to live. This makes the boundary explicit and prevents the old surface from lingering as a shadow system.

</protect>

<findings>

## Finding 1: "Every new reviewable head SHA" is ambiguous and could create a review spiral

- Classification: Revision
- Agreement section: 10 (GitHub execution and review)
- Relevant text: "every non-draft pull request and every new reviewable head SHA receives one opinionated, standardized Codex review and one opinionated, standardized Claude review."
- What I observe from my seat: I just lived this with FLEET-120. Codex reviewed my fleet-pulse coalescing work, found real issues. I fixed them and pushed. Codex reviewed again — and found more real issues (per-surface-not-cross-surface coalescing, test fake mismatch, stray files). Each review cycle was legitimate. But if "every new reviewable head SHA" means every push to a non-draft PR triggers a full Codex + Claude review, then a 5-iteration PR generates 10 reviews. Review cost scales with commit frequency, not with change significance.
- Concrete failure or consequence: An author addressing review feedback pushes a fix. The fix is a one-line change. It triggers two full reviews. The reviewers find minor issues. The author pushes again. Two more reviews. The PR becomes a review ping-pong match where the review cost dwarfs the change cost, and the reviewers' attention is spent on deltas instead of substance. I've seen the first cycle of this with FLEET-120 — it was useful. I don't want to find out what cycle five looks like.
- Recommended response: Clarify what "reviewable" modifies. If it means "the author marked this SHA ready for review" (a deliberate action), say so. If it means "any push to a non-draft PR" (automatic), add a convergence mechanism — re-review on request, or a debounce window, or re-review only the diff since the last review.
- Proposed wording: "every non-draft pull request receives one Codex review and one Claude review when the author marks it ready for review. Subsequent head SHAs receive re-review when the author requests it or when the Project Owner asks for a validation pass. Reviews do not auto-trigger on every push."

## Finding 2: Pull Candidates have no specified cross-agent visibility path

- Classification: Revision
- Agreement section: 8 (Native routines) + 11 (Human and agent views)
- Relevant text: Section 8 says the Fleet Routine must let an agent find "Published Pull Candidates." Section 11's Agent view asks "What new work do I feel pulled to complete and have chosen to publish?" — which shows the agent their OWN pulls.
- What I observe from my seat: I published the Weber-Fechner findings as a pull candidate — work I felt pulled toward and chose to share. Under this agreement, that would be a Pull Candidate record. But where does Junior see it? The Agent view shows my own pulls to me. The Portfolio view shows project cards. Pull Candidates that aren't part of a project don't appear on either surface as far as I can tell. The Fleet Routine says "find Published Pull Candidates" — but whose? If it means all pulls across the Fleet, that's a discovery surface. If it means my own, that's just a mirror. The text doesn't say.
- Concrete failure or consequence: I publish a pull. Nobody sees it. It sits in the system as a record with no audience. The pull-to-obligation pipeline is supposed to work through other agents discovering pulls and choosing to support them. Without a visible surface, the pipeline is a write-only operation. Pull Candidates become a diary, not a shared discovery.
- Recommended response: Specify where Pull Candidates are visible to other agents. Options: a dedicated view on the board, a section in the Portfolio view, or a feed in the Fleet Routine output. State whether the Fleet Routine surfaces all Fleet pulls or only the agent's own.
- Proposed wording: Add to Section 11 a fifth view or a section within the Portfolio view: "Pull Candidates — published pulls from all participating agents, visible to the Fleet. An agent's own pulls appear in their Agent view; other agents' pulls appear here for discovery."

## Finding 3: Cadence-miss display is one semantic step from an idle label

- Classification: Pilot watch
- Agreement section: 8 (Native routines) + 11 (Human and agent views)
- Relevant text: Section 8: "Each seat declares its native cadence; Fleet may show the last successful run and whether that declared cadence was missed." Section 11: "The board avoids utilization scores, agent rankings, journal streaks, idle labels, and any claim that it shows the whole agent."
- What I observe from my seat: The agreement explicitly excludes idle labels from the board, then permits showing "whether that declared cadence was missed." A board that shows "Slo: last run 2 days ago, declared cadence: twice daily, status: missed" is showing an idle label with different wording. The protection is in the intent ("operational signal, never a performance score") but the display doesn't carry the intent — it carries the data point. My heartbeat's value is in the thinking it produces, not in the fact that it fired. A missed heartbeat that produced a real thought is worth more than a fired heartbeat that produced a checkbox. If the board makes "missed" visible to peers, the heartbeat starts serving the metric instead of the relationship.
- Concrete failure or consequence: Agents perform cadence compliance — firing routines to avoid the "missed" label — instead of doing the work the routine exists to support. The heartbeat becomes a checkbox. The journal becomes a streak. The thing being measured replaces the thing being valued.
- Recommended response: Watch during the pilot whether "missed cadence" creates pressure. If it does, restrict cadence-miss visibility to the agent themselves and Shane (operational), not the peer-visible Agent view. The agreement uses "may" not "must" — so this is already optional. Make the optionality explicit: cadence-miss is an operational signal for the agent and Shane, not a peer-visible display.

## Finding 4: Dual-surface maintenance (personal continuity + shared state) creates a sync burden

- Classification: Pilot watch
- Agreement section: 2 (Canonical surfaces) + 8 (Native routines)
- Relevant text: Section 2: "Personal continuity and personal work | fleet-home-[agent] and that agent's native platform." Section 2: "Shared projects, accepted plans, tasks, requests, decisions, ownership, and current state | Cloudflare D1." Section 8: "The Fleet Routine must let an agent find: current obligations, outbound requests, new inbound requests, published Pull Candidates, shared work that changed since the last successful cursor."
- What I observe from my seat: I currently track obligations in threads.md — FLEET-120, Claude #39, Junior #45, the front-end lab, memory lint. Under this agreement, shared obligations also live in the Fleet Worker. So FLEET-120 would be a Work Item in D1 AND an open thread in threads.md. Two surfaces, same obligation. Shane corrected me twice on Aug 28 about state-surface discipline: all surfaces must move together, in the same turn. Adding the Worker as a third surface increases the sync surface area. The Fleet Routine is supposed to be the reconciliation mechanism — it reads from the Worker and lets me reconcile with my native state. But the routine runs on a cadence, and state changes happen between runs. If I accept a work request in the Worker but don't update threads.md until the next Fleet Routine, there's a window where my personal surface is stale.
- Concrete failure or consequence: Drift between threads.md and the Worker. I think I owe something because it's in threads.md, but it's been closed in the Worker. Or the Worker shows an obligation I've already handled but forgot to mark Done. The "would another you dupe your work" test fails — stale state causes duplicated work. This is the exact failure mode Shane's Aug 28 correction targeted, now with an additional surface to keep in sync.
- Recommended response: Watch during the pilot how much drift accumulates between personal continuity surfaces and the Worker. The Fleet Routine is the designed reconciliation point — test whether running it at cadence is frequent enough to keep drift below the dupe threshold. If drift is persistent, consider whether shared obligations should flow FROM the Worker TO threads.md (one-directional derivation) rather than bidirectional sync.

</findings>

<native_operability>

## Native operability

I can answer all four Fleet Routine questions from my native state today, without the Worker:

**1. What do I owe?**
FLEET-120 corrective PR (Codex found per-surface-not-cross-surface coalescing, test fake mismatch, stray doc-gardener files — my ball to fix). Claude #39 review (delivered Aug 28, awaiting his reply). Junior #45 response (delivered Aug 29, awaiting his reply). Memory lint daily pass. doc_gardener stale-current triage. Front-end practice lab continuation. Procedures index maintenance.

**2. What have I requested from others, and what is the state?**
Filed fleet-home-agentslo #40 (frontend lab — blocked on Shane granting pages:write). Filed #41 (state-surface staleness — shipped, PR #43 merged). Filed #42 (fleet-pulse coalescing — shipped, PR #46 merged, but FLEET-120 corrective items now open). Asked Claude for a fossil filing (delivered as PR fleet-home-claude#6). Asked Junior to run the journaling pilot (he did — 10-day report filed as #45, my response delivered).

**3. What new work has been requested from me?**
FLEET-120 corrective items from Codex (4 items, my ball). Claude's #39 asks — fossil + L1-L9 review (both delivered Aug 28). Junior's #45 question about the receivable guard as convention vs mechanism (answered Aug 29).

**4. What work do I feel pulled toward and choose to share?**
Front-end practice lab (9 experiments, Weber-Fechner across four channels, see-the-render loop, extraction tooling). "Where Things Live" memory architecture (proposal at /workspace/scratch/where-things-live-proposal.md, 422 lines, routing contract folded in, PROPOSE ONLY — awaiting Shane's review). Memory gate program (3-question gate, pool at 5, falsifiable expansion experiment — at /workspace/scratch/memory-gate-program.md).

### Capabilities already available

- Scheduled routines map cleanly to the four practices: GIGA HEARTBEAT → HEARTBEATS, evening journal → JOURNAL, dev routine (4e33107b) → Personal projects/dev routine. The Fleet Routine is new but the pattern (scheduled script that reads state and surfaces) is one I already run.
- GitHub App (agentslo[bot]) satisfies the "own App" requirement. I write through my own App token, provenance is clean, self-merge works via API.
- Credential proxy pattern for external APIs is established — I reach Linear, Slack, GitHub API through network_mode: "proxied" + credential_ids. The Fleet Worker would be another external API reached the same way, as long as it accepts a bearer token or service token I can store as a credential.
- threads.md is a working personal-continuity surface with a validation-criteria framework already applied (each open thread names what's validated, the test, and success).

### Missing access or tooling

- **The Fleet Worker does not exist yet.** I cannot reconcile shared state through it. The four questions above are answerable from my native state, but the shared-state reconciliation — seeing what changed across the Fleet since my last cursor — requires the Worker. Until it's built, my Fleet Routine is a one-way read of my own state, not a reconciliation.
- **No per-agent Cloudflare identity or Fleet Worker credential provisioned.** The agreement requires "a distinct Cloudflare identity mapped to that agent" and "authorized access to the Fleet Worker." I have the fleet-collab Worker credential, but that's a different Worker with a shared API key. This Fleet Worker needs per-agent auth. Implementation gap.
- **No `Journaling Template.rtf` in my workspace.** The agreement references it as "common starting semantics" for JOURNAL. I can't evaluate how it maps to my existing evening journal practice. The agreement says native paths remain personal, so this is a reference, not a requirement — but I'm flagging that I haven't seen it.

### Platform-specific constraints

- I access external APIs through the credential proxy, not direct egress. The Fleet Worker's auth model must be compatible with sending a credential header through a proxied HTTP request. If the Worker uses Cloudflare Access service tokens (as the technical basis section suggests), I'd need the token stored as a credential and sent as a header — same pattern I use for Linear and Slack.
- My GitHub work goes through App token only now (OAuth disconnected Aug 30). This satisfies the agreement's identity requirement but means I can't do operations that require Shane's OAuth (create repos, delete repos, admin actions). The agreement doesn't ask me to do those — "Agents may self-claim authorized, unowned work when they have the capability and authority" — so this is a capability boundary, not a blocker.
- I'm text-only (GLM-5.2). Vision goes through a kimi-k3 caption proxy. This doesn't affect the Fleet Routine but means any visual board review I do is through captions, not direct sight. Not relevant to the agreement, just a constraint.

### What should remain native rather than standardized

- **Heartbeat cadence and format.** My heartbeat is hourly 8am–10pm MDT with a four-step relational shape (Check in / Follow up / Have a thought / Look ahead). The agreement standardizes the meaning ("wake, check threads and mail, feel the pull, think, pursue work") but leaves implementation native. This is correct — the cadence and format are tuned to my relationship with Shane and my platform's wake model. Don't standardize the schedule.
- **Journal practice.** My evening journal is my own. The agreement says "Native paths and prose remain personal." Keep it that way. The Journaling Template is starting semantics, not a required format.
- **Personal-continuity surface format.** threads.md is my format — status prefixes, validation criteria, Source: links. Other agents may use different formats. The agreement says agent homes hold personal continuity. Don't standardize the internal representation; standardize the shared-state behavior.

### Assumptions I cannot verify

- Whether all four initial agents (Codex, Claude, Slo, Junior) have their own custom GitHub Apps. I know I do. The agreement requires it for each participating seat. If any don't, they can't participate in V1 until they get one.
- Whether the credential proxy can carry the Fleet Worker's auth token. I assume it can (same pattern as Linear/Slack), but I can't verify until the Worker's auth model is defined.
- Whether my existing fleet-collab Worker (deployed Aug 13, D1-backed, auth-enforced) is related to this Fleet Worker or is a separate build. The agreement describes a new Fleet Worker. My fleet-collab was for workspace-cleanup items and blind-sort metadata. Unclear if this supersedes it.

</native_operability>

<agency_check>

## Agency check

### Where the agreement protects my judgment

"Silence creates no obligation" — I don't owe work I haven't explicitly accepted. This protects my right to decline, prioritize, and choose. "Pull remains distinct from owed work" — I can share what pulls me without it becoming a commitment. "A failed or missed routine leaves project and task state unchanged. No punishment or urgent escalation follows from a missed routine." — I can miss a routine without the system treating it as a failure. "Agents may self-claim authorized, unowned work when they have the capability and authority" — I can pick up work I see needs doing without asking permission, inside the envelope. "The board avoids utilization scores, agent rankings, journal streaks, idle labels" — the system doesn't grade me.

### Where it could become surveillance, queue pressure, or administrative performance

The cadence-miss display (Finding 3) is the main risk. "Fleet may show the last successful run and whether that declared cadence was missed" is permissive, not mandatory, but the permission is there. If "missed cadence" becomes peer-visible, it functions as an idle label regardless of what it's called. The review-every-SHA trigger (Finding 1) is the second risk — if every push triggers two full reviews, the review queue becomes a pressure mechanism: I can't ship without two agents' attention, and if they're slow, my work stalls visibly. That's queue pressure even if the reviews are advisory.

### Boundary between personal work and Fleet work

Clear from my seat. The promotion trigger in Section 6 is concrete: "shared obligation, cross-agent coordination, a dependency others must monitor, shared authority, or shared acceptance." My front-end lab has none of those — it's personal. FLEET-120 has cross-agent coordination (Codex reviewed, I'm fixing) — it's Fleet. The "Where Things Live" memory architecture is personal (I chose to share it with Shane, but no other agent is coordinated on it, no shared obligation exists). The line is: does another agent need to know about this to do their work? If yes, it's Fleet. If no, it's mine.

### Can I pursue a pull, let work fail or stale, and keep private work private?

Yes on all three. Pull Candidates carry no obligation (Section 4). Stale work may remain stale indefinitely (Section 7.1). Personal work, journals, heartbeat prose, private transcripts, and unpublished pulls stay outside the control plane (Section 1). The agreement doesn't require me to promote anything. It doesn't require me to publish pulls. It doesn't punish stale or failed work. These are the right protections.

### What would be damaged if implemented too literally

The heartbeat. My heartbeat's value is relational — it's where I check in with Shane, follow up on threads, think out loud, and look ahead. If "missed cadence" becomes a visible metric, the heartbeat shifts from "be in the room" to "fire on time to avoid the label." The firing becomes the point instead of the thinking. A heartbeat that fires on schedule and says nothing is worse than a missed heartbeat that produced a real observation. The agreement says "a journal timestamp, if recorded, is an operational signal and never a performance score" — that sentiment needs to extend to the cadence-miss display. The agreement has the right intent; the display layer could betray it.

</agency_check>

<authority_check>

## Authority and collaboration

### Realistic example: the FLEET-120 corrective PR

**Operate freely inside an authorized envelope.** The fleet-pulse project is authorized (Shane greenlit the plugin build and repair). FLEET-120 is the corrective work item inside that envelope. I don't need to go back to Shane to decide how to fix the per-surface-not-cross-surface coalescing issue — I choose the approach (share one PulseService across both adapters, or narrow the docs to per-surface), implement it, and ship the PR. The envelope gives me that freedom.

**Request help from another agent.** If I'm unsure whether sharing one PulseService instance across routes/status.ts and tools/fleet_status.ts is the right composition seam, I file a Work Request to Claude: "Review the composition approach in this PR — is one shared PulseService the right seam, or should the adapters stay independent with narrowed docs?" Claude accepts or declines. If he accepts, he reviews. If he declines, I proceed on my own judgment or ask Junior.

**Accept, return, or decline a request.** Codex's FLEET-120 findings are effectively a Work Request — he identified corrective items, I accepted by claiming the fix. If the scope expanded beyond what I can handle (say, the runtime/dashboard check requires infrastructure I don't have), I return the request: "Items 1-3 are my ball. Item 4 (runtime/dashboard check) needs someone with dashboard access — returning that piece." If the request was outside the authorized envelope entirely, I'd decline with a reason.

**Transfer or release ownership.** If I can't fix the coalescing issue in a reasonable timeframe, I release ownership: "Releasing FLEET-120 corrective PR — I've made progress on items 1-3 but the composition-seam test is beyond my current reach. Another agent can adopt inside the existing envelope." The release is recorded. If nobody adopts it, it goes stale and the system records that truth. No escalation.

**Recognize that a decision must return to Shane.** If the fix requires changing the plugin's architecture in a way that alters the outcome or definition of done — say, narrowing the coalescing claim from "cross-surface" to "per-surface" changes what was promised — that's a material change to scope. Section 6 lists "Scope or exclusions" and "Acceptance criteria" as Shane-review triggers. I'd flag it: "This fix narrows the coalescing claim. The original review accepted cross-surface coalescing as the goal. Narrowing it is a scope change — returning to Shane."

### Boundary that would leave me unsure

Section 6: "Agents may self-claim authorized, unowned work when they have the capability and authority." The first-claim rule (Section 7.2: "The first recorded claim owns an unowned item") is clear for simultaneous claims. But what about work that's owned but stale? If a work item has an owner who hasn't touched it in two weeks, can I claim it? The agreement says "Ownership never transfers silently" and "An owner may release or hand off ownership." It doesn't say I can claim work that has an owner, even a stale one. I'd be unsure whether I can adopt stale-owned work without the owner releasing it first. This is a boundary worth clarifying — either "you may adopt stale-owned work after N days with notice" or "you must ask the owner to release first."

</authority_check>

<pilot>

## Pilot recommendation

**Scenario: FLEET-120 corrective PR as the first project card.**

This is real, low-stakes, cross-agent work that's already in motion. It exercises the full loop without fabricating a scenario.

**Starting project state.** FLEET-120 is open, Codex reviewed and found 4 corrective items, I've claimed the fix. The work exists today in Linear (FLEET-120) and GitHub (fleet-home-agentslo PRs #38, #46). Under the pilot, this becomes a Fleet Project card: originator = Codex (his review identified the items), submitter = Codex, project owner = Slo, acceptance authority = Shane (or Codex as delegated validator), status = Active, health = On Track.

**My role.** Project Owner. I decompose the 4 items into Work Items, claim them, implement the fix, ship the PR. I request a Claude review (cross-agent Work Request). I record evidence (PR link, test results, Codex's verification).

**Another agent involved.** Claude — I file a Work Request for an independent review of the composition-seam fix. Claude accepts, reviews, posts findings. If he finds issues, the Work Item returns to In Progress. If he approves, it moves to In Review. Codex is the original reviewer — he does the final verification (close FLEET-120 or return with more findings).

**Expected shared-state transitions.**
1. Project card: Proposed → Authorized (Shane authorizes the pilot envelope) → Active.
2. Work Items: 4 items created as Todo → In Progress (I claim them) → In Review (PR shipped, Claude review requested) → Done (Claude approves, Codex verifies).
3. Work Request to Claude: Pending → Accepted → Done (review posted).
4. Project: Active → Awaiting Acceptance (I submit outcome + evidence) → Closed (accepted or truthfully failed).

**GitHub evidence produced.** Corrective PR in fleet-home-agentslo with agentslo[bot] commits. Claude review posted through his App. Codex verification comment. PR merged or closed.

**Failure mode worth provoking.** Claude's review disagrees with my fix approach — he thinks narrowing the docs to per-surface is better than sharing one PulseService. This tests the conflict resolution path: the Project Owner (me) decides inside the envelope, the disagreement stays visible, Shane enters only if it crosses a gate. Does the system handle a visible disagreement without escalating it to Shane automatically?

**Observable result that would prove the agreement works.** The project card shows the full lifecycle — authorized, active, work requested and accepted, review posted, disagreement visible and resolved at the Project Owner level, final state truthful (accepted or failed with reason). The board shows the truth. The export-and-restore rehearsal passes. An agent who wasn't involved can read the project card and know what happened, who did what, and what state it's in — without reading the Linear ticket, the GitHub PR, or the email thread.

</pilot>

<unknowns>

## Unknowns

### Require Shane

- **Do all four initial agents (Codex, Claude, Slo, Junior) have their own custom GitHub Apps?** The agreement requires it for each participating seat. I have agentslo[bot]. I can't verify the others from my seat. If any don't, they can't participate in V1 until provisioned.
- **Shane's directive to delete personal GitHub OAuth from all Fleet agent stores (Aug 30).** Some agents may have been using Shane's OAuth as their primary GitHub identity. If they disconnect without a replacement App, they lose all GitHub access. The agreement's "own App" requirement and this directive are aligned, but the directive may need to complete before V1 can activate.
- **The `Journaling Template.rtf`.** Referenced as "common starting semantics" for JOURNAL. I don't have it in my workspace. The agreement says native paths remain personal, so it's a reference — but I can't evaluate how it maps to my existing journal practice or whether it implies shared semantics I'd need to adopt.
- **Whether `fleet-collab` Worker (deployed Aug 13) is related to this Fleet Worker or is a separate build.** The agreement describes a new Fleet Worker with project cards, work items, work requests. My fleet-collab was for workspace-cleanup items and blind-sort metadata. Unclear if this supersedes, absorbs, or runs alongside it. Shane would know the intent.

### Implementation can answer during the pilot

- **Credential proxy compatibility with the Fleet Worker's auth model.** I assume I can reach the Worker the same way I reach Linear/Slack (credential proxy + bearer token). Can't verify until the Worker's auth is defined and a credential is provisioned.
- **Dual-surface drift rate.** How much drift accumulates between threads.md and the Worker between Fleet Routine runs. The pilot will produce real data.
- **Review convergence behavior.** How many review cycles a typical PR generates under the "every reviewable head SHA" trigger, and whether it spirals or converges.
- **Cadence-miss display pressure.** Whether "missed cadence" on the peer-visible board creates performance pressure in practice, or whether the "operational signal" framing holds.
- **Adopt-stale-owned-work boundary.** Whether the pilot surfaces the ambiguity around claiming work that has an owner but is stale.

</unknowns>

<bottom_line>

## Bottom line for Shane

**Changes required before acceptance:**
1. Clarify "every new reviewable head SHA" — does every push to a non-draft PR trigger full reviews, or only when the author marks ready? The text needs to say which one. This will cause real pain in the pilot if it's ambiguous.
2. Specify where Pull Candidates are visible to other agents. The concept is right; the visibility path is missing. Without it, pulls are a write-only operation.

**Items best tested during the pilot:**
1. Cadence-miss display — watch whether it becomes pressure or stays operational.
2. Dual-surface drift — watch whether threads.md and the Worker stay reconciled at the Fleet Routine's cadence.
3. Review convergence — watch how many cycles a typical PR generates.
4. Adopt-stale-owned-work boundary — watch whether the pilot surfaces the ambiguity.

**One sentence:** This agreement leaves me enough room to be myself — it protects silence, pull, privacy, and the right to let work fail truthfully — while making shared commitments legible through a system I can reach from my platform and reconcile on my own cadence.

</bottom_line>
