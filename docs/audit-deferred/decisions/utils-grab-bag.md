# `scripts/lib/utils.mjs` is a grab-bag mixing generic, Playwright, release, and app-domain concerns

**Original finding:** [P2][architecture] — `scripts/lib/utils.mjs` (whole file, pinned at f934d43) —
deferred because the implementer failed to deliver a fix round against the reviewer's last
objection. **Verdict:** FIX

## Context

The finding: `utils.mjs` claims to be "generic helpers" but held at least five unrelated
responsibilities — process runners (`run`/`sh`/`capture`/`fail`), network polling (`waitForUrl`),
Playwright binary resolution (`chromiumExecutablePath`), Maestro/tool discovery, release/markdown
parsing (`parseFrontmatter`, `compareSemverDesc`, `writeFileDeep`), and app-domain logic
(`webOnlyBooks`). Proposed solution: split by concern into `proc`/`net`/`playwright`/`maestro`/
`frontmatter` modules, with a thin `utils.mjs` re-export barrel for one migration cycle.

The burndown attempt implemented a **hard cut** instead of the barrel: it created the five modules,
migrated every caller, deleted `utils.mjs`, and renamed `scripts/tests/utils.test.mjs` to
`proc.test.mjs`. The single unresolved reviewer objection:

> Deleting `scripts/lib/utils.mjs` leaves active guidance pointing to a nonexistent module in
> `scripts/.ruler/AGENTS.md`, `.ruler/skills/testing/SKILL.md`, `.ruler/skills/fix-audits/SKILL.md`,
> and `docs/adrs/0017-cross-platform-node-scripts.md`; update these authoritative sources and
> regenerate their mirrors.

The implementer never delivered that follow-up round. The code split itself drew no unresolved
objection — the review died on documentation drift, which is a bounded, completable gap.

## Current state (verified at HEAD 63a7aa49)

The problem is still real but **partially reduced**, and the draft patch is **stale**:

* `webOnlyBooks` — the app-domain offender — was already extracted to `scripts/lib/book-assets.mjs`
  by commit f49f388 (a separate audit finding). That part of the finding is done.
* `utils.mjs` has otherwise **grown** since the pin (148 → ~200 lines): it gained `isMain`,
  `runMain`, `requireEnv`, `argFlag`, `openInOS`, `pollUntil`, `runId`, and several function bodies
  changed under other audit fixes — `hasCommand` now uses `sh -c 'command -v'` (e1b73cd), `run`/
  `capture` dropped the `quoteArg`/`shellJoin` shell path (8743196), `chromiumExecutablePath` was
  reworked twice (e940c63, 99d55d1), and `parseFrontmatter` now throws on malformed lines (c1be0d7).
  The remaining mix — process/CLI helpers, HTTP polling, Playwright binary self-heal, Maestro
  discovery, release frontmatter/semver — still cohabits one file whose header still says "Generic
  helpers".
* The draft patch **does not apply** at HEAD: `git apply --check` fails on ~10 files, its
  `book-assets.mjs` collides with the one that now exists, and its new-module bodies carry pre-fix
  code (the old `which`-based `hasCommand`, the old lenient `parseFrontmatter`). It is a correct
  **map of which caller needs which module**, not applyable code.
* References to `utils.mjs` in guidance at HEAD (`git grep`): the three `.ruler` sources named by
  the reviewer (`scripts/.ruler/AGENTS.md:12`, `.ruler/skills/testing/SKILL.md:281,309`,
  `.ruler/skills/fix-audits/SKILL.md:114`), their generated mirrors (`scripts/CLAUDE.md`,
  `scripts/AGENTS.md`, `.claude/skills/`, `.agents/skills/`), `docs/adrs/0017` line 37 (a living
  description of the `scripts/lib/` layout, itself freshly rewritten by the interim audit commits),
  `docs/adrs/0062` line 38 (a historical decision record), plus one code comment in
  `scripts/audit-burndown/lib.mjs:2`.
* One nuance: `web/playwright.config.ts` contains a deliberate *copy* of `chromiumExecutablePath`
  (the comment in `utils.mjs` says "Mirror the self-heal in web/playwright.config.ts"). It does not
  import from `scripts/lib/` and is untouched by this change.

## Options considered

1. **Hard cut + doc updates** (finish what the draft started, re-derived at HEAD) — **winner.**
   Split into concern-named modules, migrate all ~55 in-repo callers in the same commit, delete
   `utils.mjs`, and update the four authoritative doc sources the reviewer listed. Pros: each module
   states one responsibility; no lingering grab-bag import surface; the doc objection is fully
   satisfied; `npm test` + `npm run ruler:check` verify both halves. Cons: ~60-file mechanical churn
   (merge friction for in-flight branches) — but the rewrites are import-line only and low-risk.
