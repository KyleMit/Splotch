# `scoreCompositeEyes` is a 100-line function with an inline pupil-shape validator

**Priority/category:** P3[complexity] · **Cluster:** C15 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `tools/asset-gen/lib/composite-eye.mjs:158-259` — pinned at SHA f934d43
**Draft patch:**
docs/audit-deferred/p3-complexity-scorecompositeeyes-is-a-100-line-function-with-an-inline-p.patch

## Verdict

**FIX — clear winner.** The draft's extraction is correct and the patch still applies cleanly at
HEAD. The reviewer's objection — "reuse `erodeMask` from `morphology.mjs`" — is, as literally
stated, unsatisfiable without changing behavior, because `erodeMask` uses a different structuring
element than the inline loop. The fix is to add a cross-kernel erode to `morphology.mjs` and route
the extracted helper through that: shared morphology home, exact same pixels.

## Original finding (condensed)

Inside `scoreCompositeEyes`'s per-eye loop, three rejection stages are inlined: bounding-box fill +
aspect ratio, a Set-based erosion survival test, and centroid + disc-stats measurement. The
pupil-shape decision spans ~50 lines mixed with measurement, and the erosion is a fourth ad-hoc
morphology implementation. Proposed extracting `isPupilDisc(blob, w, h)` (reusing `erodeMask`) and
`blobCentroid(blob, w)` so the loop reads grow → validate → measure → push.

## Why it was deferred

Implementer failed to deliver a fix round. The extraction shipped, but `isPupilDisc` kept the exact
Set-based erosion loop; the reviewer's unresolved objection demanded building a blob mask and
reusing `erodeMask` from `morphology.mjs` "while preserving the calibrated fixture verdicts". The
implementer's note says the Set loop was kept deliberately, "preserving the exact cross-kernel
erosion" — the two demands are in tension, and no round resolved it.

## Current state of the code

Unchanged at HEAD: `scoreCompositeEyes` is `lib/composite-eye.mjs:174-275` with the bbox/aspect
check (207-222), Set-based erosion (224-248), and centroid reduce (251-252) all inline.
`git apply --check` passes — this is the only C15 patch that still applies verbatim.

The technical crux the review deadlocked on: `erodeMask` (`lib/morphology.mjs:46`) is a **separable
box erosion** — radius r erodes by a (2r+1)×(2r+1) *square*. The inline loop is `PUPIL_ERODE_PX`
iterations of a **4-neighbor cross** erosion (a diamond). A 5×5-square erosion removes strictly more
pixels than two cross iterations, so `erodeMask(mask, w, h, PUPIL_ERODE_PX)` erodes harder and can
flip the `eroded.size >= max(12, blob.length * 0.3)` survival test on borderline blobs — with only
the five committed fixtures as coverage of the detection path. The reviewer's instruction, taken
literally, cannot preserve the calibrated verdicts by construction; that is why the fix round
failed, not implementer sloppiness.

## Options considered

1. **Apply the patch + add a cross-kernel erode to `morphology.mjs`** (winner). Exact behavior, and
   the "fourth ad-hoc morphology implementation" the finding named is genuinely removed.
2. **Apply the patch as-is and document why the Set loop is not `erodeMask`.** Cheapest; overrules
   the reviewer with a true reason (kernel mismatch). Acceptable fallback, but leaves the ad-hoc
   erosion the finding explicitly called out.
3. **Switch to `erodeMask` and re-calibrate.** Changes detection behavior for a pure-readability
   finding; re-pinning thresholds off five fixtures for zero functional gain is the wrong trade.

## Recommendation

Apply the draft patch, then replace `isPupilDisc`'s Set loop with shared morphology:

* Add to `lib/morphology.mjs` a one-step 4-neighbor erode, e.g.
  `export function erodeCross(mask, w, h)` — pixel survives iff itself and all four neighbors are
  set, with out-of-bounds treated as unset. That matches the Set version exactly (its
  `x > 0 && x < w - 1 && …` guards mean border pixels never survive, same as out-of-bounds = 0). A
  short comment should state why `erodeMask` (box kernel) is deliberately not used here.
* In `isPupilDisc`, build a dense `Uint8Array` mask over the blob's bounding box (already computed
  for the fill/aspect checks), run `erodeCross` `PUPIL_ERODE_PX` times, and count survivors in place
  of `eroded.size`.
* Verification: `tests/composite-eye.test.mjs` passes with identical verdicts and identical
  `coreDarkFrac` values; assert (in the PR notes) that per-fixture `pupils.length` is unchanged,
  since the erosion gates detection, not just measurement.

## Suggested next step

Apply the patch
(`git apply docs/audit-deferred/p3-complexity-scorecompositeeyes-is-a-100-line-function-with-an-inline-p.patch`),
then make the `erodeCross` change above in the same commit.
