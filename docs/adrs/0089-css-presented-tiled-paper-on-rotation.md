# ADR-0089: Present Rotated Tiled Paper with CSS Instead of Reallocating Canvas Surfaces

**Status:** Active — amends [ADR-0050](0050-locked-paper-view-on-rotation.md),
[ADR-0085](0085-tiled-live-canvas-for-ipad-webkit.md), and
[ADR-0088](0088-frame-bound-screenshot-export-on-ipad-webkit.md). **Date:** 2026-07

## Context

ADR-0050 keeps a drawing's paper locked through device rotation and presents it upright,
contain-fit, and centered. The production renderer inherited that view by resizing all 48 live tile
canvases to the new viewport, applying a transformed context to each, and replaying the drawing.
JavaScript completed in 2–3 ms, but MobileSafari presented a 56–57 ms frame on the 12.9-inch iPad
Pro. The page visibly froze even though the engine's own measure looked fast.

The generic interaction gate is a requestAnimationFrame interval at or below 32 ms, derived from the
observed 60 Hz display cadence. P95 remains expected near 9 ms on this iPad. Rotation is unusual
because iPadOS itself contributes a 20–31 ms transition frame, leaving almost no budget for app-side
surface work.

Playwright can emulate the viewport, DPR, orientation angle, paper lock, and functional behavior,
but it does not reproduce the physical iPad's WebKit compositor flush. Appium's XCUITest orientation
endpoint supplies a repeatable physical-device rotation without requiring someone to turn the iPad.
The authoritative probe records orientation/resize events, `engine.resize`, canvas backing-store
assignments, and animation-frame intervals before and after the request.

Serial diagnostic trials changed one surface family at a time:

| Trial                                                         | Max gap ms | Finding                                                               |
| ------------------------------------------------------------- | ---------: | --------------------------------------------------------------------- |
| Baseline, portrait to landscape                               |         57 | Fail; engine JavaScript was 3 ms                                      |
| Baseline, landscape to portrait                               |         56 | Fail; engine JavaScript was 2 ms                                      |
| Suppress every canvas backing resize                          |         34 | Diagnostic pass; invalid presentation                                 |
| Suppress 32 crayon-preview canvases                           |      43–44 | Improvement, but still a fail                                         |
| Suppress 16 normal-ink canvases                               |         54 | Ink surfaces alone were not the dominant family                       |
| Suppress all 48 live tile canvases                            |         39 | Improvement, but still a fail                                         |
| Suppress only the aggregate input canvas                      |      32–36 | Misleading: tiles still derived their old geometry from that canvas   |
| Separate viewport geometry; retain a 1×1 input bitmap         |      51–54 | Input surface was not causal once tile geometry stayed correct        |
| CSS-present the locked paper; perform zero tile reallocations |      27–30 | Pass in both directions; no app-induced long frame                    |
| Same CSS presentation with coloring art and ink               |         31 | Pass; page and stroke remained centered and aligned                   |
| Rotate a blank canvas, whose hidden tiles re-adopt            |         24 | Pass; hidden backing stores did not trigger the visible-surface cliff |
| Undo rotated ink to blank, synchronous re-adoption            |         49 | Fail; hidden state had not reached the compositor before reallocation |
| Re-adopt two animation frames after hiding                    |      32–34 | Borderline; variable failure remained                                 |
| Also defer hidden crayon-preview backing allocation           |         24 | Pass                                                                  |
| First crayon stroke after lazy allocation                     |         30 | Pass; five touched preview tiles allocated and rendered correctly     |
| Rotate the committed crayon stroke                            |         20 | Pass                                                                  |
| Three rotated settled-tile screenshot saves                   |       9–12 | Pass; full-resolution PNG path remained frame-bound                   |
| Colored crayon returning to its original orientation          |    96, 138 | Fail; unchanged tiles were hidden and replayed                        |
| Cache the unchanged Magic sheet, retain tile replay           |        136 | Fail; engine resize fell from 92 to 4 ms, but crayon replay flushed   |
| Preserve an unchanged tile layout, rerasterize Magic sheet    |      28–29 | Pass; no replay scratch surfaces                                      |
| Five more colored-crayon rotations with preserved tile layout |      23–32 | Pass; P95 remained 9 ms                                               |

The alternatives were:

* **Keep replaying into resized viewport tiles.** Functionally complete, including drawing into the
  temporary letterbox margins, but it necessarily invalidates dozens of attached WebKit canvas
  surfaces together and misses the frame gate.
* **Lower the DPR or export scale.** ADR-0085 and ADR-0088 already rejected the visible quality
  loss, and the surface cliff is not proportional enough to pixel count to make this reliable.
* **Resize surface families in separate frames.** This avoids one large flush only if the old image
  remains visible while new buffers are built. It requires a second 48-canvas layer or a full-page
  snapshot, temporarily doubles graphics memory, and reintroduces the full-surface synchronization
  class the tiled renderer was built to avoid.
* **Rebuild off-DOM and swap.** Still requires a second complete tile set, must reconcile strokes
  made during the rebuild, and makes an ordinary rotation depend on an asynchronous migration.
* **CSS-present the existing paper-sized tiles.** The tiles already contain the exact upright paper
  at full resolution. One composited transform supplies the same contain-fit presentation without
  mutating their graphics backings.

## Decision

The production tiled renderer keeps live tile pixels in upright paper coordinates through a locked
rotation. `DrawingCanvas.svelte` wraps all ink and crayon tiles in `.live-paper-view`, sized to the
paper and transformed with the same CSS matrix used by the paper sheet and coloring overlay.
`engine.ts` continues computing `paperView` and inverse-mapping pointer coordinates, but it does not
resize, transform, or replay tiled surfaces while the paper is locked. The legacy `/dev/engine`
renderer retains its context-transform implementation.

