<!-- Source: .ruler/AGENTS.md -->

# Splotch – Agent Instructions

> [!IMPORTANT]
> Every `CLAUDE.md` and `AGENTS.md` in this repo and nearly every package in `.claude/skills/` and
> `.agents/skills/` is **generated** by [ruler](https://github.com/intellectronica/ruler) — never
> edit generated files directly. Edit their `.ruler/` source, run `npm run ruler:apply`, and commit
> the output. Direct provider packages registered in `tools/ruler/lib/direct-provider-skills.mjs`
> are the exceptions: `burn-down-audits` and `analyze-session-transcripts` have independent Claude
> and Codex implementations, while `run-claude` and `implement-issue-stack` are intentionally
> Codex-only. Edit only the registered provider package and note you intend to change; never
> manufacture a missing provider by copying another one.

Splotch is a drawing app for toddlers (2+). One SvelteKit codebase ships two targets (ADR-0001):

* **Web** (`splotch.art`, Netlify): SSR + `/api/*` serverless functions + `/admin` console + PWA.
* **Native** (Capacitor; Android + iOS): fully static export, no server routes — the apps call the
  hosted API.

The SvelteKit app lives in **`web/`** (its `src/`, configs, `netlify.toml`, build output); the
Capacitor native trees (`android/`, `ios/`), `capacitor.config.json`, the single root
`package.json`/`node_modules`, and `tools/` stay at the repo root. This keeps netlify-cli's file
watcher (run via `netlify dev --cwd web`) off the large native trees — see ADR-0024. The web
toolchain runs with `cwd = web/` through `tools/run-web-tool.mjs`.

The `CAPACITOR=true` env var at build time is the **single signal** for all web-vs-native branching
(`web/svelte.config.js`, `web/vite.config.ts`). Do not add runtime platform branches that could be
build-time branches instead.

<!-- Source: .ruler/agent-files.md -->

## Agent instruction files (ruler)

`.ruler/` is the source of truth for generated agent instructions and shared skills. Claude Code
(local and cloud sessions) reads `CLAUDE.md` files and `.claude/skills/`; OpenAI Codex and other
AGENTS.md-standard agents read `AGENTS.md` files and `.agents/skills/`. See ADR-0058.

* Root instructions live in `.ruler/*.md` (concatenated in sorted order, `AGENTS.md` first); each
  nested `<dir>/.ruler/AGENTS.md` holds that directory's orientation and generates the sibling
  `<dir>/CLAUDE.md` + `<dir>/AGENTS.md`.
* Skills are authored in `.ruler/skills/<name>/SKILL.md` and copied verbatim to `.claude/skills/`
  and `.agents/skills/` — including helper files (`driver.mjs`, extra `.md` references).
* A skill whose implementation genuinely differs by runner is absent from the shared tree. Its
  complete, independent packages live in `.ruler/skill-forks/<runner>/skills/<name>/`.
  `tools/ruler/apply-skill-forks.mjs` replaces that whole generated skill directory after Ruler's
  shared pass (`claude` → `.claude`, `codex` → `.agents`). It rejects a name that also exists under
  `.ruler/skills/` or lacks a package for either configured runner, preventing either fork from
  inheriting shared implementation files or disappearing from one agent. Markdown fork sources end
  in `.template`; the suffix is removed at the destination and keeps Ruler's recursive rule loader
  from concatenating them into root instructions.
* Direct-maintained exceptions are declared in `tools/ruler/lib/direct-provider-skills.mjs`.
  `burn-down-audits` has independent Claude and Codex packages; `run-claude` and
  `implement-issue-stack` have only Codex packages because they orchestrate a standalone Claude
  process and Codex-native subagents respectively; `analyze-session-transcripts` has independent
  provider packages because Claude Code and Codex persist different transcript formats. Edit
  registered packages and notes directly, never through `.ruler/`, and never create an undeclared
  provider by copying one.
* Skill notes are authored in `.ruler/skill-notes/<name>.md.template` and mirrored, suffix stripped,
  to `.claude/skill-notes/` and `.agents/skill-notes/` by `tools/ruler/mirror-skill-notes.mjs`. The
  `.template` suffix is load-bearing for the same reason it is on a skill fork's Markdown: ruler's
  recursive rule loader concatenates every `.md` under `.ruler/` into the root instruction files, so
  a plain `.md` note would land in every session's context — exactly what this tree exists to avoid.
  The mirror script refuses to run if it finds one. A forked skill's independent note instead lives
  under `.ruler/skill-forks/<runner>/skill-notes/` and must be absent from the shared note tree. The
  registered direct notes stay beside their direct provider trees. Notes are deliberately *not* part
  of a skill — see below.
* `npm run ruler:apply` snapshots every path in the direct-provider registry, runs Ruler, mirrors
  shared skill notes, applies managed skill forks, restores the direct paths even on failure, and
  dprint-formats the output. `npm run ruler:check` repeats that pipeline and fails if generated
  output changed — the CI drift gate. `npm run ruler:dry-run` previews Ruler's shared output only;
  it does not preview the post-apply layers.

**If asked to update agent instructions, docs, or skills: change `.ruler/**` sources, never the
generated files.** A generated file carries a `<!-- Source: ... -->` marker pointing back to its
source. For a registered direct package, edit its selected `.claude/` or `.agents/` package and note
instead.

Not generated — edit in place: registered direct provider implementations and notes,
`.claude/rules/` (path-scoped rules), `.claude/hooks/`, `.claude/settings.json`,
`.claude/audit-conventions.md`, `.claude/cloud/`, and everything under `docs/`.

`.ruler/skill-notes/` and the fork-specific `skill-notes/` directories hold the **design history and
open questions** for a skill — why it is shaped the way it is, which failures earned which rule,
what was rejected, what is still unvalidated. They are deliberately *not* linked from any
`SKILL.md`: a skill pays context for everything it references, and this material is for someone
working on the skill, not running it. Notes live beside skills rather than inside a skill package,
which would file design history inside the very skill it is kept out of. See
`.ruler/skill-notes/README.md.template` for the convention.

<!-- Source: .ruler/commands.md -->

## Commands

| Command                       | Purpose                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `npm run info`                | List **every** npm script with its description — run this before guessing at a script |
| `npm run dev`                 | Dev server at `localhost:5173` (no `/api` functions)                                  |
| `npm run dev:netlify`         | Dev server **with** the `/api/*` serverless functions                                 |
| `npm run check`               | svelte-check / type checking                                                          |
| `npm test`                    | Run the CI test tiers declared by the `package.json` test entry                       |
| `npm run build` / `build:cap` | Web build / native static build                                                       |

Script naming and the `scripts-info` descriptions follow ADR-0019: `namespace:variant` names
(`dev:*`, `test:e2e:*`, `gen:*`, `android:*`, …), and every new or renamed script gets a matching
one-line entry in the `scripts-info` block of `package.json`.

## Concurrent worktrees

Codex-managed worktrees share host ports and machine capacity.

* Select an explicit unused port for every server. Run targeted Playwright checks as
  `SPLOTCH_E2E_PORT=<port> npm run test:e2e -- <spec> --workers=1`.
* Treat `EADDRINUSE` as a request to select another port and retry. Never run `npm run dev:stop` or
  `kill-port`, and never terminate a listener merely because it occupies a desired port. Stop only a
  PID, process group, or tool handle created and recorded by the current session.
* Full `npm test`/Playwright E2E suites, fixed-port Netlify workflows, performance runs, tunnels,
  and native-device runs are host-exclusive. ADR-0078 establishes that one Playwright suite already
  sizes itself to available CPU capacity; concurrent full suites invalidate that capacity model.

<!-- Source: .ruler/conventions.md -->

## Conventions

* **No comments** unless the WHY is non-obvious. Well-named identifiers are the documentation. A
  comment that does survive states stable facts: no temporal phrasing ("now", "previously") and no
  restating mutable facts (counts, dates, values, paths) owned elsewhere — name the owning
  identifier or file instead.
* Numbered step comments (`// 1. …`) or section banners inside one function are the signal to
  extract each step into a named helper — write it that way the first time.
* **Tuning literals get names.** A numeric literal that encodes a tunable decision — threshold,
  duration, dimension, curve shaping, byte offset, retry count — gets a named module-scope constant
  with the unit in the name (`_MS`, `_PX`, `SNAP_BAND_FRACTION`); the WHY comment lives on the
  constant. Plain geometry arithmetic stays inline. (ESLint's `no-magic-numbers` was evaluated and
  rejected: ~750 hits in this canvas-heavy codebase.)
* **Cross-file agreement is never maintained by prose.** A value that must agree with another module
  is imported from one exported constant; when the agreeing sites can't share code (the `app.html`
  boot script, YAML, native config, generated output), add a drift-guard test that reads both sides
  and fails on divergence — the pattern of `web/src/app.html.test.ts`,
  `tools/mobile/android/tests/android-config.test.mjs`, and `web/src/browserFloor.test.ts`. A "keep
  in sync with X" comment marks a defect, not a mitigation. Same rule for boundary strings (storage
  keys, query params, event names, special-case ids): declared once, imported everywhere (tests
  deliberately excepted). A **bundle boundary** is one of the places that can't share code: a static
  import into a startup-path module hands Rollup an edge that re-partitions chunks no matter how
  small the imported module, so there the duplication is deliberate and the sharing itself is the
  defect (`web/src/lib/state/saveFolder.svelte.ts` vs `folderSave.ts`, drift-guarded by
  `saveFolder.svelte.test.ts` and pinned by `web/tests/startup-bundle.spec.ts`). Such a site keeps
  its inline copy, adds the drift-guard test, and carries a comment stating the constraint and
  naming the enforcing spec — that comment is load-bearing evidence of intent, not the "keep in
  sync" defect above, and refactoring the duplication away past it breaks the boundary it protects.
