# ADR-0088: Keep iPad Screenshot Export Frame-Bound with Settled Live Tiles

**Status:** Active — amends [ADR-0015](0015-capped-dpr-canvas-rendering.md) for saved-image quality,
complements [ADR-0085](0085-tiled-live-canvas-for-ipad-webkit.md), and is amended by
[ADR-0089](0089-css-presented-tiled-paper-on-rotation.md) for rotated settled tiles; bounded
polaroid feedback amended 2026-08-02 and 2026-08-09; worker context-loss recovery added by
[ADR-0110](0110-single-replay-worker-canvas-context-recovery.md); trusted-press preparation amended
2026-08-17. **Date:** 2026-07

## Context

The live tiled renderer and tiled undo history made drawing and undo responsive on the physical
iPad, but the Screenshot Button still froze the page. The original path replayed the drawing into an
`HTMLCanvasElement`, composed a second 2× output canvas, encoded it with
`HTMLCanvasElement.toBlob('image/png')`, and decoded the resulting full-resolution PNG into a
full-screen polaroid animation. On a 1,282×934 CSS-pixel iPad at 2× export scale, the 2,564×1,868
PNG encode blocked animation frames for 241–265 ms.

Screenshot export uses the same generic interaction gate as theme changes: a `requestAnimationFrame`
interval above 33.5 ms is a long frame. Total save completion may exceed one frame if drawing
remains responsive throughout. Saved-image correctness independently requires a lossless PNG, the
full upright paper rather than the letterboxed visible viewport, a minimum 2× export scale, paper
texture, theme treatment, and coloring-page line art.

The first thirty-one serial isolations separated encoding, preview, surface allocation, and cleanup
costs. Each architecture was applied alone and backed out before the next unless marked retained.
“Max gap” is the largest `requestAnimationFrame` interval after the Screenshot Button click on the
same physical iPad. Rapid stress trials started a new save approximately every 1.1 seconds;
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

A later brush-complete regression pass falsified that conclusion. The retained architecture passed
pen and uncomplicated coloring-page exports, but a fresh Magic drawing blocked for 288–354 ms at
exactly 2×, and a crayon drawing still blocked for 202 ms at 1.99× and 144 ms at 1.5×. The
full-resolution main-thread snapshot—not PNG compression or merely the 2× dimensions—was still a
shared graphics backing store that the worker forced WebKit to synchronize.

The follow-up serial trials kept the same physical iPad, 1,282×934 CSS-pixel paper, exact blob-type
check, and 33.5 ms frame gate:

| #  | Isolated strategy                                                    | Max gap ms      | Result                                                    |
| -- | -------------------------------------------------------------------- | --------------- | --------------------------------------------------------- |
| 32 | Exact-2× production snapshot with fresh Magic ink                    | 354; repeat 288 | Fail                                                      |
| 33 | Pure-JavaScript full-canvas PNG in the worker                        | 401             | Fail; native PNG compression was not causal               |
| 34 | Compose coloring overlay inside the worker                           | 268             | Fail; another worker graphics surface increased pressure  |
| 35 | Scan full `ImageBitmap` as 64-row bands in the worker                | 311             | Fail; first access synchronized the full source backing   |
| 36 | Crop 64-row bitmaps from one full exact-2× source                    | 309–389         | Fail; the first crop synchronized the full source backing |
| 37 | Magic export at 1.5×, 1.75×, 1.875×, 1.95×, and 1.99×                | 9 each          | Pass for Magic only                                       |
| 38 | Magic export at 1.995× and 1.999×                                    | 907; 942        | Fail; exposed a sharp WebKit surface-size cliff           |
| 39 | Render exact-2× 64-row surfaces directly, then batch worker transfer | 83–91           | Fail; pending surfaces flushed together                   |
| 40 | Transfer and encode one 64-row surface per frame                     | 66–67           | Fail; first worker pixel readback remained blocking       |
| 41 | Reduce direct surfaces to 16 rows                                    | 71              | Fail; gap was not proportional to row height              |
| 42 | Native-PNG each row surface, decompress, and reassemble              | 61              | Fail; avoided `getImageData` but not first graphics sync  |
| 43 | Render 512×64 2D tiles and reassemble losslessly                     | 60–72           | Fail; first `createImageBitmap` flushed pending tile work |
| 44 | 1.99× full snapshot with crayon                                      | 202             | Fail; near-2× was not brush-complete                      |
| 45 | 1.5× full snapshot with crayon                                       | 144             | Fail and visibly reduced saved resolution                 |
| 46 | Transfer the 16 existing settled live tiles; transparent worker PNG  | 16              | Pass; exact 2×                                            |
| 47 | Settled tiles plus paper, texture, and dark coloring overlay         | 20              | Pass; exact 2×                                            |
| 48 | Production Magic, three normal-cadence saves                         | 17 / 17 / 17    | Pass; P95 9–11                                            |
| 49 | Production crayon, three normal-cadence saves                        | 23 / 16 / 16    | Pass; P95 9–11                                            |
| 50 | Production pen and light-theme Magic coloring-page saves             | 21; 24          | Pass                                                      |
| 51 | Final branch: 15 Magic saves, then five crayon saves                 | 25 worst        | Pass; P95 9–13                                            |

