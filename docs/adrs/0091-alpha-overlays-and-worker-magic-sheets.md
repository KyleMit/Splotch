# ADR-0091: Keep Coloring-Page Selection Frame-Bound with Alpha Overlays and Worker Magic Sheets

**Status:** Active — amends [ADR-0043](0043-magic-brush-color-sheet-reveal.md),
[ADR-0052](0052-dark-mode-theme-tokens.md), and
[ADR-0087](0087-frame-bound-theme-switch-on-ipad-webkit.md); worker context-loss recovery added by
[ADR-0110](0110-single-replay-worker-canvas-context-recovery.md)

**Date:** 2026-07

## Context

The tiled renderer fixed continuous drawing, undo, screenshot, theme, and rotation stalls on the
physical iPad, but selecting a coloring page still crossed the discrete-action frame gate on the
iPad Pro simulator. Ten production-route web runs measured a 17 ms post-action frame P95 and a 50 ms
maximum. The action handler and overlay readiness completed quickly; WebKit paid the delayed cost
after JavaScript returned.

The generic action contract from ADR-0090 is a post-action frame P95 no greater than 20 ms and a
maximum no greater than 33.5 ms. The maximum admits two exact 60 Hz intervals (33.33 ms); the next
interval is a visible 50 ms freeze.

Two independent full-surface operations occurred after selection:

1. The opaque ink-on-white page image used `multiply` in light mode or `invert(1)` plus `screen` in
   dark mode. WebKit had to recomposite that full-page blend layer whenever the canvas below it
   changed.
2. The Magic fill decoded and rasterized into a paper-sized canvas on the UI thread, including the
   letterbox edge extension from ADR-0087. A child could see the page before this work completed,
   but the next frame still absorbed its surface allocation and draws.

Twenty serial trials isolated the costs. Each candidate was measured alone and backed out before the
next unless marked retained. The table reports the selected-page post-action maximum from ten
iPad-simulator web runs; the other columns are the final cross-target checks.

| #  | Isolated strategy                                              | Max gap ms | Result                                                   |
| -- | -------------------------------------------------------------- | ---------: | -------------------------------------------------------- |
| 01 | Production baseline                                            |         50 | Fail                                                     |
| 02 | OffscreenCanvas for the Magic sheet only                       |         40 | Fail                                                     |
| 03 | Rasterize the Magic sheet at source-image resolution           |         47 | Fail                                                     |
| 04 | Worker raster after main-thread `createImageBitmap`            |         45 | Fail                                                     |
| 05 | Suppress Magic-fill setup entirely                             |         37 | Fail; proved the overlay alone crossed the gate          |
| 06 | Also remove the overlay opacity transition                     |         36 | Fail                                                     |
| 07 | Opaque image with ordinary `normal` composition                |         27 | Timing pass, visually invalid because white paper stayed |
| 08 | Replace multiply with `darken`                                 |         37 | Fail                                                     |
| 09 | Alpha image with synchronous production fill                   |         38 | Invalid isolation; selector still left `darken` on paper |
| 10 | Alpha image with OffscreenCanvas fill                          |         38 | Invalid isolation; same selector mistake                 |
| 11 | Alpha image with worker raster from a main-thread bitmap       |         43 | Invalid isolation; same selector mistake                 |
| 12 | Worker fetch/decode plus alpha image                           |         39 | Invalid isolation; same selector mistake                 |
| 13 | Lossless alpha PNG plus worker fetch/decode                    |         37 | Invalid isolation; same selector mistake                 |
| 14 | Correct alpha PNG + normal composition + worker fetch/raster   |         28 | Pass                                                     |
| 15 | Lossless alpha WebP + normal composition + worker fetch/raster |         30 | Pass; retained representation                            |
| 16 | Disable only the worker under the passing alpha architecture   |         38 | Fail; proved both retained changes were necessary        |
| 17 | Generated dark alpha overlay + worker fetch/raster             |         27 | Pass                                                     |
| 18 | Final native iPad simulator                                    |         33 | Pass                                                     |
| 19 | Final native physical iPad                                     |         18 | Pass                                                     |
| 20 | Final macOS Playwright WebKit                                  |         19 | Pass                                                     |

Trials 9–13 are kept in the record because they expose an important reproduction gotcha: a broad CSS
patch matched a crayon tile selector instead of `.paper-view`. They are not evidence against alpha
overlays. The corrected trials changed the exact paper selector and first restored the crayon blend
declarations.

