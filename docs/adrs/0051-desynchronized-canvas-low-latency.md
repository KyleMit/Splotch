# ADR-0051: `desynchronized` Canvas for Lower Ink Latency — Tried and Rejected

**Status:** Rejected (tried 2026-07; reverted the same day) **Date:** 2026-07

## Context

The dominant on-device cost in the drawing path is raster/paint of the capped-DPR canvas, not JS
(ADR-0032), but that measurement doesn't capture **presentation latency** — how long after a finger
moves the ink reaches the glass. A normally-composited 2D canvas is synchronized with the
compositor, so ink inherits its frame cadence and queueing, visible as a small lag most noticeable
on Android.

`CanvasRenderingContext2D` exposes a `desynchronized: true` context-creation hint (the "low-latency
canvas") that decouples the canvas from the compositor, letting Chromium present ink sooner — often
via a hardware **overlay plane**. It is Chromium-only; other engines ignore the unknown settings
key.

We reviewed the two pixel-readback paths and judged them safe (exports rebuild from the undo log in
`exportDrawing`; the post-erase blank check draws onto a separate scratch canvas in `emptyScan`
before reading). We shipped `canvas.getContext('2d', { desynchronized: true })` in
`initDrawingCanvas` and validated: `npm run check` clean, `npm run perf:web` no compute regression
(59.5 FPS, `engine.draw` 0.5 ms avg / 3.6 ms max), all canvas-readback E2E flows green.

## Decision

**Rejected.** On the Android WebView the entire canvas rendered **opaque black** immediately after
load.

Root cause: this canvas is **transparent by design**. Under the paper view (ADR-0050) the
`handmade-paper` texture lives on a `.paper-sheet` element and the coloring page on an overlay
`<img>`, both *beneath* the "always transparent" canvas; the child sees them through it. A
`desynchronized` 2D canvas gets promoted to a hardware overlay plane that does **not**
alpha-composite with the DOM content stacked below it — so the transparent canvas presents as solid
black, hiding the paper and overlay.

This is not something the readback review would have caught, and it does not reproduce on the
throttled headless `perf:web` harness (no real display / overlay-plane path) — only an on-device
Android run surfaced it. There is no way to keep the low-latency overlay while also compositing the
sheet-below-canvas stack, so the hint is fundamentally incompatible with the ADR-0050 architecture.
Reverted to a plain `getContext('2d')`, with a code comment at the call site so the experiment isn't
repeated.

## Consequences

* **−** No presentation-latency win from this hint; Android ink latency stays as it was. A future
  latency improvement would have to come from elsewhere (e.g. reducing the capped-DPR raster cost,
  ADR-0015) or from a canvas architecture that isn't transparent-over-DOM.
* **+** Documented dead end: `desynchronized` requires an opaque canvas that owns its own
  background. Adopting it would mean moving the paper texture and coloring overlay *into* the canvas
  (painting them as the bottom layer of every frame/replay), a large change to the ADR-0050 paper
  view and every paint path — not worth the marginal latency hint.
* **+** Reinforces the profiling-skill lesson: the `perf:web` harness catches compute regressions,
  not compositor/presentation behavior. Canvas-compositing changes must be checked on a real Android
  device before landing.

Relates to the transparent-canvas-over-paper design in **ADR-0050** (the reason the hint fails) and
the capped-DPR compositing tradeoff in **ADR-0032**/ **ADR-0015**.
