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

### [P5][type-safety] `AiImageResult` casts in event handlers

**File(s):** `web/src/lib/components/AiImageResult.svelte:42` — pinned at SHA f934d43

#### Problem

`handleImgLoad` does `const { naturalWidth: w, naturalHeight: h } = e.target as HTMLImageElement;`.
The cast is safe today (the handler is only wired to an `<img onload>`), but `as` bypasses the
checker and would silently mis-type if the handler were ever reused on a different element. Minor.

**State at triage (2026-07-27):** Still present, now at
`web/src/lib/components/AiImageResult.svelte:46-49`. The component was refactored since the pin
(constants hoisted, `closeAiResult` moved to `aiGeneration.svelte`), but the handler body is
unchanged and this is the component's only cast — `handleAnimationEnd` compares
`e.target === dialogEl` without one. The handler is bound once, on the hidden `.stage-sizer` img
(line 146).

#### Proposed solution

**FIX — clear winner.** Type the handler's `currentTarget` and drop the `as` cast.

```ts
function handleImgLoad(e: Event & { currentTarget: HTMLImageElement }) {
  const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
  if (w > 0 && h > 0) imgAspect = w / h;
}
```

`onload={handleImgLoad}` type-checks unchanged. Verify with `npm run check` and by opening an AI
result — the stage must still size to the loaded image's aspect.

**Alternatives weighed:** * **Typed `currentTarget` on the named handler (winner).** Svelte types an
`<img>`'s `onload` as `EventHandler<Event, HTMLImageElement>`, i.e. the event's `currentTarget` is
already `HTMLImageElement`. Declaring the parameter to match keeps the named handler, removes the
cast, and makes any future rebinding onto a non-img element a compile error. `load` doesn't bubble,
so `target` → `currentTarget` is behavior-identical here.

* **Inline arrow at the binding site** (`onload={(e) => handleImgLoad(e.currentTarget)}` with
  `handleImgLoad(img: HTMLImageElement)`). Equivalent safety, slightly more indirection in the
  template. Fine, but no advantage over the first.
* **Leave it.** Defensible for a P5 — the cast is provably safe today. But the fix is one line,
  strictly stronger, and removes an `as` that invites copy-paste into places where it isn't safe.

**Landing note:** Re-stage in `docs/AUDIT.md` as-is (updated line number 46), or fold into any
nearby edit to the component — it's a one-line change not worth its own PR.

#### Verification

`npm run check` plus the unit/E2E suites covering the touched files (see the solution for any
targeted commands).

#### Why it was deferred

implementation failed

#### What was tried

The requested signature is not assignable to this Svelte version’s generic `onload` handler type, so
`npm run check` fails at the unchanged binding. I implemented the brief exactly and left the
worktree change in place, but cannot reach all required gates without changing the binding or
widening the handler type.

### [P1][duplication] Extract a shared segmented-control primitive — it now exists three times with drift

**File(s):** `web/src/lib/components/parent/AppearanceSection.svelte:32-47,92-138` ·
`web/src/lib/components/ParentCenter.svelte:222-238,443-490` ·
`web/src/lib/components/parent/ReportForm.svelte:112-125,233-267` — pinned at SHA f934d43

#### Problem

Three near-identical "iOS-style segmented control" implementations exist (theme picker, orientation
selector, report-kind picker), and the comments admit the copy-paste ("matching the Theme picker",
"mirrors the Appearance theme picker"). They have drifted: container radius `var(--radius-md)` vs
raw `10px`, option radius `9px` vs `var(--radius-sm)` vs `7px`, raised-card vs brand-fill active
treatment, `var(--font-size-sm)` vs raw `12.5px`. Proposed a `Segmented.svelte` primitive with
`options`/`selected`/`onSelect`, a `raised`/`filled` variant, and an allow-deselect flag.

**State at triage (2026-07-27):** Still three sites, still drifted — the finding fully holds, with
two updates since f934d43:

* **The orientation selector moved.** ParentCenter's compact layout was extracted into
  `web/src/lib/components/parent/CompactShell.svelte`; the `.orient-seg` control now lives there
  (markup 97-111, styles 162-219), comment still saying "matching the Theme picker in
  AppearanceSection". It also gained real deselect behavior: tapping the active side releases the
  rotation lock (`CompactShell.svelte:46-55`), so the `allowDeselect`/toggle mode is now a hard
  requirement, not a nicety.
