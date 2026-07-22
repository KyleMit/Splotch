# Splotch performance profile

| Setting        | Value                                                    |
| -------------- | -------------------------------------------------------- |
| Captured       | 2026-07-22T14:50:01.346Z                                 |
| Target         | web/dev-engine (headless Chromium — not WebKit/real GPU) |
| Device         | ipad-pro-12.9                                            |
| CPU throttle   | 4×                                                       |
| Build mode     | production-preview (reused build)                        |
| Session length | 156882.0 ms                                              |

## Frame health

| Metric                  | Value |
| ----------------------- | ----- |
| Avg FPS (whole session) | 1.7   |
| Frames                  | 83    |
| Long frames (>32 ms)    | 37    |

| Long tasks (>50 ms) | Value      |
| ------------------- | ---------- |
| Count               | 21         |
| Total               | 46955.0 ms |
| Longest             | 44524.0 ms |

## Where the main thread went (approximate — nested events may overlap)

| Bucket                     | Time        |
| -------------------------- | ----------- |
| Main-thread busy (RunTask) | 132116.8 ms |
| Scripting                  | 7902.1 ms   |
| Rendering / layout         | 76.7 ms     |
| Painting / raster / GPU    | 30.3 ms     |

## Engine hot paths (user-timing marks)

| Operation       | Count  | Total      | Avg      | Max       |
| --------------- | ------ | ---------- | -------- | --------- |
| engine.draw     | 171457 | 45068.0 ms | 0.3 ms   | 814.3 ms  |
| engine.commit   | 154    | 23781.9 ms | 154.4 ms | 1108.4 ms |
| engine.snapshot | 154    | 15324.9 ms | 99.5 ms  | 1068.6 ms |
| engine.fold     | 154    | 1916.5 ms  | 12.4 ms  | 70.0 ms   |
| engine.undo     | 140    | 1164.7 ms  | 8.3 ms   | 159.5 ms  |
| engine.resize   | 14     | 1117.9 ms  | 79.9 ms  | 172.2 ms  |

## Per-phase main-thread cost (busy time, not wall-clock)

Compositor commit = pushing the canvas damage rect to the compositor for raster — the dominant
on-device drawing cost (ADR-0015); software rendering (headless) exaggerates it.

| Phase                 | Busy       | Long tasks | Compositor commit            | Wall       |
| --------------------- | ---------- | ---------- | ---------------------------- | ---------- |
| long-squiggles-draw   | 8148.7 ms  | 2          | 68.4 ms ×30 (max 61.5 ms)    | 8411.2 ms  |
| long-squiggles-undo   | 1956.8 ms  | 19         | 1120.1 ms ×40 (max 110.4 ms) | 1710.6 ms  |
| short-marks-draw      | 2244.1 ms  | 2          | 75.7 ms ×1 (max 75.7 ms)     | 2205.1 ms  |
| short-marks-undo      | 1842.0 ms  | 18         | 1192.9 ms ×41 (max 103.1 ms) | 1685.4 ms  |
| mixed-draw            | 5738.8 ms  | 2          | 70.9 ms ×17 (max 63.9 ms)    | 5830.7 ms  |
| mixed-undo            | 1980.8 ms  | 19         | 1204.3 ms ×40 (max 103.8 ms) | 1753.5 ms  |
| multi-finger-draw     | 17456.8 ms | 2          | 78.2 ms ×54 (max 64.1 ms)    | 17931.7 ms |
| multi-finger-undo     | 3629.2 ms  | 28         | 1177.0 ms ×44 (max 107.0 ms) | 3161.1 ms  |
| scribbles-draw        | 8432.1 ms  | 2          | 71.0 ms ×33 (max 62.2 ms)    | 8735.8 ms  |
| scribbles-undo        | 1722.5 ms  | 16         | 907.6 ms ×41 (max 56.9 ms)   | 1474.5 ms  |
| crayon-squiggles-draw | 19027.6 ms | 2          | 224.3 ms ×31 (max 209.0 ms)  | 19143.8 ms |
| crayon-squiggles-undo | 3730.0 ms  | 20         | 2377.0 ms ×41 (max 274.8 ms) | 3222.9 ms  |
| crayon-scribbles-draw | 45856.8 ms | 2          | 216.6 ms ×35 (max 209.9 ms)  | 45764.1 ms |
| crayon-scribbles-undo | 3488.4 ms  | 21         | 2060.5 ms ×41 (max 242.3 ms) | 2974.3 ms  |

