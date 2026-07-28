# Audit — deferred findings

> Findings the scripted audit burndown (the `burn-down-audits` skill) moved aside instead of fixing
> — the verifier was unavailable, the implementation failed, or the change never passed adversarial
> review. Each needs human triage: re-stage it in `docs/AUDIT.md`, file it as an issue, or drop it.

The 2026-07-27 triage pass reviewed the 49 findings deferred up to that date and drained them from
this file: 30 FIX verdicts were re-staged in `docs/AUDIT.md` with resolution guidance, 9 OPTIONS
verdicts became `type:audit` + `needs-triage` GitHub issues (564-572), and 10 DROP verdicts were
retired with rationale. The disposition index (`docs/audit-deferred/triage/README.md`) and full
original texts remain in this file's git history — the triage directory was removed once every
verdict was dispatched. Entries below arrived after that pass.

### [P4][consistency] `--check`/flag parsing done ad hoc in every gate script

**File(s):** `scripts/gen-tokens.mjs:69`, `scripts/image-audit.mjs:37`,
`scripts/publish-scrapbook.mjs:37,47`, `scripts/gha-versions.mjs:108-110` — pinned at SHA f934d43

#### Problem

Each script re-implements flag detection inline: `process.argv.includes('--check')`,
`args[0] === '--index-only'`, `args.includes('--check-latest')`, `--json`, etc. It's fine at one
flag each, but there's no shared convention, so `--check` means "CI drift gate" in three scripts
with three separate parses, and a reader can't predict how a given script reads its args.

#### Proposed solution

A minimal shared `parseFlags(argv, names)` (or adopt `node:util` `parseArgs`) in `lib/utils.mjs`,
returning `{ flags, positionals }`. Not worth a heavy CLI framework, but one helper standardizes the
`--check` gate idiom the repo uses repeatedly.

#### Verification

Each gate (`gen:tokens:check`, `img:audit:check`, `scrapbook:check`, `deps:gha --check-latest`)
still behaves identically. Consistent parsing visible in a grep.

---

#### Why it was deferred

failed adversarial review

Reviewer's unresolved objections:

* `scripts/publish-scrapbook.mjs:38,48` still selects both modes with the original ad hoc
  `args[0] === '--…'` checks; the parsed booleans are only redundant conjuncts. Make the shared
  parsing path own mode selection while preserving the existing first-argument-only behavior.
* The live `check:assets:manifest` gate still parses `--check` ad hoc with
  `process.argv.includes('--check')` in `tools/asset-gen/bin/gen-asset-manifest.mjs:59`; migrate it
  to the shared flag convention so the original repository-wide gate consistency problem is fully
  resolved.
* `tools/asset-gen/lib/paths.mjs` duplicates `parseFlags` byte-for-byte, leaving two independently
  maintained flag parsers and perpetuating the original consistency defect; use asset-gen’s existing
  `node:util` `parseArgs` convention for `gen-asset-manifest.mjs`, or provide one genuinely shared
  implementation.
* No test covers `parseFlags` or the required ordered combinations of `gha-versions` flags, so the
  acceptance-critical parsing behavior is not enforced by the green suite; add focused coverage for
  combined/reordered flags and positional preservation.

#### What was tried

1. Added a shared flag parser and routed the four assigned scripts through it while preserving their
   existing CLI dispatch behavior.
2. Moved scrapbook mode selection fully into `parseFlags` by parsing only the first CLI token,
   preserving its first-argument-only contract.
3. Migrated the asset-manifest drift gate to the asset pipeline’s shared `parseFlags` convention
   while preserving its self-contained module boundary.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p4-consistency-check-flag-parsing-done-ad-hoc-in-every-gate-script.patch` (3
commits). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p4-consistency-check-flag-parsing-done-ad-hoc-in-every-gate-script.patch`.

### [P1][duplication] Extract the copy-pasted CLI `flag()`/`args` parser shared by every perf entry script

**File(s):** `scripts/perf/scenario.mjs:23-32`, `scripts/perf/mount.mjs:38-47`,
`scripts/perf/ios.mjs:25-33`, `scripts/perf/undo-scenarios.mjs:39-46`,
`scripts/perf/replay-scenario.mjs:27-36` (module-scope arg parsing) — pinned at SHA f934d43

#### Problem

The exact same argument-parsing helper is defined five times:

```js
const args = process.argv.slice(2);
const flag = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};
```

