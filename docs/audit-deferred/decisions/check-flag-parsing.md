# `--check`/flag parsing done ad hoc in every gate script

**Original finding:** [P4][consistency] — `scripts/gen-tokens.mjs:69`, `scripts/image-audit.mjs:37`,
`scripts/publish-scrapbook.mjs:37,47`, `scripts/gha-versions.mjs:108-110` (pinned at f934d43) —
deferred because the draft failed adversarial review. **Verdict:** FIX

## Context

Each gate script re-implements flag detection inline: `process.argv.includes('--check')`
(gen-tokens, image-audit), `args[0] === '--index-only'` / `args[0] === '--check'`
(publish-scrapbook), `args.includes('--check-latest')` / `args.includes('--json')` (gha-versions).
Fine at one flag each, but `--check` means "CI drift gate" in several scripts with separate parses,
and a reader can't predict how any given script reads its args.

The burndown draft (kept at
`docs/audit-deferred/p4-consistency-check-flag-parsing-done-ad-hoc-in-every-gate-script.patch`)
added a custom `parseFlags(argv, names)` helper to `scripts/lib/utils.mjs`, routed the four scripts
through it, and — because `tools/asset-gen/` deliberately does not import from `scripts/lib/`
(documented at the top of `tools/asset-gen/lib/paths.mjs`) — pasted the same helper byte-for-byte
into `tools/asset-gen/lib/paths.mjs` to also migrate `bin/gen-asset-manifest.mjs`.

Reviewer's unresolved objections:

1. **Scrapbook mode selection** still ran through the original ad hoc `args[0] === '--…'` checks in
   early rounds; the parsed booleans were redundant conjuncts. The shared parsing path must own mode
   selection while preserving the existing first-argument-only behavior.
2. **`check:assets:manifest` left out**: `tools/asset-gen/bin/gen-asset-manifest.mjs:59` is a live
   `--check` gate still parsing ad hoc; the "gate consistency" problem isn't resolved without it.
3. **Byte-for-byte duplication**: the draft's second `parseFlags` copy in
   `tools/asset-gen/lib/paths.mjs` created two independently maintained flag parsers — the exact
   defect the finding set out to fix. Use asset-gen's existing `node:util` `parseArgs` convention,
   or provide one genuinely shared implementation.
4. **No tests** covered `parseFlags` or ordered combinations of `gha-versions` flags.

## Current state

Verified at HEAD (63a7aa49) — the problem is intact and unchanged:

* `scripts/gen-tokens.mjs:67` — `process.argv.includes('--check')`
* `scripts/image-audit.mjs:37` — `process.argv.includes('--check')`
* `scripts/publish-scrapbook.mjs:49-63` — `args[0] === '--index-only'` / `args[0] === '--check'`
  (the file has since grown a proof-sheet hub mode, so the draft patch no longer applies cleanly)
* `scripts/gha-versions.mjs:107-109` — `args.includes('--check-latest')`, `args.includes('--json')`
* `tools/asset-gen/bin/gen-asset-manifest.mjs:59` — `process.argv.includes('--check')`

Also relevant at HEAD:

* `tools/asset-gen/lib/cli.mjs` already uses **`node:util` `parseArgs`** — it is asset-gen's
  established CLI convention (also `legacy/retouch-line-art.mjs` and several exploration scripts).
* `scripts/lib/utils.mjs:38` exports `argFlag(name, fallback)` for `--name=value` flags — a second
  scripts-side parsing idiom, and `scripts/lib/utils.mjs` is itself the subject of the separate
  "grab-bag" finding ([utils-grab-bag.md](utils-grab-bag.md)).
* `scripts/perf/*` carries five copies of a `flag()` value-parser — the sibling finding
  ([perf-flag-parser.md](perf-flag-parser.md)).
* `package.json` requires Node >= 22.13; `parseArgs` is stable stdlib there.

## Options considered

### Option A — `node:util` `parseArgs` at each site, no custom helper anywhere (winner)

