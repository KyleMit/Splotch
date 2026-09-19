# ADR-0169: Flush the History Fold's Canvas Raster to the GPU on Android Chrome

**Status:** Active **Date:** 2026-09

## Context

Once history is deeper than the undo window, `foldOldestCommand` (`tiledRenderer.ts`, ADR-0086)
replays the oldest command into the offscreen history-base tiles. It runs once for every 1.5 s of
idle. On Android Chrome after 30 paced crayon scribbles, the first undo froze the screen for about
1.4 s (issue #2072). No undo JavaScript explained it: `engine.undo` took at most 14 ms.

A Chrome trace attributed the freeze to the fold, which rasterizes but never flushes:

* Each fold's 2D raster calls reached the renderer's GPU channel only as deferred ordering barriers.
* Nothing flushed the channel while the page sat idle, because no visible canvas changed. The GPU
  process stayed idle through all ten folds.
* The frame that presented the undo flushed the channel. The GPU then had to run every fold before
  that frame could appear. The same backlog awaits the first stroke after any such pause.

The evidence is in `docs/scratchpad/perf/2026-09-18-issue-2072-android-fold-flush/`.

Alternatives considered:

* **A 1-px `getImageData` after each fold.** It flushes, but only by waiting for the GPU on the main
  thread. PR 2070 measured the same readback on Android as a synchronous block of about the
  backlog's full size.
* **`createImageBitmap`.** It was measured and does not flush the channel. An ImageBitmap on the
  same context needs no cross-context sync token.
* **Folding in a worker (`OffscreenCanvas`).** A separate command stream would keep the backlog out
  of the undo frame. That is a large renderer change for one flush.
* **Deferring the base raster until a repaint needs it.** Folded ops would accumulate without bound,
  which is the memory the fold exists to cap.
* **Leaving it alone.** Every pause that folds would keep landing on the next action.

## Decision

Each fold runs inside `withCanvasRasterFlush` (`web/src/lib/drawing/canvasRasterFlush.ts`):

* It lazily creates one 1×1 WebGL context per page, with no alpha, depth, stencil, or antialiasing.
  It creates the context before the fold queues any raster, because creating a context waits for
  whatever the channel already holds.
* After the fold, it issues one `clear` and one `flush`. Chromium sends every deferred message on
  the channel with it, so the GPU runs the fold while the page is still idle.

The flush is neither a readback nor a wait. WebGL is used only as a flush primitive here. Nothing is
drawn with it, so this does not reopen ADR-0153's rejected WebGL crayon renderer.

It applies only to Android web Chrome: `isAndroidBrowser()` and not
`__IS_CAPACITOR__ && isNative()`. That is the one runtime where it was measured. The native WebView
cannot run the measuring workload (`/dev` is excluded from native bundles). iOS keeps its own
undo-ghost settle (`inkMotion.ts`), and desktop keeps the unflushed path.

## Consequences

* \+ On the device, the longest undo-phase interval fell from a median of 1,400 ms to 25.7 ms, over
  5 fresh runs against 5 of main. Whole-session late-frame cost fell by 1.29 s. Pixels and retained
  history were byte-identical.
* \+ The action after a folding pause now waits for at most one fold's raster, not every fold of the
  pause.
* − The GPU work now overlaps the idle frame after each fold. The worst idle frame grew by about one
  refresh: 67 → 83 ms for crayon and 17 → 33 ms for pen.
* − It depends on observed Chromium behaviour: a WebGL flush sends the whole channel. That is not a
  specified contract. If Chromium changes it, the flush becomes a no-op and the stall returns
  without an error. Only a physical-device capture would notice.
* − Each Android Chrome page holds one extra 1×1 WebGL context. A coarse GPU-process memory sample
  (2 runs against 2) found no increase beyond run-to-run spread.
* − The native Android WebView likely pays the same stall. The glaze-direct pipeline showed it at
  250 ms in Chrome. It stays unflushed until someone measures it there.
