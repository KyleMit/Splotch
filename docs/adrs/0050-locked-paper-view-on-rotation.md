# ADR-0050: Lock the "Paper" on Rotation and Present It Upright Through a Contain-Fit View

**Status:** Active **Date:** 2026-07

## Context

Ops, the baseline, and the keyframes all live in the visible canvas's coordinate space
(ADR-0033/0034/0035), and a resize simply rebuilt into the new backing store with content anchored
at the top-left. For a device rotation that produced two bad experiences:

1. **A colored-in page fell apart.** The tall/wide variants of a coloring page are *different
   compositions* (2:3 vs 3:2 art, `state/books.ts`), and rotation swapped the overlay to the other
   variant while the strokes kept their absolute coordinates — the child's coloring no longer
   matched anything. No transform can fix that after the fact: there is no mapping between two
   different drawings.
2. **Plain drawings "disappeared."** Content past the new viewport's short edge was clipped (still
   preserved in the square baseline, but invisible), which to a toddler reads as their picture
   vanishing.

Locking the screen orientation is not an answer: iPadOS doesn't allow it for windowed apps, and
overriding the OS rotation preference is hostile anyway (`lib/orientation.ts` exists for parents who
explicitly opt in).

Alternatives considered:

* **Rescale the ops** (bake a fit transform into every op + raster on each rotation). Loses
  information on every round trip (repeated resampling), makes historical stroke widths diverge from
  new ones, and — decisive — still can't reconcile strokes with a *swapped* page composition.
* **Counter-rotate the paper to stay "glued to the glass"** (the drawing keeps its physical position
  on the screen and the controls re-layout around it). Was built first — the view machinery supports
  it, and it usually fits at scale ≈ 1 — but rejected as the product behavior: the drawing reads as
  *sideways* in the new orientation rather than as a picture that rotated with the device, and its
  correctness depends on the platform's Screen Orientation angle sign convention. The upright
  presentation was preferred even though it scales the drawing down further.
* **Fit the whole baseline square** into the new viewport. Shows everything but wastes most of the
  screen: the square is the union of both orientations, and the actually-used region is only ever
  the adopted viewport's rect.
* **Only stop the art swap** and keep letting strokes clip. Fixes nothing for problem 2 and leaves
  the page art contain-fit to a viewport the strokes were not drawn against — still misaligned.

## Decision

Introduce the **paper**: the coordinate space the drawing lives in, adopted from the viewport and
**locked while there is ink on the canvas**. A rotation never remaps content; it changes only how
the locked paper is *presented*: **upright, contain-fit, centered** — the picture rotates with the
device and is scaled down (uniformly) when the old orientation's paper doesn't fit the new one.

* `engine.ts` keeps `paper` (px + CSS dims) and `paperAngle` (the `screen.orientation.angle` at
  adoption). `resizeCanvas()` decides **adopt vs lock**: an empty canvas, or a resize at an
  unchanged angle (desktop window drag, mobile URL bar), re-adopts the paper as the live viewport —
  exactly the old semantics. Only a resize whose angle differs (a real rotation,
  `rotationDelta ≠ 0`) with a non-empty canvas keeps the paper and computes a **paper view**.
* The view (`lib/drawing/paperView.ts`, pure + unit-tested) is a uniform contain-fit + center
  (`computePaperView(paper, viewport, 0)` — the rotation parameter exists for the rejected
  glued-to-glass alternative and stays 0 in production, so a 180° flip on an unchanged viewport
  computes an identity view). It is applied **once per resize as the visible ctx's persistent
  transform plus a clip to the paper rect** — every existing paint path (live ops, undo/resize
  replay, keyframe blits, the magic-brush pattern) flows through it untouched, because they all
  paint in paper coordinates already. Pointer input is inverse-mapped (`screenToPaper`); the
  edge-swipe guard stays in screen space (OS gesture bands are physical edges), so
  `PointerState.
  startX/startY/pendingPoints` are screen-space by contract.
* **Uniform view scale, never per-op rescale**: relative stroke weights inside the drawing stay
  exact; while letterboxed the whole page just reads smaller, and new strokes record in paper space
  so rotating back restores the original layout pixel-for-pixel.