The produced light-theme PNG was decoded only for validation and measured exactly 2,564×1,868. That
validation decode itself caused a 64 ms UI gap, reaffirming why product feedback must never display
the just-created full-resolution PNG.

The final-build regression pass also kept coloring-page selection at a 26 ms maximum frame with its
first visible paint at 47 ms, three dark-to-light switches at a 31 ms maximum and 9 ms P95, and Undo
at 1 ms of engine work with a 9 ms maximum interaction frame. One 85 ms screenshot interval followed
a deliberately timed-out instrumentation run; it did not recur in the next 15 Magic or five crayon
saves. Preserve a normal-cadence multi-save run so probe cleanup is not mistaken for a periodic
product cliff.

The key distinction was not simply “use a worker.” An HTML canvas snapshot followed by
`createImageBitmap` normally moved encoding off-thread but accumulated WebKit graphics surfaces
until a later save paid a 400–800 ms cleanup cliff. Retaining or explicitly resizing a surface made
WebKit synchronize on every save. A disposable main-thread `OffscreenCanvas` avoided the DOM canvas
surface lifecycle in the initial trials, but Magic and crayon later proved that its newly rendered
full-page backing still synchronized. The reliable distinction is whether the UI process ever
creates that full-page drawing surface: the retained path transfers the live renderer's already
settled small tiles and assembles the only full page inside the worker.

### Bounded polaroid amendment (2026-08-02)

Issue #694 revisited screenshot celebration feedback after the settled-tile export path was in
production. Three implementations used the same 1.9-second transform-and-opacity animation, four
trusted activations on the same physical iPad running iPadOS 26.5, one warmup, three scored repeats,
and a three-second observation window:

| Preview source                    | First P95 ms | Ready P95 ms | Post P95/max ms | Raw max ms | Result |
| --------------------------------- | -----------: | -----------: | --------------: | ---------: | ------ |
| Resize the completed PNG blob     |            5 |          236 |           17/49 |         49 | Fail   |
| Raster visible live tiles locally |            7 |          230 |           17/19 |         26 | Pass   |
| Downscale the worker composition  |            7 |          234 |           17/19 |         24 | Pass   |

The worker preview won despite a 4 ms slower ready P95 than the local-tile candidate. It kept raster
work off the UI thread, had the lowest raw maximum, and derived the photograph from the same
composited surface as the saved PNG, so paper texture, theme treatment, and coloring-page overlay
cannot drift between feedback and output. The completed-blob decode remains forbidden: its 49 ms
maximum crossed the action gate.

The final worker-only build then passed a ten-activation confirmation with one warmup and nine
scored repeats: first-frame P95 10 ms, ready P95 242 ms, post-action frame P95 17 ms, post-action
maximum 23 ms, and raw maximum 28 ms across 1,153 scored and 1,745 raw frames.

The first retained implementation attached the polaroid only to that matched-scale worker export.
Scale-mismatch compatibility exports — notably a 1× desktop display saving at the 2× export floor —
therefore kept only the camera-button pulse. The 2026-08-09 amendment adopts the same bounded
local-tile technique for that fallback: before replay allocates the full export snapshot, the engine
requests image bitmaps from the settled live tiles at their existing scale. `exportDrawing.ts`
composites those bitmaps into only the bounded preview surface, adds the same paper, texture, theme,
and overlay treatment, and hands that bitmap to the unchanged polaroid animation. The saved PNG
still takes the compatibility replay path at the full export scale. Active pointers and platforms
missing the transferable canvas APIs continue to receive only camera-button feedback.

