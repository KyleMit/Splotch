# Audit comments — Testing

10 of the 464 archived burndown PR comments. Part of the [audit comment archive](README.md) — see
the README for what this archive is, the full run table, and the category index.

## PR [\#535](https://github.com/KyleMit/Splotch/pull/535) — Audit burndown (2026-07-24)

### `2d735046dcaa` — [P5][testability] `emptyScan` / `strokeOps` module-singleton scratch state has no reset seam

**Issue**

These modules hold process-lifetime mutable singletons (scratch canvas, per-target crayon buffers,
live paper buffer). `strokeOps` exposes `setLiveCrayonBuffer(null, null)` as a partial reset, but
`emptyScan`'s scratch and `strokeOps`' `bufferByTarget`/`livePaperSide` have no teardown/reset. Unit
tests that want a clean slate (and the engine teardown itself) cannot fully reset this state, so
tests can leak buffers between cases and the "outlives teardown" behavior is implicit rather than
expressed.

**Fix**

refactor(drawing): add reset seams for emptyScan scratch and strokeOps livePaperSide

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071309559) · 2026-07-24
15:04:29 UTC</sub>

### `510e17c79166` — [P2][testability] Extract the AiDial progress engine out of the component into a testable unit

**Issue**

The dial's fill model is imperative logic tangled into the component: a mutable
`rafId`/`startTime`/`done` triple (non-`$state`), a `loop()` with three phase branches (lines
24-46), plus **four** separate `$effect` blocks (lines 63-91) that start/stop the loop on different
`ui` combinations, and a fifth destroy-cleanup effect. The lifecycle is spread across five reactive
blocks sharing hidden mutable state, and there is no unit test — the behavior is only covered
indirectly by `web/tests/ai-timer.spec.ts` (an E2E), precisely because the math is unreachable
without a DOM. Any change risks a stuck spinner (the exact class of bug the comments at lines 22-45
and 78-81 are patching around).

**Fix**

refactor(drawing): extract createDialProgress engine from AiDial

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071309825) · 2026-07-24
15:04:31 UTC</sub>

## PR [\#552](https://github.com/KyleMit/Splotch/pull/552) — Audit burndown: clear the staged docs/AUDIT.md backlog (236 findings) (2026-07-27)

### 9c59aa6c426f — [P2][test-quality] `light-fill-cli` gate-result arrays are magic sequences silently coupled to `MAX_ATTEMPTS = 5`

**Issue**

The mock outline-match gate (lines 30-43) `shift()`s from a shared queue `state.gateResults`; each
test seeds that queue with a bare boolean array whose length silently encodes the CLI's retry count:

```js
state.gateResults = [false, false, false, false, false, true]; // line 122
```

That is exactly `MAX_ATTEMPTS` (5, defined at `bin/gen-coloring-fills.mjs:157`) failures for
`first-tall` followed by one pass for `second-tall`. Nothing in the test names or explains the count
of five — a reader must cross-reference the CLI's retry constant to understand why six entries
produce "1 failed". Other tests use `state.gateResults = []` (lines 164, 189) with a
`// every attempt misses a gate` comment, relying on `shift()` on an empty array returning
`undefined`.

**Fix**

Replaced the hand-counted boolean queues in `light-fill-cli.test.mjs` with a named `exhaustPage()`
helper built from a `MAX_ATTEMPTS` constant, so each seeding reads as "this many pages/samples miss
every gate" rather than a bare six-element literal. The brief's preferred fix — exporting
`MAX_ATTEMPTS` from `gen-coloring-fills.mjs` and importing it — is not possible and I verified that
empirically: the CLI does its work at module top level, so a static import crashes the suite on the
mocked `COLORING_DIR` getter before any test runs; I took the brief's documented fallback of a
commented mirror constant, which means a future change to the CLI's `MAX_ATTEMPTS` will make this
test fail loudly rather than track the new value.

