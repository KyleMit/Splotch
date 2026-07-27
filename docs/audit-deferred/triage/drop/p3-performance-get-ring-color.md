# `getRingColor` is recomputed 2-3× per active swatch in the template

**Priority/category:** P3[performance] · **Cluster:** C10 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/components/ColorPalette.svelte:130-132` — pinned at SHA f934d43
**Draft patch:** none

## Verdict

**DROP — already resolved.** The double-compute the finding describes was removed at HEAD by commit
27a997f ("unify the two selection-ring box-shadow builders"): the ring color is now computed once
per swatch via `{@const}` and reused for both the `box-shadow` and `--ring-color`. Independently,
the performance framing does not survive scrutiny — even unfixed, the cost was unmeasurable.

## Original finding (condensed)

At f934d43 the active swatch's style string called `ringShadow(shown)` (which internally called
`getRingColor(shown)`) *and* `getRingColor(shown)` again for `--ring-color`, so the hex-parse +
luminance + per-channel math ran at least twice for the selected swatch on every reactive tick
touching the `{#each}`. Proposed computing it once, e.g. an `activeRingColor` `$derived` near the
selection state.

## Why it was deferred

Verifier unavailable — the burndown recorded no verification brief either way.

## Current state of the code

Resolved. `web/src/lib/components/ColorPalette.svelte:117-127` now reads:

```svelte
{@const shown = themedSwatchColor(hex, dark)}
{@const ringColor = getRingColor(shown)}
...
  ? `box-shadow: ${selectionRingShadow(ringColor)}; --ring-color: ${ringColor};`
```

`selectionRingShadow` (line 66) takes the ring color as an argument and no longer calls
`getRingColor` itself, so the active swatch computes its ring color exactly once — the outcome the
finding asked for, in `{@const}` form rather than the proposed `$derived`-near-selection form.

On the perf claim itself: `getRingColor` (`web/src/lib/colorRing.ts:37-47`) is a hex parse plus a
handful of arithmetic ops and a string build — microseconds. The `{#each}` re-evaluates only when
its reactive dependencies change (`colors.activeSwatch`, the eraser flag, a theme flip,
`ringAnimateKey`) — discrete user interactions like a tap, never per frame or per pointer-move.
Running that twice instead of once per tap was never measurable; the legitimate kernel was
readability (compute once, name it), and that is what landed.

One wrinkle worth noting and dismissing: the `{@const}` now runs `getRingColor` for every rendered
swatch (~10) on each block re-render, where f934d43 ran it only for the active one. That is
nominally *more* total calls, equally unmeasurable, and the code is clearer — not worth reopening.

## Recommendation

Nothing to do. The duplicate computation is gone, and no observable performance problem existed in
either version.

## Suggested next step

Dropped — nothing to do.
