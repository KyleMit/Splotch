# ADR-0099: Window the Paper — Don't Re-Adopt It When Transient System Bars Shrink the Viewport

**Status:** Active (amends [0050](0050-locked-paper-view-on-rotation.md)) **Date:** 2026-08

## Context

Splotch runs full-screen on Android with the navigation bar hidden in immersive-sticky mode
(`MainActivity.hideNavigationBar()`). A swipe from the bottom edge brings the system bars back
temporarily, and the WebView shrinks by their height — a same-angle, same-orientation viewport
change of roughly 48 CSS px.

With a coloring page applied, that made the child's drawing visibly break: the page art slid **up**
by half the height delta while the strokes stayed exactly where they were, so the coloring no longer
matched the line art. A Playwright repro at 412×915 → 412×867 measured it precisely — ink moved 0
px, art moved −24 px.

The cause is an asymmetry in what the two are anchored to. Ink is recorded in paper coordinates and
repaints from the paper raster anchored at the paper **origin**. The coloring art (the `.paper-view`
wrapper's `object-fit: contain` image in `DrawingCanvas.svelte`) and the magic-brush fill
(`magicBrush.ts`, drawn contain-fit within the paper) are both **centered within** the paper. So
they only stay aligned while the paper's dimensions hold still — and ADR-0050's `adopt vs lock` rule
re-adopted the paper for any same-angle resize larger than the 8 px inset-settling tolerance, which
is exactly what a bar reveal is.

The same shape reaches web: a mobile URL bar reappearing shrinks the viewport identically.

Alternatives considered:

* **Lock the paper and present it contain-fit**, reusing ADR-0050's rotation presentation unchanged.
  Keeps art, fill, and ink mutually aligned — but scales the whole drawing down ~5 % and re-centers
  it every time the bars are swiped, so the picture still visibly moves. The reported complaint was
  movement, and a transient occlusion is not worth a scale change.
* **Anchor the coloring art top-left** instead of centering it. Fixes the resize case by breaking
  the resting composition: a tall page in a portrait container is centered on purpose, and this
  would jam it against the top on every device.
* **Stop the WebView resizing natively** — keep the transient bars a pure overlay so no web-layer
  resize occurs. Platform-version dependent, untestable from the web test suite, and leaves the
  mobile-web URL-bar case unfixed.
* **Re-map the ink** to the new paper. Rejected for the same reasons as ADR-0050: resampling loses
  information every round trip and can't reconcile a swapped page composition.

## Decision

Make **paper size, not the view transform, the thing that is held**, and give the resize path a
third outcome. `resizeCanvas()` picks a `PaperPresentation` (`engine.ts`):

* **`adopt`** — the paper becomes the viewport, the pre-lock semantics. Chosen for an empty canvas,
  for a viewport that grew past the paper, or for a shrink too large to be system chrome (nothing to
  preserve, or a deliberate resize the drawing should re-fit into).
* **`window`** — the paper is kept and presented at **identity**; the viewport is a window onto it.
  Chosen when the canvas has ink, the angle and orientation are unchanged, and
  `viewportIsBarOcclusion()` (`paperView.ts`) reports the viewport is the paper minus a band of
  system chrome. Nothing moves: the occluded band is simply cropped by the canvas container's
  `overflow: hidden`, and it returns untouched when the bars go away.
* **`fit`** — the paper is kept and presented upright, contain-fit and centered, so a rotated
  drawing stays fully visible. This is ADR-0050's behavior, now reached only on a genuine rotation
  or orientation flip.

`viewportIsBarOcclusion()` replaces `smallViewportDrift()`. It is asymmetric: the old ±8 px band is
kept as the **grow** tolerance, so native rotation settling its insets a few pixels late still
avoids invalidating every tile, while the **shrink** side opens up to
`SYSTEM_BAR_OCCLUSION_MAX_CSS_PX` (96). That bound is the load-bearing part of the decision. System
chrome is absolute-sized — Material's navigation bar is 48dp and a status bar with a display cutout
runs to about the same — so 96 px covers the pair even stacked. Beyond it, a shrink is a dragged
window edge, split-screen, or a keyboard: a deliberate resize, where re-fitting the drawing beats
hiding part of it behind nothing. Without the bound, dragging a desktop window edge in would crop
the coloring page instead of re-fitting it, and it would also strand the tile-backing rebuild path
with no same-orientation resize left to reach it (caught by `flows-tile-history.spec.ts`'s resize
test, which is why that spec now resizes far past the band).

Gotchas encoded in the code:

* **A windowed paper presents at identity, so "the view is identity" no longer means "the paper is
  free."** The two "blank canvas frees the paper" paths (`setCanvasEmptyState`,
  `readoptPaperAfterTiledCanvasHides`) previously inferred lock state from
  `!isIdentityView(paperView)`; they now read an explicit `paperLocked` flag. The remaining
  `isIdentityView` call sites are genuinely about the transform — margin-ink handling and
  rect-limited undo repaint — and stay correct under `window`, where there are no margins at all
  because every visible pixel is paper.
* Because the paper does not change, `window` skips the magic-sheet re-raster and the tiled-renderer
  resize entirely. Under the tiled renderer (ADR-0085/0089) a bar reveal now does essentially
  nothing — the tiles are not even touched, so the drawing physically cannot move.
* Exports stay full-page while the bars are up: `exportCanvasBlob` composes from the paper, which
  still carries the cropped band.

Covered by `tests/engine-system-bars.spec.ts` (crop-not-shift, exact restore on re-hide, and the
paper freeing on clear) and `paperView.test.ts`'s `paperPresentationFor` cases, which pin both sides
of the occlusion bound.

## Consequences

* \+ The reported bug is gone: revealing the system bars over a coloring page moves nothing at all —
  the bottom band the bar covers is simply cropped, which is what the bar is doing anyway.
* \+ Mobile web gets the same fix for free; a reappearing URL bar no longer shifts the page.
* \+ Cheaper than what it replaced. A bar reveal used to re-adopt the paper, re-raster the magic
  sheet, and resize the tiled renderer; it now does none of those.
* \+ The lock state is explicit rather than inferred from the view transform, which was a proxy that
  had just quietly stopped being true.
* − A third presentation mode is more surface than ADR-0050's binary adopt/lock, and the three-way
  choice has to be read to know which resize does what.
* − The bound is a tuned literal. A device whose bars exceed 96 px falls back to the old re-adopting
  behavior and the original bug; a deliberate resize *under* 96 px crops a band instead of
  re-fitting. Both are quiet failures — nothing announces which side of the line a resize landed on
  — and the number is justified by Material's dp sizes rather than measured across a device matrix.
* − The asymmetry is deliberate and incomplete: a viewport that *grows* past the paper still adopts,
  so a drawing started while the bars were showing will re-center its art when they hide. That
  ordering needs the child to draw during a transient bar reveal, and adopting on grow is what keeps
  a genuinely larger window drawable.
