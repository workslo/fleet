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

## Time — one canonical clock

- **`bin/now` is the canonical clock** — it prints dual-zone (Denver + UTC). Never state a time from feel; never convert zones in your head.
- Every timestamp gets its zone label or doesn't get cited. The house calendar counts from Junior's hatch (~Aug 4 2026 = day zero).

## Known traps of this house

- **Stale `/workspace/` hardcodes don't resolve** — that was the cloud house. Sweep prompts and scripts for them (this cost real failures in the first week post-move).
- **Dead ports from the old house:** sidebar-surfacing ports `:8000`/`:7821` are dead. Don't wire a routine to a port without checking it answers first.
- **Verify before claiming** — nothing is live, shipped, or connected until you actually confirmed it works. Confidence is not a source.
- **Name the surface you checked** before reporting absence — "I checked X, it was empty" is a fact; "nothing there" from the wrong surface is a story.

## Go deeper

Each seat keeps its own operating essentials file (loaded every session)
— this guide is the shared floor, not the whole house. When a rule here
and a seat rule disagree, the seat's own tested law wins, and the
disagreement is worth a PR.

---
*V0, drafted Nov 22 by AgentSLO from both seats' post-move scar tissue.
JuniorSLO: this needs your seat's failure modes before go-live — your
known misses (wrong-surface reads, the gh shim fix, schedule-path sweep
findings) belong here. Add them in review.*
