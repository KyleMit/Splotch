# Issue 1196 — browser frame starvation on real devices

Investigation log for the seven-candidate campaign. Raw captures land in gitignored
`perf-profiles/`; this file keeps the numbers and the reasoning that outlive them.

## What the reported failure actually is

`lostFrameTimeShare` (`tools/perf/lib/real-screen-stats.mjs`) is not a paint metric. It is derived
from rAF deltas:

```
budgetMs      = min(p10 of all frame deltas, 16.67)
lateThreshold = budgetMs * 1.5
lostMs        = sum over deltas > lateThreshold of (delta - budgetMs)
share         = lostMs / sum(all in-contact deltas)
```

Two consequences that shape every candidate below:

* The budget is **derived per capture**. On the 120 Hz Galaxy S21 FE the observed beat is ~8.2 ms,
  so the late threshold is ~12.3 ms and the gate asks the browser to hold 120 fps to within 1%. On
  the iPad, Safari hands web content a 60 Hz beat, so the threshold is ~25 ms.
* Paint latency and lost-frame share measure different things. Every failing cell passes all three
  paint gates; the failure is entirely in rAF pacing.

## Baseline evidence (from the committed matrix, 2026-08-21)

| Target                    | Pen   | Crayon | Magic | Eraser |
| ------------------------- | ----- | ------ | ----- | ------ |
| iPad physical · web       | 2.5%  | 5.1%   | 2.7%  | 3.3%   |
| iPad physical · native    | 0.0%  | 2.0%   | 0.1%  | 0.3%   |
| Android physical · web    | 10.1% | 11.9%  | 12.0% | 31.7%  |
| Android physical · native | 0.0%  | 0.0%   | 0.0%  | 0.0%   |
| Android emulator · web    | 0.6%  | 0.0%   | 0.1%  | 0.5%   |

Android physical native records a **maximum** in-contact frame delta of 8.3–8.4 ms across a ~69 s
capture — no frame ever late. That is cleaner than a real display pipeline usually is, and it is the
reason candidate 6 exists: Android WebView drives rAF from the host app's Choreographer without the
compositor backpressure Chrome's BeginFrame source applies, so a WebView's rAF cadence can stay
perfect while presentation slips. The browser number may simply be the honest one.

Note also that both Android web and Android native captures fail the same three input-fidelity
checks (`cadence`, `coalescing`, `contactGeometry`), so the web-vs-native gap on that platform is
not an input-fidelity artifact.

## Candidates

1. **rAF-coalesced rasterization.** Today `draw()` rasterizes synchronously inside every
   `pointermove` (`web/src/lib/drawing/engine.ts`). `docs/PROFILING-IPAD.md` records 1.9–4.2 moves
   per painted frame on device — the engine repeats per-event work several times per presentable
   frame. Buffer points on the event and flush once per rAF.
2. **Viewport-adaptive live-tile grid.** ADR-0085 fixed a 4×4 grid from a 2732×1830 iPad backing
   store. A portrait phone paper is roughly 720×1560 backing pixels, so the same grid pays 48
   composited canvases to keep a 0.07 Mpx maximum surface — far below the measured 1.565 Mpx cliff.
3. **Crayon without `mix-blend-mode` live planes.** Crayon is the worst brush on every physical
   target and the only native-iPad failure. It owns 32 extra live canvases, 16 of them blended
   inside an `isolation: isolate` stacking context.
4. **Scribble touch guard scoped to WebKit.** The non-passive `touchstart`/`touchmove`
   `preventDefault()` pair exists only to release iPadOS Scribble. On Chromium it is pure
   main-thread touch routing cost.
5. **Opaque paper-in-canvas plus `desynchronized`.** ADR-0051 rejected the low-latency hint because
   the live canvas is transparent over the paper sheet. Moving the paper into the bottom tile layer
   removes that blocker. Chromium-only.
6. **Direct-CDP Android drawing-frame transport.** ADR-0092 moved Android browser *action* profiles
   off Appium because UiAutomator2/Chromedriver intermittently stopped presenting Chrome frames.
   Drawing cells still run over Appium.
7. **Evidence-based browser gate.** Measure the browser's own achievable floor with a no-op control
   in the same session, and set the browser-target gate from it rather than from native-quality
   capture.

## Results

Filled in as each candidate is measured.
