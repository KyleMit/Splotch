# ADR-0088: Keep iPad Screenshot Export Frame-Bound with Disposable Offscreen Canvases

**Status:** Active — amends [ADR-0015](0015-capped-dpr-canvas-rendering.md) for saved-image quality
and complements [ADR-0085](0085-tiled-live-canvas-for-ipad-webkit.md). **Date:** 2026-07

## Context

The live tiled renderer and tiled undo history made drawing and undo responsive on the physical
iPad, but the Screenshot Button still froze the page. The original path replayed the drawing into an
`HTMLCanvasElement`, composed a second 2× output canvas, encoded it with
`HTMLCanvasElement.toBlob('image/png')`, and decoded the resulting full-resolution PNG into a
full-screen polaroid animation. On a 1,282×934 CSS-pixel iPad at 2× export scale, the 2,564×1,868
PNG encode blocked animation frames for 241–265 ms.

Screenshot export uses the same generic interaction gate as theme changes: a `requestAnimationFrame`
interval above 32 ms is a long frame. Total save completion may exceed one frame if drawing remains
responsive throughout. Saved-image correctness independently requires a lossless PNG, the full
upright paper rather than the letterboxed visible viewport, a minimum 2× export scale, paper
texture, theme treatment, and coloring-page line art.

Thirty-one serial isolations separated encoding, preview, surface allocation, and cleanup costs.
Each architecture was applied alone and backed out before the next unless marked retained. “Max gap”
is the largest `requestAnimationFrame` interval after the Screenshot Button click on the same
physical iPad. Rapid stress trials started a new save approximately every 1.1 seconds;
normal-cadence trials waited four seconds. Typical ranges exclude a separately reported cleanup
outlier.

| #  | Isolated strategy                                                 | Max gap ms      | Result                                                   |
| -- | ----------------------------------------------------------------- | --------------- | -------------------------------------------------------- |
| 01 | Production `HTMLCanvasElement.toBlob('image/png')` baseline       | 241–265         | Fail                                                     |
| 02 | Request WebP from the HTML canvas                                 | 237–258         | Fail; Safari returned PNG                                |
| 03 | JPEG at quality 0.95                                              | 128–144         | Fail and lossy                                           |
| 04 | Fresh worker + `OffscreenCanvas.convertToBlob('image/png')`       | 10–16; 118–578  | Smooth normally; periodic graphics-memory cleanup        |
| 05 | Cache the encoder worker                                          | 10–18; 578–606  | Worker startup was not the cleanup source                |
| 06 | Hide the full-resolution polaroid preview                         | 9–17            | Located a second independent decode/composition cost     |
| 07 | Generate a small PNG preview in the worker                        | 214–220         | Fail; WebKit still synchronized image decode             |
| 08 | Draw a 640 px preview canvas on the main thread                   | 247–472         | Fail                                                     |
| 09 | Decode a 320 px resized `ImageBitmap` preview                     | 179–249         | Fail                                                     |
| 10 | Worker PNG plus placeholder polaroid                              | 88–96           | Fail; overlay graphics competed with worker encoding     |
| 11 | Remove only the polaroid flash                                    | about 94        | Fail                                                     |
| 12 | Remove animation but retain a static polaroid frame               | about 94        | Fail                                                     |
| 13 | Remove the full-screen polaroid overlay                           | 9–13            | Retained in favor of local button feedback               |
| 14 | Animate only the Screenshot Button camera icon                    | 9–15            | Retained                                                 |
| 15 | Pure-JavaScript PNG + `CompressionStream` in the worker           | 11–16; 539      | Compression was not the cleanup source                   |
| 16 | Explicitly zero both main-thread export canvases after save       | 71–79           | Fail; moved cleanup onto every interaction               |
| 17 | Explicitly zero only the worker's `OffscreenCanvas`               | 9–16; 443–459   | Fail; periodic cleanup remained                          |
| 18 | Pool two main-thread HTML canvases                                | 79–94           | Fail; reuse forced synchronization on every save         |
| 19 | Reduce only screenshot output to 1.5×                             | 9–14; 414       | Fail under stress and degraded saved-image quality       |
| 20 | Compose strokes, paper, texture, and overlay on one HTML canvas   | 9–14; 781       | Halved allocation but only delayed cleanup               |
| 21 | Single HTML canvas at four-second cadence                         | 9–12; 78        | Fail; a sixth save still crossed the frame gate          |
| 22 | Retain one main HTML canvas and one worker offscreen canvas       | 76–91           | Fail; reuse synchronized graphics on every save          |
| 23 | Retain only the main HTML canvas                                  | 71–89           | Fail; the worker allocation was not the per-save stall   |
| 24 | Fresh main `OffscreenCanvas` plus fresh worker `OffscreenCanvas`  | 9–13            | Pass; 15 rapid free-draw saves                           |
| 25 | Production implementation, 20 rapid free-draw saves               | 9–17; P95 9     | Pass                                                     |
| 26 | Production implementation, 15 rapid light-overlay saves           | 9–15; 93–591    | Fail; line-art surfaces exhausted graphics memory        |
| 27 | Pure-JavaScript PNG with a fresh worker and light overlay         | 9–18; 289       | Fail; native PNG compression was not the cliff           |
| 28 | Transfer the composed snapshot with `transferToImageBitmap()`     | 85–101; 514     | Fail; zero-copy transfer synchronized every save         |
| 29 | Production implementation, ten light-overlay saves at 4 s cadence | 9–13; P95 9–10  | Pass; 3,927,856-byte lossless PNG                        |
| 30 | Production implementation, five dark-overlay saves at 4 s cadence | 12–15; P95 9–12 | Pass; 2,567,186-byte lossless PNG                        |
| 31 | Production cooldown, 20 rapid dark-overlay button taps            | 20; P95 9       | Pass; seven saves and thirteen suppressed duplicate taps |