* **TypeScript everywhere.** No plain `.js` source files in `src/`.
* **Close finite value sets in the type.** A value drawn from a fixed vocabulary (style names,
  platforms, sizes, themes) is a literal union or `keyof typeof`, threaded end to end — never bare
  `string`/`number` plus a runtime fallback; constant maps are `Record<UnionType, V>` (or
  `satisfies`), not `Record<string, V>`.
* **`as` is a boundary tool.** Cast only where typed code meets untyped input (storage, wire,
  non-standard browser APIs) after runtime validation, or augment globals in `app.d.ts` (the
  `WindowEventMap` pattern). Never cast to silence a generated union — fix the type at its source.
* **No speculative surface.** A new prop, option, or optional parameter needs a production caller
  that exercises it; a seam kept only for tests gets a comment saying so at the declaration.
* Module-scope mutable `let` is either a pure memoization cache or lives behind a `createX()`
  factory so tests get fresh instances — never a shipped `*ForTests` reset export. A memoized
  promise resets itself on rejection (see `web/src/lib/idb.ts`) unless permanent failure is
  intended.
* **Svelte 5 runes only.** No legacy stores (`writable`, `readable`, `derived` from `svelte/store`).
* All npm scripts must run on macOS and Linux (ADR-0017; Windows dev support was dropped in
  ADR-0062): env vars are set inline (`VAR=value cmd`, no `cross-env`), and platform-specific tools
  (the Gradle wrapper, the file-manager opener) are invoked via Node helpers in `tools/` rather than
  inline shell.