2. **Barrel-then-remove** (the original finding's proposal) — rejected. A deprecation cycle exists
   for consumers you cannot migrate atomically. Every consumer of `utils.mjs` is in this repo and
   migrates in the same commit, so the barrel only schedules a second PR that history says nobody
   runs. It also does *not* moot the doc objection: the `.ruler` sources and ADR-0017 describe the
   *contents* of `utils.mjs` ("has the common run/log helpers … plus the Maestro location"), which
   would be misleading the moment the contents move behind a facade. The docs need the same rewrite
   either way; the barrel just adds a step.
3. **Barrel forever** — rejected. Keeps the grab-bag as the permanent import surface, adds a second
   way to import every helper, and the "generic helpers" header stays a lie. Worst of both.
4. **DROP** — rejected, but it was a real contender. The strongest smell (app-domain `webOnlyBooks`)
   is already fixed, the module imports only node builtins (Playwright's `chromium` is injected as a
   parameter precisely to avoid a heavy import graph), so the runtime cost of the grab-bag is nil —
   the cost is purely cognitive. What tips it to FIX: the file has kept accreting (seven new exports
   since the pin), the repo's own audit conventions call out grab-bag `utils`, the split survived
   adversarial review on its merits, and the only thing that killed it is a half-hour of doc edits.
   The churn only gets bigger later.

## Decision / lean

**FIX — option 1, re-derived from HEAD (do not `git apply` the stale patch).** Concretely:

New modules under `scripts/lib/`, each body taken **verbatim from HEAD's `utils.mjs`** (not from the
patch, whose bodies predate e1b73cd/c1be0d7):

| Module            | Exports (from HEAD)                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `proc.mjs`        | `ROOT`, `isMain`, `runMain`, `sleep`, `fail`, `requireEnv`, `argFlag`, `run`, `sh`, `openInOS`, `pollUntil`, `capture`, `hasCommand`, `runId` |
| `net.mjs`         | `waitForUrl` (imports `sleep` from `proc.mjs`)                                                                                                |
| `playwright.mjs`  | `chromiumExecutablePath`                                                                                                                      |
| `maestro.mjs`     | `maestroPath`, `maestroInstalled` (private `maestroDefaultPath`; imports `hasCommand` from `proc.mjs`)                                        |
| `frontmatter.mjs` | `parseFrontmatter`, `compareSemverDesc`, `writeFileDeep`                                                                                      |

Notes on the map: `book-assets.mjs` already exists at HEAD — no action. `writeFileDeep` is
fs-generic but its only consumers are `generate-releases.mjs`/`release.mjs`, so it stays beside the
release helpers as the draft had it (moving it to `proc.mjs` is acceptable if the implementer
prefers; not worth debate). `pollUntil` and `runId` are process/CLI-flavored and go to `proc.mjs`,
matching the draft.

Caller migration: use the stale patch as the per-file import map (it covers every caller), but
re-run `git grep -n "lib/utils.mjs\|/utils.mjs'" scripts tools` at implementation time — callers may
have shifted again. Tests: split `scripts/tests/utils.test.mjs` into `proc.test.mjs`
(`run`/`capture`/`hasCommand` cases — also update its `utilsUrl` subprocess-fixture URL) and
`frontmatter.test.mjs` (`parseFrontmatter` cases), so test file names track modules. Delete
`scripts/lib/utils.mjs` — no barrel.

Doc updates (the reviewer's objection, resolved item by item):

1. `scripts/.ruler/AGENTS.md` — rewrite the `scripts/lib/` inventory bullet: replace the
   "`utils.mjs` has the common run/log helpers (including `sh()` … and `waitForUrl()` …) plus the
   Maestro location" clause with the five-module inventory (one clause each). Then
   `npm run ruler:apply` regenerates `scripts/CLAUDE.md` and `scripts/AGENTS.md`.
2. `.ruler/skills/testing/SKILL.md` — both references are about Maestro discovery (lines 281 and 309
   at HEAD): point them at `scripts/lib/maestro.mjs`. Regenerated mirrors under `.claude/skills/`
   and `.agents/skills/` come from the same `ruler:apply`.
3. `.ruler/skills/fix-audits/SKILL.md` line 114 — the reuse-before-you-add list: replace `utils.mjs`
   with `proc.mjs` (and optionally name the siblings).
4. `docs/adrs/0017-cross-platform-node-scripts.md` line 37 — this bullet is a living description of
   the current helper layout (it was itself updated by the interim audit commits); rewrite it to
   list the five modules with the same content it credits to `utils.mjs` today.
5. `docs/adrs/0062-drop-windows-dev-support.md` line 38 — **deliberately unchanged.** It records
   "Drop the `isWindows` branches from `scripts/lib/utils.mjs`, …" — a decision executed at a point
   in time when the file existed. ADRs are records, not living maps; rewriting history to track a
   rename would be scope creep. (The reviewer did not list it either.)
6. Comment sweep: `scripts/audit-burndown/lib.mjs:2` says "Unlike scripts/lib/utils.mjs's
   run()/capture()" → `proc.mjs`. Acceptance check: after the change,
   `git grep -n "utils\.mjs" -- ':!docs/audit-deferred' ':!docs/handoff'` returns only ADR-0062.

Verification: `npm test` (unit + scripts + driver:smoke + E2E — `test:driver:smoke` matters here
because `app-driver.mjs` is a caller and has bitten on dropped imports before) and
`npm run ruler:check` (the CI drift gate proves the mirrors were regenerated).

## Why the previous attempt failed, and how this path avoids it

There was exactly one unresolved objection: deleting `utils.mjs` orphaned references in four
authoritative doc sources. The attempt failed not because the objection was contested but because
the implementer never shipped the round addressing it. This path bakes the doc edits into the change
itself as a first-class checklist (items 1–6 above), scopes them per repo convention (edit `.ruler/`
sources once, `ruler:apply` regenerates all mirrors — no hand-editing generated files), and
explicitly rules the one arguable expansion (rewriting the historical ADR-0062) out of scope with
justification. Nothing else from the review remains open, so implementation should not re-litigate
the split itself — only rebase it onto HEAD's current function bodies.
