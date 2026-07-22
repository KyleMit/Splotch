# Splotch performance profile

| Setting        | Value                    |
| -------------- | ------------------------ |
| Captured       | 2026-07-22T14:46:35.577Z |
| Target         | web                      |
| Device         | tablet                   |
| CPU throttle   | 4×                       |
| Build mode     | production-preview       |
| Session length | 172286.0 ms              |

## Frame health

| Metric                  | Value |
| ----------------------- | ----- |
| Avg FPS (whole session) | 57.1  |
| Frames                  | 7896  |
| Long frames (>32 ms)    | 211   |

| Long tasks (>50 ms) | Value     |
| ------------------- | --------- |
| Count               | 24        |
| Total               | 2746.0 ms |
| Longest             | 607.0 ms  |

## Where the main thread went (approximate — nested events may overlap)

| Bucket                     | Time        |
| -------------------------- | ----------- |
| Main-thread busy (RunTask) | 145989.2 ms |
| Scripting                  | 17782.1 ms  |
| Rendering / layout         | 4765.3 ms   |
| Painting / raster / GPU    | 1899.2 ms   |

## Engine hot paths (user-timing marks)

| Operation        | Count | Total     | Avg     | Max      |
| ---------------- | ----- | --------- | ------- | -------- |
| engine.draw      | 3738  | 1250.0 ms | 0.3 ms  | 6.3 ms   |
| engine.snapshot  | 13    | 684.6 ms  | 52.7 ms | 575.7 ms |
| engine.commit    | 12    | 215.3 ms  | 17.9 ms | 83.9 ms  |
| engine.undo      | 12    | 100.3 ms  | 8.4 ms  | 20.2 ms  |
| engine.fold      | 13    | 92.7 ms   | 7.1 ms  | 73.9 ms  |
| engine.scanEmpty | 1     | 8.3 ms    | 8.3 ms  | 8.3 ms   |

## Per-phase main-thread cost (busy time, not wall-clock)

| Phase             | Busy       | Long tasks | Wall       |
| ----------------- | ---------- | ---------- | ---------- |
| boot-settle       | 123.4 ms   | 0          | 707.4 ms   |
| draw-single       | 27092.8 ms | 1          | 26502.7 ms |
| multi-finger-draw | 1506.8 ms  | 1          | 1111.2 ms  |
| change-colors     | 87769.3 ms | 16         | 80374.2 ms |
| stroke-size       | 14119.5 ms | 3          | 14229.6 ms |
| erase             | 8846.0 ms  | 2          | 8618.1 ms  |
| undo              | 2452.9 ms  | 12         | 3396.0 ms  |
| clear             | 3095.5 ms  | 2          | 2339.8 ms  |

## Top JS by self-time (V8 sampler — app code; harness symbols excluded)

| Function            | Location      | Self      |
| ------------------- | ------------- | --------- |
| (anonymous)         |               | 1619.6 ms |
| drawImage           |               | 908.0 ms  |
| (garbage collector) |               | 594.0 ms  |
| querySelector       |               | 197.3 ms  |
| setProperty         |               | 185.8 ms  |
| addEventListener    |               | 159.1 ms  |
| setupDragListeners  |               | 154.8 ms  |
| di                  | BkewDlkn.js:1 | 148.9 ms  |
| setTimeout          |               | 131.6 ms  |
| Ce                  | jRfd2Atc.js:1 | 103.2 ms  |
| #_                  | BkewDlkn.js:1 | 94.8 ms   |
| removeEventListener |               | 88.5 ms   |
| mr                  | CmsAsEaa.js:2 | 77.2 ms   |
| fill                |               | 72.6 ms   |
| clearTimeout        |               | 63.0 ms   |

## Memory

| Metric         | Value  |
| -------------- | ------ |
| JS heap before | 9.5 MB |
| JS heap after  | 9.5 MB |
| Delta          | 0.0 MB |

---

See the `profiling` skill for how to turn these numbers into a fix.
