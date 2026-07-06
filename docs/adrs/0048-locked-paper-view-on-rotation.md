# ADR-0048: Lock the "Paper" on Rotation and Present It Through a Counter-Rotate + Fit View

**Status:** Active
**Date:** 2026-07

## Context

Ops, the baseline, and the keyframes all live in the visible canvas's coordinate
space (ADR-0033/0034/0035), and a resize simply rebuilt into the new backing
store with content anchored at the top-left. For a device rotation that produced
two bad experiences:

1. **A colored-in page fell apart.** The tall/wide variants of a coloring page
   are *different compositions* (2:3 vs 3:2 art, `state/books.ts`), and rotation
   swapped the overlay to the other variant while the strokes kept their absolute
   coordinates — the child's coloring no longer matched anything. No transform
   can fix that after the fact: there is no mapping between two different
   drawings.
2. **Plain drawings "disappeared."** Content past the new viewport's short edge
   was clipped (still preserved in the square baseline, but invisible), which to
   a toddler reads as their picture vanishing.

Locking the screen orientation is not an answer: iPadOS doesn't allow it for
windowed apps, and overriding the OS rotation preference is hostile anyway
(`lib/orientation.ts` exists for parents who explicitly opt in).

Alternatives considered:

- **Rescale the ops** (bake a fit transform into every op + raster on each
  rotation). Loses information on every round trip (repeated resampling), makes
  historical stroke widths diverge from new ones, and — decisive — still can't
  reconcile strokes with a *swapped* page composition.
- **Fit the whole baseline square** into the new viewport. Shows everything but
  wastes most of the screen: the square is the union of both orientations, and
  the actually-used region is only ever the adopted viewport's rect.
- **Only stop the art swap** and keep letting strokes clip. Fixes nothing for
  problem 2 and leaves the page art contain-fit to a viewport the strokes were
  not drawn against — still misaligned.

## Decision

Introduce the **paper**: the coordinate space the drawing lives in, adopted from
the viewport and **locked while there is ink on the canvas**. A rotation never
remaps content; it changes only how the locked paper is *presented*.

- `engine.ts` keeps `paper` (px + CSS dims) and `paperAngle` (the
  `screen.orientation.angle` at adoption). `resizeCanvas()` decides **adopt vs
  lock**: an empty canvas, or a resize at an unchanged angle (desktop window
  drag, mobile URL bar), re-adopts the paper as the live viewport — exactly the
  old semantics. Only a resize whose angle differs (a real rotation) with a
  non-empty canvas keeps the paper and computes a **paper view**.
- The view (`lib/drawing/paperView.ts`, pure + unit-tested) is
  counter-rotate(`rotationDelta(paperAngle, angle)`) ∘ uniform contain-fit ∘
  center. It is applied **once per resize as the visible ctx's persistent
  transform plus a clip to the paper rect** — every existing paint path (live
  ops, undo/resize replay, keyframe blits, the magic-brush pattern) flows
  through it untouched, because they all paint in paper coordinates already.
  Pointer input is inverse-mapped (`screenToPaper`); the edge-swipe guard stays
  in screen space (OS gesture bands are physical edges), so `PointerState.
  startX/startY/pendingPoints` are screen-space by contract.
- **Uniform scale, never per-op rescale**: relative stroke weights inside the
  drawing stay exact; while letterboxed the whole page just reads slightly
  smaller, and new strokes record in paper space so rotating back restores the
  original layout pixel-for-pixel.
- The **clip makes the letterbox dead space** — a stroke there would otherwise
  be stranded off-screen (or lost past the baseline square) on rotating back.
- The **coloring page follows the paper, not the viewport**: the overlay `<img>`
  sits in a `.paper-view` wrapper (`DrawingCanvas.svelte`) positioned with the
  same matrix (`viewMatrix`, shared by `ctx.setTransform` and CSS `matrix()`),
  and the picker keys the tall/wide variant off `canvasState.paperOrientation`
  (`ColoringBook.svelte`) so a locked page keeps the art the child colored on.
  The magic sheet rasterizes at paper size (`magicBrush.ts` host `paperSize`),
  so the reveal stays aligned by construction. The wrapper carries the multiply
  blend (its transform creates a stacking context that would isolate an inner
  `mix-blend-mode`).
- **Blank canvas frees the paper**: `setCanvasEmptyState(true)` (clear,
  undo-to-blank, erase-to-blank) re-adopts immediately, and rotations with an
  empty canvas behave exactly as before (art variant swaps, full viewport
  drawable). `exportCanvasBlob` now composes from a paper-space rebuild instead
  of the visible canvas, so exports are the full upright page even mid-lock.

Gotchas encoded in the code:

- `clearAllOf()` replaces canvas-sized `clearRect`s: under the view the visible
  ctx's user space is paper coordinates, where a canvas-sized rect may not cover
  the paper.
- The rotation *direction* comes from `rotationDelta` = adoption angle − current
  angle, matching the Screen Orientation convention that `angle` is how far
  content was rotated to compensate the device. If a platform is ever observed
  180°-off, the fix is localized to `rotationDelta`; alignment and visibility do
  not depend on the sign, only the "glued to the glass" fidelity does.
- The engine also funnels `screen.orientation` `change` events into the
  debounced resize handler, in case an angle update lands after the resize
  event. `setScreenAngleOverride()` is the dev-harness seam that lets Playwright
  simulate rotation (`tests/engine.spec.ts`, "device rotation / the paper
  view"); a flows spec covers the app-level page lock via CDP orientation
  emulation.

## Consequences

- **+** Both original failures are gone: a colored page keeps its exact art and
  alignment through any number of rotations, and a plain drawing is always fully
  visible (contain-fit) instead of half-clipped.
- **+** Rotating back is a perfect restore — the paper never changed, only the
  view did. The metaphor is physical: the paper is glued to the glass and the
  controls re-layout around it.
- **+** No new rendering machinery: undo (ADR-0033), rebuild (ADR-0034),
  keyframes (ADR-0035), simplification (ADR-0036), and the magic brush
  (ADR-0043) are untouched replay-wise; the view is one `setTransform` + `clip`
  at resize time, off the hot path.
- **−** While rotated, the drawing is letterboxed and new strokes render
  proportionally smaller than the picker circle implies (the paper is "further
  away"); the eraser preview bubble is scaled to match. Near-square viewports
  (tablets) barely shrink; a phone letterboxes more.
- **−** The child cannot draw in the letterbox margins (by design — such strokes
  could never survive a rotation back). Clearing the canvas reclaims the full
  new orientation.
- **−** Undoing *back into* content after the paper re-adopted (e.g. undoing a
  clear after rotating) replays old-space ops into the new space — the pre-ADR
  behavior (possible partial off-screen), accepted for that corner rather than
  keeping stale locks on a blank canvas.
- **−** The glued-to-glass rotation direction is derived from the Screen
  Orientation angle convention and is verified in emulation but not yet on
  physical iOS/Android hardware; a wrong sign would show the paper turned 180°
  from the physical expectation (still aligned and fully visible).

Amends the "rotation coordinate handling is unchanged" note in **ADR-0034** (the
baseline square remains the preservation mechanism; presentation is new) and the
sheet-sizing note in **ADR-0043** (the sheet is paper-sized now). Builds on
**ADR-0033/0035**; the picker/state wiring extends **ADR-0045**'s orientation
handling.
