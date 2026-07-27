# "Median" via `>>1` is the upper-middle element, and luma definitions differ between modules that compare against shared thresholds

**Priority/category:** P5[maintainability] · **Cluster:** C15 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `tools/asset-gen/lib/composite-eye.mjs:80-88` (`grayResized`, sharp
`.grayscale()`) vs `eye-fill.mjs:216-218` (manual Rec.601) — pinned at SHA f934d43 **Draft patch:**
docs/audit-deferred/p5-maintainability-median-via-1-is-the-upper-middle-element-and-luma-def.patch

## Verdict

**OPTIONS — real tradeoffs.** The finding is real and fully unresolved at HEAD, and the draft got
five of the seven review objections closed with strong empirical evidence that the unification is
numerically near-inert. But the two outstanding objections are exactly the ones that make "fix the
math" risky in a tuned classifier pipeline: stale committed composite fixtures and an unverified
full-catalog golden run. A safe subset captures most of the value with none of the risk.

## Original finding (condensed)

(1) The old `vals[vals.length >> 1]` "median" convention was undocumented (at HEAD this is now
`stats.mjs`'s `quantile`, which picks the *lower* middle — still undocumented). (2)
`composite-eye.scoreCompositeEyes` derives luma via sharp `.grayscale()` (libvips weighting) while
`eye-fill.scoreEyeFill` uses manual Rec.601 `0.299/0.587/0.114` — two modules thresholding the same
conceptual "luma" (`DARK`/`WHITE` vs `EYE_DARK_MAX`/`EYE_LIGHT_MIN`) against values computed two
different ways, so constants tuned under one luma are applied to the other. Proposed a shared
`luma()` used everywhere thresholds are compared, plus a one-line median note.

## Why it was deferred

Failed adversarial review, three rounds, seven objections. Rounds 2-3 closed: `Math.round` on the
`Uint8Array` store (truncation bias), fixture `worstCoreDarkFrac` re-measured under unified luma
(all 5 stable to 2 decimals, documented in the fixtures README), header calibration figures marked
pre-unification, `pupils.length` verified identical (this is a detection-path change), `stats.mjs`
median note added, `night-composite.mjs` unified with `luma()` and empirically shown a near-no-op on
real chalks (max delta 1/255 on ~0.002% of bytes). Still unresolved when rolled back:

* The committed `tests/fixtures/composite-eye/*.comp.webp` were built with the OLD `compositeNight`;
  the "all 5 re-measured, unchanged" note validates only `grayResized`. Rebuild the fixtures under
  the new composite (or revert `night-composite.mjs`).
* `golden/golden-scores.json` (`orbMinCoreDark`, `bgLuma`, `lineWhite`) is produced by the altered
  functions and `gen:coloring-golden:diff` is not part of `npm test` — run it and re-freeze in the
  same commit if movement is intended.

## Current state of the code

Fully unresolved — the rollback restored everything. `lib/stats.mjs` ships `quantile`/`median` with
no selection-rule note and no `luma()`. `composite-eye.mjs:83` and `night-composite.mjs:19` still
use `.grayscale()`; `eye-fill.mjs:46/342`, `night-halo.mjs:38/49`, `night-scores.mjs:98/136`,
`punch-fill.mjs`, and `solid-regions.mjs` each inline the manual Rec.601 formula. The patch no
longer applies (`solid-regions.mjs` was heavily refactored since its base). Margins on the tuned
side are modest — over-flag floor 0.10 vs `CORE_DARK_FRAC_MIN` 0.07 — but the measured unification
shifts were ≤ 0.003, an order of magnitude smaller.

## Options considered

1. **Safe subset: document + deduplicate without changing any number** (lean). Add the `stats.mjs`
   selection-rule note and `luma()`; adopt `luma()` only in the five modules already using the
   manual formula (a pure move — zero numeric change); leave `.grayscale()` in `composite-eye.mjs`
   and `night-composite.mjs` but add explicit fence comments: "libvips grayscale, deliberately NOT
   the shared `luma()` — the calibration constants below were pinned under this weighting; unify
   only with a fixture rebuild + golden re-freeze." Pros: kills the duplication, documents both
   traps, cannot regress anything; no fixture rebuild, no golden run. Cons: the two-luma
   inconsistency itself survives, fenced rather than fixed.
2. **Complete the unification (the draft, finished).** Rebase the patch; rebuild the five
   `.comp.webp` fixtures under the new `compositeNight` (the README points at
   `.coloring-samples/orb-fixtures/build-fixtures.mjs` — a *gitignored* scratch script that may need
   recreating, a real friction point); run `npm run gen:coloring-golden:diff` and re-freeze with
   justification if any score moves. Pros: one luma everywhere; the empirical evidence
   (sub-quantization deltas, stable fixture verdicts) says regression risk is small. Cons: the two
   remaining review demands are precisely the expensive ones; if the golden diff does move, someone
   must judge threshold re-pins page by page; three review rounds already sank into this for a P5 in
   manual tooling.
3. **Drop.** Rejected: the median note and the `luma()` dedup are near-free, and the undocumented
   two-luma trap already cost one reviewer seven objections' worth of analysis.

Ranked 1 > 2 > 3.

## Recommendation

Lean option 1. It is most of the draft with the two risky hunks (the `grayResized` and
`compositeNight` `.grayscale()` switches) replaced by fence comments, and it needs none of the
outstanding verification machinery. The tradeoff the maintainer must weigh: accepting a documented
inconsistency (option 1) versus paying the fixture-rebuild + golden-refreeze cost to eliminate it
(option 2) — worth revisiting as option 2 the next time the composite-eye fixtures are rebuilt for
some other reason, at which point the incremental cost drops to running the golden diff.

## Suggested next step

Re-stage in docs/AUDIT.md as the option-1 subset ("cherry-pick the patch's stats.mjs +
manual-formula hunks; do NOT switch the two `.grayscale()` sites — fence them with comments
instead"). Note in the entry that option 2 remains available behind a fixture rebuild.
