# ADR-0051: Opt the Drawing Canvas Into `desynchronized` for Lower Finger-to-Ink Latency

**Status:** Active
**Date:** 2026-07

## Context

The dominant on-device cost in the drawing path is the raster/paint of the
capped-DPR canvas, not JS — `engine.draw` runs well under a frame and there are
no long tasks (the profiling baseline, ADR-0032). What that measurement does
*not* capture is **presentation latency**: how long after a finger moves the ink
actually appears on the glass. A normally-composited 2D canvas is synchronized
with the compositor, so ink waits for the next compositor frame and inherits the
compositor's queueing — visible as a small but real lag between fingertip and
line, most noticeable on Android.

`CanvasRenderingContext2D` exposes a `desynchronized: true` context-creation
hint (the "low-latency canvas" path) that decouples the canvas from the
compositor's frame cadence, letting the browser present ink sooner — on Chromium
often via an overlay plane. It is Chromium-only; other engines ignore the
unknown settings key and render identically.

Two caveats had to be cleared before adopting it — a desynchronized canvas is
GPU-backed and can present frames ahead of the compositor, so any code that
**reads pixels back** from it is where a race could hide:

1. **Exports.** `exportDrawing.snapshotStrokes` rebuilds the picture in paper
   space from the undo log (`replayAll`) onto a fresh canvas — it never reads the
   live GPU canvas. Safe by construction (already true for the ADR-0050 paper
   view).
2. **The post-erase blank check.** `emptyScan.scanCanvasIsEmpty` never calls
   `getImageData` on the main canvas either: it `drawImage`s the main canvas onto
   a small `willReadFrequently` scratch canvas and reads *that*. The `drawImage`
   read resolves the latest ink before the copy, so the empty flag is computed
   against committed content, not a stale frame.

The alternatives were to leave it off (the status quo — measurable lag we can
cheaply remove on the platform where it's worst) or to gate it behind
`__IS_CAPACITOR__`/Android. Gating buys nothing: the hint is a no-op wherever
it's unsupported, so a build-time branch would only add a platform fork the
project's conventions steer away from (CLAUDE.md: prefer no platform branch when
none is needed).

## Decision

Create the visible drawing context with `canvas.getContext('2d',
{ desynchronized: true })` in `initDrawingCanvas` (`lib/drawing/engine.ts`).
Everything downstream is unchanged: the same context, the same paint paths, the
same paper-space rebuild for exports, the same scratch-canvas blank scan. No
platform branch — the hint is a universal progressive enhancement that only
Chromium acts on.

Recorded in the API risk register (`docs/COMPATIBILITY.md`) as a
Chromium-only, silently-ignored hint with identical rendering below it.

## Consequences

- **+** Lower finger-to-ink latency on Chromium/Android at zero code cost — the
  interaction toddlers spend the entire session doing.
- **+** No hard dependency: unsupported engines (Firefox, Safari/WebKit — so the
  iOS WKWebView too) ignore the key and behave exactly as before. Nothing to
  feature-detect, nothing to fall back to.
- **+** The two pixel-readback paths (export, blank scan) were already isolated
  from the live GPU canvas, so correctness is unaffected — verified by the E2E
  flows that read the canvas back (screenshot-gating, undo-to-blank,
  rotate-until-blank) and by the perf harness's `engine.scanEmpty` marks.
- **−** The latency win itself is a compositor/presentation effect and does **not
  show up** in the `npm run perf:web` CDP trace (headless, no real display) or in
  the engine's `performance.mark` timings — those confirm *no compute
  regression*, not the win. Measuring the actual latency improvement requires an
  on-device Android run (`perf:android`) or manual observation; treat the benefit
  as validated by the platform contract, not by the throttled-desktop harness.
- **−** Desynchronized canvases can exhibit brief tearing under extreme paint
  load. Not observed in the Splotch draw path (single canvas, no per-frame full
  clears), noted for the future.

Builds on the export (**ADR-0034**) and blank-scan design that keep pixel
readback off the live canvas; complements the capped-DPR compositing tradeoff in
**ADR-0032**/**ADR-0015** (this addresses presentation latency, that addresses
raster cost — orthogonal).
