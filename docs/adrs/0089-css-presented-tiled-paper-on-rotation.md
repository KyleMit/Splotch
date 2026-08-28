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

The generic interaction gate is a requestAnimationFrame interval at or below 33.5 ms, derived from
two exact 60 Hz vsync intervals plus timer precision. P95 remains expected near 9 ms on this iPad.
Rotation is unusual because iPadOS itself contributes a 20–31 ms transition frame, leaving almost no
budget for app-side surface work.

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

The later full-action regression suite found two rotation paths that the original isolated
ink/coloring captures did not sequence together: rotate a paper immediately after clear, then draw
and return to the original angle after MobileSafari's viewport chrome settles. The blank path
reallocated all sixteen hidden normal-tile backings together. The return path sometimes changed the
restored viewport by a few CSS pixels, defeated the exact-size no-op, and replayed history even
though the paper had returned to its own angle. Both operations took 0–4 ms of JavaScript while
WebKit presented a much longer frame later.

These follow-up trials used the action-local scorer from ADR-0090. “Post max” excludes the frame
interval that began before MobileSafari delivered the orientation event; the action-to-first-frame
gate scores the app-owned remainder of that interval.

| Follow-up strategy                                              | Blank post max ms | Undo-clear max ms | Ink-return post max ms | Result                                      |
| --------------------------------------------------------------- | ----------------: | ----------------: | ---------------------: | ------------------------------------------- |
| Broad-suite baseline                                            |           111–129 |                 — |                    131 | Fail                                        |
| Detach the hidden paper wrapper during synchronous reallocation |           107–112 |                 — |                      — | Fail; allocation, not attachment, dominates |
| Allocate normal tiles only when reused                          |             17–23 |             91–97 |                  19–25 | Rotation pass; undo regression              |
| Allocate one hidden tile per frame, then rebuild patches        |             18–21 |                20 |                    240 | Blank/undo pass; return misclassified       |
| Also preserve paper on return despite viewport drift            |             17–23 |             17–19 |                  18–21 | Focused pass; late patch rebuild hit 68–74  |
| Keep patches stale; replay without recapture when undone        |             19–27 |             18–19 |                  19–21 | Pass; retained                              |

The retained three-repeat sequence measured first-frame P95 at 19–20 ms for the two blank
directions, 15–16 ms for the ink directions, 7 ms for undoing clear, and 8 ms for undoing the
restored older stroke. Every post-action frame P95 was 17 ms and every post-action maximum was at
most 27 ms. Trusted first-contact drawing also remained within the ADR-0085 gates: pen paint
P95/P99/max was 16/26/39 ms, crayon was 16/27/38 ms, and both recorded zero starvation.

The Android native matrix later exposed a second form of return drift. The restored viewport first
matched the paper, then settled about 5.5 CSS px shorter as system insets stabilized. Treating that
same-angle settle as a new paper reallocated all sixteen normal tiles and produced 33–50 ms frames.
Deferring an inactive Magic sheet alone left the tile stall; retaining the paper alone left 4–6
full-surface Magic mutations and the same stall. With both surface families preserved, five repeats
performed zero canvas backing mutations across all ten ink rotations. Nine directions topped out at
16.8 ms; one system-compositor interval was exactly two 60 Hz vsyncs (33.4 ms), while the app's
`engine.resize` work was 0.2 ms.

Physical iPad validation exposed the complementary event-order case: Mobile WebKit can deliver the
resized portrait/landscape geometry before `screen.orientation.angle` changes. Preferring the legacy
angle API did not solve it and still reassigned 32–48 normal tiles, producing 46–52 ms frames.
Locking when the viewport's portrait/landscape shape differs from the paper removed every surface
mutation. Across three repeats in both directions, physical iPad post-action P95 was 17 ms and max
was 22–26 ms. Android native retained zero surface mutations with P95 16.7–16.8 ms and max 33.3–33.4
ms. An isolated Mac WebKit cross-check passed ten rotations at P95 18 ms and max 19–24 ms.

The final discrete-action regression found that its trusted-stroke setup used enabled Undo as its
ink signal. Clear remains undoable while the canvas is blank, so the supposed with-ink rotation
could exercise the blank path. The runner instead uses enabled Screenshot, whose product state
tracks whether the canvas has pixels. A corrected Android-web trace confirmed real ink and zero
canvas backing mutations; `engine.resize` took 0.4–3.0 ms.