*Revised before approval:* Addressed both review points. Moved `MAX_ATTEMPTS` out of
`bin/gen-coloring-fills.mjs` into `lib/cli.mjs` — side-effect-free and unmocked by the suite — and
imported it in both the generator and `light-fill-cli.test.mjs`, so the gate-miss sequences are
genuinely derived from the CLI's constant rather than a hand-maintained mirror; the incorrect "can't
be imported" comment is gone. Verified derivation by setting the real constant to 3 and to 6 (test
passes at each) before reverting to 5. The reviewer was right that my earlier "fails loudly" claim
was wrong. One honest caveat reported to the user: I also shortened `exhaustPage()` to
`MAX_ATTEMPTS - 1` as a negative control and all 5 tests still passed, because the CLI ships
all-or-nothing and the assertions only check "1 render failed, nothing shipped" — so the array
length expresses intent and can no longer drift, but it is not load-bearing for a pass/fail signal;
making it so would require asserting on the failing page's identity via the mocked console.log, a
behavior change beyond this readability fix, which I flagged as a possible follow-up rather than
doing unasked. Gates: `npm run check` 0 errors, `npm run test:asset-gen` 116 passed, `npx eslint` on
all three changed files clean, `npm run format:check` clean.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `tools/asset-gen/tests/light-fill-cli.test.mjs:10` re-declares `MAX_ATTEMPTS = 5` as a
  hand-maintained mirror of `tools/asset-gen/bin/gen-coloring-fills.mjs:139`, so the finding's
  coupling is unresolved: change the CLI to 6 and the test still passes for the wrong reason — page
  1 consumes the 5 `false`s plus the trailing `true` and *passes* on attempt 6, page 2 then exhausts
  on `undefined`, and the run still throws '1 render(s) failed.' Move `MAX_ATTEMPTS` into a
  side-effect-free module (e.g. `tools/asset-gen/lib/cli.mjs`, which the test does not mock) and
  import it in both `gen-coloring-fills.mjs` and the test so the sequences are genuinely derived
  from the CLI's constant.
* The comment at `tools/asset-gen/tests/light-fill-cli.test.mjs:7-9` states the constant "can't be
  imported" because the bin module executes at import time; that is true of the bin module but not
  of the constant, which can be relocated to a lib module. Drop or correct the comment along with
  the relocation above rather than leaving it as justification for the duplicate.

**Supervisor note** — worth highlighting as the best-executed finding of the run so far. The
reviewer's first objection is the subtle kind a green test suite actively hides: the mirrored
constant would have kept the suite passing *for the wrong reason* after a CLI change, with the
off-by-one absorbed by page 1 passing on attempt 6 and page 2 exhausting on `undefined`. The
implementer then proved the fix rather than asserting it — setting the real constant to 3 and to 6
and confirming the test tracks each — and volunteered both that its earlier "fails loudly" claim had
been wrong and that a negative control (`MAX_ATTEMPTS - 1`) still passes, so the sequence length now
expresses intent but is not load-bearing. It flagged tightening that as a follow-up rather than
widening the finding's scope unasked, which is the right call.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5086623841) · 2026-07-27
02:15:40 UTC</sub>

### 9e9528765b5a — [P4][test-quality] `composite-eye` hardcodes fixture-name arrays and a `length === 5` that duplicate `manifest.json`

**Issue**

The suite loads `manifest.json` (which already lists all five fixtures with `expectBlankOrb` flags
and `worstCoreDarkFrac` values), yet the true-positive and over-flag cases are driven by literal
arrays hardcoded in the test:

```js
for (const name of ['stegosaurus-tall', 'horse-tall']) { ... }        // line 42
for (const name of ['unicorn-tall', 'owl-tall', 'square-tall']) {...} // line 56
```

and the manifest check asserts a magic `expect(manifest.length).toBe(5)` (line 89). Add a sixth
fixture and you must update the manifest, the two arrays, and the count — three places that silently
disagree until someone notices. The manifest is the source of truth but isn't used to drive the
parametrized cases.

**Fix**

