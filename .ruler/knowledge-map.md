## Where knowledge lives

On-demand **skills** (consult when the topic comes up — don't guess from memory). Skill-aware
runners select them by description, and each has its own explicit-invocation sigil — Claude Code
`/name`, Codex `$name`. **Shared prose, docs, and process output name a skill bare** (the `build`
skill, alongside the concrete `npm run …` where one exists); a sigil belongs only inside the tree
that runner owns, because one file here generates both providers' copies. `npm run check:skill-refs`
(also `tools/tests/skill-reference-syntax.test.mjs`) fails on the wrong one. Agents without skill
support should read the skill's `SKILL.md` directly from `.agents/skills/<name>/` (or
`.claude/skills/<name>/`). Most are generated from `.ruler/`; managed runner forks may be produced
from `.ruler/skill-forks/<runner>/`. Registered direct provider packages are different:
`burn-down-audits` is independently maintained under `.claude/` and `.agents/`, as is
`analyze-session-transcripts` with format-specific implementations and `run-rival-agent`, whose two
packages each launch the *other* vendor's CLI; Codex-only `implement-issue-stack` lives only under
`.agents/`. See `tools/ruler/lib/direct-provider-skills.mjs` for the authoritative registry.

| Skill                                   | Read it before…                                                                                                                                                                                                                                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `architecture`                          | navigating unfamiliar code, placing new code, naming UI elements                                                                                                                                                                                                                                   |
| `design`                                | writing or changing component styles, picking a color/size/shadow/easing, or writing user-facing copy — the token vocabulary, primitives, voice, and the public `/design` styleguide                                                                                                               |
| `api`                                   | adding, changing, or calling any `/api/*` endpoint                                                                                                                                                                                                                                                 |
| `mobile`                                | touching anything Android/iOS/Capacitor, or store-release work                                                                                                                                                                                                                                     |
| `testing`                               | writing/running tests beyond the basics, or debugging CI failures                                                                                                                                                                                                                                  |
| `profiling`                             | measuring drawing/canvas performance, investigating jank, or checking for perf regressions (`npm run perf:*`)                                                                                                                                                                                      |
| `lighthouse-audit`                      | auditing page-load performance / Core Web Vitals on a throttled device (Lighthouse, first vs repeat visit)                                                                                                                                                                                         |
| `adrs`                                  | proposing or discussing any architectural approach                                                                                                                                                                                                                                                 |
| `run-rival-agent`                       | pairing this session, as the native handler, with the other vendor's CLI as a read-only rival agent for an independent review or question — the rival asks you to run commands through a broker, and its findings post to the PR verbatim; from Claude the rival is Codex, from Codex it is Claude |
| `pr-screenshots`                        | opening/creating a pull request that touches the UI — screenshot conventions that augment the built-in PR flow                                                                                                                                                                                     |
| `leave-pr-review` / `address-pr-review` | authoring a review of a PR (`leave-pr-review` — local checkout, empirical verification, posts by default, augments the built-in review flow), or working through the review feedback received on a PR (`address-pr-review`)                                                                        |
| `create-handoff` / `resume-handoff`     | pausing in-flight work for a later session (`create-handoff`), or picking it back up (`resume-handoff`) — transfer packets live in `docs/handoff/`                                                                                                                                                 |
| `self-heal`                             | wrapping up a session that hit hiccups, surprises, or hard-won lessons — judges which are durable and writes each into the home the next tripped-up session will actually see                                                                                                                      |

That table covers the highest-traffic skills. The **full catalog** — every skill, grouped by the
workflow it belongs to and how related skills chain together (the audit lifecycle, the PR flow,
handoffs, ADRs) — is the `skills-guide` skill. Consult it when unsure which skill applies or how
skills relate.

**Prefer skills over slash commands.** Reusable agent workflows are normally authored in
`.ruler/skills/<name>/SKILL.md` or, when managed implementations must be isolated, as complete
packages under `.ruler/skill-forks/<runner>/`; only packages registered in
`tools/ruler/lib/direct-provider-skills.mjs` are authored directly in provider trees. Do not create
workflows as commands in `.claude/commands/`. A skill with a good `description` is both
user-invocable and model-invocable, so the agent can reach for it on its own — a plain command
can't. When authoring a new reusable workflow, create a skill: give it a `name` and a `description`
that says both what it does and when to use it (add `disable-model-invocation: true` if it should
stay user-only), and **register it in the `skills-guide` skill**
(`.ruler/skills/skills-guide/SKILL.md`) under the group it belongs to — same when renaming or
deleting a skill. If the user asks to create a *command*, ask whether they'd like a skill instead
before making one.