The retained free-draw production run generated the same 1,379,984-byte PNG on every trial. Typical
completion was 194–282 ms. The twentieth encode took 1,068 ms, but animation frames remained at 9 ms
throughout: worker throughput varied, while the drawing UI no longer froze. On the same drawing, the
injected HTML- and offscreen-snapshot paths produced byte-identical PNGs.

A full-page coloring overlay creates more graphics pressure than free drawing. The offscreen
architecture remained frame-bound at normal user cadence, but rapid unrestricted saves eventually
forced a 591 ms MobileSafari graphics cleanup. A four-second post-save cooldown prevented that
surface backlog: a 20-tap dark-overlay stress run made seven real saves, suppressed thirteen
duplicate taps, and held every frame at or below 20 ms.

The key distinction was not simply “use a worker.” An HTML canvas snapshot followed by
`createImageBitmap` normally moved encoding off-thread but accumulated WebKit graphics surfaces
until a later save paid a 400–800 ms cleanup cliff. Retaining or explicitly resizing a surface made
WebKit synchronize on every save. A disposable main-thread `OffscreenCanvas` avoided the DOM canvas
surface lifecycle, while a disposable worker `OffscreenCanvas` avoided retained-surface
synchronization.

## Decision

Screenshot export uses one disposable `OffscreenCanvas` snapshot at the final export dimensions when
the API exists:

1. `engine.ts` creates the snapshot synchronously before the compositor module's dynamic import and
   replays strokes at `currentExportScale()`. Synchronous capture preserves the save-on-delete race
   contract: clearing the live drawing immediately afterward cannot blank the pending export.
2. `exportDrawing.ts` composes paper texture and the opaque paper color behind those strokes with
   `destination-over`, then draws coloring-page line art above them. It does not allocate a second
   output canvas.
3. `pngEncoder.ts` converts the finished surface to an `ImageBitmap` and transfers it to one cached
   module worker. `pngEncoder.worker.ts` creates a fresh `OffscreenCanvas` for that request and
   calls `convertToBlob({ type: 'image/png' })`.
4. Worker and bitmap failures terminate the cached worker and fall back to the browser's canvas
   encoder. HTML canvas remains a feature-detected fallback for engines without `OffscreenCanvas`.
5. The full-screen polaroid preview is removed. `screenshotFeedback.ts` immediately animates the
   existing camera icon, so feedback does not decode or composite the just-created PNG.
6. `screenshot.ts` continues coalescing concurrent Screenshot Button taps into one active save.
7. After a successful save starts, `screenshot.ts` suppresses further Screenshot Button taps for the
   four-second interval exported by `screenshotTiming.ts`. A failed save remains immediately
   retryable.

Do not pool, cache, resize-to-zero, or explicitly release either export canvas as an optimization.
Those intuitive lifetime controls are the configurations that caused 70–94 ms per-save stalls or
periodic 400–800 ms cleanup cliffs on MobileSafari. The cached object is the worker process, not its
canvas.

The export scale remains independent from ADR-0015's 1.5× live rendering cap. `exportScale.ts` keeps
the lossless saved PNG at `max(devicePixelRatio, 2)`, so the live-canvas performance tradeoff does
not soften paper texture or line art in saved work.

Safari and iPadOS 16.4 added Offscreen Canvas 2D support, matching Splotch's browser and native iOS
floor. The path remains guarded because native Android can run an independently updated WebView and
because a failed worker must not turn the Screenshot Button into a no-op.