## Decision

Full-screen coloring-page presentation uses generated alpha-native overlays and ordinary source-over
composition:

* `tools/asset-gen/bin/gen-coloring-overlays.mjs` derives a transparent black `{page}.overlay.webp`
  from the pen outline and a transparent white `{page}.dark.overlay.webp` from the chalk outline. An
  absent chalk deliberately falls back to the pen source.
* `books.ts` returns those presentation assets from `pageOverlayImage()`. Opaque outline/chalk
  images remain the source of truth for generation and picker thumbnails.
* `DrawingCanvas.svelte` applies neither `filter` nor `mix-blend-mode` to the full-page overlay. The
  old per-pointer transform nudge is removed because source-over composition immediately reflects
  canvas changes below it.
* Screenshot export draws the already-themed alpha overlay source-over on both the main-thread and
  worker compositors; it does not invert or blend the image again.

Magic-sheet preparation runs outside the UI thread when the platform supports the required APIs:

* `magicSheet.worker.ts` accepts either a coloring-page fill or a blank-page rainbow. It fetches and
  decodes a fill before rasterizing the contain-fitted image plus direct-source edge extensions; a
  rainbow is painted directly from its gradient specification. Both paths allocate `OffscreenCanvas`
  in the worker and transfer an `ImageBitmap` back.
* `magicBrush.ts` publishes a transferred bitmap only if its request identity and active source
  still match. A superseded bitmap is closed. A worker error rejects pending requests, tears down
  the worker, and uses the existing synchronous rasterizer so Safari 16.4-floor correctness does not
  depend on the optimization.
* A pending worker sheet remains unready. Magic operations recorded before it arrives retain the
  existing unresolved-sheet behavior and repaint once the bitmap is published.

The generator quantizes only the alpha plane in steps of 8 before lossless WebP encoding. Its
catalog-wide guard rejects an output whose reconstructed composite differs from its opaque source by
more than 4/255 in any channel. This reduces the 192 generated overlays to 14.0 MB without a visible
UI or export change. The detailed asset-pipeline decision is
[`alpha-line-art-overlays.md`](../../tools/asset-gen/docs/alpha-line-art-overlays.md).

The native static export removes the 200 full-resolution opaque outline/chalk sources after the
alpha overlays and thumbnails have been copied. They remain committed under `web/static` for the
offline asset pipeline and web deployment, but no native runtime path loads them. The native
coloring asset directory therefore shrinks from about 53 MB to 34 MB despite adding the overlays.

## Consequences

* \+ Physical-iPad native page selection is frame-bound at 17 ms P95 / 18 ms max, down from the
  simulator reproduction's 50 ms maximum.
* \+ Light and dark overlays have no full-page blend/filter dependency, and drawing no longer
  damages that layer on every pointer event.
* \+ Magic preparation preserves full 2× paper resolution and edge-extension behavior while moving
  allocation, decode, and drawing off the UI thread.
* \+ The worker path has unit coverage for successful transfer, superseded-result disposal, and
  synchronous fallback. Asset conversion has an executable per-channel equivalence bound.
* \+ macOS WebKit and native iPad simulator selection remain inside the shared action gates.
* − Every page orientation now has two additional committed presentation assets. A pen or chalk
  change must rerun `npm run gen:coloring-overlays` and refresh the asset manifest.
* − The web deployment retains both opaque pipeline sources and transparent presentation assets;
  only native builds strip the unused sources.
* − Magic fill availability becomes asynchronous across a worker boundary. New code must preserve
  request identity, bitmap ownership, and the synchronous failure path.
* − An `ImageBitmap` can now be the immutable `MagicSheetSnapshot.canvas`; callers must treat the
  snapshot as a `CanvasImageSource`, not assume an `HTMLCanvasElement` context exists.

## Amendment (2026-08): Present Decoded Overlays Without a Full-Page Fade

A later physical-iPad campaign reproduced a Capacitor-only 79–80 ms frame 39 ms after page
selection, after the alpha overlay had decoded and the dialog was closed. The same production build
passed MobileSafari at 9 ms first-frame P95, 17 ms post-action P95, and 17 ms maximum. Suppressing
Magic-sheet setup, pre-promoting the overlay with `will-change: opacity`, and the existing worker
architecture did not remove the native tail.

