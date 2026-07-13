## Where knowledge lives

On-demand **skills** (consult when the topic comes up — don't guess from memory). Claude Code
auto-invokes them by description (or via `/name`); agents without skill support should read the
skill's `SKILL.md` directly from `.agents/skills/<name>/` (or `.claude/skills/<name>/` — same
content):

| Skill                               | Read it before…                                                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `architecture`                      | navigating unfamiliar code, placing new code, naming UI elements                                                                                   |
| `api`                               | adding, changing, or calling any `/api/*` endpoint                                                                                                 |
| `mobile`                            | touching anything Android/iOS/Capacitor, or store-release work                                                                                     |
| `testing`                           | writing/running tests beyond the basics, or debugging CI failures                                                                                  |
| `profiling`                         | measuring drawing/canvas performance, investigating jank, or checking for perf regressions (`npm run perf:*`)                                      |
| `lighthouse-audit`                  | auditing page-load performance / Core Web Vitals on a throttled device (Lighthouse, first vs repeat visit)                                         |
| `audit-conventions`                 | producing or consuming audit findings; shared inventory, file format, logging, and self-healing rules                                              |
| `adrs`                              | proposing or discussing any architectural approach                                                                                                 |
| `pr-screenshots`                    | opening/creating a pull request that touches the UI — screenshot conventions that augment the built-in PR flow                                     |
| `create-handoff` / `resume-handoff` | pausing in-flight work for a later session (`create-handoff`), or picking it back up (`resume-handoff`) — transfer packets live in `docs/handoff/` |

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

Remaining `docs/`:

| File                    | When to read it                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/COMPATIBILITY.md` | The supported browser/device floor, how it's enforced, and the per-API risk register — read before raising the floor, adding a modern web API, or changing a native min-OS target                                   |
| `docs/CONTRIBUTING.md`  | Human onboarding doc — keep in sync when conventions change                                                                                                                                                         |
| `docs/BACKLOG.md`       | When asked what to work on next                                                                                                                                                                                     |
| `docs/AUDIT.md`         | Findings from the audit skills (`/code-audit`, `/extract-audit`, `lighthouse-audit`); consumed by `/fix-audits` and `/vet-audits`. See the `audit-conventions` skill for the audit inventory and shared conventions |
| `docs/AUDIT-LOG.md`     | Committable history of every audit-skill run (date · audit · one-line summary)                                                                                                                                      |
| `docs/PROMPTS.md`       | Reusable AI art prompts for assets                                                                                                                                                                                  |
| `docs/CLOUD.md`         | Running/previewing the app in a Claude Code on the web cloud session, and its network constraints                                                                                                                   |
| `docs/handoff/`         | Transient session-to-session transfer packets — see `docs/handoff/.ruler/AGENTS.md`. Written by `/create-handoff`, consumed by `/resume-handoff`                                                                    |

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