Moved the composite-eye test's manifest load to module-scope top-level await and derived the
true-positive/legible fixture lists and margin-test name sets from `manifest.filter(...)` instead of
four hardcoded name arrays, and dropped the redundant `manifest.length === 5` assertion. Verified by
temporarily adding a 6th manifest entry and confirming it was picked up by all three parametrized
blocks without touching the test body, then reverted; asset-gen vitest suite, root unit tests,
svelte-check, and eslint all pass clean.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor note** — the verification method here is the right one for this class of fix and worth
calling out: "derive the cases from the manifest" is only actually done if a *new* manifest entry
flows through without touching the test body. Temporarily adding a sixth fixture and confirming all
three parametrized blocks picked it up tests the property the finding cares about. A green suite on
the existing five fixtures would have proven nothing — it passes identically whether the lists are
derived or still hardcoded.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5086912183) · 2026-07-27
03:15:41 UTC</sub>

## PR [\#561](https://github.com/KyleMit/Splotch/pull/561) — Burn down 114 staged audit findings (2026-07-27)

### 127ed5925bd3 — [P4][test-quality] Scribble-guard `evaluate` probes are duplicated between engine and flows and could share one fixture

**Issue**

Both files build synthetic `TouchEvent`/stubbed-`changedTouches` probes to assert the Scribble
guard's `preventDefault` behavior. `flows.spec.ts:492-500` and `engine.spec.ts:464-476` construct
the same touch-event scaffolding independently. The pattern (dispatch a cancelable touch and read
`defaultPrevented`) is a reusable primitive.

**Fix**

Centralized the shared WebKit-safe finger and stylus touch-dispatch probes in the test helper. The
palette and canvas tests now use it while preserving their distinct cancellation assertions.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5094524993) · 2026-07-27
17:23:09 UTC</sub>

### d3b546f01531 — [P4][test-quality] Tests reach deep into engine internals via the harness, coupling specs to implementation details

**Issue**

The `window.__engine` harness exposes 25+ methods including internals like `getUndoDebug()`
(`{ snapshots, liveRasters, blobBytes, pendingCommands }`) and `getCrayonParams()`. Tests like
`engine.spec.ts:1918-1978` assert on `liveRasters`/`blobBytes` tier counts — implementation details
of the snapshot memory tier (ADR-0066). If the tiering strategy is refactored (e.g. a third tier),
these tests fail even when user-visible undo behavior is unchanged. Some coupling is inherent to an
engine harness, but the memory-tier assertions test the mechanism, not the behavior.

**Fix**

Documented the intentional ADR-0066 storage-tier white-box invariants and removed unused
browser-harness state and crayon getter exposure, including the obsolete engine export and ADR
description.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5094525654) · 2026-07-27
17:23:12 UTC</sub>

## PR [\#589](https://github.com/KyleMit/Splotch/pull/589) — Drain audit-deferred decision docs: implement the triaged fixes (2026-07-28)

### Finding 5 of 15 — `/dev/engine` readiness `beforeEach` duplicated across specs — ✅ FIXED

**Decision doc:** `engine-readiness-duplication.md` (verdict FIX) · **Priority:** P2

#### What changed

* `web/tests/engine-harness.ts` — gained an exported `alphaAt(page, x, y)` pixel-alpha reader beside
  the existing `state`/`count` readers.
* `web/tests/multitouch.spec.ts` — the last spec still carrying its own copy of the `/dev/engine`
  readiness `beforeEach` now imports the shared harness instead (importing the module installs the
  readiness hook, the same mechanism the nine `engine-*.spec.ts` files already use). Its local
  `count`/`alphaAt` readers are deleted in favor of the harness exports, and its three inline
  `page.evaluate(() => window.__engineState)` calls go through the shared `state()` reader. The
  `window.__engine.multiStrokeSync`/`undo()` driver calls stay inline — they're the spec's subject,
  not readers.

The readiness poll now exists in exactly three places by design: `engine-harness.ts`,
`global-setup.ts`, `global.d.ts`.

