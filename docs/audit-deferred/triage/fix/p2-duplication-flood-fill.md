# Background flood-fill is written twice in lib (and a third time in bin)

**Priority/category:** P2[duplication] · **Cluster:** C15 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `tools/asset-gen/lib/night-scores.mjs:57-83` (`scoreNightness`),
`tools/asset-gen/lib/invented-shapes.mjs:55-82` (`detectInventedShapes`),
`tools/asset-gen/bin/gen-coloring-chalk.mjs:113` (`openBackground`) — pinned at SHA f934d43 **Draft
patch:**
docs/audit-deferred/p2-duplication-background-flood-fill-is-written-twice-in-lib-and-a-third.patch

## Verdict

**FIX — clear winner.** The finding still holds (three border flood-fills at HEAD), and the one
unresolved objection — the chalk copy was left behind — has a mechanical cause with a clean cure:
the draft's helper took a grayscale buffer + threshold, but chalk floods a binary pen mask. A
predicate-based core covers all three call sites without bending any semantics.

## Original finding (condensed)

`scoreNightness` and `detectInventedShapes` flood the open background from the image border through
source-light pixels with the same `push(x,y)` closure, four border-seeding loops, and pop-and-spread
stack loop; `invented-shapes` even documents the copy ("the same machinery as scoreNightness").
`gen-coloring-chalk.mjs` reimplements it a third time. Two separate `170` light-threshold constants
(`NIGHT_SRC_LIGHT`, `SRC_LIGHT`). Proposed `floodBackground(gray, w, h,
lightThreshold)` in a shared
module plus one `BG_LIGHT_THRESHOLD`.

## Why it was deferred

Implementer failed to deliver a fix round. Unresolved objection: `gen-coloring-chalk.mjs` (now
`openBackground` at 124-153) still contained the third copy; the reviewer required refactoring it
onto the shared implementation "while preserving its binary-mask semantics".

## Current state of the code

Still three copies, slightly reshuffled:

* `lib/night-scores.mjs:65-91` — inline in `scoreNightness`, gated on `s.data[i] > NIGHT_SRC_LIGHT`
  (170).
* `lib/invented-shapes.mjs:41-70` — since the pin this copy was hoisted into a module-private
  `floodBackground(source, w, h, lightThreshold)` (called with exported `SRC_LIGHT` = 170). Better
  factored, but still a duplicate of the night-scores loop.
* `bin/gen-coloring-chalk.mjs:124-153` — `openBackground(penMask)` floods through `!penMask[i]` on a
  0/1 ink mask at `OUTLINE_MASK_SIZE`. Same algorithm, different open-pixel predicate — this is why
  the grayscale-signature helper couldn't absorb it.

The draft patch no longer applies (both lib files drifted), but its `lib/regions.mjs` content is
still the right starting point.

## Options considered

1. **Predicate-core `lib/regions.mjs`** (winner): a generic border flood over "open" pixels, with
   the grayscale form as a thin wrapper. Covers all three sites exactly, including chalk's
   binary-mask semantics, answering the objection head-on.
2. **The draft as-is (grayscale-only helper), chalk left alone.** Already rejected by review, and
   rightly: the chalk copy is the one in `bin/`, the least discoverable of the three.
3. **Fold into `lib/morphology.mjs`.** Avoids a new module, but that file is documented as mask
   morphology/distance transforms; a region flood is a different family and `regions.mjs` leaves
   room for future region ops. Cosmetic either way — do not block on the file name.

## Recommendation

Re-cut the draft on HEAD with a predicate core:

```js
// lib/regions.mjs
export const BG_LIGHT_THRESHOLD = 170;

export function floodFromBorder(w, h, isOpen) {
  const region = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {/* bounds check; if (!region[i] && isOpen(i)) mark + push */};
  // seed four borders, then pop-and-spread 4-connected — verbatim from the draft
  return region;
}

export const floodBackground = (gray, w, h, lightThreshold = BG_LIGHT_THRESHOLD) =>
  floodFromBorder(w, h, (i) => gray[i] > lightThreshold);
```

Exactly what must change vs the rejected draft:

* **Migrate the chalk copy** — `openBackground(penMask)` becomes
  `floodFromBorder(OUTLINE_MASK_SIZE, OUTLINE_MASK_SIZE, (i) => !penMask[i])`. Binary-mask semantics
  are preserved because the predicate is the caller's own.
* Rebase the two lib hunks: `night-scores.mjs` drops its inline loop + `NIGHT_SRC_LIGHT`;
  `invented-shapes.mjs` deletes its now-private `floodBackground` and keeps `SRC_LIGHT` exported as
  a re-export/alias of `BG_LIGHT_THRESHOLD` (it is part of the module's documented constants).

The per-pixel closure call is irrelevant at 384/512 px working widths in a manual tool.
Verification: `tests/night-scores.test.mjs` and `tests/invented-shapes.test.mjs` pass with unchanged
`bgFrac`/`bgLuma`; chalk's gates are exercised via
`npm run gen:coloring-chalk -- --dry-run
--rescore`-style offline runs plus
`npm run gen:coloring-golden:diff` staying clean.

## Suggested next step

Re-stage in docs/AUDIT.md with the predicate-core design above ("apply the patch's regions.mjs,
generalize to `floodFromBorder(w, h, isOpen)`, migrate all three call sites including chalk").