## Consequences

* \+ Screenshot interaction improved from 241–265 ms blocked frames to a 9 ms frame P95 and 20 ms
  maximum in the worst-case coloring-page button-mash test.
* \+ Saved output remains a full-resolution, lossless, 2× PNG with the same paper, texture, theme,
  strokes, and coloring-page composition.
* \+ Encoding throughput no longer controls drawing responsiveness; even a one-second worker encode
  produced no long frame.
* \+ Snapshot capture still precedes the first `await`, preserving save-on-delete correctness.
* \+ The worker and compositor stay out of the initial drawing-route preload graph.
* − The large full-screen polaroid animation is replaced by smaller camera-button feedback.
  Restoring any PNG preview requires its own physical-iPad frame-budget proof.
* − The main and worker threads briefly hold full-resolution offscreen surfaces concurrently. They
  must remain disposable even though pooling appears to reduce allocation.
* − Repeated Screenshot Button taps within four seconds of a successful save are intentionally
  ignored so MobileSafari can reclaim the full-page PNG surfaces.
* − The compatibility fallback can still block on engines whose main-thread canvas encoder is slow.
  The supported Safari/iPadOS floor takes the offscreen worker path.
* − Completion time is intentionally not a hard gate. A save can finish slowly under device pressure
  as long as UI frames remain below the 32 ms interaction threshold.

## Re-attempting the Architectures

### Authoritative Screenshot Measurement

Use the production `/` route from a `PERF_MARKS` build on the physical iPad:

1. Draw at least one trusted pen stroke so the Screenshot Button is enabled.
2. Replace `HTMLAnchorElement.prototype.click` only for the measurement window so Safari does not
   open twenty download dialogs. Record the generated blob type and byte count before suppressing
   the anchor.
3. Start a `requestAnimationFrame` loop, wait two frames, then click the Screenshot Button.
4. Stop 100 ms after the PNG reaches `URL.createObjectURL`.
5. Record completion time, largest frame interval, and pooled frame P95.
6. First bypass the production cooldown and repeat at least 15 times at approximately one-second
   cadence to expose graphics cleanup behavior. Then restore the cooldown and repeat at least 20
   button taps. A cleanup strategy that passes one save is insufficient.

Verify separately that an unsuppressed user tap downloads or saves the PNG. Re-run trusted pen,
crayon, and magic strokes plus undo and theme switching after any export architecture change. Test
both free drawing and light- and dark-theme coloring overlays: free drawing alone did not reveal the
line-art graphics-memory cliff.

### Encoding Isolation

Temporarily intercept `HTMLCanvasElement.prototype.toBlob` and log source dimensions, requested
type, callback time, and subsequent frame gaps. Safari accepts a WebP request but returns the
specification-mandated PNG fallback; check `blob.type` rather than assuming the request succeeded.

To distinguish PNG compression from graphics cleanup, replace the worker encoder with an RGBA scan
plus `CompressionStream('deflate')`. A similar periodic cliff means compression is not causal. The
pure-JavaScript experiment produced smaller files but still stalled at the same allocation cadence.

### Preview Isolation

Suppress the full-screen preview without changing export. If frame gaps fall below the gate, the
PNG's display decode/composition is independently expensive. Test preview alternatives one at a
time: worker-resized PNG, main-thread canvas thumbnail, resized `createImageBitmap`, static overlay,
and animation-free overlay. All five failed on the measured iPad.

The retained feedback never references the PNG. It restarts a class animation on the existing
Screenshot Button icon. If product direction requires a preview again, capture a video and frame
trace on the physical iPad; desktop Playwright does not reproduce WebKit's graphics synchronization.

### Canvas Lifetime Isolation

Compare four lifetimes without changing resolution or PNG encoding:

1. Fresh HTML canvas per main snapshot and fresh worker offscreen canvas.
2. Retained main HTML canvas with `clearRect`.
3. Retained worker offscreen canvas with `clearRect`.
4. Explicitly set completed canvases to 0×0.

Retained surfaces cause a 70–94 ms synchronization on nearly every save. Explicit release causes a
similar immediate stall or merely shifts the periodic cliff. Do not score only total encode time:
the failing configurations can complete quickly while still missing animation frames.

### Offscreen Snapshot Isolation

For the smallest experimental seam, temporarily return `new OffscreenCanvas(width, height)` from the
snapshot factory while leaving replay, composition, `createImageBitmap`, worker code, export scale,
and feedback unchanged. Confirm exact PNG byte equality against the HTML snapshot on the same
drawing. The offscreen snapshot must still be created before the compositor's dynamic import so
save-on-delete captures the pre-clear state.