#### Adversarial review

Independent reviewer with no implementer context: **APPROVE.** Verified the moved `alphaAt` is
character-identical to the previous local definition and the shared `beforeEach` body matches the
deleted one (no subtle behavior change); confirmed both prior burndown objections resolved (pixel
reader exported and used at every call site; all three `__engineState` bypasses eliminated);
confirmed scope discipline (`webkit-smoke.spec.ts` correctly stays off the harness per the
WebKit-portability rule in `.claude/rules/testing.md`). One cosmetic nit — a missing blank line
between import groups — fixed before commit.

#### Verification

`npm run test:e2e -- multitouch.spec.ts --repeat-each=3`: 9/9 across all repeats.
`engine-undo.spec.ts`: 10/10 (proves the harness is unchanged for existing consumers).
`npm run check`: 0 errors. `grep __engineReady web/tests/*.spec.ts`: no matches.

#### Drained

Deleted `docs/audit-deferred/decisions/engine-readiness-duplication.md` and its stale draft patch
`p2-duplication-the-dev-engine-readiness-beforeeach-and-state-readers-are.patch`.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/589#issuecomment-5103262572) · 2026-07-28
11:00:40 UTC</sub>

### Finding 6 of 15 — Crayon tests re-derive point generators/samplers inline — 🗑️ DROPPED (per decision doc)

**Decision doc:** `crayon-test-helpers.md` (verdict DROP) · **Priority:** P2

No implementation — the triage decision was to drop this finding, and nothing at HEAD changed that
calculus. The doc's three lines of evidence, summarized for the record:

1. **The win was oversold and is now measured.** The finding promised a few hundred lines saved; the
   finished draft implementation measured net **+8 lines**. The 40-segment interpolation count is an
   arbitrary per-test density choice with no cross-test coupling — repetition without divergence
   risk.