The later issue-1197 physical-iPad recapture found that the packaged native branch still bypassed
the resize-settle debounce. iPadOS delivered an initial resize while the drawing container retained
its old orientation layout, exposing a transient square 641×641 tile geometry before the screen
orientation signal settled. The native engine adopted that intermediate paper synchronously and
performed 64 backing assignments per ink rotation. `engine.resize` took only 3–5 ms, but WebKit
presented one 148–156 ms interval portrait-to-landscape and one 107–111 ms interval on every
landscape-to-portrait repeat. The earlier retained “native” pass had native Appium transport but an
HTTP `appUrl`, so it ran the web build's debounced engine rather than the packaged Capacitor branch.

Native now uses the same 150 ms trailing resize debounce as web. Ten scored physical-iPad repeats
then recorded zero canvas mutations in both ink directions: portrait-to-landscape measured 20 ms
first-frame P95 and 18/22 ms post-action P95/max; landscape-to-portrait measured 0 ms first-frame
P95 and 18/21 ms post-action P95/max. Blank, undo, and clear siblings passed. A fresh ten-repeat
Safari cross-check measured 19/20 ms and 19/22 ms post-action P95/max in the two ink directions. The
raw before/after corpus and its provenance are retained under
`perf-profiles/evidence/2026-08-28-issue-1197-rotation-recapture/`.

That trace also separated canvas work from orientation layout animation. Eight palette swatches
animated width and height because their interaction rule used `transition: all`, and the action
drawer animated its axis whenever the media query changed. Limiting palette transitions to visual
feedback properties and arming drawer geometry transitions only for an actual expand/collapse
reduced the rotation's active CSS transitions from seventeen to zero. Seven of eight focused
Android-web rotation cases passed; one ink landscape-to-portrait sample retained a 50 ms first fully
post-action viewport/layout frame while `engine.resize` took 0.4 ms and performed no backing
mutation. Mac WebKit passed both ink directions across three repeats at 21 ms maximum. Android-web
remains an advisory target under ADR-0090, so the isolated compositor/layout interval is a
cross-device watchpoint rather than evidence of a tiled-canvas regression.

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
rotation. `LiveSurface.svelte` wraps all ink and crayon tiles in `.live-paper-view`, sized to the
paper and transformed with the same CSS matrix used by the paper sheet and coloring overlay.
`engine.ts` continues computing `paperView` and inverse-mapping pointer coordinates, but it does not
resize, transform, or replay tiled surfaces while the paper is locked. The product and `/dev/engine`
share this implementation through `LiveSurface.svelte`; production-route rotation tests cover the
surrounding paper, coloring-art, and control composition.

The related invariants are:

* The transparent `#drawingCanvas` remains a full-CSS-size pointer receiver, but its bitmap is 1×1
  in tiled production. A separate backing-pixel `viewport` owns pointer scaling, edge guards, paper
  view computation, and stale-resize detection. Tile geometry is passed explicitly to
  `resizeTiledRenderer`; it never derives from the input bitmap.
* Locked tiled contexts stay in paper coordinates. Existing strokes and new inverse-mapped strokes
  land in the same paper-sized tiles, while CSS supplies presentation. Rotating back removes the CSS
  transform and restores the original pixels without replay or resampling.
* The letterbox margin is not paper and is not drawable. A contact that begins outside the
  transformed paper is ignored and creates no undo command. This removes a feature whose committed
  pixels were already cropped on rotating back or exporting.
* A blank rotation still re-adopts the new viewport. Its tiles are hidden, so normal-ink backings
  migrate one per animation frame. Undo patches from the previous geometry stay stale: rebuilding
  them together after migration caused a delayed 68–74 ms surface flush. An undo whose patch no
  longer fits replays the remaining vector history without recapturing every older patch. A new op
  that reaches a tile before migration finishes allocates that tile synchronously before snapshot
  capture or paint.
* `resizeTiledRenderer` treats identical backing dimensions and render scale as a no-op. Returning a
  nonempty paper to its original orientation therefore removes the CSS presentation transform
  without hiding and replaying the already-correct tiles. Replaying one colored crayon stroke
  created ten temporary canvases and two 96/138 ms frames despite unchanged output.
