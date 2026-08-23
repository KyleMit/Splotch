# Splotch performance profile

| Setting        | Value                                                    |
| -------------- | -------------------------------------------------------- |
| Captured       | 2026-07-22T16:25:57.098Z                                 |
| Target         | web/dev-engine (headless Chromium — not WebKit/real GPU) |
| Device         | ipad-pro-12.9                                            |
| CPU throttle   | 4×                                                       |
| Build mode     | production-preview                                       |
| Session length | 153077.0 ms                                              |

## Frame health

| Metric                  | Value |
| ----------------------- | ----- |
| Avg FPS (whole session) | 1.8   |
| Frames                  | 84    |
| Long frames (>32 ms)    | 37    |

| Long tasks (>50 ms) | Value      |
| ------------------- | ---------- |
| Count               | 22         |
| Total               | 45237.0 ms |
| Longest             | 43568.0 ms |

## Where the main thread went (approximate — nested events may overlap)

| Bucket                     | Time        |
| -------------------------- | ----------- |
| Main-thread busy (RunTask) | 125220.9 ms |
| Scripting                  | 6558.2 ms   |
| Rendering / layout         | 68.6 ms     |
| Painting / raster / GPU    | 15.5 ms     |

## Engine hot paths (user-timing marks)

| Operation       | Count  | Total      | Avg      | Max      |
| --------------- | ------ | ---------- | -------- | -------- |
| engine.draw     | 171457 | 44093.8 ms | 0.3 ms   | 849.5 ms |
| engine.commit   | 154    | 21970.5 ms | 142.7 ms | 237.8 ms |
| engine.snapshot | 154    | 13492.3 ms | 87.6 ms  | 203.2 ms |
| engine.fold     | 154    | 1977.6 ms  | 12.8 ms  | 70.3 ms  |
| engine.resize   | 14     | 1190.3 ms  | 85.0 ms  | 178.8 ms |
| engine.undo     | 140    | 746.5 ms   | 5.3 ms   | 23.2 ms  |

## Per-phase main-thread cost (busy time, not wall-clock)

Compositor commit = pushing the canvas damage rect to the compositor for raster — the dominant
on-device drawing cost (ADR-0015); software rendering (headless) exaggerates it.

| Phase                 | Busy       | Long tasks | Compositor commit            | Wall       |
| --------------------- | ---------- | ---------- | ---------------------------- | ---------- |
| long-squiggles-draw   | 9122.0 ms  | 2          | 74.5 ms ×38 (max 64.5 ms)    | 9508.9 ms  |
| long-squiggles-undo   | 1098.9 ms  | 1          | 437.0 ms ×40 (max 72.2 ms)   | 879.9 ms   |
| short-marks-draw      | 2245.1 ms  | 2          | 64.5 ms ×1 (max 64.5 ms)     | 2208.0 ms  |
| short-marks-undo      | 906.7 ms   | 1          | 404.8 ms ×41 (max 62.4 ms)   | 848.3 ms   |
| mixed-draw            | 5715.7 ms  | 2          | 77.3 ms ×18 (max 73.2 ms)    | 5851.8 ms  |
| mixed-undo            | 915.3 ms   | 1          | 393.6 ms ×40 (max 78.1 ms)   | 788.0 ms   |
| multi-finger-draw     | 16098.7 ms | 3          | 88.5 ms ×65 (max 76.4 ms)    | 16791.6 ms |
| multi-finger-undo     | 2366.1 ms  | 10         | 713.0 ms ×40 (max 85.7 ms)   | 1965.3 ms  |
| scribbles-draw        | 9029.4 ms  | 2          | 74.2 ms ×37 (max 67.6 ms)    | 9397.5 ms  |
| scribbles-undo        | 1128.0 ms  | 1          | 464.5 ms ×41 (max 72.0 ms)   | 948.7 ms   |
| crayon-squiggles-draw | 19580.3 ms | 2          | 218.9 ms ×33 (max 212.4 ms)  | 19763.9 ms |
| crayon-squiggles-undo | 2693.5 ms  | 21         | 1395.4 ms ×41 (max 254.0 ms) | 2204.2 ms  |
| crayon-scribbles-draw | 44937.1 ms | 2          | 208.0 ms ×36 (max 198.7 ms)  | 44904.6 ms |
| crayon-scribbles-undo | 2319.1 ms  | 20         | 1375.5 ms ×40 (max 200.3 ms) | 2034.4 ms  |