2. **The consolidation manufactured real risk.** These are white-box pixel-invariant tests (exact
   snapshot counts, byte-zero diffs). The one genuine defect produced during the whole burndown
   effort was created *by* this refactor (`setupCrayon`'s hidden `clearCanvas` undo command) and
   survived a full implement+review round. A dedup whose failure mode is silently weakened
   assertions in a green suite needs a large payoff; the payoff measured ~zero.
3. **The remaining duplication mostly isn't duplication.** Only 3 of ~7 samplers share a shape, the
   shared helper still forced local wrapper closures at call sites, and each `evaluate` block
   staying self-contained is a stated design property of these specs, not an accident.

The doc explicitly notes the prior reviewer's objections were valid and completable — this is a
premise-turned-false drop, not review fatigue. If anyone wants it anyway, the doc's "if the owner
disagrees" section (preserved in git history at this commit's parent) lists the non-negotiables for
reviving the rolled-back patch.

#### Drained

Deleted `docs/audit-deferred/decisions/crayon-test-helpers.md` and the rolled-back draft patch
`p2-duplication-crayon-brush-tests-re-derive-point-generators-and-region.patch`.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/589#issuecomment-5103267377) · 2026-07-28
11:01:11 UTC</sub>

### Finding 7 of 15 — Single Parent-Center test asserts ~six behaviors — ✅ FIXED

**Decision doc:** `parent-center-test-split.md` (verdict FIX) · **Priority:** P2

#### What changed

One file: `web/tests/flows-parent-center.spec.ts`. The monolithic
`'parent center shows quick toggles on a landscape phone'` test (~24 assertions across six
behaviors) is now:

* `openParentCenterCompact(page)` — a setup-only helper (viewport 852×390 + `gotoApp` +
  `openParentCenter`), zero assertions
* **Test 1** `'landscape phone renders compact quick toggles'` — compact class, quick toggles
  present / hub+sidebar absent, orientation-lock cell in slot 3, portrait hint
* **Test 2** `'the orientation lock selector cycles portrait, landscape, and off'` — the full
  Portrait → Landscape → off → re-select-Portrait sequence, no rotation
* **Test 3** `'quick-toggle changes persist into the full portrait Parent Center'` — flips the
  advanced-controls quick toggle, sets portrait lock *through the asserted intermediate off state*,
  rotates to portrait, and verifies the full hub shell reflects both settings

#### Adversarial review

Independent reviewer with no implementer context: **APPROVE, no blocking findings.** It
reconstructed the original monolith from git and mapped all ~24 original assertions — every one
survives the split; the only added assertion is the intermediate `aria-pressed="false"` the doc
mandates (so a no-op click handler now fails the test). All four prior burndown objections confirmed
resolved: the cycle test no longer rotates, the helper no longer asserts, the off-state gap is
closed, and the full four-step cycle sequence is intact. No inter-test coupling (each test gets a
fresh context; both setting-mutating tests are independent). One cosmetic nit about a spliced
comment sentence, explicitly no-action.

#### Verification

`npm run test:e2e -- flows-parent-center --repeat-each=10`: 90/90 (the testing rules' flake bar for
changed specs); reviewer independently reran at ×3 and ×10 — all green.

#### Drained

Deleted `docs/audit-deferred/decisions/parent-center-test-split.md` and its stale draft patch
`p2-test-quality-a-single-parent-center-test-asserts-six-distinct-behavio.patch`.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/589#issuecomment-5103327548) · 2026-07-28
11:07:28 UTC</sub>

### Finding 9 of 15 — Git version derivation embedded untestable in `vite.config.ts` — ✅ FIXED

**Decision doc:** `git-version-derivation.md` (verdict FIX) · **Priority:** P3

#### What changed

* `web/buildVersion.ts` (new) — the ~35-line imperative derivation extracted as a pure, injectable
  module: `deriveWebVersion({ packageVersion, runGit })` implements the three-tier fallback (git tag
  describe → short SHA → bare package version), and `buildMetadata({ isCapacitor, … })` is the
  single entry point that skips git entirely for native builds. The ADR-0030 blobless-clone
  rationale comment moved here beside the logic it explains.
* `web/src/lib/buildVersion.test.ts` (new) — 6 tests pinning all three fallback branches, git
  command order, lazy SHA lookup (a successful describe never calls rev-parse), that
  `CAPACITOR=true` never invokes git, and the web-branch glue.
* `web/vite.config.ts` — the derivation block is now two lines calling `buildMetadata`;
  `node:fs`/`node:child_process` imports dropped.
* `netlify.toml` + `docs/adrs/0030-git-derived-web-version.md` — both synced to name
  `web/buildVersion.ts` as the derivation home (the ADR gains a dated amendment noting semantics are
  unchanged).

#### Adversarial review

Independent reviewer with no implementer context: **APPROVE.** It reconstructed the old inline block
from git and compared tier-by-tier — commands, regexes, trigger conditions, output formats, and
evaluation timing all identical (one unreachable edge case improves: rev-parse succeeding with empty
output). Confirmed the tests genuinely pin behavior (a swapped fallback order, eager SHA call, or
git-under-CAPACITOR each fails a specific assertion) and all four prior burndown objections are
resolved: no gitignored helper path, complete extraction (config no longer owns any version logic),
`netlify.toml` synced, ADR synced. One nit — `buildMetadata`'s web branch had no direct glue test —
addressed: a test now mocks git so the derived version differs from the package version and asserts
the derived value comes back.

#### Verification

`test:unit` 779/779 (6 new) · `npm run check` 0 errors · `npm run build` green, emitting
`version.json` = `1.3.0+70f8b8b` — the exact short-SHA branch expected in this tagless clone,
byte-identical injection into the bundles · Prettier + dprint clean.

#### Drained

Deleted `docs/audit-deferred/decisions/git-version-derivation.md` and its stale draft patch
`p3-maintainability-git-based-version-derivation-is-35-lines-of-imperativ.patch`.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/589#issuecomment-5103649171) · 2026-07-28
11:39:40 UTC</sub>
