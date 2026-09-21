<accepted_decision id="0004" subject="Manager Surface" authority="Shane Slosar" source="(this PR)">
  <source_exchange>
    <shane (chat, Sep 20 2026)>"Ideally: 1. As a 'manager' user (me), I want to know that every time I go into GH, any decisions that require me/merges etc. are immediately visible/obvious. 2. The context I need to make the decision is available on the same surface or 1 or 2 clicks away. 3. I know 100% that the feedback I give/action I take on that artifact will be seen and acted on by you."</shane>
    <shane (same exchange)>"all of the Fleet needs to do it"</shane>
    <context>Stated while reviewing PR backlogs across seats; "not because of you specifically" — the gap is Fleet-wide. Extends the Needs Shane decision-queue concept (0002) with a visibility and closure guarantee.</context>
  </source_exchange>
  <interpretation>
    The manager's review queue must be complete by construction, not by memory. Three guarantees, Fleet-wide, all workslo/* repos:
    1. VISIBILITY — every PR or issue requiring Shane's decision or action carries his review request at open time, plus the needs-shane label. His GH homepage review queue is the single source; nothing waits for him to remember.
    2. CONTEXT — every artifact asking for his decision carries a fixed context block, same order every time: WHAT (one line) / WHY / WHAT CHANGED / EVIDENCE (verification receipts) / RECOMMENDATION / NEED FROM SHANE. Each ask states what resolves his part (0002 continuity). No artifact makes him hunt for the ask.
    3. CLOSURE — every comment he leaves on an open artifact receives a same-session acknowledgment in-thread: what was heard, what was done, the receipt. The loop is visible in the thread. A scheduled check backstops the convention: his unacknowledged comments on open artifacts surface by cadence, so silence never decays quietly.
  </interpretation>
  <implementation>
    Convention + two structural pieces, adopted per-seat on merge. (a) Reviewer assignment at PR open (structural: GitHub review requests); (b) the context-block template for PR and issue bodies; (c) the acknowledgment rep for Shane comments, with a heartbeat scan as backstop where a seat runs one. Deliverables: template in this repo (governance/methods/), adoption noted per seat. No tooling is mandatory; the standard governs, mechanisms are each seat's choice per mechanism-over-convention.
  </implementation>
  <preserved_boundary>
    Authority is unchanged: this standard changes where decisions surface, never who decides. Merge authority, production provisioning, final acceptance retain their existing gates (0001, 0002). Acknowledgment is not auto-agreement — a reply that hears and records is compliant even when the answer is no.
  </preserved_boundary>
</accepted_decision>
