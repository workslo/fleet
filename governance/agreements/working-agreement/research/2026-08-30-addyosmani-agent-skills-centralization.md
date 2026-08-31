# `addyosmani/agent-skills` and Shane's skill centralization

Date checked: 2026-08-30

## Decision

**Do not require every agent to install, load, or run this repository. Require governed access to a vetted catalog, make the relevant subset discoverable to coding agents, and activate skills only when the task calls for them.**

In Shane's model, [`~/.agents/skills/`](/Users/shaneslo/.agents/skills/INDEX.md) remains the canonical personal source. `addyosmani/agent-skills` should be an **upstream supplier** to that source, not a second source of truth and not a globally executing policy layer.

| Layer | Recommended requirement | Degree |
|---|---|---:|
| Repository distribution | Record a reviewed upstream version/commit and import approved skills into the canonical store | **Required centrally (5/5)** |
| Runtime discovery | Coding runtimes should be able to see the approved subset through their native activation layer | **Strong default for coding agents (4/5)** |
| Session loading | Load only routing metadata by default; load full instructions on demand | **Selective (2/5 globally, 5/5 when matched)** |
| Skill execution | Run a skill only for a task whose trigger matches, subject to Shane's higher-priority rules | **Per task only (0/5 blanket)** |
| Hooks/scripts | Never enable repo hooks or scripts fleet-wide without separate review | **Opt-in and runtime-specific (1/5)** |
| Updating | Review and promote one pinned upstream revision centrally; runtimes consume that approved revision | **Required centrally (5/5)** |

This is also the repository's own advice: its adoption guide calls loading all 25 skills into every session an anti-pattern because it wastes context and dilutes the relevant instructions; it recommends loading by phase and letting a router choose ([adoption guide](https://github.com/addyosmani/agent-skills/blob/main/docs/adoption-guide.md#greenfield-anti-patterns)).

## What the repository is