Each of the five gate scripts calls stdlib `parseArgs` inline with its own tiny options object (1-2
booleans each). No new shared module, no change to `scripts/lib/utils.mjs` or
`tools/asset-gen/lib/paths.mjs`.

* Pros: zero custom parsing code, so nothing to unit-test and nothing to keep in sync across the
  `scripts/` ↔ `tools/asset-gen/` boundary; matches asset-gen's existing convention exactly;
  `strict: true` (the default) turns a typo'd flag into a loud error instead of today's silent
  fallthrough — today `gen-tokens.mjs --chekc` silently **rewrites** `tokens.css` instead of gating,
  which is a real footgun for humans running gates by hand; net diff is roughly zero lines.
* Cons: slight behavior tightening (unknown flags now error; see below); `parseArgs` is mildly
  verbose for a single boolean compared to `.includes()`.

### Option B — the draft's shared `parseFlags` helper, fixed up

Keep `parseFlags` in `scripts/lib/utils.mjs`, migrate `gen-asset-manifest.mjs` via `parseArgs`
(asset-gen convention), add tests for `parseFlags`.

* Pros: closest to the existing draft.
* Cons: institutionalizes a **third** parsing idiom (`parseFlags` + `argFlag` + asset-gen's
  `parseArgs`), needs its own test coverage (objection 4 stays live), and grows the utils grab-bag
  the sibling finding wants shrunk. Strictly worse than A.

### Option C — DROP as not worth it (P4)

* Pros: zero effort; each script works today.
* Cons: the fix under A is smaller than this decision doc, deletes a silent-typo footgun, and
  settles the repo-wide convention question that the perf finding also needs answered. Cost/benefit
  is positive, so dropping wastes the cheap win.

## Decision / lean

**FIX — Option A.** Migrate the five gate scripts to inline `node:util` `parseArgs`; add no helper.

Exact changes (5 files, nothing else):

1. `scripts/gen-tokens.mjs` — replace line 67 with a `parseArgs` call
   (`options: { check: { type: 'boolean' } }`).
2. `scripts/image-audit.mjs` — same replacement at line 37.
3. `scripts/gha-versions.mjs` — replace lines 107-109 with one `parseArgs` call declaring
   `'check-latest'` and `json` booleans.
4. `scripts/publish-scrapbook.mjs` — parse `check`, `'index-only'`, and positionals in one
   `parseArgs({ allowPositionals: true, … })` call at the top of `main()`; mode-select on the
   booleans; fail with the existing usage text when a mode flag is combined with positionals.
5. `tools/asset-gen/bin/gen-asset-manifest.mjs` — replace line 59 with a `parseArgs` call.
   `parseArgs` is stdlib, so the self-contained boundary in `lib/paths.mjs` is untouched.

Deliberate behavior changes to accept (both improvements for CI gates):

* Unknown/typo'd flags now error loudly (strict mode) instead of silently selecting write mode.
* `publish-scrapbook` mode flags are recognized in any position, not only `argv[0]`; combining a
  mode flag with positionals becomes a usage error rather than the flag being silently ignored.
  Every committed caller (`package.json` scripts `scrapbook:check`, `scrapbook:index`,
  `scrapbook:publish`, plus the CI workflows that invoke them) passes flags first and alone, so no
  live invocation changes meaning.

Verification: run `npm run gen:tokens:check`, `npm run img:audit:check`, `npm run scrapbook:check`,
`npm run scrapbook:index`, `npm run check:assets:manifest`, and `npm run deps:gha -- --json` on a
clean tree — all must pass/behave identically.
`grep -rn "argv.includes\|args\[0\] === '--"
scripts/*.mjs tools/asset-gen/bin/gen-asset-manifest.mjs`
returns nothing.

### One convention for gate scripts, perf scripts, and asset-gen?

