<!-- Source: .ruler/AGENTS.md -->

# Splotch – Agent Instructions

> [!IMPORTANT]
> Every `CLAUDE.md` and `AGENTS.md` in this repo, plus the `.claude/skills/` and `.agents/skills/`
> trees, is **generated** by [ruler](https://github.com/intellectronica/ruler) — never edit those
> files directly. Edit the sources in `.ruler/` (or the nested `<dir>/.ruler/`), then run
> `npm run ruler:apply` and commit the regenerated output. CI fails on drift
> (`npm run ruler:check`).

Splotch is a drawing app for toddlers (2+). One SvelteKit codebase ships two targets (ADR-0001):

* **Web** (`splotch.art`, Netlify): SSR + `/api/*` serverless functions + `/admin` console + PWA.
* **Native** (Capacitor; Android + iOS): fully static export, no server routes — the apps call the
  hosted API.

The SvelteKit app lives in **`web/`** (its `src/`, configs, `netlify.toml`, build output); the
Capacitor native trees (`android/`, `ios/`), `capacitor.config.json`, the single root
`package.json`/`node_modules`, and `scripts/` stay at the repo root. This keeps netlify-cli's file
watcher (run via `netlify dev --cwd web`) off the large native trees — see ADR-0024. The web
toolchain runs with `cwd = web/` through `scripts/web.mjs`.

The `CAPACITOR=true` env var at build time is the **single signal** for all web-vs-native branching
(`web/svelte.config.js`, `web/vite.config.ts`). Do not add runtime platform branches that could be
build-time branches instead.

<!-- Source: .ruler/agent-files.md -->

## Agent instruction files (ruler)

`.ruler/` is the single source of truth for the instructions coding agents load — Claude Code (local
and cloud sessions) reads the generated `CLAUDE.md` files and `.claude/skills/`; OpenAI Codex and
other AGENTS.md-standard agents read the generated `AGENTS.md` files and `.agents/skills/`. See
ADR-0058.

* Root instructions live in `.ruler/*.md` (concatenated in sorted order, `AGENTS.md` first); each
  nested `<dir>/.ruler/AGENTS.md` holds that directory's orientation and generates the sibling
  `<dir>/CLAUDE.md` + `<dir>/AGENTS.md`.
* Skills are authored in `.ruler/skills/<name>/SKILL.md` and copied verbatim to `.claude/skills/`
  and `.agents/skills/` — including helper files (`driver.mjs`, extra `.md` references). When you
  delete a skill from `.ruler/skills/`, the next apply deletes the generated copies; commit those
  deletions too.
* `npm run ruler:apply` regenerates everything and dprint-formats the output. `npm run ruler:check`
  re-applies and fails if anything changed — the CI drift gate. `npm run ruler:dry-run` previews
  what an apply would regenerate without writing.

**If asked to update agent instructions, docs, or skills: change `.ruler/**` sources, never the
generated files.** A generated file carries a `<!-- Source: ... -->` marker pointing back to its
source.

Not generated — edit in place: `.claude/rules/` (path-scoped rules), `.claude/hooks/`,
`.claude/settings.json`, `.claude/audit-conventions.md`, `.claude/cloud/`, and everything under
`docs/`.

<!-- Source: .ruler/commands.md -->

## Commands

| Command                       | Purpose                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `npm run info`                | List **every** npm script with its description — run this before guessing at a script |
| `npm run dev`                 | Dev server at `localhost:5173` (no `/api` functions)                                  |
| `npm run dev:netlify`         | Dev server **with** the `/api/*` serverless functions                                 |
| `npm run check`               | svelte-check / type checking                                                          |
| `npm test`                    | Unit (Vitest) + asset-pipeline + E2E (Playwright) — what CI runs                      |
| `npm run build` / `build:cap` | Web build / native static build                                                       |

Script naming and the `scripts-info` descriptions follow ADR-0019: `namespace:variant` names
(`dev:*`, `test:e2e:*`, `gen:*`, `android:*`, …), and every new or renamed script gets a matching
one-line entry in the `scripts-info` block of `package.json`.

<!-- Source: .ruler/conventions.md -->

## Conventions

* **No comments** unless the WHY is non-obvious. Well-named identifiers are the documentation.
* **TypeScript everywhere.** No plain `.js` source files in `src/`.
* **Svelte 5 runes only.** No legacy stores (`writable`, `readable`, `derived` from `svelte/store`).
* All npm scripts must run on macOS and Linux (ADR-0017; Windows dev support was dropped in
  ADR-0062): env vars are set inline (`VAR=value cmd`, no `cross-env`), and platform-specific tools
  (the Gradle wrapper, the file-manager opener) are invoked via Node helpers in `scripts/` rather
  than inline shell.
* **The `dependencies`/`devDependencies` split is inverted** (ADR-0070): `dependencies` = what the
  Netlify web build needs (runtime imports + vite/SvelteKit/adapter/`marked`); `devDependencies` =
  local/CI-only tooling (Playwright, dprint, sharp, the Capacitor CLIs, …). Netlify installs with
  `--omit=dev`, so a build-needed package filed under `devDependencies` breaks the deploy (CI stays
  green — it installs everything). When adding a dependency, ask "does the Netlify web build import
  or execute this?"
* **Formatting is split: Prettier owns code, dprint owns Markdown** (`*.md` is in `.prettierignore`;
  ADR-0057). The `format-edited-file.sh` PostToolUse hook auto-formats each file you edit through
  the right one, but if you write Markdown any other way (or aren't sure), run
  `npm run format:check` before you commit — CI's `dprint check` fails on unwrapped Markdown, and
  that's the most common reason a fresh PR is red.

<!-- Source: .ruler/github.md -->

## Writing on GitHub

GitHub auto-links a `#` followed by digits (`#12`) into a reference to the issue or pull request
with that number. So a plain list like "#1 done, #2 pass" in a PR body or comment silently turns
into links to unrelated issues/PRs.

**When you write a PR body or a GitHub comment, escape any `#`-number that isn't a deliberate
issue/PR reference.** Prefer one of:

* Backslash-escape the hash: `\#1 done, \#2 pass`.
* Wrap it in backticks: `` `#1` done, `#2` pass ``.
* Reword so no bare `#`-number appears: "item 1 done, item 2 pass".

This applies everywhere agent-authored text lands on GitHub — PR descriptions, PR comments, review
comments, and issue comments. A `#`-number you *do* mean as a reference (e.g. "fixes #123") should
stay unescaped.

<!-- Source: .ruler/knowledge-map.md -->

## Where knowledge lives

On-demand **skills** (consult when the topic comes up — don't guess from memory). Claude Code
auto-invokes them by description (or via `/name`); agents without skill support should read the
skill's `SKILL.md` directly from `.agents/skills/<name>/` (or `.claude/skills/<name>/` — same
content):

| Skill                                   | Read it before…                                                                                                                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `architecture`                          | navigating unfamiliar code, placing new code, naming UI elements                                                                                                                                                         |
| `design`                                | writing or changing component styles, picking a color/size/shadow/easing — the token vocabulary, primitives, and `/dev/design`                                                                                           |
| `api`                                   | adding, changing, or calling any `/api/*` endpoint                                                                                                                                                                       |
| `mobile`                                | touching anything Android/iOS/Capacitor, or store-release work                                                                                                                                                           |
| `testing`                               | writing/running tests beyond the basics, or debugging CI failures                                                                                                                                                        |
| `profiling`                             | measuring drawing/canvas performance, investigating jank, or checking for perf regressions (`npm run perf:*`)                                                                                                            |
| `lighthouse-audit`                      | auditing page-load performance / Core Web Vitals on a throttled device (Lighthouse, first vs repeat visit)                                                                                                               |
| `adrs`                                  | proposing or discussing any architectural approach                                                                                                                                                                       |
| `pr-screenshots`                        | opening/creating a pull request that touches the UI — screenshot conventions that augment the built-in PR flow                                                                                                           |
| `leave-pr-review` / `address-pr-review` | authoring a review of a PR (`leave-pr-review` — local checkout, empirical verification, gated posting, augments the built-in review flow), or working through the review feedback received on a PR (`address-pr-review`) |
| `create-handoff` / `resume-handoff`     | pausing in-flight work for a later session (`create-handoff`), or picking it back up (`resume-handoff`) — transfer packets live in `docs/handoff/`                                                                       |

**Prefer skills over slash commands.** Every reusable agent workflow in this repo is authored as a
skill in `.ruler/skills/<name>/SKILL.md` (ruler propagates it to `.claude/skills/` and
`.agents/skills/`), not as a command in `.claude/commands/`. A skill with a good `description` is
both user-invocable (`/name`) *and* model-invocable, so Claude can reach for it on its own — a plain
command can't. When authoring a new reusable workflow, create a skill: give it a `name` and a
`description` that says both what it does and when to use it (add `disable-model-invocation: true`
if it should stay user-only). If the user asks to create a *command*, ask whether they'd like a
skill instead before making one.

Path-scoped **rules** in `.claude/rules/` (Claude Code loads them automatically on path match; other
agents: read the matching rule before editing those paths): `svelte.md`, `server-api.md`,
`testing.md`. Nested `CLAUDE.md`/`AGENTS.md` files in `web/src/`, `web/tests/`, `android/`,
`scripts/`, `tools/asset-gen/`, and `docs/handoff/` cover those areas.

The **live backlog is GitHub Issues** — when asked what to work on next, list the open issues and
filter by label (`area:*`, `type:*`, `priority:*`); don't look for a backlog file. Capture a durable
TODO by opening an issue, not by editing a Markdown list. The issue format, the full label glossary,
and the triage/won't-do flow live in `docs/ISSUE-WORKFLOW.md`. After completing an issue review
pass, apply `reviewed` only when the issue is clear, actionable, and correctly labeled; automation
then moves it to the project's `ToDo` status.

Remaining `docs/`:

| File                     | When to read it                                                                                                                                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/COMPATIBILITY.md`  | The supported browser/device floor, how it's enforced, and the per-API risk register — read before raising the floor, adding a modern web API, or changing a native min-OS target                                                                                                                    |
| `docs/CONTRIBUTING.md`   | Human onboarding doc — keep in sync when conventions change                                                                                                                                                                                                                                          |
| `docs/ISSUE-WORKFLOW.md` | How the GitHub issue tracker is organized — issue format, label glossary (`type:*`/`area:*`/`priority:*`/meta), and the triage + won't-do flow                                                                                                                                                       |
| `docs/AUDIT.md`          | Transient staging for audit-skill findings (`/code-audit`, `/extract-audit`, `lighthouse-audit`, `/session-audit`); `/vet-audits` drains it into `type:audit` GitHub issues, which `/fix-audits` burns down. See `.claude/audit-conventions.md` for the audit-skill inventory and shared conventions |
| `docs/AUDIT-LOG.md`      | Committable history of every audit-skill run (date · audit · one-line summary)                                                                                                                                                                                                                       |
| `docs/PROMPTS.md`        | Reusable AI art prompts for assets                                                                                                                                                                                                                                                                   |
| `docs/CLOUD/Claude.md`   | Running/previewing the app in a Claude Code on the web cloud session, and its network constraints                                                                                                                                                                                                    |
| `docs/CLOUD/Codex.md`    | Configuring the Codex Cloud environment, including the manually synced setup and maintenance scripts                                                                                                                                                                                                 |
| `docs/handoff/`          | Transient session-to-session transfer packets — see `docs/handoff/CLAUDE.md`. Written by `/create-handoff`, consumed by `/resume-handoff`                                                                                                                                                            |

Committed run outputs (contact sheets, Lighthouse reports, model/prompt tests) live in
**`/artifacts`** — a keeper's home separate from `docs/`, published live via GitHub Pages. Promote
one with `npm run artifacts:publish -- <source> <type>/<name>` (ephemeral tool scratch dirs stay
gitignored); see `artifacts/README.md` and
[ADR-0059](../docs/adrs/0059-committed-run-artifacts-github-pages.md).

If you discover any doc, skill, or rule is out of date while working, update it as part of the same
task — don't leave it stale.

## Architectural Decision Records

`docs/adrs/` is the home for architectural decisions; the `adrs` skill is the entry point for
consulting them. One carve-out: decisions about the **asset-generation pipeline** (line art,
coloring fills) live beside the pipeline as un-numbered records in `tools/asset-gen/docs/` — write
new ones there, not as numbered ADRs (the ADR index marks the ones that moved).

**When a significant decision is made or confirmed:** use `/create-adr` to document it. A decision
is significant if it chose one approach over real alternatives, has non-obvious consequences, or
encodes a constraint a future contributor would want to understand.

**At the end of any session that touched architecture, testing, infrastructure, or build tooling:**
briefly consider running `/update-adrs` to catch anything that changed.

ADRs live in the repo and are committed alongside the code they describe. They are not internal
memory — they're part of the project.

## Memory vs. ADRs (Claude Code)

Claude Code's auto-memory system (`memory/`) and `docs/adrs/` serve different purposes. Use the
right one:

| What it is                                                             | Where it goes                  |
| ---------------------------------------------------------------------- | ------------------------------ |
| Architectural/technical decision (chose X over Y, with context)        | `docs/adrs/` via `/create-adr` |
| Behavioral feedback (how Claude should work in this project)           | `memory/` — `feedback` type    |
| User preferences and background                                        | `memory/` — `user` type        |
| Temporal project context (active incidents, deadlines, in-flight work) | `memory/` — `project` type     |
| Pointers to external systems                                           | `memory/` — `reference` type   |

If you find yourself about to write a `project`-type memory about a technical approach or tradeoff,
stop and write an ADR instead — it should be committed to the repo, not stored only in Claude's
local memory.