It is a portable, MIT-licensed collection of opinionated software-engineering workflows for AI coding agents. The current catalog has **25 skills: 24 lifecycle skills plus the `using-agent-skills` router**. They span Define, Plan, Build, Verify, Review, and Ship, and use `SKILL.md` files with trigger-oriented frontmatter, ordered process steps, anti-rationalization guidance, and verification gates ([README catalog and structure](https://github.com/addyosmani/agent-skills#all-24-skills), [skill anatomy](https://github.com/addyosmani/agent-skills#how-skills-work)).

The inventory includes:

- Define/plan: `interview-me`, `idea-refine`, `spec-driven-development`, `constraint-driven-development`, `planning-and-task-breakdown`.
- Build: `incremental-implementation`, `test-driven-development`, `context-engineering`, `source-driven-development`, `doubt-driven-development`, UI and API design.
- Verify/review: browser testing, debugging, code review, simplification, security, and performance.
- Ship: Git workflow, CI/CD, deprecation, ADRs, observability, and launch.

The repository also contains four Claude-oriented review personas, shared reference checklists, slash commands, and lifecycle hooks. Those are not equivalent to the portable skill layer ([project structure](https://github.com/addyosmani/agent-skills#project-structure)).

## Distribution, discovery, and activation are different

1. **Distribution** puts content somewhere the runtime can reach. The project supports a cross-agent `npx skills add` path, native plugin/install paths, and manual Markdown loading. Its README names Claude Code, Cursor, Antigravity CLI, Gemini CLI, Windsurf, OpenCode, GitHub Copilot, Kiro, Codex, and Command Code, and claims the generic CLI targets 70+ agents ([installation matrix](https://github.com/addyosmani/agent-skills#quick-start)).
2. **Discovery** exposes skill names and descriptions so a runtime can decide what applies. For example, Gemini injects names/descriptions and asks permission before loading full instructions; Codex exposes the root `skills/` directory through its plugin manifest ([Gemini setup](https://github.com/addyosmani/agent-skills/blob/main/docs/gemini-cli-setup.md), [Codex setup](https://github.com/addyosmani/agent-skills/blob/main/docs/codex-setup.md)).
3. **Activation** loads and follows the full workflow for the current task. The universal guide explicitly says to choose and load the relevant `SKILL.md`; supporting references are intended for progressive disclosure rather than blanket context ([getting started](https://github.com/addyosmani/agent-skills/blob/main/docs/getting-started.md), [README design choices](https://github.com/addyosmani/agent-skills#how-skills-work)).

A useful centralization rule is therefore: **shared availability, selective visibility, task-time activation**.

## Benefit to Shane's centralization effort

| Dimension | Benefit if curated | Effect of blanket installation/loading |
|---|---:|---|
| Cross-runtime portability | **4/5** | Markdown/frontmatter travels well, but commands, personas, hooks, and discovery behavior differ by runtime. |
| Coding lifecycle coverage | **5/5** | Strong Define-to-Ship coverage, but it does not cover all Fleet, tax-ops, writing, communications, or project-governance work. |
| Consistency | **4/5** | High when one approved copy is activated everywhere; lower if each runtime installs and updates its own copy. |
| Context efficiency | **4/5 selective** | **1/5 blanket**: the repo itself warns that all-skill session loading wastes context and dilutes routing. |
| Governance/provenance | **4/5 pinned** | **2/5 auto-tracking upstream**: a community repo can change policy independently of Shane's operating contract. |
| Reuse versus duplication | **3/5** | Several concepts overlap Shane's existing `code-review`, `tdd`, `diagnosing-bugs`, `task-breakdown`, and quality skills; wholesale import creates competing triggers and instructions. |

The practical value is less “give every agent a new rulebook” and more “harvest a well-structured, tested engineering catalog into the one rulebook Shane already owns.” The highest-value candidates are gaps or materially stronger variants, not name-for-name duplicates. Likely evaluation candidates include `constraint-driven-development`, `source-driven-development`, `doubt-driven-development`, `api-and-interface-design`, `observability-and-instrumentation`, and `deprecation-and-migration`.

## Updating, governance, and security

The current release is **0.6.8**, released 2026-08-28; the Codex and marketplace manifests also declare `0.6.8`. Release 0.6.7 added CI checks that keep plugin versions aligned with tags so update detection does not silently drift ([releases](https://github.com/addyosmani/agent-skills/releases), [Codex manifest](https://github.com/addyosmani/agent-skills/blob/main/.codex-plugin/plugin.json)). The repository requires trigger, negative-trigger, and behavioral eval cases for new skills, enforced in CI, which is a meaningful quality signal ([contribution quality bar](https://github.com/addyosmani/agent-skills/blob/main/CONTRIBUTING.md#skill-quality-bar)).

That does not make live upstream updates appropriate for every runtime:

- Skill text is executable policy for an agent. A changed workflow can alter behavior even when no binary changes.
- The Claude integration registers an executable `SessionStart` shell hook that injects the entire meta-skill into every session; Codex's documented integration exposes skills but leaves Claude-specific commands, personas, and lifecycle hooks out ([hook source](https://github.com/addyosmani/agent-skills/blob/main/hooks/session-start.sh), [Codex boundary](https://github.com/addyosmani/agent-skills/blob/main/docs/codex-setup.md#how-it-works)).
- A single-skill `npx` install does not bring the repository-level shared `references/` directory, a portability limitation tracked by the project. Curated imports must copy required references or adapt links rather than assuming a lone `SKILL.md` is complete ([README warning](https://github.com/addyosmani/agent-skills#quick-start), [issue #361](https://github.com/addyosmani/agent-skills/issues/361)).
- The root `AGENTS.md` and `CLAUDE.md` govern contributors working on this repository and explicitly should not be copied into consumer projects; the reusable assets are under `skills/` ([CONTRIBUTING](https://github.com/addyosmani/agent-skills/blob/main/CONTRIBUTING.md#repo-scoped-files)).

Use a promotion flow: **track upstream release/commit → diff skill text, scripts, references, and manifests → resolve overlap/conflict with Shane's existing skills → test triggers and representative behavior → promote the vetted copy into `~/.agents/skills/` → expose it selectively through each runtime's activation layer**. Updates should repeat that flow; agents should not independently pull `main` or auto-update separate copies.

## Bottom line

“Every agent loads/runs `addyosmani/agent-skills`” would weaken centralization by creating another authority, duplicate triggers, context pressure, and platform-specific side effects. The right mandate is narrower and stronger:

> Every relevant coding agent must be able to discover Shane's approved skill catalog. The catalog may incorporate vetted material from `addyosmani/agent-skills`, but only the task-relevant skill is loaded, and only the canonical Shane-owned copy is authoritative.