* **pnpm installs; npm runs** (ADR-0119). `npm run <script>` is correct everywhere and stays the
  documented way to invoke the script graph (ADR-0019) — pre/post hooks and all. But **never run
  `npm install` or `npm ci` here**: both succeed, both produce a working flat `node_modules`, and
  both write a `package-lock.json` that resolves the tree independently of `pnpm-lock.yaml` and then
  drifts from it with nothing to announce the divergence. Use `pnpm install` (or
  `pnpm install --frozen-lockfile` to reproduce the committed tree exactly), and `pnpm add <pkg>` to
  add one. `package-lock.json` is gitignored and `tools/tests/package-manager.test.mjs` fails if any
  CI, hook, or bootstrap file starts installing with npm again. pnpm itself comes from
  `corepack enable pnpm` — re-run that after every `nvm install`, since the shim is written into the
  active Node's `bin/`.
* **The `dependencies`/`devDependencies` split is inverted** (ADR-0070): `dependencies` = what the
  Netlify web build needs (runtime imports + vite/SvelteKit/adapter/`marked`); `devDependencies` =
  local/CI-only tooling (Playwright, dprint, sharp, the Capacitor CLIs, …). Netlify installs with
  `--prod`, so a build-needed package filed under `devDependencies` breaks the deploy (CI stays
  green — it installs everything). When adding a dependency, ask "does the Netlify web build import
  or execute this?"