Each site then re-derives the same flags by hand — `--no-throttle`, `--throttle`, `--no-build`,
`--device`, `--port` — with subtle divergence (e.g. `throttle` defaults to `'4'` in
scenario/mount/undo but `'0'` in replay; ios omits throttle entirely). Any fix to arg handling (e.g.
`--throttle` with no `=`, or a typo'd flag warning) has to be made in five places, and the drift is
already visible.

#### Proposed solution

Add `scripts/perf/args.mjs` exporting a parser, e.g.
`export function parsePerfArgs(argv = process.argv.slice(2))` returning
`{ flag, has, device, throttle, port, build }` with the shared defaults, and
`export const flag = (name, def, argv) => …` for the raw case. Have each entry import it instead of
re-declaring. Keep `HZ`/`long-seconds`/`scenarios`/`recording` (script-specific flags) reading
through the returned `flag`.

#### Verification

`grep -rn "const flag = (name, def)" scripts/perf` returns zero after the change; run
`npm run perf:web -- --no-build --device=tablet` and
`npm run perf:undo -- --scenarios=mixed --no-throttle` and confirm identical flag behavior.

---

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* `scripts/perf/args.mjs` only centralizes value lookup; the entry scripts still duplicate
  `process.argv.slice(2)` and the common `--no-throttle`, `--no-build`, `--device`, `--throttle`,
  and `--port` derivations. Move these into a shared `parsePerfArgs` result while preserving each
  script’s throttle default and optional flags, so common parsing changes and unknown-flag
  validation no longer require edits across every entry point.

#### What was tried

Extracted the duplicated raw flag lookup into `scripts/perf/args.mjs` and updated all five profiling
entry points to pass their local argv explicitly. Existing per-script defaults and boolean flag
behavior remain unchanged.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p1-duplication-extract-the-copy-pasted-cli-flag-args-parser-shared-by-ev.patch`
(1 commit). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p1-duplication-extract-the-copy-pasted-cli-flag-args-parser-shared-by-ev.patch`.

### [P2][cross-platform] `bumpAndroidGradle` / `bumpIosPbxproj` regexes are unanchored and global — they corrupt sibling lines

**File(s):** `scripts/lib/native-version.mjs:28-53` (`bumpAndroidGradle`, `bumpIosPbxproj`) — pinned
at SHA f934d43

#### Problem

The version bumpers match with bare, greedy, global regexes:

```js
.replace(/versionName.*/g, `versionName "${version}"`)
.replace(/versionCode.*/g, `versionCode ${versionCode}`);
```

`versionName.*` also matches a `versionNameSuffix ".debug"` line (it starts with `versionName`) and
any comment mentioning `versionName`, and `/g` rewrites *every* match — silently clobbering those
lines with `versionName "x.y.z"`. Same hazard for `versionCode` vs `versionCodeOverride`, and for
the iOS `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` variants. The header comment claims
byte-identical output "matching the upstream behaviour on files that carry the pair once," but
nothing guarantees the project files stay single-occurrence, and a future Gradle edit that adds a
suffix would produce a corrupt build file with no error.

#### Proposed solution

Anchor to the assignment and preserve indentation, e.g. `/^(\s*)versionName\s+".*"/m` →
`` `$1versionName "${version}"` `` and `/^(\s*)versionCode\s+\d+/m`. Drop `/g` in favour of
asserting exactly one match (the guard checks already require presence; extend them to reject >1).
For pbxproj keep `MARKETING_VERSION =` but require the trailing `;`:
`/MARKETING_VERSION = [^;]*;/g`.

#### Verification

Add a fixture `build.gradle` containing both `versionName "0.0.1"` and `versionNameSuffix ".debug"`;
assert only the `versionName` line changes. Existing release flow (`npm run release` dry path) still
produces the same diff on the real files.

---

#### Why it was deferred

failed adversarial review

Reviewer's unresolved objections:

* `scripts/lib/native-version.mjs:24-25,42-43` require the assignment to occupy the entire line, so
  valid Android or iOS assignments followed by an inline comment are rejected or skipped instead of
  being updated while preserving the comment.
* The anchored patterns still match indented assignment-shaped text inside `/* ... */` comments;
  Android then reports a false duplicate and iOS rewrites the commented text. Exclude block-comment
  contents and add coverage for them.
* `scripts/lib/native-version.mjs` anchors the iOS patterns to whole lines, so valid compact pbxproj
  dictionaries such as `buildSettings = { MARKETING_VERSION = 1.2.3; ... };` are silently skipped
  while other configurations are updated; match each semicolon-terminated assignment wherever it
  appears in the build-settings dictionary.
* `maskBlockCommentContents` treats `/*` inside a `//` comment as the start of a block comment,
  potentially masking all following assignments and making an otherwise valid Gradle file fail the
  bump; block-comment masking must respect line comments.
* `scripts/lib/native-version.mjs:23-47,98-105` is not string-aware: a valid Gradle string
  containing `/*` can mask the real assignments and fail the bump, while a quoted pbxproj value
  containing `{ MARKETING_VERSION = ...;` is treated as an assignment and rewritten. Exclude comment
  delimiters and assignment-shaped text inside string literals, with coverage for both cases.

#### What was tried

1. Tightened native version matching to complete indented assignments, preserving indentation while
   rejecting ambiguous Android fields and retaining multi-configuration iOS updates. Added focused
   regression coverage proving sibling identifiers, comments, and embedded setting substrings remain
   unchanged.
2. Updated native-version transforms to retain inline comment suffixes verbatim and mask
   block-comment contents before assignment detection, preventing false Android ambiguity and
   commented iOS rewrites. Expanded regression fixtures for both comment forms and stable multi-line
   replacement.
3. Updated iOS version matching to recognize dictionary entries after line starts, `{`, or `;`,
   including multiple settings on compact lines without touching unrelated substrings. Reworked
   comment masking to track line and block comments independently, so `/*` inside `//` cannot hide
   later Android assignments.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p2-cross-platform-bumpandroidgradle-bumpiospbxproj-regexes-are-unanchore.patch`
(3 commits). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p2-cross-platform-bumpandroidgradle-bumpiospbxproj-regexes-are-unanchore.patch`.

### [P2][architecture] `utils.mjs` is a grab-bag mixing generic, Playwright, release, and app-domain concerns

**File(s):** `scripts/lib/utils.mjs:1-148` (whole file) — pinned at SHA f934d43

#### Problem

The header says "Generic helpers … App-specific logic stays in the script that owns it," but the
file holds at least five unrelated responsibilities: process runners (`run`/`sh`/`capture`/`fail`),
network polling (`waitForUrl`), Playwright binary resolution (`chromiumExecutablePath`),
command/tool discovery (`hasCommand`, `maestroPath`, `maestroInstalled`), release/markdown parsing
(`parseFrontmatter`, `compareSemverDesc`, `writeFileDeep`), and outright app-domain logic
(`webOnlyBooks`). A change to any one drags an unrelated import graph; `perf/` scripts importing
`sleep` pull in `scrypt`-free but still Playwright- and Maestro-flavoured code. This is the
"grab-bag `utils`" the audit brief calls out.

#### Proposed solution

Split by concern: `lib/proc.mjs` (`run`/`sh`/`capture`/`fail`/`sleep`/`hasCommand`), `lib/net.mjs`
(`waitForUrl`), `lib/playwright.mjs` (`chromiumExecutablePath`), `lib/maestro.mjs` (Maestro paths —
or fold into `android.mjs`'s sibling), `lib/frontmatter.mjs` (`parseFrontmatter`,
`compareSemverDesc`). Re-export from a thin `utils.mjs` barrel for one migration cycle, then update
imports.

#### Verification

`npm test` (unit + driver:smoke) green; each new module has a single-sentence header describing one
responsibility.

---

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* Deleting `scripts/lib/utils.mjs` leaves active guidance pointing to a nonexistent module in
  `scripts/.ruler/AGENTS.md`, `.ruler/skills/testing/SKILL.md`, `.ruler/skills/fix-audits/SKILL.md`,
  and `docs/adrs/0017-cross-platform-node-scripts.md`; update these authoritative sources and
  regenerate their mirrors to reference the new concern-specific modules.

#### What was tried

Split the generic script helpers into responsibility-specific modules and migrated every executable
and test caller to the narrowest import while preserving command-runner semantics. Moved mobile book
filtering into a narrowly named asset helper shared only by asset validation and native packaging.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p2-architecture-utils-mjs-is-a-grab-bag-mixing-generic-playwright-releas.patch`
(1 commit). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p2-architecture-utils-mjs-is-a-grab-bag-mixing-generic-playwright-releas.patch`.

### [P2][duplication] The `/dev/engine` readiness `beforeEach` and state readers are duplicated verbatim across engine and multitouch specs

**File(s):** `web/tests/engine.spec.ts:24-40`, `web/tests/multitouch.spec.ts:15-55` — pinned at SHA
f934d43

#### Problem

`multitouch.spec.ts:46-55` copies the `engine.spec.ts:27-40` `beforeEach` navigate-and-poll block
character-for-character (both even carry the same explanatory comment). The `count` reader is
defined identically in both (`engine.spec.ts:25`, `multitouch.spec.ts:15`), and `state`/`alphaAt`
overlap. `grep "__engineReady === true"` shows the poll logic living in three files (`engine`,
`multitouch`, `global-setup`). Any change to how the harness signals readiness (e.g. a new
`__engineReady` gate) must be edited in lockstep in multiple places.

#### Proposed solution

Create `web/tests/engine-harness.ts` exporting `gotoEngine(page)` (the navigate + poll `beforeEach`
body), plus `count(page)`, `state(page)`, `alphaAt(page, x, y)`, `pixelAlpha(page, x, y)`. Both
specs import them; `beforeEach(({ page }) => gotoEngine(page))` replaces both inline blocks. Keep it
out of `helpers.ts` since it depends on the dev-harness `window.__engine` globals (which
`helpers.ts` must stay free of per its WebKit-portability note).

#### Verification

`grep -c "__engineReady" web/tests/*.spec.ts` returns 0 (only in `engine-harness.ts` and
`global-setup.ts`). `npm run test:e2e -- engine.spec.ts multitouch.spec.ts` green.

---

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* The reader extraction is incomplete: `multitouch.spec.ts:16` still defines its own `alphaAt`, and
  lines 62, 68, and 75 bypass the shared `state` reader. Export the pixel-alpha reader from
  `engine-harness.ts` and use it together with `state` in the multitouch spec so the dev-harness
  readers are actually centralized.

#### What was tried

Updated the multitouch spec to import the shared `count` helper and register the engine harness’s
existing readiness hook, removing both local duplicates while retaining `alphaAt` and all assertions
unchanged.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p2-duplication-the-dev-engine-readiness-beforeeach-and-state-readers-are.patch`
(1 commit). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p2-duplication-the-dev-engine-readiness-beforeeach-and-state-readers-are.patch`.

### [P2][duplication] Crayon-brush tests re-derive point generators and region samplers inline in every test

**File(s):** `web/tests/engine.spec.ts:1309-1354` (crayonScene line/region), `1393-1428`,
`1445-1488` (seg), `1493-1512`, `1521-1560` (pts+coverage), `1569-1607`, `1610-1621`, `1644-1701`,
`1763-1802` — pinned at SHA f934d43

#### Problem

The crayon section (roughly `engine.spec.ts:1299-1802`, ~500 lines) has, in nearly every test's
`page.evaluate`, a locally-defined horizontal-line generator (`line`/`pts`/`seg`:
`for (let i = 0; i <= 40; i++) p.push({ x: x0 + ((x1-x0)*i)/40, y })`) and a region coverage
sampler. The `E.clearCanvas(); E.setCrayonMode(true); E.setColor('#…'); E.setStrokeWidth(…)`
preamble repeats verbatim in eight tests. The 40-segment interpolation formula alone appears ~9
times.

#### Proposed solution

In the new `engine-harness.ts` (or a `crayon-harness.ts`), export in-page string builders / a single
injected helper providing `interpolateLine(x0,x1,y,segments=40)`,
`regionCoverage(g, x0, x1, yMid, h)`, and a `setupCrayon(color, width)` preamble. Since these run in
`evaluate`, expose them by injecting a small helper object onto `window.__testkit` via
`addInitScript` on the `/dev/engine` route, then call `window.__testkit.line(...)` inside each
`evaluate`. Reduces the crayon section by a few hundred lines and pins the interpolation math in one
place.

#### Verification

The interpolation formula `((x1 - x0) * i) / 40` appears once.
`npm run test:e2e -- engine.spec.ts -g crayon --repeat-each=5` green.

---

#### Why it was deferred

failed adversarial review

Reviewer's unresolved objections:

* The consolidation leaves two cited stragglers: `web/tests/engine-snapshot-tier.spec.ts:57-64`
  still defines its own 40-step line/setup, while `web/tests/engine-crayon.spec.ts:329-339` still
  defines a region sampler and repeats the raw crayon preamble. Install and use the shared testkit
  in the snapshot-tier spec and route both remaining sampler/setup sites through it.
* `web/tests/engine-snapshot-tier.spec.ts:63` replaces a setup sequence that deliberately did not
  clear with `setupCrayon()`, whose `clearCanvas()` call creates an extra undo snapshot; preserve
  the original no-clear behavior so the test still observes exactly the two stroke snapshots
  asserted at line 73.
* `web/tests/engine-crayon.spec.ts:336` still re-derives the 40-segment interpolation formula inline
  for the held-pointer stroke, so interpolation math is not pinned to the new helper as the original
  finding requires; generate those pointer-move coordinates through `interpolatePoints` as well.

#### What was tried

1. Added a post-navigation, test-only crayon kit for point interpolation, region sampling, and
   consistent crayon setup. Updated the crayon specs to reuse it while preserving scenario-specific
   gestures, parameters, colour changes, thresholds, and pointer-event coverage.
2. Applied Prettier’s required tuple layout to the crayon region sampler so the deterministic
   formatting gate accepts the harness.
3. Installed the shared crayon testkit in the snapshot-tier spec and replaced its local
   interpolation/setup. Routed the pointer-event regression’s remaining alpha sampler and crayon
   preamble through the same kit while leaving its gesture sequence inline.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p2-duplication-crayon-brush-tests-re-derive-point-generators-and-region.patch`
(3 commits). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p2-duplication-crayon-brush-tests-re-derive-point-generators-and-region.patch`.

### [P2][test-quality] A single Parent-Center test asserts ~six distinct behaviors across 60 lines

**File(s):** `web/tests/flows.spec.ts:853-914` ('parent center shows quick toggles on a landscape
phone') — pinned at SHA f934d43

#### Problem

This one test verifies: (1) compact class renders, (2) quick toggles present / hub+sidebar absent,
(3) the orientation-lock cell occupies the last slot, (4) the advanced-controls quick toggle drives
its setting, (5) the portrait/landscape lock selector cycles through select→move→release→re-select
(four sub-assertions), and (6) rotating to portrait carries the setting into the full hub. A failure
in the lock-cycle sub-flow reports as a failure of "shows quick toggles," obscuring which behavior
broke, and the test cannot be run in isolation for the rotation-carry concern.

#### Proposed solution

Split into: `'landscape phone renders compact quick toggles'` (assertions 1-3),
`'a quick toggle drives the persisted setting'` (4+6 rotation-carry), and
`'the orientation lock selector cycles portrait/landscape/off'` (5). Share a
`openParentCenterCompact(page)` fixture that sets the 852×390 viewport and opens the modal.

#### Verification

Three focused tests each fail with a title that names the broken behavior.
`npm run test:e2e -- flows.spec.ts -g "quick toggle"` green.

---

#### Why it was deferred

failed adversarial review

Reviewer's unresolved objections:

* `web/tests/flows-parent-center.spec.ts:150`: The selector-cycle test still rotates to portrait and
  verifies the lock in the full Appearance hub, so a rotation-carry failure is misleadingly reported
  as “the orientation lock selector cycles portrait/landscape/off.” Move the rotation/full-hub
  assertions into the persisted-setting test (or a separately titled focused test) so this test
  covers only the selector cycle requested by the original finding.
* `openParentCenterCompact` asserts the compact class, so a compact-rendering regression fails every
  focused test during setup instead of only the test whose title names that behavior. Keep the
  helper limited to viewport/navigation/modal setup and assert the class in
  `landscape phone renders compact quick toggles`.
* `the orientation lock selection persists in the full portrait Parent Center` double-clicks an
  already-active Portrait control without checking the intermediate off state, so a completely
  broken/no-op Portrait click handler still passes. Confirm the state changes before re-selecting
  Portrait and performing the rotation check.
* `web/tests/flows-parent-center.spec.ts:143` ends the orientation-cycle test before re-selecting
  Portrait, while the separate test at line 150 only exercises Portrait→off→Portrait; restore the
  original Portrait→Landscape→off→Portrait sequence so regressions dependent on the prior landscape
  state remain covered.

#### What was tried

1. Split the landscape-phone Parent Center flow into focused rendering, persisted-toggle, and
   orientation-lock tests backed by a shared compact opener that preserves the existing retry path.
   This keeps the original coverage while making failures targetable by behavior.
2. Moved the rotation/full-hub assertions into a separately titled orientation-lock persistence
   test. The selector-cycle test now ends after verifying the unlocked state, so its failures
   reflect only portrait/landscape/off cycling.
3. Moved the compact-class assertion from shared setup into the rendering-focused test, preventing
   unrelated focused tests from failing on that concern. The orientation persistence test now
   verifies Portrait turns off before re-selecting it and checking the value after rotation.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p2-test-quality-a-single-parent-center-test-asserts-six-distinct-behavio.patch`
(3 commits). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p2-test-quality-a-single-parent-center-test-asserts-six-distinct-behavio.patch`.

### [P1][duplication] Browser-support floor is duplicated across `vite.config.ts` and root `browserslist` with only a comment enforcing sync

**File(s):** `web/vite.config.ts:72-78` (build target) — pinned at SHA f934d43; cross-references
`package.json:304-310` (browserslist)

#### Problem

The supported-browser floor is hand-maintained in two places that must stay identical:

```ts
// web/vite.config.ts:78
build: { target: ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'] },
```

```json
// package.json:305-309
"chrome >= 111", "edge >= 111", "firefox >= 114", "safari >= 16.4", "ios_saf >= 16.4"
```

The only thing keeping them in sync is the prose comment ("Keep in sync with `browserslist`… both
are documented in docs/COMPATIBILITY.md"). Drift here is not cosmetic: esbuild's `target` governs
which JS/CSS syntax is down-leveled, so if someone bumps `browserslist` (e.g. via
`npm run update:browserslist`) but not this array, the bundle can ship syntax the declared floor
can't run. The comment also encodes a hard INVARIANT (ios/safari ≥ native
`IPHONEOS_DEPLOYMENT_TARGET`) that nothing checks. Three separate sources of truth (this array,
browserslist, the Xcode target) are coupled only by comments.

#### Proposed solution

Derive the esbuild `target` array from `browserslist` programmatically rather than restating it.
Either (a) read the root `package.json` `browserslist` field in `vite.config.ts` and map
`"chrome >= 111"` → `"chrome111"`, or (b) use a small helper (e.g. `browserslist-to-esbuild`) so the
single source is the `browserslist` field. If a runtime dependency is undesirable, add a cheap
assertion test (or a `scripts/` check wired into `npm run check`) that parses both and fails on
mismatch, plus a check that the safari/ios floor ≥ the Xcode `IPHONEOS_DEPLOYMENT_TARGET`.

#### Verification

Bump one entry in `browserslist` only and confirm the build (or a new sync test) fails. After the
fix, `npm run build` should produce identical `target` behavior; grep `git grep -n "16.4"` should
show one authoritative definition, not three uncoordinated ones.

---

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* `web/src/viteConfig.test.ts` enforces the native-safety inequality backward: an `ios_saf >= 17`
  target passes against an iOS 16.4 deployment target even though esbuild may then emit syntax
  unavailable on installable 16.4 devices. Compare each web target as less than or equal to the
  native target, and correct the reversed `>=` invariant in `web/vite.config.ts` and
  `docs/COMPATIBILITY.md`.
* `.ruler/skills/mobile/ios.md:13` still states the opposite invariant—native iOS must stay ≤ the
  web target—contradicting the corrected safety rule and directing future changes toward unsafe web
  targets; update this source and regenerate its `.agents`/`.claude` copies.

#### What was tried

1. Root browserslist now drives Vite’s build targets through an explicit mapper that rejects
   unsupported syntax. A focused unit invariant compares both Safari/iOS web floors with every Xcode
   deployment target, while compatibility documentation reflects the canonical/derived relationship
   without changing any floor.
2. Corrected the native safety invariant so derived Safari and iOS esbuild targets cannot be newer
   than any Xcode deployment target. The focused assertion and the corresponding config and
   compatibility wording now consistently enforce that direction.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p1-duplication-browser-support-floor-is-duplicated-across-vite-config-ts.patch`
(2 commits). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p1-duplication-browser-support-floor-is-duplicated-across-vite-config-ts.patch`.

### [P3][maintainability] Git-based version derivation is ~35 lines of imperative logic embedded in `vite.config.ts` and is untestable there

**File(s):** `web/vite.config.ts:16-49` (`git`, `webVersion`, `PKG_VERSION`) — pinned at SHA f934d43

#### Problem

The config file carries non-trivial branching logic — `git describe` parsing with a regex, a
two-level try/catch fallback chain, and version-string assembly:

```ts
function webVersion(pkg: string): string {
  const [major, minor] = pkg.split('.');
  try {
    const match = git('describe --tags --long --match "v*"').match(/-(\d+)-g[0-9a-f]+$/);
    if (match) return `${major}.${minor}.${match[1]}`;
  } catch { ... }
  try { return `${major}.${minor}.0+${git('rev-parse --short HEAD')}`; }
  catch { return pkg; }
}
```

This encodes the ADR-0030 versioning contract but lives inside a config module, so it cannot be
unit-tested and mixes "what the build is" with "how versions are computed." The regex and fallback
semantics are exactly the kind of logic that should have tests.

#### Proposed solution

Move `git`, `webVersion`, and the `PKG_VERSION`/`BUILD_TIME` derivation to a `scripts/` helper (e.g.
`scripts/web-version.mjs` or `web/build/version.ts`) exporting pure functions (take the
`git describe` output as an argument so it's mockable). `vite.config.ts` imports and calls it. Add a
Vitest spec covering the tag-present, no-tag, and no-git branches.

#### Verification

New unit test passes for all three branches. `npm run build` on a checkout with tags still yields
`major.minor.<n>`; on a shallow/tagless checkout yields `major.minor.0+<sha>`.

---

#### Why it was deferred

failed adversarial review

Reviewer's unresolved objections:

* `web/build/version.ts` is ignored by the repository-wide `build/` rule and is absent from commit
  74145884, so both new imports fail in a clean checkout; commit the helper at a non-ignored path
  (or explicitly include it).
* `web/vite.config.ts:32-50` still owns `PKG_VERSION`/`BUILD_TIME`, the `execSync` wrapper, and the
  describe-to-SHA fallback orchestration, so the original imperative derivation remains embedded and
  untested while only its final string formatting was extracted. Move the complete derivation into
  the helper and test the fallback orchestration, leaving the Vite config to consume the derived
  values.
* `netlify.toml:12` still says `git describe` runs in `web/vite.config.ts`; update it to point to
  `web/buildVersion.ts`, where the tag-fetch dependency now lives.
* ADR-0030 still states that version derivation branches inside `web/vite.config.ts`, but the branch
  now occurs in `buildMetadata` in `web/buildVersion.ts`; update the active ADR to reflect the
  extracted implementation.

#### What was tried

1. Extracted git-version parsing into a pure helper and kept `vite.config.ts` responsible for lazily
   gathering git inputs, with focused coverage for all three fallbacks. The required
   `web/build/version.ts` path is an ignored build-output directory that native builds may clear,
   but I implemented it exactly as specified.
2. Moved the version helper to the non-ignored `web/buildVersion.ts` path and updated both imports,
   ensuring clean checkouts include and resolve the extracted logic.
3. Moved package-version loading, build-time creation, git execution, and lazy describe-to-SHA
   orchestration into `buildVersion.ts`, leaving Vite to consume returned metadata. Expanded tests
   to verify git command order, lazy SHA lookup, no-git fallback, and native builds avoiding git
   entirely.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p3-maintainability-git-based-version-derivation-is-35-lines-of-imperativ.patch`
(3 commits). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p3-maintainability-git-based-version-derivation-is-35-lines-of-imperativ.patch`.

### [P3][consistency] The `CAPACITOR` "single signal" is re-derived independently in every config with a repeated literal comparison

**File(s):** `web/vite.config.ts:8`, `web/svelte.config.js:10`, `web/vitest.config.ts:18`
(isCapacitor) — pinned at SHA f934d43

#### Problem

`CLAUDE.md` calls `CAPACITOR=true` "the single signal," yet each config recomputes it:

```ts
const isCapacitor = process.env.CAPACITOR === 'true'; // vite.config.ts:8
const isCapacitor = process.env.CAPACITOR === 'true'; // svelte.config.js:10
```

and `vitest.config.ts:18` hardcodes the opposite (`__IS_CAPACITOR__: JSON.stringify(true)`) with its
own inline rationale. The `=== 'true'` comparison (easy to get wrong, e.g.
`Boolean(process.env.CAPACITOR)` which is truthy for `"false"`) is duplicated. There's no single
named export representing the platform signal, so "the single signal" is really three call sites.

#### Proposed solution

Add a tiny shared module (`web/build/platform.ts` / `.mjs`) exporting
`export const isCapacitor = process.env.CAPACITOR === 'true'` and import it into `vite.config.ts`
and `svelte.config.js`. This makes the "single signal" literally single and removes the risk of one
file using a laxer comparison.

#### Verification

`git grep -n "CAPACITOR === 'true'"` should return one hit. Build both targets and confirm adapter
selection and PWA inclusion are unchanged.

---

#### Why it was deferred

implementer failed to deliver a fix round

#### What was tried

Centralized production `CAPACITOR` parsing in `web/build/platform.mjs` and imported it from both
configs, leaving Vitest unchanged. The brief’s path is normally ignored generated output, so I added
narrow tracking exceptions and a type declaration.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p3-consistency-the-capacitor-single-signal-is-re-derived-independently-i.patch`
(1 commit). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p3-consistency-the-capacitor-single-signal-is-re-derived-independently-i.patch`.

### [P4][documentation] `android:allowBackup="true"` is unexplained for a privacy-first kids app

**File(s):** `android/app/src/main/AndroidManifest.xml:4` (Android manifest) — pinned at SHA f934d43

#### Problem

```xml
android:allowBackup="true"
```

This is the template default and is the one manifest attribute with a real privacy dimension:
`allowBackup=true` lets Android Auto Backup copy the app's data (including anything the
secure-storage / preferences plugins persist) to the user's Google account. Every other manifest
entry here carries a rationale comment (INTERNET, ACCESS_NETWORK_STATE, WRITE_EXTERNAL_STORAGE), but
this security-relevant flag has none. For a Families-policy app, whether child-created content and
any stored state should leave the device is a deliberate decision, not a default to inherit
silently.

#### Proposed solution

Decide intentionally and document it: either keep `allowBackup="true"` with a comment stating that
only non-sensitive local drawing state is backed up, or set it to `false` (and/or add
`fullBackupContent`/`dataExtractionRules`) if child content should never leave the device. Note the
choice in the `mobile` skill's kids-compliance checklist.

#### Verification

Manifest reflects an explicit, commented decision; if changed to `false`, `adb backup` produces no
app data.

---

#### Why it was deferred

implementation failed

#### What was tried

Disabled Android backup and added the matching Families checklist policy; Ruler regenerated the
Claude copy. It could not write the required generated `.agents` copy because this nested sandbox
denies that directory, so the driver must rerun `npm run ruler:apply` outside the sandbox.

### [P2][duplication] The npm@11 pin (logic + multi-line rationale) is copy-pasted across four shell files and has already drifted

**File(s):** `.claude/hooks/session-start.sh:12-19`, `.claude/cloud/setup.sh:14-23`,
`.codex/cloud/setup.sh:37-44`, `.codex/cloud/maintenance.sh:29-33` — pinned at SHA f934d43

#### Problem

The same decision — pin npm to 11 because `package-lock.json` is authored by npm 11 and other majors
dirty the tree on optional-peer entries — is re-explained at length in four places, with the command
`npx -y npm@11 install -g npm@11` repeated in three of them. The prose has already drifted:

* `.claude/cloud/setup.sh:15` says "the container image ships npm 10"
* `.codex/cloud/setup.sh:38` says "the Codex image ships npm 11.4.2"
* `session-start.sh:15-19` gives yet a third framing ("npm 10 and 11 disagree on optional-peer
  entries")

Four copies of a rationale means four places to update when the npm story changes, and they are
already telling slightly different stories.

#### Proposed solution

Collapse the rationale to one canonical home (it partly lives in `docs/CLOUD/Claude.md` /
`docs/CLOUD/Codex.md` already) and have each script carry a one-line comment plus a doc pointer
instead of the full paragraph, e.g.
`# Pin npm@11 to match package-lock.json's authoring major — see docs/CLOUD/Codex.md.` The command
itself can't be factored into a shared sourced file (the cloud scripts are pasted into web dialogs
and must be standalone), so keep the command inline but stop duplicating the multi-line explanation.

#### Verification

`grep -rn "optional-peer\|npm@11 install -g npm@11" .claude .codex` currently returns the rationale
in four files; after the change each file has a single-line comment and the long explanation exists
in exactly one doc.

---

#### Why it was deferred

implementation failed

#### What was tried

Updated the two Claude script comments, but the sandbox denied writes to `.codex/cloud/setup.sh` and
`.codex/cloud/maintenance.sh`. The required four-file change is therefore incomplete, so I did not
run gates or commit.

### [P3][consistency] Android emulator API level is a second source of truth for the `Pixel_7_Pro_API_33` AVD

**File(s):** `.github/workflows/android-deploy.yml:70-74` (`api-level: 33`, `target: google_apis`,
`arch: x86_64`, long `emulator-options` string) — pinned at SHA f934d43

#### Problem

CI hard-codes `api-level: 33` (and `target`/`arch`) in the emulator-runner inputs, while the local
smoke path (`scripts/android-emulator-smoke.mjs`, `scripts/lib/android.mjs`) targets an AVD named
`Pixel_7_Pro_API_33`. The API level "33" now lives in two unrelated places; a bump to API 34 must be
made in both or CI and local diverge. The `emulator-options` value is also a long undocumented magic
string (`-no-snapshot-save -no-window -noaudio -no-boot-anim -camera-back none`) with no named
constant or comment explaining each flag.

#### Proposed solution

Derive the API level from a single source (an env/constant shared with `scripts/lib/android.mjs`, or
at least a workflow `env:` used to interpolate both the runner input and any reference). Add a brief
comment naming why each `emulator-options` flag is present (headless/perf).

#### Verification

Changing the API level in one place updates both CI and local smoke; a comment documents the
emulator flags.

---

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* `.github/workflows/android-deploy.yml:70` still leaves the full `emulator-options` magic string
  undocumented; add the requested brief explanation covering the purpose of each
  headless/performance flag.
* Hard-coded API 33 and `Pixel_7_Pro_API_33` references remain in
  `scripts/android-emulator-smoke.mjs:10`, `package.json:227-229`, and the `.ruler`-authored
  mobile/testing guidance, so changing `ANDROID_API_LEVEL` leaves user-facing setup and smoke
  instructions stale; make these references version-neutral or update their `.ruler` sources
  consistently.
* No test exercises the new single-source invariant across `ANDROID_API_LEVEL`, the derived AVD
  name/package commands, local system image, and workflow action input, leaving the exact regression
  this finding addresses unguarded.

#### What was tried

Centralized Android emulator API 33 in the shared configuration, deriving local image/AVD settings,
package-script targets, and the CI emulator input from it while preserving their distinct image
targets and architectures.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p3-consistency-android-emulator-api-level-is-a-second-source-of-truth-fo.patch`
(1 commit). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p3-consistency-android-emulator-api-level-is-a-second-source-of-truth-fo.patch`.

### [P4][accessibility] Tab UI is built from bare `<button>`s with no tab ARIA semantics

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:168-177`, `:199-206` (hand-authored
hub) — pinned at SHA f934d43

#### Problem

The hub implements a genuine tablist — mutually-exclusive `.on` state, ←/→ arrow navigation, a
switched iframe — but with no assistive semantics: `<div class="tabs">` is not `role="tablist"`, the
generated buttons are not `role="tab"` and never set `aria-selected`, and the `<iframe id="sheet">`
is not `role="tabpanel"` associated to the active tab. Screen-reader users get eight unlabelled
toggle buttons and an untied frame instead of a coherent tab widget.

#### Proposed solution

Add `role="tablist"` to the `.tabs` container, `role="tab"` + `aria-selected` (toggled alongside the
`.on` class in `show()`) to each button, and wire the iframe as the panel (`role="tabpanel"` +
`aria-labelledby`). This is a reference/keeper page so the bar is low, but the tab pattern is
already there — the semantics are cheap to finish.

#### Verification

Run an a11y checker (axe) against the hub, or tab through with a screen reader: the tab strip should
announce as a tablist with a selected tab.

---

#### Why it was deferred

fix broke a targeted E2E spec

The driver's gates were red at the final round: the Playwright spec(s)
tests/proof-sheet-history.spec.ts are red.

#### What was tried

1. Added synchronized tablist, tab, and tabpanel semantics to the proof-sheet hub and regenerated
   its committed HTML. Extended the existing history spec to verify active-tab accessibility state
   and panel association.
2. Formatted the Playwright assertions to satisfy the repository formatter. All permitted driver
   gates and original non-listener checks now pass; the only worktree change is the formatting
   correction.
3. Changed the hash-only history step to `window.history.back()` so Playwright no longer waits for a
   full page load while the iframe updates. The original full-page history assertion remains intact,
   and all permitted non-listener checks pass.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p4-accessibility-tab-ui-is-built-from-bare-button-s-with-no-tab-aria-sem.patch`
(3 commits). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p4-accessibility-tab-ui-is-built-from-bare-button-s-with-no-tab-aria-sem.patch`.

### [P2][duplication] `--experimental-strip-types --disable-warning=ExperimentalWarning` repeated 10× and likely stale

**File(s):** `package.json:20,25,72,73,76,77,78,85,86,91` (scripts) — pinned at SHA f934d43

#### Problem

Ten scripts invoke Node with the identical verbose flag pair, e.g.:

```json
"build:cap": "CAPACITOR=true node scripts/web.mjs vite build && node --experimental-strip-types --disable-warning=ExperimentalWarning scripts/strip-native-assets.mjs",
"gen:tokens": "node --experimental-strip-types --disable-warning=ExperimentalWarning scripts/gen-tokens.mjs",
```

Two problems: (1) the 60-character flag string is copy-pasted verbatim ten times — any change (or a
typo in one) must be reconciled by hand; (2) it is likely **stale**. `engines.node` is `">=22.13"`
(`package.json:6`); Node stabilized type-stripping so that `--experimental-strip-types` became the
default (and the flag a deprecated no-op emitting its own warning) from 22.18 / 23.6 onward. On a
modern Node in the supported range the whole pair is redundant, and `--disable-warning` exists only
to silence a warning the flag itself triggers.

#### Proposed solution

Either drop both flags (verify on the project's Node floor that `node scripts/gen-tokens.mjs` strips
types without them), or, if the floor must keep them, factor a single helper — e.g.
`scripts/run-ts.mjs` that re-execs Node with the flags, or a package-level shell alias — so the flag
string lives in exactly one place. Update `engines.node` to the version where the decision holds.

#### Verification

On the CI Node version: `node scripts/gen-tokens.mjs --check` (no flags) — if it runs, the flags are
dead. `grep -c 'experimental-strip-types' package.json` should drop from 10 to 0 (or to 1 in a
shared helper).

---

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* `tools/asset-gen/package.json:8-14` still repeats the obsolete flag pair across five runnable
  aliases, including aliases for scripts updated at the root; remove the flags there so the original
  repository-level duplication is actually resolved.
* `package-lock.json:63` still records the root Node engine as `>=22.13`; regenerate/update the
  committed lockfile so it agrees with the new `package.json` floor of `>=22.18`.
* Active guidance still claims these scripts require or receive `--experimental-strip-types`,
  notably `scripts/.ruler/AGENTS.md:19-20`, `scripts/api-smoke.mjs:15`, and
  `scripts/strip-native-assets.mjs:10-11`; update the Ruler source/generated instructions and
  affected script documentation to describe default type stripping on the new Node floor.
* Remove the stale flags from remaining runnable invocations in
  `tools/asset-gen/tests/cli.test.mjs:209,244`, `crayon-brush-samples`, and `legacy`; the tests
  currently bypass the newly supported flag-free invocation path and the original duplication
  remains elsewhere in the repository.
* Update `.ruler/skills/architecture/SKILL.md`, `.ruler/skills/design/SKILL.md`, and ADRs
  0003/0029/0047, then regenerate their mirrors; these authoritative references still incorrectly
  state that scripts require `--experimental-strip-types`.

#### What was tried

1. Raised the supported Node floor to 22.18 and removed the obsolete type-stripping and
   warning-suppression flags from all 16 affected scripts while preserving every target and
   argument.
2. Removed the obsolete flags from all five asset-generator aliases, synchronized the lockfile’s
   Node floor to 22.18, and updated generated/current script guidance to describe Node’s default
   type stripping.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p2-duplication-experimental-strip-types-disable-warning-experimentalwarn.patch`
(2 commits). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p2-duplication-experimental-strip-types-disable-warning-experimentalwarn.patch`.

### [P3][maintainability] Personal device identifiers are hard-coded into committed scripts

**File(s):** `package.json:106,113,114` (scripts) — pinned at SHA f934d43

#### Problem

Three scripts embed one developer's specific hardware:

```json
"android:run:device": "... ANDROID_SERIAL=R5CY128YMGF node scripts/gradle.mjs :app:installDebug",
"ios:run:emulator":   "... cap run ios --target C6012C49-AA93-4869-B3A6-E47C9EAAC567",
"ios:run:device":     "... cap run ios --target 00008103-0006202E3CF1001E",
```

and the `scripts-info` describes them as the physical "SM-S938U1" phone and "Kyle's iPad". These
serials/UDIDs are meaningless (and non-functional) for any other contributor or CI, yet they sit in
the shared `package.json`. They are effectively personal config committed to the repo.

#### Proposed solution

Read the target from an env var with the current value as a documented fallback, e.g.
`ANDROID_SERIAL=${ANDROID_SERIAL:-R5CY128YMGF}` is not portable inline — instead have the Node
helper (`scripts/gradle.mjs` / a wrapper) accept `--target`/`ANDROID_SERIAL` from the environment
and drop the literals from `package.json`, or move the device-specific variants into a gitignored
local overrides file. At minimum, document in `scripts-info` that these are placeholders to replace
with `adb:devices` / `xcrun simctl list` output (already partially noted for Android).

#### Verification

On a machine without those devices, `npm run ios:run:device` fails with "device not found" — proving
the literal is dead for everyone but one person. After the fix it should resolve from env or error
with a clear "set TARGET_DEVICE" message.

---

#### Why it was deferred

implementation failed

#### What was tried

Removed the personal device scripts and updated the authoritative mobile guidance, but the sandbox
denied writes to the tracked `.agents/skills/mobile` mirrors during `ruler:apply`. Those generated
files remain stale, so the full change cannot be delivered safely from this runner.

### [P3][dependency-split] `@capacitor/filesystem` appears unused — no JS import anywhere

**File(s):** `package.json:279` (dependencies) — pinned at SHA f934d43

#### Problem

Every Capacitor plugin in `dependencies` is imported from `web/src` (verified) — except
`@capacitor/filesystem`, which has **zero** JS references. Its only repo mentions are the generated
native registrations (`android/capacitor.settings.gradle`, `ios/App/CapApp-SPM/Package.swift`) and
`package.json` itself. A Capacitor plugin that is installed but never called from JS ships in the
native binaries yet does nothing, and — under the inverted-split rule (ADR-0070: `dependencies` =
what the Netlify web build imports) — it doesn't belong in `dependencies` either, since the web
build never bundles it.

#### Proposed solution

Confirm no dynamic import or peer requirement (e.g. `@capacitor-community/media` needing it) then
remove `@capacitor/filesystem`, `cap sync`, and re-run the native smoke test. If a peer/native need
surfaces, document why it is present-but-unimported.

#### Verification

`git grep "@capacitor/filesystem" -- ':!package-lock.json' ':!*.md'` returns only native config +
`package.json` (confirmed). `npm ls @capacitor/filesystem` shows whether anything depends on it
transitively; if it's a leaf with no JS import, it is dead. Remove it and confirm
`npm run test:android:device` still passes.

---

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* `docs/DEPENDENCIES.md:29,109,175-190` still claims `@capacitor/filesystem` is installed, used by
  `folderSave.ts`, and should be kept; remove/update those stale inventory entries and the “already
  a dep” alternative.
* The changed Android and iOS native registrations are not covered by the verifier’s web type/unit
  gates; run the original finding’s `npm run test:android:device` smoke verification before
  approval.

#### What was tried

Removed the unused Capacitor filesystem dependency and its sole transitive package, then regenerated
Android and iOS registrations so the plugin is no longer bundled. The media plugin and all other
native registrations remain unchanged.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p3-dependency-split-capacitor-filesystem-appears-unused-no-js-import-any.patch`
(1 commit). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p3-dependency-split-capacitor-filesystem-appears-unused-no-js-import-any.patch`.

### [P3][maintainability] Dev/preview port numbers are magic values scattered across scripts and configs

**File(s):** `package.json:16,47,103,115,121` (scripts) — pinned at SHA f934d43

#### Problem

The dev port `5173` is hard-coded in `dev:kill` (`kill-port 5173 8888`), `android:live`
(`--port 5173`), `ios:live` (`--port 5173`), `adb:reverse` (`tcp:5173 tcp:5173`); the netlify-dev
port `8888` in `dev:kill`; and the perf-preview port `4173` in `perf:serve`. There is no single
declaration — a contributor changing the vite dev port (set in `web/vite.config.ts`) must hunt down
and update several unrelated scripts, and `dev:kill` will silently kill the wrong port.

#### Proposed solution

Where the port is a vite concern, it already lives in `web/vite.config.ts`; have the port-dependent
Node helpers (`cloud-tunnel.mjs`, the smoke scripts) read it rather than restating literals in
`package.json`. For `dev:kill`, derive the port list from the same source. At minimum, add a comment
in `scripts-info` noting `5173`/`8888`/`4173` are the vite / netlify-dev / perf-preview ports so the
mapping is discoverable.

#### Verification

Change the vite dev port and run `npm run dev` + `npm run dev:kill`; today the kill misses the new
port. After centralizing, both track the config.

---

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* `web/netlify.toml:26` still hard-codes `targetPort = 5173`, so changing `VITE_DEV_PORT` breaks
  `npm run dev:netlify` by sending its proxy to the old port; make this active config consume the
  centralized value as well.
* `.ruler/skills/mobile/android.md:118` still tells contributors that port 5173 is pinned in
  `web/vite.config.ts`, which is no longer the source of truth; update the generated skill source
  documentation to point to `scripts/lib/dev-ports.mjs` and regenerate its outputs.

#### What was tried

Centralized the Vite dev, Netlify-dev, and Vite preview ports in one ESM module. All executable
consumers now use the shared constants while preserving existing commands, overrides, and forwarding
behavior.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p3-maintainability-dev-preview-port-numbers-are-magic-values-scattered-a.patch`
(1 commit). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p3-maintainability-dev-preview-port-numbers-are-magic-values-scattered-a.patch`.

### [P4][consistency] No `.editorconfig`; indent width `2` and print width `100` are restated in three files

**File(s):** `.prettierrc.json:3,6`, `dprint.json:1-2`, `.vscode/settings.json:4` (config) — pinned
at SHA f934d43

#### Problem

The same two formatting constants live in three places with three vocabularies: `.prettierrc.json`
(`tabWidth: 2`, `printWidth: 100`), `dprint.json` (`indentWidth: 2`, `lineWidth: 100`),
`.vscode/settings.json` (`editor.tabSize: 2` for markdown). There is no `.editorconfig`, so any
editor without the Prettier/dprint extensions gets no indentation guidance, and the `100`/`2` magic
numbers must be kept in lockstep by hand across formatter configs.

#### Proposed solution

Add a root `.editorconfig` (`indent_size = 2`, `max_line_length = 100`, `charset = utf-8`,
`insert_final_newline = true`) as the editor-agnostic source, and reference it in a comment from the
formatter configs. This doesn't remove the per-tool settings (each formatter needs its own) but
gives one canonical statement and covers editors without extensions.

#### Verification

Open a source file in a bare editor (no plugins) and confirm 2-space indent is applied from
`.editorconfig`. Confirm `100`/`2` still agree across `.prettierrc.json` and `dprint.json`.

---

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* `.prettierrc.json`, `dprint.json`, and `.vscode/settings.json` do not reference `.editorconfig` as
  the canonical source, so this change merely adds a fourth independent copy of the `2`/`100` values
  and leaves the original lockstep-maintenance problem unresolved.

#### What was tried

Added root EditorConfig defaults so EditorConfig-aware editors inherit the repository’s shared
spacing, line length, encoding, and final-newline preferences without formatter extensions.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p4-consistency-no-editorconfig-indent-width-2-and-print-width-100-are-re.patch`
(1 commit). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p4-consistency-no-editorconfig-indent-width-2-and-print-width-100-are-re.patch`.

### [Tooling] Make the session-audit conventions link resolve for Codex

**File(s):** `.ruler/skills/session-audit/SKILL.md` (shared conventions link),
`.agents/skills/session-audit/SKILL.md`

#### Problem

**Cost:** minor

The generated Codex skill links to `[.claude/audit-conventions.md](../../audit-conventions.md)`.
From `.agents/skills/session-audit/SKILL.md`, that relative target resolves to
`.agents/audit-conventions.md`, which does not exist. During this session the prescribed
`sed -n '1,320p' .agents/audit-conventions.md` read failed, and repository orientation had to be
used to recover the real `.claude/audit-conventions.md` path. Every Codex session that runs this
skill encounters the same broken reference.

#### Proposed solution

Change the shared source link in `.ruler/skills/session-audit/SKILL.md` to the provider-neutral
`../../../.claude/audit-conventions.md`, then run `npm run ruler:apply`. From both generated skill
locations, that path resolves to the repository's one directly maintained conventions file.

#### Verification

Run `npm run ruler:check`, then resolve the link from both `.agents/skills/session-audit/SKILL.md`
and `.claude/skills/session-audit/SKILL.md`; each should identify the existing
`.claude/audit-conventions.md` without a fallback lookup.

---

#### Why it was deferred

implementation failed

#### What was tried

Updated the shared source and generated Claude copy, but `npm run ruler:apply` could not write the
protected `.agents` tree in this nested sandbox. The Codex generated copy therefore remains stale,
so the full brief cannot be delivered here.