## Long tasks attributed (top tasks >50 ms, by duration)

What each long main-thread task was actually doing — its largest nested timeline events. `Commit` =
compositor raster push; `EventDispatch (pointerup)` = stroke-end work inside the lift handler (see
engine.commit/engine.snapshot in the hot paths).

| Phase                 | Task       | Dominant nested work                                                                                    |
| --------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| crayon-scribbles-draw | 44958.8 ms | Receive mojo message 44520.0 · EventDispatch (pointermove) 814.4 · EventDispatch (pointermove) 705.6 ms |
| crayon-squiggles-draw | 18412.2 ms | Receive mojo message 17836.2 · EventDispatch (pointermove) 728.9 · EventDispatch (pointermove) 664.3 ms |
| multi-finger-draw     | 16923.2 ms | Receive mojo message 16418.8 · EventDispatch (pointerup) 1108.6 · EventDispatch (pointerup) 811.1 ms    |
| scribbles-draw        | 8138.6 ms  | Receive mojo message 7872.4 · EventDispatch (pointermove) 383.0 · EventDispatch (pointerup) 159.6 ms    |
| long-squiggles-draw   | 7861.6 ms  | Receive mojo message 7585.5 · EventDispatch (pointermove) 463.7 · EventDispatch (pointerup) 146.6 ms    |
| mixed-draw            | 5492.8 ms  | Receive mojo message 5060.0 · EventDispatch (pointerup) 186.9 · EventDispatch (pointerup) 185.7 ms      |
| short-marks-draw      | 2101.2 ms  | Receive mojo message 2008.6 · EventDispatch (pointerup) 100.8 · EventDispatch (pointerup) 98.3 ms       |
| multi-finger-undo     | 309.4 ms   | MajorGC 307.8 · V8.GC_MARK_COMPACTOR 307.0 · V8.GC_HEAP_EMBEDDER_TRACING_EPILOGUE 197.8 ms              |
| crayon-squiggles-undo | 284.9 ms   | Commit 274.8 · FireAnimationFrame 7.6 · ThreadPool_RunTask 7.2 ms                                       |
| crayon-scribbles-undo | 250.3 ms   | Commit 242.3 · FireAnimationFrame 6.4 · RunMicrotasks 6.4 ms                                            |
| crayon-squiggles-undo | 231.8 ms   | Commit 223.5 · FireAnimationFrame 6.9 · RunMicrotasks 6.0 ms                                            |
| crayon-scribbles-undo | 223.2 ms   | Commit 221.4 ms                                                                                         |

## Top JS by self-time (V8 sampler — app code; harness symbols excluded)

| Function                   | Location        | Self       |
| -------------------------- | --------------- | ---------- |
| drawImage                  |                 | 57362.3 ms |
| stroke                     |                 | 3641.0 ms  |
| setTransform               |                 | 1871.5 ms  |
| toBlob                     |                 | 1824.4 ms  |
| (garbage collector)        |                 | 1493.6 ms  |
| ut                         | CmsAsEaa.js:2   | 777.2 ms   |
| (anonymous)                |                 | 632.5 ms   |
| save                       |                 | 437.5 ms   |
| M                          | CmsAsEaa.js:2   | 334.2 ms   |
| restore                    |                 | 331.9 ms   |
| We                         | CmsAsEaa.js:2   | 310.0 ms   |
| parseEvaluationResultValue |                 | 181.3 ms   |
| i                          | 7.C5i0Gm3i.js:1 | 168.0 ms   |
| createImageBitmap          |                 | 159.3 ms   |
| getContext                 |                 | 138.6 ms   |

## Memory

| Metric         | Value   |
| -------------- | ------- |
| JS heap before | 0.0 MB  |
| JS heap after  | 18.4 MB |
| Delta          | 18.4 MB |

---

See the `profiling` skill for how to turn these numbers into a fix.