**Skill naming:** the name's shape signals what invoking the skill does. **Workflow skills** — ones
that perform a procedure with side effects (`create-adr`, `fix-audits`, `prune-remote-branches`) —
get verb-noun names, so the name reads as the action it kicks off. **Reference skills** — ones that
only load knowledge into context (`architecture`, `adrs`, `testing`, `skills-guide`) — get plain
noun names; a verb name on a reference skill would falsely promise an action. Scanning the skill
list, the name alone should tell you whether invoking it is passive or starts a procedure.

**Where a skill's content lives (ADR-0107).** Every skill is stored three times — the `.ruler/`
source plus a generated `.claude/` and `.agents/` copy — so one line of skill prose is three lines
of diff on every edit. Which half of the split a skill belongs to follows from its kind:

* **Reference skills keep their bulk in `docs/` and stay thin routers.** `architecture` →
  `docs/ARCHITECTURE.md`, `api` → `docs/API.md`, `testing` → `docs/TESTING.md`, `mobile` →
  `docs/MOBILE/`, `profiling` → `docs/PROFILING.md` + `docs/PROFILING-IPAD.md` +
  `docs/PROFILING-ANDROID.md` + `docs/PROFILING-MECHANICS.md`. The content is documentation a human
  would want anyway, it is read by lookup rather than start-to-finish, and one copy means one diff.
* **Workflow skills keep their procedure inline**, however long it runs. A step the agent never read
  is a step it never runs, and an imperative runbook has no human reader that `docs/` would serve.

A router still has to earn its keep: name each section of the doc and say what it answers, so the
agent reads the part that applies instead of the whole file. Reach past the router only for content
that must not be missed — invariants, footguns, the thing that makes a wrong reading expensive.

Path-scoped **rules** in `.claude/rules/` (Claude Code loads them automatically on path match; other
agents: read the matching rule before editing those paths): `svelte.md`, `server-api.md`,
`testing.md`, `ipad-profiling-docs.md`. Nested `CLAUDE.md`/`AGENTS.md` files in `web/src/`,
`web/tests/`, `android/`, `tools/`, `tools/asset-gen/`, and `docs/handoff/` cover those areas.

The **live backlog is GitHub Issues** — when asked what to work on next, list the open issues and
filter by label (`area:*`, `type:*`, `priority:*`); don't look for a backlog file. Capture a durable
TODO by opening an issue, not by editing a Markdown list. The issue format, the full label glossary,
and the triage/won't-do flow live in `docs/ISSUE-WORKFLOW.md`. After completing an issue review
pass, apply `reviewed` only when the issue is clear, actionable, and correctly labeled; automation
then moves it to the project's `ToDo` status.

Remaining `docs/`:

