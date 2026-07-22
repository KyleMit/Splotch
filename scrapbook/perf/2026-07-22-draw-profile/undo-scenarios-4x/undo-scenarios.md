# Undo scenario profile (snapshot stack, ADR-0066)

Target **web/dev-engine (headless Chromium — not WebKit/real GPU)** · device **ipad-pro-12.9**
(1024×1366 @ dsf 2) · refresh **120Hz** (frame budget **8.3 ms**) · CPU throttle **4×** · build
**production-preview (reused build)**

> Fidelity: long strokes are ~1200 ops (≈ 120Hz × stroke seconds) to mirror real input volume.
> Headless Chromium (Blink/V8) is **not** WebKit/JavaScriptCore or the iPad GPU — SwiftShader
> software rendering exaggerates full-canvas blits (the paper copy, restores, blob decodes) heavily
> — and CPU throttle models a slow CPU, not the tighter 8.3 ms ProMotion frame. Absolute ms want the
> on-device run (`scripts/perf/ipad-console-driver.js` / the `profiling` skill); this run is for
> stack behavior, op-volume scaling, and relative cost.

> Note: strokes are dispatched synchronously (to land exact op counts), so the draw phase is one big
> task — its FPS/long-task numbers in report.md are a harness artifact. The clean live-draw signal
> is **engine.draw avg** (per pointermove); the commit and undo costs below don't depend on pacing.

## Snapshot stack after drawing (getUndoDebug)

| Scenario                                                                   | Strokes | Snapshots | Live rasters | Blob bytes | Pending commands |
| -------------------------------------------------------------------------- | ------- | --------- | ------------ | ---------- | ---------------- |
| 22 long squiggles (~1200 ops each @ 120Hz), then undo all                  | 22      | 20        | 2            | 317 KB     | 0                |
| 22 short dot/dash strokes, then undo all                                   | 22      | 20        | 2            | 9 KB       | 0                |
| 22 mixed long+short strokes, then undo all                                 | 22      | 20        | 2            | 164 KB     | 0                |
| 22 five-finger drags (~2400 ops/command), then undo all                    | 22      | 20        | 2            | 5148 KB    | 0                |
| 22 pen back-and-forth scribbles (~1200 ops each), then undo all            | 22      | 20        | 2            | 146 KB     | 0                |
| 22 crayon long squiggles (~1200 ops each), then undo all                   | 22      | 20        | 2            | 1099 KB    | 0                |
| 22 crayon back-and-forth scribbles (mid-stroke pass splits), then undo all | 22      | 20        | 2            | 2030 KB    | 0                |

## Drawing cost (engine.draw + the stroke-end pipeline)

engine.commit wraps the whole stroke-end pipeline (paper copy → fold), so **commit max** is the
pointerup hitch the user feels; engine.snapshot isolates the paper copy inside it.

| Scenario                                                                   | draw() calls | draw total | snapshot copy max | **commit max (1 stroke end)** |
| -------------------------------------------------------------------------- | ------------ | ---------- | ----------------- | ----------------------------- |
| 22 long squiggles (~1200 ops each @ 120Hz), then undo all                  | 26378        | 1326.5 ms  | 126.8 ms          | **146.5 ms**                  |
| 22 short dot/dash strokes, then undo all                                   | 33           | 4.1 ms     | 89.5 ms           | **99.9 ms**                   |
| 22 mixed long+short strokes, then undo all                                 | 13222        | 517.6 ms   | 174.5 ms          | **186.7 ms**                  |
| 22 five-finger drags (~2400 ops/command), then undo all                    | 52690        | 2783.6 ms  | 1068.6 ms         | **1108.4 ms**                 |
| 22 pen back-and-forth scribbles (~1200 ops each), then undo all            | 26378        | 1325.0 ms  | 137.2 ms          | **159.5 ms**                  |
| 22 crayon long squiggles (~1200 ops each), then undo all                   | 26378        | 6636.7 ms  | 9.0 ms            | **139.5 ms**                  |
| 22 crayon back-and-forth scribbles (mid-stroke pass splits), then undo all | 26378        | 32454.3 ms | 7.5 ms            | **186.6 ms**                  |