The isolated 17 ms frame P95 and 26 ms raw maximum for the local-tile candidate motivated this
choice but do not measure the integrated fallback. That trial did not include the subsequent
main-thread compatibility replay and composition, and the measured iPad itself takes the
matched-scale worker path. The combined fallback has Chromium and WebKit correctness coverage at a
simulated 1× device scale; it remains unmeasured on physical scale-mismatch hardware.

### Trusted-press preparation amendment (2026-08-17)

Issue #978 moved lazy screenshot-module loading from trusted `pointerup` to the matching
`pointerdown`. Once that module resolves, it checks the active-save and cooldown gates before
requesting an immutable snapshot during the press. Activation, visible feedback, persistence, and
cooldown still begin only after the guarded tap completes; a drag, cancellation, or destroyed
control closes any prepared tile bitmaps and never saves. This preserves the user's ability to
cancel a press while using the remaining contact interval for snapshot work without making a
suppressed press pay the capture cost.

On the same physical iPad running iPadOS 26.5, one warmup plus five scored native-touch saves passed
with first-frame P95 8 ms, ready P95 236 ms, post-action P95 17 ms, and a 29 ms maximum. The bounded
preview became available about 85 ms earlier than the click-time baseline, matching the trusted
press interval. The remaining save-ready duration is asynchronous worker encoding and persistence;
ADR-0090 keeps readiness as an observed upper bound rather than a frame gate.

If another pointer keeps drawing while the camera is pressed, the prepared image includes that
stroke only through the snapshot point; later ink remains on the paper but not in that PNG. This is
deliberate: preparation needs an immutable ordering boundary, and pressing the camera defines the
captured moment. Waiting for every concurrent drawing pointer to lift would make one child's held
finger block another child's completed save.

## Decision

At matched live/export scale with an identity paper view, screenshot export reuses the tiled live
renderer's already-settled pixels instead of replaying into a new full-page surface:

1. Before the compositor module's first `await`, `captureTiledCanvasSnapshot()` invokes
   `createImageBitmap()` on all 16 live tile canvases and records each tile's paper position. For a
   trusted Screenshot Button press, `pointerdown` loads the lazy screenshot module; once resolved,
   that module rejects already-suppressed work before requesting this preparation. The preparation
   is consumed only when the guarded tap activates, and cancellation closes the requested bitmaps.
   Other export callers prepare immediately when they request the blob. The promises may settle
   later, but invoking them synchronously also preserves the save-on-delete race: clearing the live
   drawing immediately afterward cannot blank the requested snapshots.
2. `exportDrawing.ts` resolves those tile snapshots plus optional paper-texture and coloring-overlay
   bitmaps. It passes them directly to the cached encoder worker; the main thread never owns a new
   full-page export surface.
3. `pngEncoder.worker.ts` creates the only full-resolution export `OffscreenCanvas`, paints the
   opaque paper and repeating texture, scales and positions the settled stroke tiles, applies the
   light/dark coloring-page blend, then calls `convertToBlob({ type: 'image/png' })`.
4. The fast path is deliberately narrow: export scale must equal live render scale, no pointer may
   still be active, and Worker, `OffscreenCanvas`, and `createImageBitmap` must exist. ADR-0089
   keeps rotated tile pixels in the full upright paper and applies presentation through CSS, so a
   rotated settled snapshot is eligible too. A scale mismatch still needs vector replay rather than
   interpolated live pixels and retains the disposable full-snapshot architecture.
5. `screenshotFeedback.ts` animates the existing camera icon immediately after a guarded tap
   activates. Snapshot preparation may already be running from `pointerdown`, but no visible
   feedback, preview, or save occurs until activation. When screenshot export uses the tiled worker
   path, that worker starts the full-resolution PNG encode, downsamples the canonical composited
   canvas to a preview no wider than 480 CSS pixels at most 2× backing scale, and transfers the
   resulting `ImageBitmap`. On a scale-mismatch compatibility export, the engine separately
   snapshots the settled live tiles before replay and `exportDrawing.ts` composites them directly
   into the same bounded preview dimensions on the main thread. A one-second deadline bounds that
   optional preview wait; on expiry the save proceeds, already-resolved and late-arriving tile
   bitmaps close, and feedback remains the camera-icon pulse. The main thread copies a completed
   bounded bitmap into a decorative canvas, closes it, and runs the 1.9-second polaroid flight with
   transform and opacity. Preview creation or delivery failure does not cancel the save; an active
   pointer or missing transferable-canvas APIs retain the camera-icon feedback without a polaroid.
   The isolated local-tile measurements above are candidate evidence, not an integrated-path result.