The sibling finding ([perf-flag-parser.md](perf-flag-parser.md)) covers the five copy-pasted
`flag()` value-parsers in `scripts/perf/`. The reviewer here pushed toward repo-wide unification;
that push was **directionally right but wrong in mechanism**. The right repo-wide unit is the
**primitive, not a shared module**: adopt "`node:util` `parseArgs` is the flag-parsing primitive for
repo scripts" as the stated convention, and let each tree apply it inside its own boundary.

* Gate scripts (this finding): call `parseArgs` directly — done here.
* asset-gen: already on `parseArgs` (`lib/cli.mjs`); `gen-asset-manifest.mjs` joins it here.
* Perf scripts: their real problem is five copies of *domain* config (shared flags + defaults like
  `--device`/`--throttle`/`--no-build`), which belongs in one `scripts/perf/args.mjs` module per
  that finding's own proposal. Whether its internals use `parseArgs` is that doc's call —
  `parseArgs` would align with the convention, but the module's shared-defaults surface is what
  fixes the duplication, and nothing here depends on its choice.

A single physical module shared across `scripts/`, `scripts/perf/`, and `tools/asset-gen/` is
explicitly rejected: it would either break asset-gen's documented no-`scripts/lib/` boundary or
require a new top-level shared package for ~10 lines that Node already ships. The `argFlag` helper
in `scripts/lib/utils.mjs` (value flags, used only by `tools/asset-gen/crayon-brush-samples/`) stays
as-is — migrating it is the utils grab-bag finding's territory, not this one's.

## Why the previous attempt failed, and how this path avoids it

1. **Scrapbook mode selection through the shared path** — resolved: `parseArgs` owns all parsing;
   the `args[0] === '--…'` comparisons are deleted. The "preserve first-argument-only behavior" half
   of the objection is ruled **out of scope as internally contradictory**: a flag parser that owns
   mode selection is inherently position-independent. Position-independence is adopted deliberately
   (see behavior changes above) with the flags+positionals combination made a hard usage error,
   which is stricter than the old silent ignore.
2. **`gen-asset-manifest.mjs` left out** — resolved: it is in the five-file list. The objection was
   fair, not scope creep — the finding's own title says "every gate script" and
   `check:assets:manifest` is a live CI gate.
3. **Byte-for-byte `parseFlags` duplication** — dissolved: there is no custom parser anywhere. The
   "one genuinely shared implementation" the reviewer asked for is Node's stdlib, which crosses the
   module boundary for free.
4. **No tests for the parser** — dissolved for the parser itself (no custom parsing logic exists to
   test; `parseArgs` ordering/combination semantics are Node's contract, and writing tests for
   stdlib is ruled out of scope). The behavior that matters — each gate still gating — is covered by
   the verification runs above; the `gha-versions` "ordered combinations" concern is moot because
   `parseArgs` is order-insensitive by construction.

## Implementation sketch

```js
// scripts/gen-tokens.mjs (same shape for image-audit, gen-asset-manifest)
import { parseArgs } from 'node:util';
const { values: { check } } = parseArgs({ options: { check: { type: 'boolean' } } });
```

```js
// scripts/gha-versions.mjs
const { values } = parseArgs({
  options: { 'check-latest': { type: 'boolean' }, json: { type: 'boolean' } },
});
const checkLatest = values['check-latest'];
const asJson = values.json;
```

```js
// scripts/publish-scrapbook.mjs — main()
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { check: { type: 'boolean' }, 'index-only': { type: 'boolean' } },
});
if ((values.check || values['index-only']) && positionals.length) fail(USAGE);
if (values['index-only']) { /* rebuild pages */ }
if (values.check) { /* drift gate */ }
const [source, dest] = positionals;
```

## Post-merge addendum (2026-07-28, after PR 583 merged)

PR 583 removed the duplicated `fail()` from `tools/asset-gen/lib/paths.mjs` (now imported from
`lib/cli.mjs`), independently settling the reviewer's cross-boundary-duplication example for that
helper. `gen-asset-manifest.mjs` still parses `--check` ad hoc, so it remains in this decision's
five-script migration; nothing else changes.