Disabling only the 180 ms opacity transition reduced the six-run native result from 5/17/80 ms to
5/17/17 ms for first-frame P95, post-action P95, and maximum. All six page-visible checks passed,
and the decoded alpha art, source-over composition, layout, theme, and export output were unchanged.

The decoded overlay therefore appears at full opacity when it becomes ready. A full-paper opacity
fade is not part of the page-selection contract: WebKit may turn its repeated alpha composition into
a delayed multi-frame stall even when the layer is pre-promoted. Re-attempting a reveal animation
requires the same focused physical Safari and Capacitor comparison, with the final art and all
coloring/Magic feature checks retained.

## Amendment (2026-08): Rasterize Blank-Page Rainbows in the Worker

A desktop cross-browser action sweep found that choosing the Magic brush on a blank page still
allocated and painted its paper-sized rainbow canvas synchronously. At 1512×982 and 2× DPR, Chromium
repeatedly produced a 25.4 ms post-action P95 while Firefox stayed near 9 ms. The page-fill path
already used the worker established by this ADR; only the generated-rainbow source bypassed it.

The same worker now accepts a discriminated image-fill or gradient request. Blank-page Magic
selection holds the chosen gradient immediately, leaves the sheet unready, and publishes the
transferred bitmap only if that exact request and gradient remain current. Clearing, resizing, or
selecting a coloring page invalidates an in-flight gradient request, and a late bitmap is closed.
Worker failure retains the synchronous gradient rasterizer as the compatibility fallback.

The focused Chromium action sweep moved Magic-brush selection to 5.0 ms first-frame P95, 9.2 ms
post-action P95, and 9.2 ms maximum. The matching Firefox sweep remained within the shared gates.
This extends the existing worker-sheet decision to both Magic sources; it does not change pattern
coordinates, source priority, retained-op recoding, or snapshot ownership.

## Re-attempting the Architectures

### Authoritative Coloring-Selection Measurement

Build with `PERF_MARKS=true PUBLIC_ENABLE_DEV_HARNESS=true`, then run only the `coloring` action
through `perf:ipad:actions` for ten repeats. The action opens the book picker, opens the first book,
selects its first page, waits for `#coloringOverlay.overlay-ready`, and scores the following frame
window. Report first-frame P95, ready P95, post-action frame P95, and maximum separately.

Use the iPad simulator web build for rapid isolation, then approve on the native physical iPad and
crosscheck macOS WebKit. A simulator-only pass cannot approve a compositor change; the physical
native result above is the retained gate.

### Overlay Isolation

Suppress `setColorSheet()` while leaving the real page image and ready gate in place. If the maximum
remains above 33.5 ms, the overlay is independently expensive. Then set only
`.paper-view { mix-blend-mode: normal; }`; the resulting opaque white rectangle is deliberately
visually invalid but proves whether blend composition is causal.

When changing selectors, inspect the final diff before measuring. `.live-crayon-tile` must retain
`darken`, `.live-crayon-tile-top` must retain `normal`, and only `.paper-view` is the coloring
overlay wrapper.

### Magic-Sheet Isolation

Keep the alpha overlay fixed and toggle only `workerRasterSupported()` to return false. The retained
architecture measured 30 ms with the worker and 38 ms without it. A worker design that first calls
`createImageBitmap` on the main thread is insufficient; the worker must own fetch, decode, canvas
allocation, contain-fit draw, and direct-source edge extension.

Exercise three races before retaining a worker change:

1. Page A resolves after page B becomes active: close A's bitmap and publish only B.
2. A worker error occurs for the current page: terminate, synchronously rasterize, and repaint.
3. Resize invalidates a pending raster: its eventual bitmap must be closed rather than published
   with stale bounds.

### Asset and Export Equivalence

Run `npm run gen:coloring-overlays -- <category>`. The generator must decode each output with
`hasAlpha: true` and enforce the 4/255 maximum reconstructed-channel error. Run
`npm run check:assets`, the asset-gen unit suite, export tests, and the coloring proof sheet for
every affected category. Verify a light and dark screenshot/export; source-over must be the only
overlay composition in both export paths.

### Native-Export Pruning

Run an instrumented `npm run build:cap`. `web/build/coloring` must contain `.overlay.webp`,
`.dark.overlay.webp`, and thumbnail/fill assets but no full-resolution `.outline.webp` or
`.chalk.webp`. Do not move the opaque sources out of `web/static`: the deterministic generators,
audits, and proof sheet still consume them there.