## Undo cost (engine.undo)

| Scenario                                                                   | Undo steps | Total    | Avg / step | Max step |
| -------------------------------------------------------------------------- | ---------- | -------- | ---------- | -------- |
| 22 long squiggles (~1200 ops each @ 120Hz), then undo all                  | 20         | 112.7 ms | 5.6 ms     | 7.0 ms   |
| 22 short dot/dash strokes, then undo all                                   | 20         | 43.9 ms  | 2.2 ms     | 4.5 ms   |
| 22 mixed long+short strokes, then undo all                                 | 20         | 77.5 ms  | 3.9 ms     | 6.1 ms   |
| 22 five-finger drags (~2400 ops/command), then undo all                    | 20         | 621.7 ms | 31.1 ms    | 159.5 ms |
| 22 pen back-and-forth scribbles (~1200 ops each), then undo all            | 20         | 94.9 ms  | 4.7 ms     | 6.5 ms   |
| 22 crayon long squiggles (~1200 ops each), then undo all                   | 20         | 118.2 ms | 5.9 ms     | 6.9 ms   |
| 22 crayon back-and-forth scribbles (mid-stroke pass splits), then undo all | 20         | 96.1 ms  | 4.8 ms     | 6.5 ms   |

## History raster memory (the real undo cost — off the JS heap)

Each square raster is 2732×2732 → **28.5 MB**. Canvas backing stores are **not** counted by
performance.memory, so the JS-heap table below stays flat regardless of history — the raster figure
is the one that matters. Resident rasters = live snapshots + the paper, plus the encoded blob bytes.

| Scenario                                                                   | Rasters resident | Blob bytes | History memory |
| -------------------------------------------------------------------------- | ---------------- | ---------- | -------------- |
| 22 long squiggles (~1200 ops each @ 120Hz), then undo all                  | 2 + 1            | 317 KB     | 32.3 MB        |
| 22 short dot/dash strokes, then undo all                                   | 2 + 1            | 9 KB       | 28.5 MB        |
| 22 mixed long+short strokes, then undo all                                 | 2 + 1            | 164 KB     | 30.4 MB        |
| 22 five-finger drags (~2400 ops/command), then undo all                    | 2 + 1            | 5148 KB    | 55.0 MB        |
| 22 pen back-and-forth scribbles (~1200 ops each), then undo all            | 2 + 1            | 146 KB     | 31.7 MB        |
| 22 crayon long squiggles (~1200 ops each), then undo all                   | 2 + 1            | 1099 KB    | 33.1 MB        |
| 22 crayon back-and-forth scribbles (mid-stroke pass splits), then undo all | 2 + 1            | 2030 KB    | 33.6 MB        |

## JS heap (performance.memory — excludes canvas pixels; coarse, GC-dependent)

| Scenario                                                                   | After draw (history resident) | After undo-to-empty |
| -------------------------------------------------------------------------- | ----------------------------- | ------------------- |
| 22 long squiggles (~1200 ops each @ 120Hz), then undo all                  | 18.4 MB                       | 18.4 MB             |
| 22 short dot/dash strokes, then undo all                                   | 18.4 MB                       | 18.4 MB             |
| 22 mixed long+short strokes, then undo all                                 | 18.4 MB                       | 18.4 MB             |
| 22 five-finger drags (~2400 ops/command), then undo all                    | 18.4 MB                       | 18.4 MB             |
| 22 pen back-and-forth scribbles (~1200 ops each), then undo all            | 18.4 MB                       | 18.4 MB             |
| 22 crayon long squiggles (~1200 ops each), then undo all                   | 18.4 MB                       | 18.4 MB             |
| 22 crayon back-and-forth scribbles (mid-stroke pass splits), then undo all | 18.4 MB                       | 18.4 MB             |

---

See the `profiling` skill and ADR-0066 for how to read these.
