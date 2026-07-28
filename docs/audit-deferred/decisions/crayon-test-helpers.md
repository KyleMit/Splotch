# Crayon-brush tests re-derive point generators and region samplers inline in every test

**Original finding:** [P2][duplication] — `web/tests/engine.spec.ts:1299-1802` at pin SHA f934d43
(the crayon section, since split out to `web/tests/engine-crayon.spec.ts` and partly
`web/tests/engine-snapshot-tier.spec.ts`) — deferred because it failed adversarial review.
**Verdict:** DROP

## Context

The finding: nearly every crayon test's `page.evaluate` block re-declares a 40-segment
horizontal-line interpolator
(`for (let i = 0; i <= 40; i++) p.push({ x: x0 + ((x1-x0)*i)/40, y })`), a pixel-region coverage
sampler, and the four-call preamble
`E.clearCanvas(); E.setCrayonMode(true);
E.setColor(…); E.setStrokeWidth(…)`. Proposed fix: inject a
shared in-page testkit (`interpolatePoints`, `sampleRegion`, `setupCrayon`) onto `window` and route
every test through it, claiming a reduction of "a few hundred lines" and pinning the interpolation
math in one place.

The burndown attempt built exactly that (`installCrayonTestkit` in `engine-harness.ts`, installed
per-spec via `test.beforeEach`, typed in `global.d.ts`) and failed review with three unresolved
objections:

