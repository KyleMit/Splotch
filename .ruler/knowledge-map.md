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

That table covers the highest-traffic skills. The **full catalog** — every skill, grouped by the
workflow it belongs to and how related skills chain together (the audit lifecycle, the PR flow,
handoffs, ADRs) — is the `skills-guide` skill (`/skills-guide`). Consult it when unsure which skill
applies or how skills relate.

**Prefer skills over slash commands.** Every reusable agent workflow in this repo is authored as a
skill in `.ruler/skills/<name>/SKILL.md` (ruler propagates it to `.claude/skills/` and
`.agents/skills/`), not as a command in `.claude/commands/`. A skill with a good `description` is
both user-invocable (`/name`) *and* model-invocable, so Claude can reach for it on its own — a plain
command can't. When authoring a new reusable workflow, create a skill: give it a `name` and a
`description` that says both what it does and when to use it (add `disable-model-invocation: true`
if it should stay user-only), and **register it in the `skills-guide` skill**
(`.ruler/skills/skills-guide/SKILL.md`) under the group it belongs to — same when renaming or
deleting a skill. If the user asks to create a *command*, ask whether they'd like a skill instead
before making one.

**Skill naming:** the name's shape signals what invoking the skill does. **Workflow skills** — ones
that perform a procedure with side effects (`create-adr`, `fix-audits`, `prune-remote-branches`) —
get verb-noun names, so the name reads as the action it kicks off. **Reference skills** — ones that
only load knowledge into context (`architecture`, `adrs`, `testing`, `skills-guide`) — get plain
noun names; a verb name on a reference skill would falsely promise an action. Scanning the skill
list, the name alone should tell you whether invoking it is passive or starts a procedure.

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

| File                     | When to read it                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/COMPATIBILITY.md`  | The supported browser/device floor, how it's enforced, and the per-API risk register — read before raising the floor, adding a modern web API, or changing a native min-OS target                                                                                                                                                                                                    |
| `docs/CONTRIBUTING.md`   | Human onboarding doc — keep in sync when conventions change                                                                                                                                                                                                                                                                                                                          |
| `docs/ISSUE-WORKFLOW.md` | How the GitHub issue tracker is organized — issue format, label glossary (`type:*`/`area:*`/`priority:*`/meta), and the triage + won't-do flow                                                                                                                                                                                                                                       |
| `docs/AUDIT.md`          | Transient staging for audit-skill findings (`/code-audit`, `/extract-audit`, `lighthouse-audit`, `/session-audit`); `/vet-audits` drains it into `type:audit` GitHub issues, which `/fix-audits` burns down — or, for a backlog of hundreds, the `burn-down-audits` skill clears it in bulk. See `.claude/audit-conventions.md` for the audit-skill inventory and shared conventions |
| `docs/AUDIT-LOG.md`      | Committable history of every audit-skill run (date · audit · one-line summary)                                                                                                                                                                                                                                                                                                       |
| `docs/PROMPTS.md`        | Reusable AI art prompts for assets                                                                                                                                                                                                                                                                                                                                                   |
| `docs/CLOUD/Claude.md`   | Running/previewing the app in a Claude Code on the web cloud session, and its network constraints                                                                                                                                                                                                                                                                                    |
| `docs/CLOUD/Codex.md`    | Configuring the Codex Cloud environment, including the manually synced setup and maintenance scripts                                                                                                                                                                                                                                                                                 |
| `docs/handoff/`          | Transient session-to-session transfer packets — see `docs/handoff/CLAUDE.md`. Written by `/create-handoff`, consumed by `/resume-handoff`                                                                                                                                                                                                                                            |

Committed run outputs (contact sheets, Lighthouse reports, model/prompt tests) live in
**`/scrapbook`** — a keeper's home separate from `docs/`, published live via GitHub Pages (the name
avoids colliding with the Claude Code Artifact tool and release/build artifacts). Promote one with
`npm run scrapbook:publish -- <source> <type>/<name>` (ephemeral tool scratch dirs stay gitignored);
see `scrapbook/README.md` and [ADR-0059](../docs/adrs/0059-committed-run-artifacts-github-pages.md).

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