* **Formatting is split: Prettier owns code, dprint owns Markdown** (`*.md` is in `.prettierignore`;
  ADR-0057). The `format-edited-file.sh` PostToolUse hook auto-formats each file you edit through
  the right one, but if you write Markdown any other way (or aren't sure), run
  `npm run format:check` before you commit — CI's `dprint check` fails on unwrapped Markdown, and
  that's the most common reason a fresh PR is red. The cloud-only `session-start.sh` and
  `cloud-branch-preview.sh` SessionStart hooks run only when `CLAUDE_CODE_REMOTE=true`; see
  `docs/CLOUD/Claude.md` for details.

<!-- Source: .ruler/github.md -->

## Writing on GitHub

For every GitHub task, **use the native GitHub skill and its MCP/app tools first**. Only attempt the
`gh` CLI after that native path fails to perform the required operation. The sandbox cannot use the
host's macOS Keychain-backed `gh` credentials, so `gh` authentication failures there are expected;
never try to repair them by re-authenticating from the sandbox.

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

The mirror-image rule holds for **commit SHAs: leave them bare, never in backticks.** GitHub
auto-links a plain-text SHA into a link to that commit; a code span suppresses the linker and it
renders as dead monospace text. So write "fixed in 863ee85aaa43", not ``"fixed in `863ee85aaa43`"``.
Backticks around file paths, identifiers, and commands are still correct — this is only about SHAs
(and the `#`-numbers above, where backticks are one of the ways to *defuse* an unwanted link).

**Never write a SHA from memory — copy it from command output, and verify before you post.** A SHA
is the one value in agent-authored text with no redundancy: every character is load-bearing, nothing
downstream validates it, and a wrong one renders as ordinary plain text rather than failing. The
specific trap is mixing widths. `git log --format=%h` abbreviates to 7 characters; extending one to
the 12 a comment wants means inventing 5, which yields a string with the right length and the right
leading characters that resolves to nothing. It looks correct in every way except the one that
matters, and the only symptom is a heading that quietly stops being a link.

So take SHAs from `%H` (or `git rev-list`) and paste them, never retype them — and when a batch is
already posted, verify rather than trusting the transcription:

```bash
git rev-parse --verify --quiet "$sha^{commit}" >/dev/null || echo "BAD $sha"
```

Worth running over every SHA in a body you are about to post, and over the whole set after posting a
batch — it is one command and it is the only thing that distinguishes a live link from a dead
string. This bit a 2026-08-05 burndown: 32 of 62 per-commit comments carried a padded 7-char prefix
and were individually plausible.

**Verify before posting, because repairing after depends on a capability you may not have.** Whether
a posted comment can be edited varies by runner and by which GitHub toolset is connected — some
expose an update-comment call, others only a create. So when you do find a bad SHA in something
already posted, check your available tools for a comment-update capability first and edit the
comment in place; fall back to a correction comment only when there is none, since that leaves the
wrong SHA on the thread and costs every later reader a cross-reference.

<!-- Source: .ruler/knowledge-map.md -->

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
`analyze-session-transcripts` with format-specific implementations; Codex-only `run-claude` and
`implement-issue-stack` live only under `.agents/`. See `tools/ruler/lib/direct-provider-skills.mjs`
for the authoritative registry.

| Skill                                   | Read it before…                                                                                                                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `architecture`                          | navigating unfamiliar code, placing new code, naming UI elements                                                                                                                                                         |
| `design`                                | writing or changing component styles, picking a color/size/shadow/easing, or writing user-facing copy — the token vocabulary, primitives, voice, and the public `/design` styleguide                                     |
| `api`                                   | adding, changing, or calling any `/api/*` endpoint                                                                                                                                                                       |
| `mobile`                                | touching anything Android/iOS/Capacitor, or store-release work                                                                                                                                                           |
| `testing`                               | writing/running tests beyond the basics, or debugging CI failures                                                                                                                                                        |
| `profiling`                             | measuring drawing/canvas performance, investigating jank, or checking for perf regressions (`npm run perf:*`)                                                                                                            |
| `lighthouse-audit`                      | auditing page-load performance / Core Web Vitals on a throttled device (Lighthouse, first vs repeat visit)                                                                                                               |
| `adrs`                                  | proposing or discussing any architectural approach                                                                                                                                                                       |
| `run-claude`                            | launching a fresh local Claude process from Codex for a second opinion, inspection, or empirical Splotch PR review                                                                                                       |
| `pr-screenshots`                        | opening/creating a pull request that touches the UI — screenshot conventions that augment the built-in PR flow                                                                                                           |
| `leave-pr-review` / `address-pr-review` | authoring a review of a PR (`leave-pr-review` — local checkout, empirical verification, gated posting, augments the built-in review flow), or working through the review feedback received on a PR (`address-pr-review`) |
| `create-handoff` / `resume-handoff`     | pausing in-flight work for a later session (`create-handoff`), or picking it back up (`resume-handoff`) — transfer packets live in `docs/handoff/`                                                                       |

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
  `docs/PROFILING-ANDROID.md`. The content is documentation a human would want anyway, it is read by
  lookup rather than start-to-finish, and one copy means one diff.
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

| File                             | When to read it                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/ARCHITECTURE.md`           | Tech stack, the `web/src/lib/` source map, the route/render table, and the UI element glossary — the `architecture` skill routes here                                                                                                                                                                                                                                                          |
| `docs/API.md`                    | The full `/api/*` contract: request/response shapes, auth, CORS, and per-endpoint rate limits — the `api` skill routes here                                                                                                                                                                                                                                                                    |
| `docs/TESTING.md`                | Every test layer, its command, and what CI runs it on; flake-resistant spec authoring; Maestro setup — the `testing` skill routes here                                                                                                                                                                                                                                                         |
| `docs/MOBILE/`                   | `native.md` (how the Capacitor build works, storage, privacy posture), `android.md`, `ios.md` — toolchains, build/sign/run, and the store release + kids-compliance checklists — and `compliance.md`, the app-store compliance ledger (each implemented guideline quoted verbatim, per-store required-or-not, mitigation, provenance); the `mobile` skill routes here                          |
| `docs/PROFILING-CAMPAIGNS.md`    | Unattended physical-device capture: the preflight, and the setup mistakes that produce plausible wrong numbers without erroring — device identity, Guided Access, port contention, stale builds, input cadence, and which capture paths cannot be scored                                                                                                                                       |
| `docs/PROFILING.md`              | The `npm run perf:*` harness — which command profiles what, how capture works, and reading a report into a bottleneck; the `profiling` skill routes here                                                                                                                                                                                                                                       |
| `docs/PROFILING-IPAD.md`         | The physical-iPad profiling runbook — the highest-fidelity target (real WebKit + Apple GPU + 120 Hz); read before any on-device perf capture                                                                                                                                                                                                                                                   |
| `docs/PROFILING-ANDROID.md`      | The physical-Android profiling toolchain — `dumpsys gfxinfo framestats`, Perfetto, and CDP `Tracing`; which one answers which question, and what each says that the app's own probe cannot                                                                                                                                                                                                     |
| `docs/COMPATIBILITY.md`          | The supported browser/device floor, how it's enforced, and the per-API risk register — read before raising the floor, adding a modern web API, or changing a native min-OS target                                                                                                                                                                                                              |
| `docs/CONTRIBUTING.md`           | Human onboarding doc — keep in sync when conventions change                                                                                                                                                                                                                                                                                                                                    |
| `docs/ISSUE-WORKFLOW.md`         | How the GitHub issue tracker is organized — issue format, label glossary (`type:*`/`area:*`/`priority:*`/meta), and the triage + won't-do flow                                                                                                                                                                                                                                                 |
| `docs/AUDIT.md`                  | Transient staging for audit-skill findings (the `code-audit`, `extract-audit`, `lighthouse-audit`, and `session-audit` skills); `vet-audits` drains it into `type:audit` GitHub issues, which `fix-audits` burns down — or, for a backlog of hundreds, the `burn-down-audits` skill clears it in bulk. See `.claude/audit-conventions.md` for the audit-skill inventory and shared conventions |
| `docs/AUDIT-LOG.md`              | Committable history of every audit-skill run (index table of date · audit, linking to a per-run summary section)                                                                                                                                                                                                                                                                               |
| `docs/DEPENDABOT.md`             | How dependency bumps arrive and get reviewed — the Dependabot config, the Claude auto-review workflow, its one-time secret setup, and why Dependabot-triggered runs fail silently when misconfigured                                                                                                                                                                                           |
| `docs/PROMPTS.md`                | Reusable AI art prompts for assets                                                                                                                                                                                                                                                                                                                                                             |
| `tools/store-drawings/README.md` | How store free-draw SVG authoring inputs become static named pointer-instruction functions, how colors and widths are selected, and how SVG→points→live-app fidelity is evaluated                                                                                                                                                                                                              |
| `docs/scratchpad/`               | Retained investigation narratives and intermediate evidence that explain how a complex result was reached; keep them when later ADRs depend on the chronology, and update stale thresholds or provenance rather than treating them as live plans                                                                                                                                               |
| `docs/CLOUD/Claude.md`           | Running/previewing the app in a Claude Code on the web cloud session, and its network constraints                                                                                                                                                                                                                                                                                              |
| `docs/CLOUD/Codex.md`            | Configuring the Codex Cloud environment, including the manually synced setup and maintenance scripts                                                                                                                                                                                                                                                                                           |
| `docs/handoff/`                  | Transient session-to-session transfer packets — see `docs/handoff/CLAUDE.md`. Written by the `create-handoff` skill, consumed by `resume-handoff`                                                                                                                                                                                                                                              |

Committed run outputs (contact sheets, Lighthouse reports, model/prompt tests) live in
**`/scrapbook`** — a keeper's home separate from `docs/`, published live via GitHub Pages (the name
avoids colliding with the Claude Code Artifact tool and release/build artifacts). Promote one with
`npm run scrapbook:publish -- <source> <type>/<name>` (ephemeral tool scratch dirs stay gitignored);
see `scrapbook/README.md` and [ADR-0059](docs/adrs/0059-committed-run-artifacts-github-pages.md).

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