6. `screenshot.ts` owns at most one prepared press and continues coalescing concurrent Screenshot
   Button taps into one active save.
7. After a successful save finishes, `screenshot.ts` suppresses further Screenshot Button taps for
   the four-second interval exported by `screenshotTiming.ts`. A failed save remains immediately
   retryable, while a suppressed tap gets a smaller camera-button pulse instead of disappearing.
8. Every worker request has a 15-second deadline. A silent worker death terminates the cached
   encoder and releases pending requests; full-canvas exports fall back to the main-thread encoder,
   while a failed tiled export remains immediately retryable.
9. `exportCompositor.ts` owns smoothing, paper/texture order, and contain-fit overlay placement for
   both the compatibility and tiled-worker paths. `pngEncoderProtocol.ts` is the single typed
   request/response vocabulary, including the optional intermediate preview response. Unit tests
   execute the real tiled compositor, and a 2× browser test reaches the matched-scale worker path,
   observes the polaroid, and waits for its cleanup.

Do not first assemble the live tiles on the main thread, render a new set of export tiles all at
once, pool a full-resolution export canvas, resize one to zero, or explicitly release it as an
optimization. Those configurations caused 60–94 ms per-save stalls or periodic 400–800 ms cleanup
cliffs on MobileSafari. The cached object is the worker process, not its full-page canvas.

The export scale remains independent from ADR-0015's 1.5× live rendering cap. `exportScale.ts` keeps
the lossless saved PNG at `max(devicePixelRatio, 2)`, so the live-canvas performance tradeoff does
not soften paper texture or line art in saved work.

Safari and iPadOS 16.4 added Offscreen Canvas 2D support, matching Splotch's browser and native iOS
floor. The path remains guarded because native Android can run an independently updated WebView and
because the tiled path requires the full set of transferable canvas APIs.

## Consequences

* \+ Screenshot interaction improved from 241–401 ms blocked frames to a 9–13 ms frame P95 and 25 ms
  maximum across repeated pen, crayon, and Magic coloring-page saves.
* \+ Saved output remains a full-resolution, lossless, 2× PNG with the same paper, texture, theme,
  strokes, and coloring-page composition.
* \+ Encoding throughput no longer controls drawing responsiveness; even a one-second worker encode
  produced no long frame.
* \+ Tile snapshot invocation still precedes the first `await`, preserving save-on-delete
  correctness.
* \+ The worker and compositor stay out of the initial drawing-route preload graph.
* \+ The celebratory polaroid is restored without decoding the saved PNG or constructing another
  full-page surface. Its bounded worker preview passed the physical-iPad action gate at 17 ms frame
  P95, 23 ms post-action maximum, and 28 ms raw maximum in the final ten-activation run. The
  scale-mismatch fallback uses the same bounded local-tile mechanism without inheriting that
  isolated candidate's measurements.
* \+ The affected 2× iPad path no longer creates a full-resolution drawing surface on the main
  thread. Only the worker owns the full composed output.
* − Active pointers and devices whose live and export scales differ retain the replay fallback. They
  preserve vector quality but can still hit the older compatibility path's main-thread graphics
  cost.
* − Repeated Screenshot Button taps within four seconds of a successful save are intentionally
  ignored so MobileSafari can reclaim the full-page PNG surfaces.
* − The compatibility fallback can still block on engines whose main-thread canvas encoder is slow.
  A tiled-worker failure rejects that save instead of reconstructing another full-page surface on
  the UI thread; the next user tap creates a fresh worker.
* − The integrated compatibility preview plus full-resolution replay has browser correctness
  coverage but no physical scale-mismatch frame-budget result. The measured physical iPad takes the
  matched-scale worker path.
* − Completion time is intentionally not a hard gate. A save can finish slowly under device pressure
  as long as UI frames remain below the 33.5 ms interaction threshold.

## Re-attempting the Architectures

### Authoritative Screenshot Measurement

Use the production `/` route from a `PERF_MARKS` build on the physical iPad:

1. Draw at least one trusted pen stroke so the Screenshot Button is enabled.
2. On web, replace `HTMLAnchorElement.prototype.click` only for the measurement window so Safari
   does not open twenty download dialogs. On native, install `window.__screenshotSaveSink` for the
   measurement window. The sink is consumed only by a `PERF_MARKS` build and records export
   completion without writing to Photos or reaching a permission sheet. Record the generated blob
   type and byte count before suppressing persistence.
3. Start a `requestAnimationFrame` loop, wait two frames, then click the Screenshot Button.
4. Stop after the PNG reaches `URL.createObjectURL` and at least three seconds after the click. The
   latter bound observes the complete polaroid flight when preview feedback is present.
5. Record completion time, largest frame interval, and pooled frame P95.
6. First bypass the production cooldown and repeat at least 15 times at approximately one-second
   cadence to expose graphics cleanup behavior. Then restore the cooldown and repeat at least 20
   button taps. A cleanup strategy that passes one save is insufficient.

Verify separately that an unsuppressed user tap downloads or saves the PNG. Re-run trusted pen,
crayon, and magic strokes plus undo and theme switching after any export architecture change. Test
both free drawing and light- and dark-theme coloring overlays: free drawing alone did not reveal the
line-art graphics-memory cliff.

The native persistence sink is not a rendering-control seam: it replaces only the external gallery
write after the production PNG exists. Normal native builds compile out its branch and property
name, and the release post-build scan rejects either surviving in the client bundle. Do not
intercept Capacitor's private `nativePromise` transport; that couples the runner to plugin internals
and can suppress unrelated native calls.

### Settled Live-Tile Isolation

The smallest proof for the retained architecture does not use the Screenshot Button:

1. Finish a trusted crayon or Magic stroke and select all `canvas[data-live-tile]` elements.
2. Invoke `createImageBitmap()` on every tile in the same synchronous turn, recording each tile's
   backing-pixel `x`/`y` position. Do not first draw them into a shared canvas.
3. Transfer the tile bitmaps to a disposable worker. Create the full-size `OffscreenCanvas` only
   there, draw the tiles at their recorded positions, and encode PNG.
4. First test transparent strokes alone. The crayon prototype produced a 2,564×1,868 PNG with a 16
   ms maximum gap.
5. Add the paper color, repeating texture, and coloring overlay inside the same worker. The complete
   dark-theme prototype measured 20 ms. If this addition fails, isolate texture and overlay
   separately before changing tile capture.

Production capture has two load-bearing guards. An active pointer can leave crayon ink in preview
overlays rather than the settled main tiles. A live/export scale mismatch would interpolate settled
pixels instead of replaying vectors at output resolution. Fall back to the existing replay snapshot
for both. ADR-0089 removed the rotation guard because CSS presents the locked paper without changing
the upright tile pixels.

Invoking all tile snapshots before the dynamic import is also load-bearing. Moving
`createImageBitmap(tile.canvas)` after an `await` lets save-on-delete clear the source first. Store
the promises immediately; awaiting those already-requested snapshots later is safe.

### Full-Surface and Export-Scale Cliff

To remeasure WebKit's dimension cliff, override only `currentExportScale()` and use one fresh Magic
stroke on the same paper. Scales from 1.5× through 1.99× held at 9 ms, while 1.995× and 1.999×
jumped to 907–942 ms. Do not infer a shippable scale from Magic alone: crayon still stalled for 202
ms at 1.99× and 144 ms at 1.5×. A resolution cap is therefore neither brush-complete nor the
retained fix.

Direct export strips fail for a related but distinct reason. Cropping strips from one full surface
synchronizes that source on the first crop. Rendering fresh strips avoids the full source but queues
new graphics work across every strip; the first pixel read or `createImageBitmap` then flushes the
aggregate pending work. Row height, incremental worker messages, native per-strip PNG, and 2D tiles
all moved the gap but did not clear the 33.5 ms gate. Existing live tiles work because their
rendering settled as the child drew, before the Screenshot Button interaction begins.

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

The retained feedback never references the PNG. It immediately restarts a class animation on the
existing Screenshot Button icon, then uses either the worker-downscaled canonical composition or the
bounded settled-live-tile fallback for the polaroid. If product direction requires another preview
architecture, capture a video and frame trace on the physical iPad; desktop Playwright does not
reproduce WebKit's graphics synchronization.

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
