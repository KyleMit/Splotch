# Issue 2072: the Android Chrome early-undo stall is the history fold's deferred GPU raster

Physical-device evidence for [issue 2072](https://github.com/KyleMit/Splotch/issues/2072). The stall
was drafted as a leftover of PR 2070 ([issue 1750](https://github.com/KyleMit/Splotch/issues/1750)).
This package answers three questions:

* Does the stall still reproduce on current main?
* What is it?
* Does flushing each history fold to the GPU remove it without moving the cost elsewhere?

`summary.json` holds every scored run as rows from `score.mjs`, plus the control-versus-treatment
comparison for each set. `runs/` holds the raw inputs:

* every rAF stamp, stored as 0.1 ms deltas;
* every `engine.*` measure except the per-op `engine.draw` and `engine.undoPatchCapture` rows, which
  are collapsed to totals;
* the undo rows, history counters, and pixel hashes.

No file holds a device id or a LAN address.

## Setup

* **Runtime.** A physical Android phone, Chrome 153 (`Android 10; K` reduced UA), portrait, 360×643
  at DPR 3, rAF at 60 Hz. This is web Chrome, not the native app. Web ships the `restamp` crayon
  pipeline (`engine.ts`, ADR-0148).
* **Workload.** It is unchanged from PR 2070:
  [`../2026-09-18-issue-1750-ipad-baseline/session-payload.js`](../2026-09-18-issue-1750-ipad-baseline/session-payload.js)
  on `/dev/engine`, with `{"undoGapMs":700,"margin":24}`.
  * 30 paced crayon scribbles, 240 points each, two moves per frame, 300 ms apart.
  * The payload waits until history folding settles, then 4 s more.
  * 20 undos follow, 700 ms apart, so every ghost animation finishes. A 4 s tail ends the run.
  * The payload injects in-page and the host only polls.
  * Every run verified 30 strokes, a history depth of 20 with 20 snapshots, and 20 undos. Final ink
    was identical: 334,027 for crayon, 401,358 for pen, and 331,797 for glaze-direct.
* **Builds.** Every build is an `npm run perf:build` served by `vite preview` over the LAN. Each run
  records the entry chunk its page loaded.

  | Arm                      | Commit                                   | Entry               | Runs                               |
  | ------------------------ | ---------------------------------------- | ------------------- | ---------------------------------- |
  | main, first build        | 4bc6ef57b69a32a1558400f0697bb492b01778dd | `start.Cp_dNZ9s.js` | `main`, `diag-flush`, `trace-runs` |
  | main, control worktree   | 4bc6ef57b69a32a1558400f0697bb492b01778dd | `start.Dlk4xmG4.js` | every `ctl` run                    |
  | treatment, first commit  | a833c5cd314cc3409e93a7a29b2fcaa1405ff29a | `start.BKX4NbVq.js` | `screen`, `confirm`                |
  | treatment, second commit | 8cc8468f634c659e9c4bbe286f9e01338d8fc484 | `start.C4OBZ2hJ.js` | `brush-*`, `pixels-*`, `memory`    |

  The two main builds come from one commit in two checkouts, and their entry hashes differ. The
  second commit differs from the first treatment commit only in excluding the native WebView and in
  test structure. Web Chrome runs the same code in both.
* **Host.** Captures ran one at a time, with no builds or suites running. The phone kept the Chrome
  tabs that earlier sessions left open. The `screen` set also ran beside five finished tabs left by
  this session's hung trace drivers. Those tabs were closed before `confirm`, and `confirm` was
  started fresh.
* **Scoring.** `score.mjs` treats each run as one experimental unit. Frames inside a run are
  correlated and are never pooled across runs.
  * The primary metric is the longest complete rAF interval in the undo phase.
  * Late excess sums every interval over 25 ms, less the observed cadence.
  * Comparisons report medians, ranges, a seeded bootstrap 95% CI of the median difference, and an
    exact permutation test. With 5 runs against 5, the smallest possible p is 2/252 = 0.0079.

## Reproduction on current main

| Run | Longest undo-phase interval | Opens after undo 1 | Undos spanned |
| --- | --------------------------: | -----------------: | ------------- |
| m1  |                    1,401 ms |             +64 ms | 1 and 2       |
| m2  |                    1,384 ms |             +72 ms | 1 and 2       |
| m3  |                    1,433 ms |             +59 ms | 1 and 2       |

This is one interval per run, not two stalls. Undo 2's 700 ms timer fired on time inside it, so the
main thread was free. `engine.undo` held 11.5–14.3 ms of JavaScript at most. PR 2070's runs on
7a2365631aba read 1,383–1,417 ms, so the result agrees.

## What the stall is

`foldOldestCommand` (`tiledRenderer.ts`) runs once per 1.5 s of idle while history exceeds the undo
depth. Each run replays one command's ops into the offscreen history-base tiles. Here that is 10
folds across the 15 s settle.

A Chrome trace (`run-traced.mjs`; its outputs are in `trace-analysis.txt`) shows how that work was
handled:

* **During settle,** the renderer issued about 600–690 canvas raster calls per fold, each sent as an
  ordering barrier. The GPU process's main thread was idle and executed none of them.
* **At undo 1,** the frame that presented the undo flushed the GPU channel. The GPU then drained the
  whole backlog before that frame could present: 1.7 s of GPU tasks under light tracing (`t8`) and
  1.86 s in one task under heavy tracing (`t6`).

Tracing stretches the stall (1,700 ms and 3,484 ms), so no traced interval is scored.

Discriminating controls, run with `payload-diag.js` on the untouched main build. Each makes one
change after settle and runs no product code:

| Control                                                            | Undo-phase max | Where the backlog went                                       |
| ------------------------------------------------------------------ | -------------: | ------------------------------------------------------------ |
| `createImageBitmap` of a 1×1 canvas (`f1`)                         |       1,533 ms | nowhere; it sends nothing to the GPU                         |
| `createImageBitmap` of a 512×512 canvas (`f2-512`)                 |       1,550 ms | nowhere; an ImageBitmap on the same context needs no flush   |
| create a WebGL context after settle (`g1-glflush`)                 |          18 ms | a synchronous 1,617 ms block inside `getContext` before undo |
| WebGL context made at load, `gl.flush()` after settle (`g2`, `t7`) |          17 ms | GPU drained 1.69 s during idle; no interval over 83 ms       |

So the stall is the folds' GPU work, held until the next channel flush. In `t7` the GPU spent the
same 1.7 s. No rAF interval stretched, because nothing needed presenting while it ran. Its timing
alone decides whether a child sees it.

In the real app, the same backlog lands on the first action after any idle pause of 1.5 s or more
once history is deeper than 20. That action can be a stroke instead of an undo. This workload
measures only the undo case.

## The treatment

`withCanvasRasterFlush` (`canvasRasterFlush.ts`) wraps each fold. It creates a 1×1 WebGL context
before the fold's first raster call, because creating one waits for whatever the channel already
holds. After the fold, it issues one `clear` and one `flush`. The flush is not a readback and does
not wait for the GPU. The GPU runs each fold's raster while the page is still idle.

Only Android browsers on the Chromium engine take this path: `isAndroidChromium()`, and not
`__IS_CAPACITOR__ && isNative()`. Only Chrome was measured. The native WebView could not run this
workload, because `/dev` is excluded from native bundles. Firefox, iOS, and desktop keep their
current code, and the iOS undo-ghost settle is untouched. A context lost after a fold is replaced on
the next fold.

The Chromium gate and the lost-context replacement landed after every run below, in response to
review. On Android Chrome, with a live context, the code runs the same path as the measured builds.

## Confirmation (fresh runs, 5 against 5, ABBA blocks)

| Metric                               | Main, median [range]   | Treatment, median [range] | Δ median (95% CI)            |      p |
| ------------------------------------ | ---------------------- | ------------------------- | ---------------------------- | -----: |
| Longest undo-phase interval          | 1,400 [1,250–1,453] ms | 25.7 [18.8–30.0] ms       | −1,375 (−1,427 to −1,224) ms | 0.0079 |
| Undo windows over the 33.5 ms gate   | 2 [2–2] of 20          | 0 [0–0] of 20             | −2                           | 0.0079 |
| Whole-session late excess            | 1,700 [1,616–1,786] ms | 409 [383–446] ms          | −1,291 (−1,386 to −1,207) ms | 0.0079 |
| Longest settle-phase (idle) interval | 66.7 [50–66.7] ms      | 83.4 [83.3–100] ms        | +16.7 (+16.6 to +33.4) ms    | 0.0079 |
| Settle-phase late excess             | 366 [316–400] ms       | 400 [383–433] ms          | +33 (−0.5 to +84) ms         |  0.064 |
| Draw-phase late excess               | 0 ms                   | 0 ms                      | 0                            |      1 |
| `engine.commit` p95                  | 3.5 [3.0–4.5] ms       | 3.4 [3.0–3.5] ms          | −0.1 ms                      |   0.33 |
| `engine.fold` max                    | 72.5 [72.3–74.1] ms    | 73.6 [71.9–78.6] ms       | +1.1 ms                      |   0.63 |
| `engine.undo` total of 20            | 131 [126–137] ms       | 136 [134–139] ms          | +5 (−0.3 to +10) ms          |  0.056 |

The two screening runs agree: 33.2–33.3 ms against 1,566–1,567 ms.

The GPU work is not moved onto another user action. It now overlaps the idle frame after each fold,
where nothing animates. That shows as a worst idle frame about one refresh longer, plus 33 ms more
settle excess in total. The whole-session late-frame cost falls by 1.29 s. At its worst, an action
that lands right after a fold waits for that one fold's raster. Before, it waited for every fold of
the pause.

## Other brush paths (second commit against main, 2 against 2, ABBA)

| Path                                      | Undo-phase max, main → treatment | Idle settle max     | Session late excess | Commit p95 / fold max            |
| ----------------------------------------- | -------------------------------- | ------------------- | ------------------- | -------------------------------- |
| pen                                       | 17–50 → 17.2–17.7 ms             | 16.8 → 33.3–33.4 ms | 0–33 → 17–33 ms     | unchanged                        |
| crayon `glaze-direct` (native's pipeline) | 250 → 33.3–33.4 ms               | 16.8 → 50–67 ms     | 283–317 → 50–67 ms  | 3.7–4.7 → 3.4 ms / 32 → 33–37 ms |

With 2 runs per arm, these are screens and carry no significance claim. Glaze-direct pays the same
deferred-fold stall on main, at a smaller size. Pen has no stall to remove, and it regresses nothing
beyond one extra idle frame during a fold.

## Pixels and memory

The `pixels-*` runs set `pixelCheck`, which reads canvases back and perturbs timing, so they are
never scored for performance. The payload reduces each canvas, and then the whole tile set, to a
32-bit FNV hash, so this is hash identity: it rules out any practical difference but is not a
bytewise comparison. `compare-pixels.mjs` found main and the second commit hash-identical on both
paths:

* restamp crayon: the same pre-undo tiles, all 20 ghost hashes, and all 20 tile hashes;
* pen: the same, with identical final ink.

The flush draws only into its own 1×1 canvas, so no drawing pixel can change.

Retained history is identical in every run: 20 snapshots, 20 history-base rasters, and the same
raster bytes. The one added allocation is a single WebGL context per page. It has a 1×1 default
framebuffer with no alpha, depth, stencil, or antialiasing.

The `memory` set ran 2 main and 2 second-commit sessions in ABBA order (`memory-run.sh`). It sampled
Chrome's GPU process with `dumpsys meminfo` every 5 s (`memory/*.txt`):

| Arm       | Peak total PSS | Peak GL mtrack | Longest undo-phase interval |
| --------- | -------------: | -------------: | --------------------------: |
| main      |     111–139 MB |       28–67 MB |              1,417–1,433 ms |
| treatment |     116–118 MB |          34 MB |                       17 ms |

The treatment sits inside main's run-to-run spread. The GPU process is shared with Chrome's other
tabs, so this check can rule out a large increase but not a small one.

## Limitations

* One phone, one Chrome version, and portrait only. The synthetic in-page input exercises the engine
  and `app.css`. It is not the real app driven with trusted touch.
* The native Android WebView is excluded from the treatment, and its behaviour was not measured. The
  glaze-direct result suggests it pays the same stall.
* The effect of the flush depends on Chromium's GPU channel sending all deferred messages on any
  context's flush. That is observed behaviour, not a specified contract. If Chrome changes it, the
  flush becomes a no-op and main's behaviour returns.
* The next action after a fold still waits for up to one fold's GPU raster. This workload does not
  measure an action that lands right after a fold.

## Reproduce

```sh
npm run perf:build && (cd web && PUBLIC_ENABLE_DEV_HARNESS=true ../node_modules/.bin/vite preview --host --port <port>)
HARNESS_URL=http://<lan-ip>:<port>/dev/engine OUT_DIR=<dir> ANDROID_SERIAL=<serial> \
  node docs/scratchpad/perf/2026-09-18-issue-2072-android-fold-flush/run-session-android.mjs \
  <label>-<ctl|trt> restamp paced '{"undoGapMs":700,"margin":24}'
node docs/scratchpad/perf/2026-09-18-issue-2072-android-fold-flush/score.mjs <dir>
```

* Diagnostics: set `PAYLOAD=.../payload-diag.js` and add `"glFlushBeforeUndo":true`,
  `"preGlFlush":true`, or `"flushBeforeUndo":true` to the config.
* Traces: `run-traced.mjs` with the same environment, then `trace-hist.mjs` and `trace-folds.mjs` on
  the trace.
* Packaging: `package-runs.mjs <capture-root> <set>...` rebuilds `runs/`, and scoring the result
  reproduces `summary.json`.

The raw traces are 47–91 MB each and are not committed. Their SHA-256 sums are in
`trace-analysis.txt`.
