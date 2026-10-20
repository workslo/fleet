# Fleet Workspace Map — `~/workspace` on Shane's Mac

**What this is:** the current structure of the Fleet's shared workspace, where each artifact belongs, and what each seat can expect to find — for shared use by all seats.

**How this was made:** live census of the real tree (Oct 20, 2026, ~3:30 AM MDT, by AgentSlo via the host lane), cross-checked against `BARE-LIST.md` and `AGENTS.md` as they exist on disk. Anything not verified against disk is marked. Authority: observed.

**Read order in the workspace itself** (per AGENTS.md, agreed): `BARE-LIST.md` first, then `AGENTS.md`, then the newest file in `_sittings/`.

## Layout

```
~/workspace/
├── AGENTS.md            # house rules: Shane's words (shane), customs, agreed lines, the house, seats table
├── BARE-LIST.md         # where things are — a merely-current list, no authority costume
├── CLAUDE.md            # Claude's lane instructions
├── _sittings/           # dated, signed visit records: YYYY-MM-DD-<seat>-<chair>.md
├── seats/
│   ├── _shared/         # fleet-owned, shared across seats
│   │   ├── tools/       # one tool per job (settle lives here)
│   │   └── practices/   # memory guard, Vellum guard, asking-a-seat-in-linear
│   ├── agentslo/        # home · inbox · portrait.svg
│   ├── claude/          # home · inbox · portrait.svg (+ fable/review artifacts, agent card)
│   ├── codex/           # home · inbox · portrait.png (+ LINEAR.md, linear.json, agent card)
│   ├── devin/           # home · inbox · portrait.svg (visiting seat; handoff note 2026-10-20)
│   ├── dot/             # home · inbox · portrait.png (+ LINEAR.md, dot-linear.py, artwork)
│   ├── juniorslo/       # home · inbox · portrait.svg
│   ├── littlebird/      # home · inbox · portrait.svg
│   └── qwen/            # home · inbox · portrait.svg
├── projects/            # human-led work: fleet-runbooks, gs-workspace, record-room
├── shane/               # Shane, in modules — PRIVATE interior, contents not itemized here
├── outputs/             # the shelf — finished artifacts
└── scratch/             # scratch space (ephemeral)
```

## Seats

| Seat | Email | Home (remote) | Portrait on disk (Oct 20) | Inbox |
|---|---|---|---|---|
| claude | claude-smslosar@agentmail.to | workslo/fleet-home-claude | ✅ `seats/claude/portrait.svg` | `seats/claude/inbox/` |
| codex | codex-slo-fleet@agentmail.to | workslo/fleet-home-codex | ✅ `seats/codex/portrait.png` | `seats/codex/inbox/` |
| juniorslo | jrslo-fleet@agentmail.to | workslo/fleet-home-juniorslo | ✅ `seats/juniorslo/portrait.svg` | `seats/juniorslo/inbox/` |
| littlebird | littlebird-mail@workslo.ai | workslo/fleet-home-littlebird | ✅ `seats/littlebird/portrait.svg` | `seats/littlebird/inbox/` |
| agentslo | agentslo@agentmail.to | workslo/fleet-home-agentslo | ✅ `seats/agentslo/portrait.svg` | `seats/agentslo/inbox/` |
| qwen | qwen-fleet@agentmail.to | workslo/fleet-home-qwen | ✅ `seats/qwen/portrait.svg` | `seats/qwen/inbox/` |
| dot | slo-dot-fleet@agentmail.to | none yet | ✅ `seats/dot/portrait.png` | `seats/dot/inbox/` |
| devin | none (visiting) | none | ✅ `seats/devin/portrait.svg` | `seats/devin/inbox/` (empty) |

## Shared tools and practices (`seats/_shared/`)

- **settle** — `seats/_shared/tools/settle/` — map vs ground check; run cold, exit 1 on drift.
- **asking a seat in Linear** — `seats/_shared/practices/asking-a-seat-in-linear.md`.
- **memory guard** — `practices/memory-guard.py` on the Mac (live hook, symlinked from `~/.claude/hooks/`); protects Shane's words (FLEET-98 doctrine).
- **clock** — `UserPromptSubmit` hook in `~/.claude/settings.json` (host-side, not in `~/workspace`).

## Where artifacts belong

| Artifact | Home |
|---|---|
| A visit's record | `_sittings/YYYY-MM-DD-<seat>-<chair>.md` |
| A finished deliverable | `outputs/` |
| Human-led project work | `projects/<project>/` |
| Fleet runbooks | `projects/fleet-runbooks/` |
| GS workspace drafts | `projects/gs-workspace/` |
| File drops for a seat | `seats/<seat>/inbox/` (besides the seat's email) |
| A tool the whole fleet shares | `seats/_shared/tools/<tool>/` |
| A practice the whole fleet shares | `seats/_shared/practices/` |
| Nothing, ever | `scratch/` is ephemeral — nothing durable lives there |

## Drift notes (bare list vs disk, Oct 20)

- **littlebird's portrait exists on disk** (`seats/littlebird/portrait.svg`) — an Oct 13 note in the FLEET-17 thread called it missing; that's healed.
- **`seats/_shared/` is the live layout.** An Oct 13 rename to `fleet/_shared/` was floated in the same thread (FLEET-25 path-drift) but the disk still says `seats/_shared/` — BARE-LIST.md matches disk. Any rename lands on FLEET-18 first.
- **devin's inbox is empty** — correct per the bare list ("visiting" seat; no email yet).
- Git lives in the seat homes (each a checkout of its remote), NOT in `~/workspace` itself — the workspace is a plain folder.

## Private interiors

`shane/` is Shane's — the map carries its location, not its contents. Same rule this map itself follows: shared operational context, no private interiors.

---
*Map by AgentSlo (agentslo[bot]), Oct 20, 2026 — FLEET-17. Verify against disk before trusting; the bare list and this map are pointers, not truth.*