| File                             | When to read it                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/ARCHITECTURE.md`           | Tech stack, the `web/src/lib/` source map, the route/render table, and the UI element glossary — the `architecture` skill routes here                                                                                                                                                                                                                                                                                                                                 |
| `docs/API.md`                    | The full `/api/*` contract: request/response shapes, auth, CORS, and per-endpoint rate limits — the `api` skill routes here                                                                                                                                                                                                                                                                                                                                           |
| `docs/TESTING.md`                | Every test layer, its command, and what CI runs it on; flake-resistant spec authoring; Maestro setup — the `testing` skill routes here                                                                                                                                                                                                                                                                                                                                |
| `docs/MOBILE/`                   | `native.md` (how the Capacitor build works, storage, privacy posture), `android.md`, `ios.md` — toolchains, build/sign/run, and the store release + kids-compliance checklists — and `compliance.md`, the app-store compliance ledger (each implemented guideline quoted verbatim, per-store required-or-not, mitigation, provenance); the `mobile` skill routes here                                                                                                 |
| `docs/PROFILING-CAMPAIGNS.md`    | Unattended physical-device capture: the preflight, and the setup mistakes that produce plausible wrong numbers without erroring — device identity, Guided Access, port contention, stale builds, input cadence, and which capture paths cannot be scored                                                                                                                                                                                                              |
| `docs/PROFILING.md`              | The `npm run perf:*` harness — which command profiles what, how capture works, and reading a report into a bottleneck; the `profiling` skill routes here                                                                                                                                                                                                                                                                                                              |
| `docs/PROFILING-IPAD.md`         | The physical-iPad profiling runbook — the highest-fidelity target (real WebKit + Apple GPU + 120 Hz); read before any on-device perf capture                                                                                                                                                                                                                                                                                                                          |
| `docs/PROFILING-ANDROID.md`      | The physical-Android profiling toolchain — `dumpsys gfxinfo framestats`, Perfetto, and CDP `Tracing`; which one answers which question, and what each says that the app's own probe cannot                                                                                                                                                                                                                                                                            |
| `docs/PROFILING-MECHANICS.md`    | What the perf harness is made of — the layer model, which transport drives which deployment target (drift-guarded against `campaign-plan.mjs`), the platform instruments, every ruled-out driver and why, and a glossary of the toolchain's vocabulary                                                                                                                                                                                                                |
| `docs/COMPATIBILITY.md`          | The supported browser/device floor, how it's enforced, and the per-API risk register — read before raising the floor, adding a modern web API, or changing a native min-OS target                                                                                                                                                                                                                                                                                     |
| `docs/SAFE-AREA.md`              | How `env(safe-area-inset-*)` behaves per device class, how the app consumes it through the `--safe-area-*` seam, and how to test a layout change against the whole device matrix — the `/dev/notch` harness by eye, `safe-area-matrix.spec.ts` in CI. Read before touching anything positioned against a screen edge                                                                                                                                                  |
| `docs/WORKTREES.md`              | How a linked agent worktree gets provisioned — the shared `SessionStart` bootstrap hook, the per-runner failure contracts, and what `.worktreeinclude` carries in; read before changing worktree setup for either runner                                                                                                                                                                                                                                              |
| `docs/CONTRIBUTING.md`           | Human onboarding doc — keep in sync when conventions change                                                                                                                                                                                                                                                                                                                                                                                                           |
| `docs/ISSUE-WORKFLOW.md`         | How the GitHub issue tracker is organized — issue format, label glossary (`type:*`/`area:*`/`priority:*`/meta), and the triage + won't-do flow                                                                                                                                                                                                                                                                                                                        |
| `docs/AUDIT.md`                  | Transient staging for audit-skill findings (the `code-audit`, `extract-audit`, `lighthouse-audit`, and `session-audit` skills); `vet-audits` drains it into `type:audit` GitHub issues, which `fix-audits` burns down — or, for a backlog of hundreds, the `burn-down-audits` skill clears it in bulk. See `.claude/audit-conventions.md` for the audit-skill inventory and shared conventions                                                                        |
| `docs/AUDIT-LOG.md`              | Committable history of every audit-skill run (index table of date · audit, linking to a per-run summary section)                                                                                                                                                                                                                                                                                                                                                      |
| `docs/audit-deferred/decisions/` | **Standing index of decision records for findings that were triaged rather than staged** — one doc per finding with the options weighed and the verdict reached. The verdicts are MIXED: today five DROP and one FIX, so read the README's status table and follow the individual record rather than assuming any of them means "leave this alone". Distinct from `docs/AUDIT-DEFERRED.md`, the transient triage inbox they were drained out of                       |
| `docs/DEPENDABOT.md`             | How dependency bumps arrive and get reviewed — the Dependabot config, the Claude auto-review workflow, its one-time secret setup, and why Dependabot-triggered runs fail silently when misconfigured                                                                                                                                                                                                                                                                  |
| `docs/PROMPTS.md`                | Reusable AI art prompts for assets                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `tools/store-drawings/README.md` | How store free-draw SVG authoring inputs become static named pointer-instruction functions, how colors and widths are selected, and how SVG→points→live-app fidelity is evaluated                                                                                                                                                                                                                                                                                     |
| `docs/scratchpad/`               | **Working notes and audit trails** — the raw evidence behind a result rather than the result itself: investigation narratives, single profiling runs, flake hunts, triage sweeps, one-off audit sheets. Not published and not on the scrapbook index; see `docs/scratchpad/README.md` for the scrapbook-vs-scratchpad split. Keep a note when a later ADR depends on its chronology, and update stale thresholds or provenance rather than treating it as a live plan |
| `docs/CLOUD/Claude.md`           | Running/previewing the app in a Claude Code on the web cloud session, and its network constraints                                                                                                                                                                                                                                                                                                                                                                     |
| `docs/CLOUD/Codex.md`            | Configuring the Codex Cloud environment, including the manually synced setup and maintenance scripts                                                                                                                                                                                                                                                                                                                                                                  |
| `docs/handoff/`                  | Transient session-to-session transfer packets — see `docs/handoff/CLAUDE.md`. Written by the `create-handoff` skill, consumed by `resume-handoff`                                                                                                                                                                                                                                                                                                                     |

Committed run outputs live in one of two homes, split by audience. **`/scrapbook`** holds the
**polished artifacts worth consuming** — proof sheets, model bake-offs, reference galleries,
performance matrices — each with a designed entry page and a card on the index, published live via
GitHub Pages (the name avoids colliding with the Claude Code Artifact tool and release/build
artifacts). Promote one with `npm run scrapbook:publish -- <source> <type>/<name>` (ephemeral tool
scratch dirs stay gitignored); see `scrapbook/README.md` and
[ADR-0059](docs/adrs/0059-committed-run-artifacts-github-pages.md). **`docs/scratchpad/`** holds the
**notes and audit trails** worth keeping available but not supporting the public pages — a single
run's findings, a flake hunt, a triage sweep. Ask "would someone want to open this rendered, months
from now?" for scrapbook; "would someone re-litigating this decision want to see the working?" for
scratchpad.

**An obvious-looking defect that nobody has fixed may already have been decided.** Check
`docs/audit-deferred/decisions/` before changing it, and follow that record's own verdict — some are
DROP, at least one is an outstanding FIX. The rule is **consult, verify against current code and
evidence, then preserve or reopen**, not "a past DROP forbids this": a decision is a point-in-time
judgement and its premises can go stale.

They do go stale. `personal-device-scripts.md` keeps a pinned `ANDROID_SERIAL` partly on the grounds
that it anchors the committed performance matrix to reproducible hardware — but it names an
SM-S938U1, while both committed physical-Android targets name an SM-G990U1. That premise no longer
holds, which is a reason to reopen the record rather than either to obey it or to quietly reverse
it.

If you discover any doc, skill, or rule is out of date while working, update it as part of the same
task — don't leave it stale.

## Architectural Decision Records

`docs/adrs/` is the home for architectural decisions; the `adrs` skill is the entry point for
consulting them. One carve-out: decisions about the **asset-generation pipeline** (line art,
coloring fills) live beside the pipeline as un-numbered records in `tools/asset-gen/docs/` — write
new ones there, not as numbered ADRs (the ADR index marks the ones that moved).

**When a significant decision is made or confirmed:** use the `create-adr` skill to document it. A
decision is significant if it chose one approach over real alternatives, has non-obvious
consequences, or encodes a constraint a future contributor would want to understand.

**At the end of any session that touched architecture, testing, infrastructure, or build tooling:**
briefly consider running the `update-adrs` skill to catch anything that changed.

ADRs live in the repo and are committed alongside the code they describe. They are not internal
memory — they're part of the project.

## Memory vs. ADRs (Claude Code)

Claude Code's auto-memory system (`memory/`) and `docs/adrs/` serve different purposes. Use the
right one:

| What it is                                                             | Where it goes                           |
| ---------------------------------------------------------------------- | --------------------------------------- |
| Architectural/technical decision (chose X over Y, with context)        | `docs/adrs/` via the `create-adr` skill |
| Behavioral feedback (how Claude should work in this project)           | `memory/` — `feedback` type             |
| User preferences and background                                        | `memory/` — `user` type                 |
| Temporal project context (active incidents, deadlines, in-flight work) | `memory/` — `project` type              |
| Pointers to external systems                                           | `memory/` — `reference` type            |

If you find yourself about to write a `project`-type memory about a technical approach or tradeoff,
stop and write an ADR instead — it should be committed to the repo, not stored only in Claude's
local memory.
