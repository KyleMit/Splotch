# Splotch performance profile

| Setting        | Value                    |
| -------------- | ------------------------ |
| Captured       | 2026-07-22T16:18:35.893Z |
| Target         | web                      |
| Device         | tablet                   |
| CPU throttle   | 4×                       |
| Build mode     | production-preview       |
| Session length | 206856.0 ms              |

## Frame health

| Metric                  | Value |
| ----------------------- | ----- |
| Avg FPS (whole session) | 52.7  |
| Frames                  | 8873  |
| Long frames (>32 ms)    | 920   |

| Long tasks (>50 ms) | Value     |
| ------------------- | --------- |
| Count               | 54        |
| Total               | 4875.0 ms |
| Longest             | 258.0 ms  |

## Where the main thread went (approximate — nested events may overlap)

| Bucket                     | Time        |
| -------------------------- | ----------- |
| Main-thread busy (RunTask) | 185366.0 ms |
| Scripting                  | 23709.6 ms  |
| Rendering / layout         | 6792.5 ms   |
| Painting / raster / GPU    | 2604.5 ms   |

## Engine hot paths (user-timing marks)

| Operation        | Count | Total     | Avg     | Max     |
| ---------------- | ----- | --------- | ------- | ------- |
| engine.draw      | 3738  | 1882.4 ms | 0.5 ms  | 10.8 ms |
| engine.commit    | 12    | 293.9 ms  | 24.5 ms | 97.3 ms |
| engine.snapshot  | 13    | 161.7 ms  | 12.4 ms | 27.2 ms |
| engine.undo      | 12    | 129.7 ms  | 10.8 ms | 23.4 ms |
| engine.fold      | 13    | 112.9 ms  | 8.7 ms  | 83.9 ms |
| engine.scanEmpty | 1     | 11.1 ms   | 11.1 ms | 11.1 ms |

## Per-phase main-thread cost (busy time, not wall-clock)

Compositor commit = pushing the canvas damage rect to the compositor for raster — the dominant
on-device drawing cost (ADR-0015); software rendering (headless) exaggerates it.

| Phase             | Busy        | Long tasks | Compositor commit               | Wall        |
| ----------------- | ----------- | ---------- | ------------------------------- | ----------- |
| boot-settle       | 205.2 ms    | 0          | 16.8 ms ×43 (max 1.6 ms)        | 709.8 ms    |
| draw-single       | 34365.9 ms  | 11         | 15133.1 ms ×1740 (max 220.4 ms) | 31659.6 ms  |
| multi-finger-draw | 2049.2 ms   | 2          | 987.0 ms ×49 (max 73.1 ms)      | 1522.9 ms   |
| change-colors     | 112425.1 ms | 35         | 46402.9 ms ×5314 (max 195.4 ms) | 100510.7 ms |
| stroke-size       | 17706.0 ms  | 4          | 7806.3 ms ×907 (max 201.3 ms)   | 16775.9 ms  |
| erase             | 11186.0 ms  | 3          | 4916.9 ms ×561 (max 74.6 ms)    | 10363.0 ms  |
| undo              | 2419.4 ms   | 2          | 320.0 ms ×158 (max 26.7 ms)     | 3215.0 ms   |
| clear             | 3433.3 ms   | 8          | 866.9 ms ×63 (max 78.4 ms)      | 2227.3 ms   |

## Long tasks attributed (top tasks >50 ms, by duration)

What each long main-thread task was actually doing — its largest nested timeline events. `Commit` =
compositor raster push; `EventDispatch (pointerup)` = stroke-end work inside the lift handler (see
engine.commit/engine.snapshot in the hot paths).

| Phase            | Task     | Dominant nested work                                                               |
| ---------------- | -------- | ---------------------------------------------------------------------------------- |
| (outside phases) | 447.9 ms | Receive mojo message 447.9 · V8.StackGuard 439.9 · V8.HandleInterrupts 439.9 ms    |
| draw-single      | 258.5 ms | Commit 220.4 · EventDispatch (pointermove) 22.5 · FunctionCall (Cr) 7.4 ms         |
| stroke-size      | 220.8 ms | Commit 201.3 · EventDispatch (pointermove) 4.7 · Layerize 4.2 ms                   |
| change-colors    | 208.2 ms | Commit 181.1 · EventDispatch (mousemove) 12.0 · EventDispatch (pointermove) 7.6 ms |
| change-colors    | 201.3 ms | Commit 195.4 · EventDispatch (pointermove) 2.0 · UpdateLayoutTree 1.3 ms           |
| change-colors    | 197.3 ms | Commit 174.5 · EventDispatch (pointermove) 7.1 · EventDispatch (mousemove) 5.2 ms  |
| change-colors    | 156.6 ms | Commit 124.4 · EventDispatch (pointermove) 15.2 · UpdateLayoutTree 12.3 ms         |
| change-colors    | 138.3 ms | Commit 130.3 · Layerize 1.9 · EventDispatch (pointermove) 1.4 ms                   |
| (outside phases) | 132.1 ms | Commit 119.1 · Paint 4.7 · Paint 3.4 ms                                            |
| draw-single      | 127.0 ms | Commit 110.6 · FireAnimationFrame 4.8 · Layerize 3.9 ms                            |
| (outside phases) | 119.9 ms | Commit 115.8 · UpdateLayoutTree 1.9 ms                                             |
| draw-single      | 113.7 ms | EventDispatch (pointerup) 105.1 · FunctionCall (wr) 98.1 · RunMicrotasks 4.4 ms    |

## Top JS by self-time (V8 sampler — app code; harness symbols excluded)

| Function                      | Location        | Self        |
| ----------------------------- | --------------- | ----------- |
| _cached                       |                 | 132395.3 ms |
| (anonymous)                   |                 | 2035.3 ms   |
| (garbage collector)           |                 | 723.7 ms    |
| setProperty                   |                 | 371.7 ms    |
| _promiseAwareJsonValueNoThrow |                 | 322.7 ms    |
| drawImage                     |                 | 314.4 ms    |
| setupDragListeners            |                 | 242.6 ms    |
| di                            | BkewDlkn.js:1   | 236.6 ms    |
| querySelector                 |                 | 225.9 ms    |
| setTimeout                    |                 | 190.3 ms    |
| addEventListener              |                 | 168.4 ms    |
| #_                            | BkewDlkn.js:1   | 160.3 ms    |
| Ce                            | CBbxnBRH.js:1   | 143.2 ms    |
| Cr                            | Bqc5W-qY.js:2   | 141.2 ms    |
| (anonymous)                   | 2.SG0dKL_Z.js:2 | 102.5 ms    |

## Memory

| Metric         | Value  |
| -------------- | ------ |
| JS heap before | 9.5 MB |
| JS heap after  | 9.5 MB |
| Delta          | 0.0 MB |

---

See the `profiling` skill for how to turn these numbers into a fix.