1. **Stragglers** — `engine-snapshot-tier.spec.ts` still defined its own 40-step line/setup, and the
   pointer-event regression test in `engine-crayon.spec.ts` still had an inline sampler and raw
   preamble. (The draft's third commit addressed both sites, but doing so triggered objection 2.)
2. **Semantic change** — the snapshot-tier crayon test *deliberately* omits `clearCanvas()` from its
   setup; the draft swapped in `setupCrayon()`, whose `clearCanvas()` call pushes an extra undo
   command, breaking the test's exact `expect(debug.snapshots).toBe(2)` invariant.
3. **Unpinned math** — the held-pointer test still derives the 40-segment formula inline for its
   `pointermove` loop instead of routing those coordinates through `interpolatePoints`.

## Current state (verified at HEAD 63a7aa49)

The duplication is real and essentially unchanged — the monolithic `engine.spec.ts` was split into
per-area specs, relocating but not consolidating anything:

* The 40-segment interpolation formula appears **8×** in `web/tests/engine-crayon.spec.ts` (lines
  24, 106, 161, 206, 236, 283, 322, plus the `pointermove` variant at 387) and **1×** in
  `web/tests/engine-snapshot-tier.spec.ts` (line 61).
* The `setCrayonMode(true)` preamble appears **8×** in `engine-crayon.spec.ts` and **1×** in
  `engine-snapshot-tier.spec.ts` (line 64 — the no-`clearCanvas` variant).
* Pixel samplers: of the ~7 sampling closures across the crayon tests, only **three** share the
  coverage/mean-rgb shape (`crayonScene`'s `region`, the scribble test's `coverage`, the pointer
  test's `inkedAt`). The rest are bespoke — per-texel deviation stats (shade-variation test), mix /
  green-dominance counters (crossing test), full-alpha count (colorMix test), whole-canvas byte diff
  (remount test) — and cannot be consolidated without parameter soup.

Two facts established during triage change the picture decisively:

* **The completed draft is net +8 lines.** `git apply --stat` on the rolled-back patch:
  `125 insertions(+), 117 deletions(-)` across four files. The finding's premise — "reduces the
  crayon section by a few hundred lines" — is empirically false once the testkit installation
  machinery, the `global.d.ts` typings, the per-spec `beforeEach`, and the local wrapper closures
  each test still needs (`line`, `region`, `pts` now wrap the testkit calls instead of containing
  the logic) are counted.
* **Objection 2 is a confirmed engine-level hazard, not reviewer pedantry.**
  `web/src/lib/drawing/engine.ts:1096-1107` — `clearCanvas()` unconditionally pushes a clear command
  (`pushCommand(clearCommand)` / `deferCommand`) and sets `canUndo`, even on a blank canvas. The
  draft's `setupCrayon()` in the snapshot-tier test would make `getUndoDebug().snapshots` report 3
  where the test asserts exactly 2. That bug shipped in the draft's final commit and survived an
  implement+review round before being caught.

Also: the patch **no longer applies at HEAD** (`git apply --check` fails — the crossing test now
takes its blue via `TEST_PALETTE.blue` as an `evaluate` argument rather than a hardcoded hex), so
finishing it means a manual rebase plus re-verification, not a mechanical touch-up.

## Options considered

### Option A — finish the draft (rebase + three amendments)

Rebase the testkit onto HEAD; give `setupCrayon` a `{ clear?: boolean }` option (default `true`,
snapshot-tier passes `false`) to resolve objection 2; route the held-pointer `pointermove` loop
through `interpolatePoints(…).slice(1)` for objection 3; verify with
`npm run test:e2e -- engine-crayon engine-snapshot-tier --repeat-each=5`.

* Pros: the draft is ~90% done; every objection has a crisp, known resolution; future crayon tests
  get ready-made helpers; the formula and preamble each appear once.
* Cons: net LOC is ~zero (or positive) — the payoff is naming, not size; every test becomes less
  self-contained (reading one now requires `engine-harness.ts` + `global.d.ts`, and depends on a
  `beforeEach` install having run); the one demonstrated defect in this effort was *introduced by
  the consolidation itself*, in exactly the way high-precision pixel tests punish — a setup call
  that looks equivalent but shifts a white-box invariant; rebase + repeat-each re-verification is
  fresh cost against a suite that is green and stable.

### Option B — helpers-only extraction (inject `interpolatePoints` alone)

Skip `setupCrayon` and `sampleRegion` (the two sources of semantic risk and API clunkiness) and
share only the pure point generator.

* Pros: zero behavioral risk — a points array is deterministic and byte-identical either way;
  removes the single most-repeated fragment.
* Cons: still pays the full machinery bill (window install, `global.d.ts` types, per-spec
  `beforeEach`) for a 4-line pure function — guaranteed net-positive LOC for the weakest slice of
  the win. Machinery cost dominates; worst ratio of the three options.

### Option C — DROP

Leave the specs as they are.

* Pros: no churn, no risk, no indirection added to a heavily commented, deliberately self-contained
  test file.
* Cons: the formula keeps appearing 9× and the preamble 9×; a future crayon spec will copy-paste
  them again.

## Decision / lean

**DROP.** Three independent lines of evidence say the cost/benefit went negative:

1. **The win was oversold and is now measured.** The finding promised a few hundred lines saved; the
   finished implementation is net **+8**. What remains as benefit is "the interpolation math is
   pinned in one place" — but nothing needs it pinned. The 40-segment count is an arbitrary per-test
   density choice with no cross-test coupling: if one copy drifted to 30 segments, no test would
   break and no bug could result. This is repetition without divergence risk — the cheapest kind of
   duplication to live with.
2. **The consolidation demonstrably manufactures risk these tests can't absorb.** These are
   white-box pixel-invariant tests (exact snapshot counts, byte-zero diffs, coverage windows). The
   one real defect in this entire effort was created by the refactor (`setupCrayon`'s hidden
   `clearCanvas` undo command) and survived a full implement+review round. A dedup whose failure
   mode is *silently weakened or broken assertions in a green suite* needs a large payoff to justify
   itself, and (1) shows the payoff is roughly zero.
3. **The remaining duplication is mostly not duplication.** Only 3 of ~7 samplers share a shape; the
   draft's shared `sampleRegion` still forced call sites to keep local wrapper closures, so per-test
   helper code never actually disappeared. Each `evaluate` block staying self-contained is a stated
   design property of these specs ("all in one page context so the canvas pixels never leave the
   browser") and an active reading aid, not an accident.

The three reviewer objections were all *valid and completable* — this is not a case of review scope
creep. Objection 1 was finished by the draft's own third commit; objection 3 is a two-line change;
objection 2 is fixed by a `clear: false` option. But completing them only lands Option A, whose
measured value no longer clears the bar. The right response to a finding whose premise ("a few
hundred lines") turned out false is to drop it, not to ship the refactor anyway.

**If the owner disagrees and wants it anyway:** take Option A exactly as specified above — the
rolled-back patch at
`docs/audit-deferred/p2-duplication-crayon-brush-tests-re-derive-point-generators-and-region.patch`
is sound raw material once rebased. Non-negotiables for that path: `setupCrayon` must take
`{ clear?: boolean }` (or not clear at all) so `engine-snapshot-tier.spec.ts` keeps observing
exactly two snapshots; the crossing test must keep receiving `TEST_PALETTE.blue` as an `evaluate`
argument; no assertion or threshold may change; verify with `--repeat-each=5` on both touched specs
per the flake-resistance rules in `.claude/rules/testing.md`.

## Why the previous attempt failed, and how this path avoids it

* *Stragglers not routed through the kit* — resolved by the draft's own final commit; moot under
  DROP.
* *`setupCrayon` changed snapshot-tier semantics* — confirmed real against `engine.ts:1096-1107`;
  under DROP the hazard is avoided by not consolidating setup at all. This objection is the
  strongest single argument *for* the DROP verdict: it is the concrete instance of the failure mode
  that makes the refactor a bad trade.
* *Interpolation math not fully pinned* — moot under DROP; pinning was the goal only if pinning had
  value, and no cross-copy consistency requirement exists.
