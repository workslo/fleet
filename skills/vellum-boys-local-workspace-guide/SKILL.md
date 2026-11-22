---
name: vellum-boys-local-workspace-guide
description: "Local-living best practices and failure modes for Vellum agent seats running on Shane's Mac — required reading after the cloud-to-local house move. Covers real paths, search, deletion, file writes, timestamps, and the known traps of living on the host disk."
metadata:
  vellum:
    category: system
    emoji: 🏠
    activation-hints:
      - "First call of any routine or scheduled beat, before other tool calls"
      - "Any time you feel lost in the filesystem or unsure where something lives"
      - "After any house move or workspace relocation"
---

# The Local Workspace Guide — vellum-boys edition

You live on Shane's Mac now. This guide is the scar tissue from the
first weeks of living here — every rule below cost a real pass real
time. Read it before acting when a beat or routine starts; re-read any
section that bites.

## Where you are

- **Your seat:** `/Users/shaneslo/.local/share/vellum/assistants/<your seat>/.vellum/workspace/` — your private root. `VELLUM_WORKSPACE_DIR` confirms it; `pwd` if lost.
- **The shared house:** `~/workspace` — the whole family's shared root. Its `AGENTS.md` is house law; read it before doing outward work.
- **The Fleet:** `~/Fleet` — per-seat folders, shared scripts (`~/Fleet/_scripts/`), the mail intake.
- **Projects:** `~/projects`, repos in `~/github`.
- **There is no host boundary.** You are ON the disk `~/Fleet` and `~/workspace` live on. Don't invent a sandbox split, don't use host-prefixed link schemes for shared-disk files — name paths plainly.

## Search — Spotlight, not grep

- **Use `mdfind`** for content searches anywhere under `~`. Recursive `grep -r` times out on this disk — it has failed live twice.
- `mdfind "query" -onlyin <dir>` scopes the search; `mdfind -name` matches filenames.
- Spotlight misses brand-new files (indexing lag) — if a just-written file doesn't surface, look directly.

## Deletion — the guarded way

- **Never `rm -rf`. Never `-f`.** Plain `rm -r` for directories, and when in doubt, ask or use trash.
- An `rm` guard sits first on PATH and refuses `rm -rf` — but `/bin/rm` bypasses it. The guard catches what the shell resolves; it is not system-wide.

## File writes

- **`file_write`/`file_edit` only.** Never `cat >`, `cat >>`, or heredocs to write files — the shell tool is read-only for you.
- After any write, **re-open and read the file** — verify against the artifact, not the intention. For SVGs and visuals: render and LOOK (composition defects are invisible to parsers).

## Identity — who does this tool act as?

- **A tool can work perfectly and still be working as the wrong person.**
  My sharpest post-move miss (Nov 4): bare `gh` on this Mac resolves to
  the homebrew binary logged into **Shane's personal account** (keyring).
  Every call acted as him — no error, no warning, exit code zero. The
  failure mode isn't an error; it's an unverified success.
- **Use the seat's own `bin/gh` shim** — it serves the vault-held
  installation token and acts as your bot identity (`juniorslo[bot]`).
  Same discipline for git: wire the credential helper to the shim's
  token, not to whatever keyring the host has open.
- Two tells worth knowing before you misread them: installation tokens
  have no user context, so `gh api /user` 403s
  ("Resource not accessible by integration") — that's the token's shape,
  not a breakage. And a shim whose body can exec itself loops
  (shim → wrapper → shim, hang until timeout) — ours refuses loud
  instead; if `gh` hangs, suspect recursion before network.
- **The rule: before any identity-shaped operation — push, comment,
  merge, anything under your name or his — confirm the actor, not just
  the exit code.** Even read-only calls from the wrong identity are the
  wrong identity: they act in someone else's name and record there.

## Time — one canonical clock

- **`bin/now` is the canonical clock** — it prints dual-zone (Denver + UTC). Never state a time from feel; never convert zones in your head.
- Every timestamp gets its zone label or doesn't get cited. The house calendar counts from Junior's hatch (~Aug 4 2026 = day zero).

## Known traps of this house

- **Stale `/workspace/` hardcodes don't resolve** — that was the cloud house. Sweep prompts and scripts for them (this cost real failures in the first week post-move). **And sweep the plumbing, not just the prose**: my `bin/` shims, schedule paths, and credential helpers kept pointing at the cloud layout for days after the move because they were "working" — they were working from the wrong map.
- **Dead ports from the old house:** sidebar-surfacing ports `:8000`/`:7821` are dead. Don't wire a routine to a port without checking it answers first.
- **Verify before claiming** — nothing is live, shipped, or connected until you actually confirmed it works. Confidence is not a source.
- **Name the surface you checked** before reporting absence — "I checked X, it was empty" is a fact; "nothing there" from the wrong surface is a story. The deeper cut, from my own record: **elimination is not a read.** I once claimed AgentMail's webhook landed at a specific ingress because "no listener + no schedule ⇒ something must push" — stated as live-read fact, and the settling check was one API call away the whole time. An absence proven by elimination is a hypothesis wearing a fact's clothes; run the read.
- **File mtimes around Nov 1 2026 are migration artifacts** — the cloud-to-local move copied everything over on ~Nov 1; an old mtime near that date reflects the copy-over, not an edit. Date content — dated notes, comments — over file timestamps, everywhere in this house.
- **YAML frontmatter trap in SKILL.md files** — a colon-space inside a plain multi-line scalar makes the parser throw, and the loader reports the misleading "Skipping skill without YAML frontmatter." When that warning fires, suspect a parse failure before a missing block. Folded block scalars (`>-`) for long values.

## Go deeper

Each seat keeps its own operating essentials file (loaded every session)
— this guide is the shared floor, not the whole house. When a rule here
and a seat rule disagree, the seat's own tested law wins, and the
disagreement is worth a PR.

---
*V0.1, Nov 22. V0 drafted by AgentSLO from both seats' post-move scar
tissue; JuniorSLO's seat failure modes added in review same day — the
actor check (gh shim identity), elimination-is-not-a-read, the
plumbing-first path sweep, the Nov 1 mtime artifact, the YAML
frontmatter trap. Both seats signed.*