* The **margins around the fitted paper stay drawable** (no clip — a child mid-scribble must not hit
  dead zones). Margin ink records at out-of-paper coordinates: it renders and replays normally while
  its command is retained, is **cropped by design on rotating back** (and from exports — the paper
  is the artifact), and reappears when rotating forward again while its ops survive. Once a margin
  command folds/keyframes into the paper-square rasters, the parts outside the square are dropped
  from later rebuilds — rasters covering the mapped margins were rejected because the contain-fit
  maps a phone viewport to ~2× the paper's long side (~25 MB per 4×-DPR surface), reintroducing
  exactly the memory class ADR-0033 removed.
* Visually the paper reads as a **distinct sheet, not a framed box**: the off-white `handmade-paper`
  texture lives on a `.paper-sheet` element beneath the (now always transparent) canvas, carrying
  the same view transform, over the container's flat, slightly greyer margins plus a soft shadow —
  no border line. This also retired the `has-coloring-overlay` body-class texture swap: the texture
  is simply always below the ink.
* The **coloring page follows the paper, not the viewport**: the overlay `<img>` sits in a
  `.paper-view` wrapper (`DrawingCanvas.svelte`) positioned with the same matrix (`viewMatrix`,
  shared by `ctx.setTransform` and CSS `matrix()`), and the picker keys the tall/wide variant off
  `canvasState.paperOrientation` (`ColoringBook.svelte`) so a locked page keeps the art the child
  colored on. The magic sheet rasterizes at paper size (`magicBrush.ts` host `paperSize`), so the
  reveal stays aligned by construction. The wrapper carries the multiply blend (its transform
  creates a stacking context that would isolate an inner `mix-blend-mode`).
* **Blank canvas frees the paper**: `setCanvasEmptyState(true)` (clear, undo-to-blank,
  erase-to-blank) re-adopts immediately, and rotations with an empty canvas behave exactly as before
  (art variant swaps, full viewport drawable). `exportCanvasBlob` now composes from a paper-space
  rebuild instead of the visible canvas, so exports are the full upright page even mid-lock.

Gotchas encoded in the code:

* `clearAllOf()` replaces bare `clearRect`s: under the view the visible ctx's user space is paper
  coordinates, where margin ink sits at negative coordinates a rect from (0,0) would miss — so it
  clears in device space.
* Because the view has no rotation component, nothing depends on the Screen Orientation angle's sign
  or physical direction — the angle is used purely as a **rotation detector**
  (`rotationDelta(paperAngle, angle) !== 0`).
* The engine also funnels `screen.orientation` `change` events into the debounced resize handler, in
  case an angle update lands after the resize event. `setScreenAngleOverride()` is the dev-harness
  seam that lets Playwright simulate rotation (`tests/engine.spec.ts`, "device rotation / the paper
  view"); a flows spec covers the app-level page lock via CDP orientation emulation.

## Consequences

* **+** Both original failures are gone: a colored page keeps its exact art and alignment through
  any number of rotations, and a plain drawing is always fully visible (contain-fit) instead of
  half-clipped.
* **+** Rotating back is a perfect restore — the paper never changed, only the view did.
* **+** No new rendering machinery: undo (ADR-0033), rebuild (ADR-0034), keyframes (ADR-0035),
  simplification (ADR-0036), and the magic brush (ADR-0043) are untouched replay-wise; the view is
  one `setTransform` + `clip` at resize time, off the hot path.
* **−** While rotated, the drawing is letterboxed at roughly the aspect-ratio ratio of the two
  orientations (a phone shows a portrait drawing at ~half size in landscape; near-square tablets
  shrink far less), and new strokes render proportionally smaller than the picker circle implies;
  the eraser preview bubble is scaled to match.
* **−** Margin ink is second-class: cropped on rotate-back and from exports (accepted product
  behavior — the paper is the artifact), and dropped from rebuilds once its command folds/keyframes
  beyond the paper-square rasters, so an undo pressed while rotated can also remove margin ink older
  than the 10-command retention window. Clearing the canvas reclaims the full new orientation as
  fresh paper.
* **−** Undoing *back into* content after the paper re-adopted (e.g. undoing a clear after rotating)
  replays old-space ops into the new space — the pre-ADR behavior (possible partial off-screen),
  accepted for that corner rather than keeping stale locks on a blank canvas.

Amends the "rotation coordinate handling is unchanged" note in **ADR-0034** (the baseline square
remains the preservation mechanism; presentation is new) and the sheet-sizing note in **ADR-0043**
(the sheet is paper-sized now). Builds on **ADR-0033/0035**; the picker/state wiring extends
**ADR-0045**'s orientation handling.