The related invariants are:

* The transparent `#drawingCanvas` remains a full-CSS-size pointer receiver, but its bitmap is 1×1
  in tiled production. A separate backing-pixel `viewport` owns pointer scaling, edge guards, paper
  view computation, and stale-resize detection. Tile geometry is passed explicitly to
  `resizeTiledRenderer`; it never derives from the input bitmap.
* Locked tiled contexts stay in paper coordinates. Existing strokes and new inverse-mapped strokes
  land in the same paper-sized tiles, while CSS supplies presentation. Rotating back removes the CSS
  transform and restores the original pixels without replay or resampling.
* The letterbox margin is not paper and is no longer drawable in tiled production. A contact that
  begins outside the transformed paper is ignored and creates no undo command. This removes a
  feature whose committed pixels were already cropped on rotating back or exporting. The legacy
  harness retains its historical drawable-margin behavior because it still owns a viewport canvas.
* A blank rotation still re-adopts the new viewport. Its tiles are hidden, so normal-ink backings
  can resize below the frame gate. Undo/clear-to-blank first paints those tiles hidden, then
  re-adopts after two animation frames; resizing them in the same turn as the hide reproduces the 49
  ms stall.
* `resizeTiledRenderer` treats identical backing dimensions and render scale as a no-op. Returning a
  nonempty paper to its original orientation therefore removes the CSS presentation transform
  without hiding and replaying the already-correct tiles. Replaying one colored crayon stroke
  created ten temporary canvases and two 96/138 ms frames despite unchanged output.
* Hidden crayon-preview canvases carry no committed pixels and are not resized. The first crayon op
  allocates only the intersecting bottom/top preview pairs. A preview that is visible during a
  resize remains eager so an in-progress pass can replay.
* `captureTiledSnapshot` no longer requires an identity paper view. Since CSS, not tile pixels,
  presents the rotation, a settled rotated tile snapshot is still the full upright paper and can use
  ADR-0088's worker composition path.
* The production rotation gate is max frame interval ≤32 ms in both directions with ink, plus blank,
  coloring-page, crayon, undo-to-empty, and screenshot regression cases. An `engine.resize` duration
  alone is not an acceptance metric.

## Consequences

* \+ Ink rotations measured 20–31 ms maximum with 9 ms P95, down from 56–57 ms, and perform zero
  live canvas backing assignments.
* \+ The drawing, paper texture, and coloring art remain upright, contain-fit, centered, and
  aligned. The existing full-resolution pixels are composited rather than replayed or softened.
* \+ Blank rotations, undo-to-empty, first crayon allocation, and rotated screenshot export all stay
  within the same 32 ms gate.
* \+ Repeated colored-crayon rotations stay frame-bound without rebuilding settled ink or its undo
  patches.
* \+ The 1×1 input bitmap removes an otherwise unused 4.8-million-pixel transparent backing store
  while preserving the full hit target and coordinate precision.
* \+ Rotated screenshot export can reuse settled tiles instead of falling back to a new full-page
  main-thread snapshot.
* − Letterbox margins are intentionally non-drawable in tiled production. This is a visible product
  rule, not an accidental culling side effect.
* − Tiled and legacy rotation presentation differ internally. Rotation behavior that concerns the
  production layer structure needs a real-route Playwright test; the legacy engine harness alone is
  insufficient.
* − The first crayon stroke after a resize allocates touched preview tiles. The measured five-tile
  gesture passed at 30 ms, but future changes that touch many tiles at pointerdown need a physical
  iPad regression run.
* − Empty-paper re-adoption is delayed by two rendered frames after undo or clear. The canvas is
  already visibly blank; only the removal of the temporary paper letterbox waits.

## Reproducing the Rotation Trials

Build and serve the production route with performance marks:

```sh
npm run perf:build
npm run perf:serve
```

Connect Appium 3's XCUITest driver to the physical iPad and load the Mac's LAN preview URL in
MobileSafari. The probe must use a trusted native stroke before rotating; synthetic DOM input does
not exercise the same WebKit surface lifecycle. Record:

1. `requestAnimationFrame` intervals from before the orientation request through at least three
   seconds after it.
2. `orientationchange`, `screen.orientation.change`, window resize, and visual viewport resize
   timestamps.
3. `engine.resize` marks.
4. Every HTML canvas `width`/`height` setter, tagged as input, normal tile, crayon preview, magic
   source, or auxiliary export surface.
5. The input and live-tile dimensions after settling.

Run portrait→landscape and landscape→portrait separately. Then repeat with no ink, a coloring page
plus ink, a committed crayon stroke, and undo of the only rotated stroke. The app's own work starts
about 150 ms after the web resize event because the web target uses the resize-settle debounce; the
largest interval anywhere in the observation window is still the score.

For surface-family isolation, temporarily intercept the `HTMLCanvasElement` width and height setters
in the page before the orientation request. Suppress exactly one tagged family and restore the
descriptors after the trial. Do not interpret input-canvas suppression while tile geometry is still
derived from `canvas.width`: that leaves the tiles at their old dimensions and confounds two
variables.

Functional preflight remains in Playwright:

```sh
npm run test:e2e -- --grep "rotation-lock|rotating with ink|crayon stroke previews"
```

Playwright validates the transformed layer, pointer mapping, undo history, coloring-page alignment,
and the non-drawable margin contract. It cannot approve the physical frame gate. After a rotation
change, also rerun trusted pen, crayon, Magic, screenshot, and undo probes so a local improvement
cannot regress ADR-0085, ADR-0086, or ADR-0088.