## Long tasks attributed (top tasks >50 ms, by duration)

What each long main-thread task was actually doing — its largest nested timeline events. `Commit` =
compositor raster push; `EventDispatch (pointerup)` = stroke-end work inside the lift handler (see
engine.commit/engine.snapshot in the hot paths).

| Phase                 | Task       | Dominant nested work                                                                                    |
| --------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| crayon-scribbles-draw | 44094.9 ms | Receive mojo message 43563.7 · EventDispatch (pointermove) 820.5 · EventDispatch (pointermove) 812.3 ms |
| crayon-squiggles-draw | 19000.6 ms | Receive mojo message 18429.8 · EventDispatch (pointermove) 850.0 · EventDispatch (pointermove) 787.0 ms |
| multi-finger-draw     | 15558.8 ms | Receive mojo message 14959.9 · EventDispatch (pointermove) 612.2 · EventDispatch (pointermove) 551.4 ms |
| long-squiggles-draw   | 8813.2 ms  | Receive mojo message 8502.7 · EventDispatch (pointermove) 545.3 · EventDispatch (pointerup) 157.9 ms    |
| scribbles-draw        | 8739.2 ms  | Receive mojo message 8456.0 · EventDispatch (pointermove) 473.2 · EventDispatch (pointerup) 147.7 ms    |
| mixed-draw            | 5491.2 ms  | Receive mojo message 5041.0 · EventDispatch (pointerup) 170.5 · EventDispatch (pointerup) 137.9 ms      |
| short-marks-draw      | 2116.6 ms  | Receive mojo message 2010.8 · EventDispatch (pointerup) 108.0 · EventDispatch (pointerup) 103.5 ms      |
| (outside phases)      | 489.2 ms   | Receive mojo message 486.7 ms                                                                           |
| crayon-squiggles-undo | 262.6 ms   | Commit 254.0 · FireAnimationFrame 6.9 · RunMicrotasks 6.9 ms                                            |
| (outside phases)      | 216.8 ms   | TimerFire 179.7 · FunctionCall 178.9 ms                                                                 |
| crayon-squiggles-draw | 216.0 ms   | Commit 212.4 · FireAnimationFrame 1.1 ms                                                                |
| crayon-scribbles-undo | 207.3 ms   | Commit 200.3 · FireAnimationFrame 5.4 · RunMicrotasks 5.4 ms                                            |

## Top JS by self-time (V8 sampler — app code; harness symbols excluded)

| Function                   | Location        | Self       |
| -------------------------- | --------------- | ---------- |
| drawImage                  |                 | 53197.6 ms |
| stroke                     |                 | 4396.5 ms  |
| setTransform               |                 | 2115.5 ms  |
| toBlob                     |                 | 1705.0 ms  |
| ut                         | oa2tIipx.js:2   | 905.1 ms   |
| (garbage collector)        |                 | 813.6 ms   |
| (anonymous)                |                 | 670.6 ms   |
| save                       |                 | 475.2 ms   |
| N                          | oa2tIipx.js:2   | 346.2 ms   |
| restore                    |                 | 300.0 ms   |
| Ue                         | oa2tIipx.js:2   | 293.1 ms   |
| parseEvaluationResultValue |                 | 172.2 ms   |
| createImageBitmap          |                 | 169.7 ms   |
| getContext                 |                 | 137.9 ms   |
| i                          | 7.AyD8f-MF.js:1 | 125.3 ms   |

## Memory

| Metric         | Value   |
| -------------- | ------- |
| JS heap before | 0.0 MB  |
| JS heap after  | 15.4 MB |
| Delta          | 15.4 MB |

---

See the `profiling` skill for how to turn these numbers into a fix.