* A return to `paperAngle` remains locked only when its viewport stays within
  `PAPER_VIEWPORT_DRIFT_TOLERANCE_CSS_PX` of the paper. A viewport whose portrait/landscape shape
  differs from the paper also locks immediately, because Mobile WebKit can expose the resized
  geometry before its Screen Orientation angle settles. The paper is contain-fit and centered in
  minor system-inset drift instead of being rerasterized; a material same-orientation viewport
  resize re-adopts the paper.
* Every target settles resize events on the shared 150 ms trailing edge before deciding whether to
  adopt or present the paper. Native rotation can cross an intermediate layout size before iPadOS
  publishes its settled orientation, so a synchronous native resize would reintroduce the exact
  backing-store mutation this decision forbids. Pointer rect measurement still refreshes
  immediately.
* Hidden crayon-preview canvases carry no committed pixels and are not resized. The first crayon op
  allocates only the intersecting bottom/top preview pairs. A preview that is visible during a
  resize remains eager so an in-progress pass can replay.
* An inactive Magic sheet keeps its immutable captured snapshot through resize and only marks its
  geometry stale. Selecting Magic rasterizes the active fill or held gradient at the current paper
  geometry before the next stroke; active Magic remains eager during resize.
* `captureTiledSnapshot` no longer requires an identity paper view. Since CSS, not tile pixels,
  presents the rotation, a settled rotated tile snapshot is still the full upright paper and can use
  ADR-0088's worker composition path.
* The production rotation gate is max frame interval ≤33.5 ms in both directions with ink, plus
  blank, coloring-page, crayon, undo-to-empty, and screenshot regression cases. An `engine.resize`
  duration alone is not an acceptance metric.

## Consequences

* \+ Ink rotations measured 20–31 ms maximum with 9 ms P95, down from 56–57 ms, and perform zero
  live canvas backing assignments.
* \+ The drawing, paper texture, and coloring art remain upright, contain-fit, centered, and
  aligned. The existing full-resolution pixels are composited rather than replayed or softened.
* \+ Blank rotations, undo-to-empty, undoing clear and the restored older stroke after a blank
  rotation, first pen/crayon allocation, and rotated screenshot export all stay within their
  calibrated gates.
* \+ Repeated colored-crayon rotations stay frame-bound without rebuilding settled ink or its undo
  patches.
* \+ The 1×1 input bitmap removes an otherwise unused 4.8-million-pixel transparent backing store
  while preserving the full hit target and coordinate precision.
* \+ Rotated screenshot export can reuse settled tiles instead of falling back to a new full-page
  main-thread snapshot.
* − Letterbox margins are intentionally non-drawable in tiled production. This is a visible product
  rule, not an accidental culling side effect.
* \+ The dev harness and production route use the same CSS-presented tile implementation. Rotation
  behavior involving the production layer structure remains a real-route Playwright test concern.
* − The first crayon stroke after a resize allocates touched preview tiles. The measured five-tile
  gesture passed at 30 ms, but future changes that touch many tiles at pointerdown need a physical
  iPad regression run.
* − Empty-paper backing migration takes up to sixteen rendered frames after re-adoption. The blank
  paper's CSS geometry updates immediately, and each allocation remains below one frame. Undo
  patches captured before the geometry change are not rebuilt; undoing one replays the remaining
  retained history without patch recapture.

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
plus ink, a committed crayon stroke, and undo of the only rotated stroke. Also run the full
clear→blank rotation→undo clear→undo restored stroke→new stroke→clear→return→new ink→both rotations
sequence; it exercises the hidden-backing migration, stale undo-patch fallback, and viewport-drift
return paths that isolated ink rotation misses. The app's own resize starts about 150 ms after the
event because every target uses the resize-settle debounce.

Retain the raw frame interval that straddles input delivery, but do not attribute its pre-event
portion to the app. Gate its action-to-first-frame remainder at 33.5 ms, then gate every fully
post-action interval at 33.5 ms. Canvas width/height setter logging should show one normal tile per
frame during blank migration and zero normal-tile assignments when ink returns to `paperAngle`.

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