* **One axis of drift was fixed by a token.** Both raised sites now share `--shadow-segment`
  (`web/src/lib/design/tokens.ts:101-104`, with a don't-converge comment), replacing the raw
  `box-shadow` the finding cited.

The remaining drift, verified at HEAD:

| Axis             | Theme (`AppearanceSection:93-139`) | Orientation (`CompactShell:169-219`) | Report-kind (`ReportForm:235-270`) |
| ---------------- | ---------------------------------- | ------------------------------------ | ---------------------------------- |
| Container radius | `var(--radius-md)`                 | raw `10px`                           | raw `10px`                         |
| Option radius    | raw `9px`                          | `var(--radius-sm)`                   | raw `7px`                          |
| Track            | `var(--slider-track)`              | `var(--slider-track)`                | `var(--surface)` + 1px `--border`  |
| Active           | surface card + `--shadow-segment`  | surface card + `--shadow-segment`    | `--brand` fill                     |
| Font             | `var(--font-size-sm)`              | raw `12.5px`                         | `var(--font-size-sm)`              |
| ARIA             | radiogroup/radio                   | group + `aria-pressed`               | radiogroup/radio                   |

`web/src/lib/components/design/` still holds only `Button`, `Disclosure`, `StatusMessage` — no
Segmented primitive exists.

#### Proposed solution

**FIX — clear winner.** Extract `web/src/lib/components/design/Segmented.svelte` beside
`Button.svelte`, styled once from tokens, with a `variant` for the active treatment and a `mode`
prop carrying the ARIA decision from the sibling entry "Two identical segmented controls use
inconsistent ARIA semantics". The design skill's own rule — "Extract a new primitive at the third
duplicate" — was written for exactly this case, and its Button table already names these three
controls as the pickers Button must not absorb.

Add `web/src/lib/components/design/Segmented.svelte`:

```svelte
<script lang="ts">
  let {
    options, // { value: string; label: string; icon?: CommonIconName; id?: string }[]
    selected, // string | null (null only meaningful in mode 'toggle')
    onSelect, // (value: string) => void — toggle mode call sites handle deselect themselves
    label, // aria-label for the container
    variant = 'raised', // 'raised' (theme, orientation) | 'filled' (report-kind)
    mode = 'radio', // 'radio' | 'toggle' — see the ARIA sibling entry
  } = $props();
</script>
```

Style once from tokens: `--slider-track` track, `--radius-md` container, `--radius-sm` options,
`--shadow-segment` on the raised active card, `--font-size-sm`, `--duration-fast` transitions, and
always `type="button"` (the theme picker currently omits it). `variant="filled"` changes only the
active treatment to `--brand`/`--on-brand`.

Deliberate normalizations to review in `/dev/design` and PR screenshots (per the `pr-screenshots`
skill), all nudges onto the token ramp: option radius 9px/7px → 8px, container 10px → 12px on two
sites, orientation font 12.5px → 13px, and the report-kind track converges from `--surface`+border
to `--slider-track` (the one visible change; convergence is the point of the primitive — if the
maintainer wants to keep the bordered look, it can ride the `filled` variant instead, but the lean
is full convergence). Don't pre-build a `size` prop for CompactShell's slightly tighter padding;
only add one if the normalized control breaks the 2×2 grid height.

Register the primitive in `/dev/design` and in the design skill's primitives table — edited at its
source `.ruler/skills/design/SKILL.md` (then `npm run ruler:apply`), never the generated copy — and
update Button's "not for pickers" row to point at Segmented.

**Alternatives weighed:** 1. **Extract a `Segmented.svelte` primitive (winner).** One
implementation, token-styled, fixes the keyboard/ARIA gaps (p4) in one place. Pros: kills the drift
permanently; three call sites shrink to a few lines each; the skill's third-duplicate rule and its
Button carve-out both point here. Cons: small visual normalization to review (below). 2. **Hoist
shared rules to `app.css` classes** (the `.flyout-menu` route). Rejected: the skill reserves that
for unscoped/imperative-DOM needs or canvas chrome that "hasn't earned a primitive yet" — these are
three structurally identical, component-scoped pickers on modal surfaces, and a class can't carry
the roving-tabindex behavior p4 requires. 3. **Leave as-is.** Rejected: the drift the shared-styling
comment was supposed to prevent has already happened, and a fourth copy is likely (any future
single-select setting).

**Landing note:** Re-stage in docs/AUDIT.md (or file as a `type:audit` issue) with the updated
file/line references above — the ParentCenter citations are stale, the control is in
`CompactShell.svelte` now. Implement together with the sibling entry "Two identical segmented
controls use inconsistent ARIA semantics" (the `mode` prop is its decision); the sibling
`.setting + .setting` spacing entry is independent and can land separately.

#### Verification

`npm run check` plus the unit/E2E suites covering the touched files (see the solution for any
targeted commands).

#### Why it was deferred

implementation failed

#### What was tried

Implemented the typed Segmented primitive and migrated all three pickers with preserved semantics,
normalized token styling, and design-gallery/docs registration. The required Codex skill mirror
remains incomplete because this sandbox denies writes to `.agents/skills`; the source and Claude
mirror updated, but `.agents/skills/design/SKILL.md` is stale.

### [P4][accessibility] Two identical segmented controls use inconsistent ARIA semantics (radiogroup vs group/pressed)

**File(s):** `web/src/lib/components/parent/AppearanceSection.svelte:32-45` (radiogroup/radio) ·
`web/src/lib/components/ParentCenter.svelte:223-237` (group + aria-pressed) — pinned at SHA f934d43

#### Problem

The theme picker exposes `role="radiogroup"` with `role="radio"`/`aria-checked` children while the
visually identical orientation selector uses `role="group"` with `aria-pressed` toggle buttons (the
report-kind picker is radiogroup again). Screen-reader users get inconsistent announcements for the
same idiom, and neither radiogroup implements the roving-tabindex/arrow-key navigation the role
implies. Whichever pattern the Segmented primitive standardizes on must be chosen deliberately —
proposed encoding the choice as a `mode: 'radio' | 'toggle'` prop.

**State at triage (2026-07-27):** The split persists, one file moved: the theme picker is unchanged
(`AppearanceSection.svelte:33-45`, radiogroup/radio/`aria-checked`); the orientation selector now
lives in `web/src/lib/components/parent/CompactShell.svelte:97-110` (`role="group"` +
`aria-pressed`); the report-kind picker is radiogroup/radio (`ReportForm.svelte:115-127`). Neither
radiogroup implements roving tabindex or arrow keys — every segment is a tab stop, so the role
promises keyboard behavior it doesn't deliver (an APG-pattern violation, not just inconsistency).

One material change strengthens the split-mode decision: the orientation control is now genuinely
deselectable — tapping the active side releases the rotation lock back to free rotation
(`CompactShell.svelte:46-55`), and a null selection ("neither locked") is a designed resting state.

#### Proposed solution

**FIX — clear winner.** The Segmented primitive (see the sibling entry "Extract a shared
segmented-control primitive") standardizes on **`radiogroup`/`radio` with roving tabindex and
arrow-key selection for mandatory single-select** (`mode: 'radio'` — theme picker, report-kind
picker), and **`role="group"` of `aria-pressed` toggle buttons for the deselectable case**
(`mode: 'toggle'` — the orientation pair). This finding is a design input to p1, not a separate
change; implement them together.

Encode the decision in the primitive's `mode` prop, per the sketch in the sibling
segmented-control-primitive entry:

* `mode: 'radio'` (theme, report-kind): container `role="radiogroup"` + `aria-label`; options
  `role="radio"`, `aria-checked`, roving `tabindex` (selected option — or first, when none — is `0`,
  the rest `-1`), ArrowLeft/Up and ArrowRight/Down move focus *and* selection with wrap, matching
  the APG radio-group pattern.
* `mode: 'toggle'` (orientation): container `role="group"` + `aria-label`; options are plain buttons
  with `aria-pressed`, all tabbable, no arrow-key handling. The call site keeps its
  deselect-on-reselect logic.

Do not fix the ARIA in place ahead of the extraction — patching roving tabindex into two bespoke
copies is throwaway work that p1 deletes.

**Alternatives weighed:** 1. **Radio for mandatory single-select, toggle for deselectable
(winner).** Matches WAI-ARIA APG guidance: the radio-group pattern is the canonical "choose exactly
one of a set" idiom — it announces position/set-size and checked state, and requires roving tabindex
(one tab stop; arrow keys move and select), which the primitive implements once. The orientation
pair cannot honestly be a radiogroup: clicking a checked radio never unchecks it, but tapping the
active orientation segment must release the lock, and "no segment active" is a legitimate persistent
state — that is two independent-ish toggle buttons (`aria-pressed`), grouped and labeled. Two of
three sites already use radio semantics, so this is also the smallest migration. 2. **`aria-pressed`
toggles everywhere.** Simpler (no roving tabindex; every segment tabbable). Rejected: "pressed"
misdescribes a mandatory pick-one set — a screen-reader user hears independent toggle buttons with
no one-of-N framing, and mutually exclusive auto-unpressing buttons are exactly the confusion the
radio pattern exists to avoid. 3. **`role="tablist"`.** Rejected: tabs switch visible panels; the
theme and report-kind pickers select a value, not a panel (the report form's textarea label changes,
but the control's meaning is a value choice). Misusing tablist would promise panel semantics that
don't exist.

**Landing note:** Fold into the p1 re-staged finding (or `type:audit` issue) as its ARIA/keyboard
acceptance criteria rather than filing separately — the decision here has no standalone
implementation.

#### Verification

`npm run check` plus the unit/E2E suites covering the touched files (see the solution for any
targeted commands).

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* `.agents/skills/design/SKILL.md:71` remains stale and omits the new `Segmented.svelte` primitive,
  while the `.ruler` source and Claude-generated copy were updated. Regenerate the provider outputs
  from `.ruler` so the Codex design skill matches its source.

#### What was tried

Introduced a shared segmented picker that provides roving keyboard radio behavior while preserving
the orientation selector’s pressed-toggle semantics. Updated Parent Center interaction coverage and
registered the new primitive in the design reference and styleguide.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p4-accessibility-two-identical-segmented-controls-use-inconsistent-aria.patch`
(1 commit). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p4-accessibility-two-identical-segmented-controls-use-inconsistent-aria.patch`.

### [P1][duplication] White/dark ink keyline CSS is triplicated across ActionsPanel, BrushMenu, and StrokeWidthMenu

**File(s):** `web/src/lib/components/ActionsPanel.svelte:772-787`,
`web/src/lib/components/BrushMenu.svelte:155-170`,
`web/src/lib/components/StrokeWidthMenu.svelte:175-190` — pinned at SHA f934d43

#### Problem

The four-declaration keyline trick (`stroke` + `stroke-width: 2px` + `paint-order: stroke` +
`vector-effect: non-scaling-stroke`, in a `#000` white-ink flavor and a `--dark-ink-keyline`
dark-ink flavor) is pasted into three components, identical comments included. ActionsPanel and
BrushMenu target `svg path[fill='currentColor']`; StrokeWidthMenu widens to `svg path`. Changing the
width, tokenizing the `#000`, or adjusting the selector means editing three files that must not
drift. Proposed promoting the pair to global utility classes in `app.css`.

**State at triage (2026-07-27):** Still triplicated — six rules, 24 declarations. Verified at HEAD:
`ActionsPanel.svelte:766-781`, `BrushMenu.svelte:66-81`, `StrokeWidthMenu.svelte:87-102`, each with
the same explanatory comment pair. All three components toggle the classes declaratively
(`class:white-stroke` / `class:dark-stroke` at `BrushMenu.svelte:29-30`,
`StrokeWidthMenu.svelte:36-37`, `ActionsPanel.svelte:279-280,303-304`); no other file uses either
class.

The drift since f934d43 makes the fix *more* natural, not less:

* The shared flyout shell was extracted to `app.css:242-335` (`.flyout-menu`/`.flyout-option`), and
  the design skill's global-class table registers it. The comment at `app.css:243-244` says each
  component keeps "only what genuinely differs — the eraser-mode sizing and the
  white-stroke/dark-stroke keylines". But the keylines *don't* differ: all six rules carry identical
  declarations; only StrokeWidthMenu's selector varies.
* That selector variance has a concrete cause: the `size-1..5` icons carry `fill="currentColor"` on
  the `<svg>` root, not the `<path>` (e.g. `web/src/lib/icons/size-3.svg`), so
  `path[fill='currentColor']` can't match them. The eraser-size icons use `<circle>` with
  `--paper`/`--hole-stroke` fills and are correctly untouched by either selector (and ActionsPanel
  drops the keyline flags while erasing anyway).
* `--dark-ink-keyline` is a real token (`web/src/tokens.css:110,153,197` — transparent in light
  mode), so the dark rule stays inert in light mode wherever it lives.

Conventions check: `.claude/rules/svelte.md` says "No global CSS except genuine cross-component
tokens", but the design skill (SKILL.md, "Shared *global* patterns" table and the paragraph below
it) explicitly carves out app.css classes for "chrome that several components share verbatim but
that hasn't earned a primitive yet" — and these exact components are its named example consumers.
The finding's approach fits the repo's conventions precisely.

#### Proposed solution

**FIX — clear winner.** Hoist the `.white-stroke`/`.dark-stroke` keyline rules to `web/src/app.css`
as global classes beside the `.flyout-menu` chrome that was already hoisted there since the pin,
using a union selector so StrokeWidthMenu's icon variant needs no asset edits. This is the design
skill's own documented pattern for exactly this situation ("hoist the shared *rules* to `app.css`
with a comment naming the consumers"), and the finding's alternative — tagging the icon SVGs — is
strictly more churn.

In `app.css`, directly after the `.flyout-option` rules:

```css
/* Ink keylines shared by ActionsPanel's trigger buttons, BrushMenu, and
   StrokeWidthMenu: ring currentColor icon parts so white ink reads on the white
   cards (#000 is a deliberate one-off — black reads against every pen color and
   both papers) and near-black ink reads on dark cards (--dark-ink-keyline is
   transparent in light mode, so the dark rule is inert there). paint-order
   draws the stroke behind the fill; non-scaling-stroke pins it to 2 screen px
   across very different viewBoxes. The second selector branch catches the
   size-N icons, which carry fill="currentColor" on the svg root, not the path. */
.white-stroke :is(svg path[fill='currentColor'], svg[fill='currentColor'] path) {
  stroke: #000;
  stroke-width: 2px;
  paint-order: stroke;
  vector-effect: non-scaling-stroke;
}

.dark-stroke :is(svg path[fill='currentColor'], svg[fill='currentColor'] path) {
  stroke: var(--dark-ink-keyline);
  stroke-width: 2px;
  paint-order: stroke;
  vector-effect: non-scaling-stroke;
}
```

Then delete the six component rules (and their now-redundant `:global()` wrappers and comment
copies), fix the two stale comments — `app.css:243-244` ("what differs" is now only the eraser-mode
sizing) and `ActionsPanel.svelte:763-764` ("the matching keyline rules … live in
BrushMenu/StrokeWidthMenu") — and register `.white-stroke`/`.dark-stroke` in the design skill's
global-class table, edited at its source `.ruler/skills/design/SKILL.md` followed by
`npm run ruler:apply`.

**Alternatives weighed:** 1. **Hoist to `app.css` with a union selector (winner).** One rule pair
covers all three components; the icon variance is absorbed by adding `svg[fill='currentColor'] path`
as a second branch. Verified safe at HEAD: no other icon rendered inside these controls (`pen`,
`crayon`, `magic-brush`, `eraser`, `line-weight`, `line-weight-eraser`, `eraser-size-*`) puts
`fill="currentColor"` on the svg root, so the branch matches exactly the `size-*` icons and nothing
else. Zero asset churn. 2. **Hoist plus retag `size-1..5.svg`** (the finding's suggestion) so one
`path[fill='currentColor']` selector suffices. Works, but edits five assets and requires a
`gen:icons` pass, for the same rendered result; the union selector's second branch with a one-line
comment is cheaper and self-explanatory. 3. **Leave in place.** Rejected: the app.css comment
already mislabels the keylines as "genuinely differs", which is exactly the drift-inviting state the
finding warns about.

**Landing note:** Re-stage in docs/AUDIT.md (or file as a `type:audit` issue) with the updated line
references and the union-selector approach above — it is a small, self-contained CSS move with a
screenshot checklist, well suited to a single PR (use the `pr-screenshots` before/after table).

#### Verification

per the finding still applies: `grep -rn "paint-order" web/src` collapses to the two app.css rules;
in `run-splotch`, check white ink and (dark theme) near-black ink on the brush trigger, open brush
menu, stroke trigger, and open stroke menu — including that the stroke menu's size lines keep their
keyline (that's the union-selector branch working).

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* `.agents/skills/design/SKILL.md` remains stale after `.ruler/skills/design/SKILL.md` registered
  the new global classes; run `npm run ruler:apply` and commit the generated Codex copy so all
  ruler-managed outputs stay synchronized.

#### What was tried

Centralized the ink-keyline rules in `app.css` with the selector union needed for both icon
structures, removing all six component-local copies. Registered the global classes in the design
guidance and updated the raw-hex allowlist to reflect their new ownership.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p1-duplication-white-dark-ink-keyline-css-is-triplicated-across-actionsp.patch`
(1 commit). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p1-duplication-white-dark-ink-keyline-css-is-triplicated-across-actionsp.patch`.

### [P1][consistency] Unify the two error-response shapes across the API surface

**File(s):** `web/src/lib/server/http.ts:9-15,22-27`;
`web/src/routes/api/generate-image/+server.ts:17-19,71,72,92,111,143`;
`web/src/lib/server/generationAuthorization.ts:32,60`;
`web/src/routes/api/report/+server.ts:73,78,89,104`;
`web/src/routes/api/verify-access-code/+server.ts:26,30`;
`web/src/routes/api/verify-key/+server.ts:20,24` — pinned at SHA f934d43

#### Problem

Endpoints emit two incompatible JSON error shapes with no rule for which: `{ ok: false, error }`
(from `throttled()`, `verify-access-code`, `verify-key`, `report`) versus SvelteKit's `{ message }`
(every `throw error(...)` in generate-image / `generationAuthorization`, plus `readJsonBody`'s 400).
The same endpoint can return both — in `report`, a malformed body yields `{ message }` while a
missing `kind` yields `{ ok: false, error }` — so a client cannot parse a 400 without sniffing the
shape. The API skill even advertises "clients surface the `error` field directly", which is false
for every `error()`-thrown response.

**State at triage (2026-07-27):** Still fully present at HEAD. The routes drifted since f934d43
(`asRecord`/`stringField` helpers, `rateLimitPolicy`/`rateLimitKeys` extraction,
`config.geminiApiKey()`), but none of that touched the error shapes. The client-facing
`throw error(...)` inventory at HEAD:

* `generate-image/+server.ts` — 400 ("Missing image" ×2), 413 ("Image is too large" ×3), 415
  ("Unsupported image type"), 422 (safety refusal), 502 (upstream failure)
* `generationAuthorization.ts` — 403 ("Invalid access token"), 500 (missing `GEMINI_API_KEY`)
* `http.ts` `readJsonBody` — 400 ("Expected a JSON body"), reachable from every JSON endpoint
* `admin/tokens/+server.ts` — 401 ("Unauthorized") (documented in the API skill as `{ message }`;
  not in the finding's file list but part of the same inconsistency)

`csp-report` is a deliberate exception: its 413/415/204 responses are bodyless by design (browsers
ignore the response) and should stay exempt.

**Wire-compat check (the deployed-native-app hazard):** unification is safe. What clients parse
today, verified at HEAD:

* generate-image — `readAiImageResponse` (`web/src/lib/drawing/aiImageResponse.ts`) branches on
  status only (422 → safety, 429 → throttled) and reads the body via `.text()` into a `detail` that
  `aiImage.ts` only ever logs to the console. Shipped native/multipart clients run the same parser.
  No client reads `message`.
* verify-access-code / verify-key — `aiCredential.ts` reads `data.error` with a `.catch(() => ({}))`
  fallback; a `{ message }` 400 today yields `undefined` and generic copy, so switching it to
  `{ ok, error }` strictly improves what the client can show.
* report — `ReportForm.svelte` reads `data.error` with a fallback string; same strict improvement.
* admin 401 — the native admin page (`routes/admin/native/+page.svelte:79`) branches on
  `response.status === 401` and never reads that body.

No deployed client parses `{ message }`, so no app-store release needs to precede the change.

**Prior attempt / why it was deferred:** "Implementation failed": the code change itself was
implemented and verified, but Ruler regeneration could not update `.agents/skills/api/SKILL.md`
because the burndown's nested sandbox denied writes under `.agents/`, leaving the doc-sync half of
the change incomplete. No reviewer objection was recorded and no patch was kept. In a normal session
`npm run ruler:apply` writes both generated trees fine — the blocker does not exist outside that
sandbox.

#### Proposed solution

**FIX — clear winner.** Normalize every client-facing JSON error to `{ ok: false, error }` via a
`fail()` builder plus a thin per-route wrapper that converts thrown SvelteKit `HttpError`s at the
handler boundary. The deferred run's only blocker was environmental (a sandbox that couldn't write
`.agents/`), not a design or review objection, and the wire change is verifiably safe for every
deployed client.

In `web/src/lib/server/http.ts`:

```ts
export function fail(status: number, error: string, headers?: HeadersInit): Response {
  return json({ ok: false, error }, { status, headers });
}

export function apiHandler(handler: RequestHandler): RequestHandler {
  return async (event) => {
    try {
      return await handler(event);
    } catch (err) {
      if (isHttpError(err)) return fail(err.status, err.body.message);
      throw err; // genuinely unexpected → SvelteKit 500 + handleError, as today
    }
  };
}
```

Then: reimplement `throttled()` on top of `fail()` (adding the `Retry-After` header); wrap every
`/api/*` handler export in `apiHandler(...)` — including `admin/login` and `admin/tokens`, so the
401 also becomes `{ ok: false, error: 'Unauthorized' }` (client-safe per the check above) — except
`csp-report`, which keeps its documented bodyless responses (leave it unwrapped, or wrapped is
harmless since it throws nothing).

Doc sync in the same change (the part the sandbox blocked): update `.ruler/skills/api/SKILL.md` (the
"clients surface the `error` field directly" claim becomes true; the admin 401 example body; note
csp-report's bodyless exemption) and add the `fail()`/`apiHandler` convention to
`.claude/rules/server-api.md` (direct-edited, not generated), then `npm run ruler:apply`.

Extend `scripts/api-smoke.mjs` with the assertion the finding asked for: every JSON failure body it
already exercises (403 invalid token, 400 missing image, malformed-body 400, admin 401) is
`{ ok: false, error: string }`.

Sequencing within C11: land this first — the contract-types finding
([issue \#567](https://github.com/KyleMit/Splotch/issues/567)) wants an
`ApiError = { ok: false; error: string }` type that is only truthful once this ships. Findings 2 and
3 (helper extractions) are independent.

**Alternatives weighed:** 1. **`fail()` + a handler-boundary wrapper (winner).** Add
`fail(status, error, headers?)` to `http.ts` and a small `apiHandler()` that catches thrown
`HttpError`s and re-emits them through `fail()`. Throw-based control flow stays exactly as written —
`readJsonBody`'s signature, generate-image's deferred `readValidatedImage` thunk, and
`generationAuthorization`'s throws all survive unchanged — and the invariant is enforced in one
place that new endpoints inherit. 2. **Convert every throw site to a returned `fail()` Response (the
finding's original proposal).** Same wire result, but it threads `Response` unions through
`readJsonBody`, the image-reading thunk, and `authorizeGenerationRequest`'s already-union return
type — more churn, and nothing stops the next endpoint from reintroducing a bare `throw error(...)`.

Option 1 wins on churn and on making the shape a guarantee rather than a convention.

**Landing note:** Re-stage in docs/AUDIT.md with the wrapper approach and the doc-sync + smoke-test
additions folded into the brief; no patch exists to apply. Land before the contract-types finding.

#### Verification

`npm run check` plus the unit/E2E suites covering the touched files (see the solution for any
targeted commands).

#### Why it was deferred

implementation failed

#### What was tried

Implemented `fail()`/`apiHandler()`, wrapped every listed API handler, and updated contract coverage
and conventions so thrown `HttpError`s use `{ ok: false, error }`. However, `npm run ruler:apply`
could not update the sandbox-protected `.agents/skills/api/SKILL.md`, leaving that required
generated copy incomplete.

### [P4][duplication] Reload-side-effect pair (`refreshState = 'idle'; window.location.reload()`) is repeated across three lifecycle paths

**File(s):** `web/src/lib/pwa/updates.ts:164-166,184-186` — pinned at SHA f934d43

**Rolled-back draft patch:**
docs/audit-deferred/p4-duplication-reload-side-effect-pair-refreshstate-idle-window-location.patch

#### Problem

The "commit the reload" step — reset the update state machine, then `window.location.reload()` — is
written out twice (in `onControllerChange` and in `checkForUpdates`' owed path), and the inverse
"defer instead" transition is a third inline copy. The discipline "always reset state before
reloading" is enforced only by copy-paste; a future path that reloads without resetting would strand
the state machine.

**State at triage (2026-07-27):** The file moved (`web/src/lib/updates.ts` →
`web/src/lib/pwa/updates.ts`) and the state machine was renamed
(`refreshState`/`'idle'`/`'deferred'` → `updateReload`/`'none'`/`'owed'`), but the duplication holds
at HEAD: the reset-and-reload pair sits at `updates.ts:162-163` (`onControllerChange`) and
`updates.ts:193-194` (`checkForUpdates`' owed path); the deferral transition is inline at
`updates.ts:158-160`. The draft patch was cut against the post-rename code — `git apply --check`
passes at HEAD, and its `reloadForUpdate()` covers exactly the two reload sites. Note two *other*
`updateReload = 'none'` writes at lines 173 and 185 are rollback-without-reload paths (postMessage
failure, activation-recovery timeout) and must stay out of the helper.

**Prior attempt / why it was deferred:** The implementer extracted `reloadForUpdate()` for the two
reload sites but never delivered a fix round for the reviewer's one unresolved objection: the
deferral transition (`updateReload = 'owed'`) stayed inline in `onControllerChange`, so the
finding's requested centralization of *both* lifecycle outcomes was incomplete. The reviewer
prescribed the remedy verbatim: extract and call a `deferReload()` helper alongside
`reloadForUpdate()`.

#### Proposed solution

**FIX — clear winner.** Apply the draft patch (it applies cleanly at HEAD) and add the one helper
the reviewer demanded — a `deferReload()` for the `updateReload = 'owed'` transition — so both
lifecycle outcomes are named, not just the reload.

Apply the patch with `git apply`, then satisfy the objection:

```ts
function deferReload() {
  updateReload = 'owed';
}

const onControllerChange = () => {
  clearTimeout(recoveryTimer);
  if (!canvasState.canvasEmpty) {
    deferReload();
    return;
  }
  reloadForUpdate();
};
```

Leave the two rollback resets (lines 173, 185) inline — they reset *without* reloading and belong to
neither helper. Verification: `npm run check` + `npm run test:unit` — the existing reload-count and
defer assertions in `web/src/lib/pwa/updates.test.ts` cover both helpers with no test edits.

**Alternatives weighed:** 1. **Apply the draft + add `deferReload()` (winner).** The reload
extraction is done and passed type-check/unit/lint gates; the residual objection is a three-line
helper. Honest caveat: at HEAD the `'owed'` assignment occurs exactly once, so `deferReload()`
centralizes nothing today — its value is that the state machine's two legal outcomes become named,
greppable moves, which is the invariant the finding is about and the condition the recorded review
made explicit. 2. **Apply the draft as-is and argue the objection down.** Rejected: re-litigating a
recorded objection over three lines costs more than writing them, and an unnamed inline transition
next to a named one reads as an accident. 3. **DROP as P4 noise.** Rejected: the patch exists,
applies cleanly, and already passed the driver's gates — the marginal cost from here is one tiny
helper, and the reload-count assertions in `updates.test.ts` (`toHaveBeenCalledTimes(1)` at lines
197, 216, 340) verify it for free.

**Landing note:** Re-stage in `docs/AUDIT.md` as "apply the draft patch, then extract
`deferReload()` for the inline `'owed'` transition in `onControllerChange`" — cite the reviewer's
objection as the acceptance criterion. Independent of the other C12 findings (different file; no
ordering constraint).

#### Verification

`npm run check` plus the unit/E2E suites covering the touched files (see the solution for any
targeted commands).

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* Extract the inline `updateReload = 'owed'` transition in `onControllerChange` into a
  `deferReload()` helper and call it there; `web/src/lib/pwa/updates.ts:164` still leaves one of the
  finding’s two lifecycle outcomes unnamed and repeats the exact unresolved defect from the prior
  attempt.

#### What was tried

Centralized the update reload lifecycle in `reloadForUpdate`, ensuring both controller-change and
deferred-update paths clear the state before reloading.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p4-duplication-reload-side-effect-pair-refreshstate-idle-window-location-2.patch`
(1 commit). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p4-duplication-reload-side-effect-pair-refreshstate-idle-window-location-2.patch`.

### [P2][architecture] Scatter of platform/device utilities across `lib/` root hurts grepability — group under one folder

**File(s):** `web/src/lib/platform.ts`, `deviceInfo.ts`, `deviceReport.ts`, `orientation.ts`,
`safeArea.ts`, `haptics.ts`, `notchBand.ts` (whole files) — pinned at SHA f934d43

#### Problem

Seven closely related "what device/platform am I on and how do I adapt" modules sit loose in the
`lib/` root among unrelated utilities. They form a natural import cluster (`deviceInfo`,
`orientation`, `haptics`, `notchBand` all lean on `platform.ts`; `safeArea` feeds
`notchBand`/layout), but answering "where does the app detect iOS / read insets / lock rotation?"
requires already knowing each filename. Proposal: group them under `lib/platform/` (or `device/`)
with an index re-export; pure move, no behavior change.

**State at triage (2026-07-27):** The finding fully holds at HEAD: all seven files still sit loose
in `web/src/lib/` (confirmed by listing), alongside topic folders that already exist for other
clusters (`pwa/`, `plugins/`, `boot/`, `audio/`, `ai/`, `design/`, …) — `updates.ts` itself moved
into `lib/pwa/` since the pin, so the repo is actively converging on this layout. Import churn
measured at HEAD: `$lib/platform` has 21 importers; the six siblings total ~15 (`deviceInfo` 1,
`deviceReport` 4, `orientation` 2, `safeArea` 3, `haptics` 3, `notchBand` 2). The `architecture`
skill's file map lists only `platform.ts` and `orientation.ts` — the other five are entirely absent,
which strengthens the grepability claim (the map won't help you find them either).

**Prior attempt / why it was deferred:** Implementation *succeeded* functionally — cluster moved,
consumers and tests rewired, the `.ruler/` architecture source updated — but the sandbox could not
write `.agents/skills/` when running `npm run ruler:apply`, so the generated Codex mirror of the
architecture skill stayed stale and the change was rolled back rather than land with drifted
generated output (which `npm run ruler:check` gates in CI). An environmental blocker, not a design
objection.

#### Proposed solution

**FIX — clear winner.** Move the cluster to `web/src/lib/platform/` with `index.ts` carrying the
current `platform.ts` exports (so the `$lib/platform` specifier and its 21 importers don't change),
siblings imported by full path, and — the part the failed attempt could not finish — regenerate the
ruler output so the Codex architecture mirror isn't left stale. The design already survived
implementation; only the environment killed it.

Redo the validated move in an environment where `npm run ruler:apply` can write both generated trees
(a normal checkout can). Concretely: `git mv` the seven modules (+ their colocated `*.test.ts`
files: `platform.test.ts`, `platform.osLabel.test.ts`, `deviceReport.test.ts`, `safeArea.test.ts`,
`notchBand.test.ts`) into `web/src/lib/platform/`, rename `platform.ts` → `platform/index.ts`,
update the ~15 sibling-import sites, update the `.ruler/` sources (the architecture skill's file map
— adding the five currently-missing modules while there — and the `web/src/.ruler/AGENTS.md` line
that names `lib/platform.ts`), run `npm run ruler:apply`, and commit the regenerated output.
Verification: `npm run check`, `npm test`, and `npm run
ruler:check` green — the last one is
precisely the gate the failed attempt could not satisfy.

Sequencing within C12: land the Orientation-type patch (see the sibling entry
"`Orientation = 'portrait' | 'landscape'` is redeclared in ~8 places") **before** this move — that
draft patches `web/src/lib/platform.ts` by path and stops applying once the file is renamed. This
move then carries the canonical `Orientation` export along into `platform/index.ts` with no further
edits, and the `$lib/platform` import specifier in all its consumers survives unchanged.

**Alternatives weighed:** 1. **`lib/platform/` with a detection-only `index.ts` (winner).**
`platform.ts` becomes `platform/index.ts` verbatim; `$lib/platform` keeps resolving for all 21
importers with zero edits. Siblings move to `platform/deviceInfo.ts` etc. and their ~15 import sites
update to `$lib/platform/<name>`. Colocated tests move along. Deliberately *not* an
everything-barrel: re-exporting `orientation.ts` from the index would route `state/settings` →
`storage` → `$lib/platform` → `orientation` → `state/settings` into an import cycle
(`orientation.ts` imports `$lib/state/settings.svelte`). Detection-only index avoids that class of
cycle entirely. 2. **Same move, folder named `device/`.** Rejected: `$lib/platform` is the
established specifier (21 importers, ADR-0013, the CLAUDE.md src map, and the `Platform` type all
say "platform"); `device/` would force edits at every one of those sites for a name that is no more
accurate. 3. **Status quo + complete the `architecture` skill file map instead.** Cheaper, and the
map *should* list all seven files regardless — but rejected as the resolution: it fixes the skill,
not the grep (`ls web/src/lib` and editor fuzzy-find still interleave the cluster with
`idle.ts`/`storage.ts`/`imagePrefetch.ts`), and the finding's brief explicitly accepts the one-time
churn.

Membership judgment calls, decided: include `deviceReport.ts` — it is the client/server-shared shape
of device info (imported by `/api/report`), and server code importing `$lib/platform/deviceReport`
is fine since the module is deliberately dependency-free; keeping it beside `deviceInfo.ts` (which
imports its type) beats stranding it. Include `haptics.ts` — it is "adapt output to the platform"
and imports `platform.ts`.

**Landing note:** Re-stage in `docs/AUDIT.md` as the move described above, with an explicit
acceptance criterion of `npm run ruler:check` passing (the recorded failure mode), and ordered after
the Orientation-type patch lands.

#### Verification

`npm run check` plus the unit/E2E suites covering the touched files (see the solution for any
targeted commands).

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* The relocation leaves durable references to removed paths in `.ruler/skills/api/SKILL.md`, several
  ADRs, `docs/COMPATIBILITY.md`, `docs/CONTRIBUTING.md`, `web/src/app.d.ts`, and
  `web/src/lib/state/books.ts`; update them to `platform/index.ts` or `platform/<module>.ts` as
  appropriate, then regenerate the `.agents` and `.claude` mirrors.
* Four committed patches under `docs/audit-deferred/` still reference the removed root modules and
  fail `git apply --check`, including the explicitly sequenced Orientation-type patch;
  retarget/regenerate the `p2-complexity`, `p2-duplication-orientation`, `p2-type-safety`, and
  `p4-accessibility` patches for `$lib/platform/*` and the relocated file paths.

#### What was tried

1. Moved the seven platform/device modules and their colocated tests into `lib/platform/`,
   preserving `$lib/platform` through `index.ts` and updating explicit sibling consumers. Updated
   the specified Ruler architecture and mobile sources to document the consolidated cluster.
2. Updated every reviewer-identified durable reference to the relocated `platform/index.ts` or
   explicit platform sibling path, including accurate compatibility line anchors. Refreshed the API
   skill source and writable generated mirror so the outer Ruler pass can complete both provider
   mirrors.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p2-architecture-scatter-of-platform-device-utilities-across-lib-root-hur.patch`
(2 commits). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p2-architecture-scatter-of-platform-device-utilities-across-lib-root-hur.patch`.

### [P2][duplication] `Orientation = 'portrait' | 'landscape'` is redeclared in ~8 places

**File(s):** `web/src/lib/notchBand.ts:38`, `web/src/lib/state/layout.svelte.ts:4`,
`web/src/lib/orientation.ts:5`, `web/src/lib/state/books.ts:49`, `state/canvas.svelte.ts:18`,
`drawing/engine.ts:258`, `components/ParentCenter.svelte:60`, `tests/global.d.ts:48` — pinned at SHA
f934d43

**Rolled-back draft patch:**
docs/audit-deferred/p2-duplication-orientation-portrait-landscape-is-redeclared-in-8-places.patch

#### Problem

The literal union `'portrait' | 'landscape'` is declared independently eight times — as
`Orientation` twice (`notchBand.ts`, `layout.svelte.ts`), as `OrientationLockType`
(`orientation.ts`), as `BookOrientation` (`books.ts`), and inlined anonymously in four more spots.
Any widening (e.g. `'square'`) touches every copy and there is no single grep target. Proposal: one
canonical `export type Orientation` in `platform.ts`, imported everywhere; keep
semantically-distinct aliases as `type X = Orientation` where the name adds meaning.

**State at triage (2026-07-27):** All eight duplication sites hold at HEAD (verified by grep):
`notchBand.ts:38`, `layout.svelte.ts:4`, `orientation.ts:5`, `books.ts:50`, `canvas.svelte.ts:26`,
`engine.ts:262`, `tests/global.d.ts:49`, and — the one drift — the `ParentCenter.svelte` copy now
lives in the extracted `components/parent/CompactShell.svelte:29` (`LockedOrientation`). The draft
was cut after that extraction: it targets `CompactShell.svelte`, and `git apply --check` passes at
HEAD. It adds `export type Orientation` to `platform.ts:52` beside `Platform`, converts all eight
consumers to type-only imports, keeps the meaningful aliases (`BookOrientation`,
`OrientationLockType`, `LockedOrientation`) as `= Orientation`, and preserves `notchBand.ts`'s
type-only-import purity (no runtime `platform.ts` import reaches the pure layer).

**Prior attempt / why it was deferred:** The implementer delivered the full consolidation but no fix
round for the one unresolved objection, which is cross-patch, not in-patch: the separately deferred
draft
`docs/audit-deferred/p2-complexity-effect-bodies-use-bare-member-access-statements-purely-to.patch`
(a) adds `import { layout, type Orientation } from '$lib/state/layout.svelte'` in
`ClearButton.svelte` — an export this patch deletes — and (b) still carries
`type OrientationLockType = 'portrait' | 'landscape'` in its rewritten `orientation.ts` hunks. The
reviewer required that reapplicable draft be updated to use the canonical type from `platform.ts`.

#### Proposed solution

**FIX — clear winner.** Apply the draft patch as-is — it applies cleanly at HEAD and is complete for
this finding. The reviewer's sole objection was about collateral damage to a *different* deferred
draft; satisfying it means rebasing that sibling patch, not changing this one.

Apply the patch with `git apply` — no edits. Record the objection's remedy against the
*effect-bodies* deferred finding, where the work actually lands: rebase that patch so it reads

```ts
// ClearButton.svelte
import type { Orientation } from '$lib/platform';
import { layout } from '$lib/state/layout.svelte';

// orientation.ts (its rewritten header)
import type { Orientation } from '$lib/platform';
type OrientationLockType = Orientation;
```

Sequencing within C12: land this **before** the platform-folder move (the sibling entry "Scatter of
platform/device utilities across `lib/` root") — the draft patches `web/src/lib/platform.ts` by path
and stops applying once that file becomes `platform/index.ts`. The move then carries the canonical
type along, and every `from '$lib/platform'` import this patch adds survives the move unchanged, so
the two land coherently in this order with no rework.

**Alternatives weighed:** 1. **Apply the draft, then rebase the effect-bodies sibling draft
(winner).** This patch passed type-check, unit-test, and lint gates and needs zero content changes.
The objection is mechanical: in the effect-bodies patch, change `ClearButton.svelte`'s type import
source from `$lib/state/layout.svelte` to `$lib/platform`, and keep
`type OrientationLockType =
   Orientation` (importing it) in its `orientation.ts` hunks — its
current hunks also carry the old literal as context, so they conflict outright once this lands; a
3-way rebase of that patch is needed regardless. 2. **Re-export `Orientation` from
`layout.svelte.ts` as a compatibility shim** so the sibling draft applies untouched. Rejected: it
preserves the second grep target the finding exists to remove, and the sibling draft still conflicts
on its `orientation.ts` context lines anyway — the shim buys nothing. 3. **DROP.** Rejected: all
eight copies are live at HEAD, the fix is done and green, and the canonical home (`platform.ts`) is
exactly where the C12 folder finding wants the platform vocabulary to live.

**Landing note:** Re-stage in `docs/AUDIT.md` as "apply the draft patch as-is, before the
platform-folder move; then rebase the effect-bodies draft per the recorded objection (import
`Orientation` from `$lib/platform`, drop its literal redeclarations)".

#### Verification

per the original brief: `git grep "'portrait' | 'landscape'"` returns only `platform.ts`'s single
definition, and `npm run check` passes (the patch already met this at the driver's gates).

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* Rebase
  `docs/audit-deferred/p2-complexity-effect-bodies-use-bare-member-access-statements-purely-to.patch`:
  its `ClearButton.svelte` hunk still imports `Orientation` from the now-removed `layout.svelte.ts`
  export, and its `orientation.ts` hunk still redeclares `'portrait' | 'landscape'`; both must use
  the canonical type from `$lib/platform`.

#### What was tried

Added the canonical `Orientation` type to `platform.ts` and replaced all eight duplicate unions with
type-only imports or meaningful aliases. Updated `ClearButton.svelte` to import the canonical type
after removing the duplicate layout export, without changing runtime behavior.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p2-duplication-orientation-portrait-landscape-is-redeclared-in-8-places-2.patch`
(1 commit). It was not accepted, so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p2-duplication-orientation-portrait-landscape-is-redeclared-in-8-places-2.patch`.
