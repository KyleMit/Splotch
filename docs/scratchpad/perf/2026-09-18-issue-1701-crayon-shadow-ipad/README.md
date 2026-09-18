# Issue 1701 — deferred crayon shadow drain on a physical iPad

Physical-iPad capture for [issue 1701](https://github.com/KyleMit/Splotch/issues/1701), the A/B
behind the treatment in the same PR, and the reason the issue's own comparable workload was not the
decisive one. The retained decision is the 2026-09 amendment at the end of
[ADR-0085](../../../adrs/0085-tiled-live-canvas-for-ipad-webkit.md).

`summary.json` holds every scored run as sanitized, derived rows: each `engine.crayonShadow` and
`engine.fold` measure joined to the rAF interval that contains it, every frame over the gate, the
history counters, and each trusted-touch capture's fidelity and drawing-gate verdict. No device
names, ids, or raw event rows. The payloads and runner here are the scripts that produced the
`/dev/engine` runs; the trusted-touch runs are unmodified `npm run perf:device:frames`.

## Setup

* **Runtime.** A 12.9-inch iPad Pro, iPadOS 26.5, Safari 26.5, portrait. Safari's rAF ran at 60 Hz
  throughout. Web is the only runtime that runs this code: `refreshPendingCrayonShadows` belongs to
  the `restamp` deposition pipeline, and the native build ships `glaze-direct`, which has no under
  shadow (ADR-0148).
* **Builds.** `npm run perf:build` (PERF_MARKS + dev harness). Main was aac6e68f002b (entry
  `start.TO--ZiKV.js`, and the same product tree rebuilt as `start.CE4aw1MY.js` for the interleave);
  the treatment was c769f34bfa97 (`start.ehOM9ioD.js`). Every run recorded the served entry, and
  each swap proved the served entry matched before capturing.
* **Gate, agreed before any capture.** `ACTION_FRAME_MAX_GATE_MS` (33.5 ms), applied to the drain
  measure and to the frame that contains it, a breach counting only when two of three scored repeats
  show it (ADR-0156 decision 4). The drain lands two frames after the finger lifts, so it is a
  post-action frame.
* **Host.** Captures ran one at a time with no build, suite, or review running.

## The issue's comparable burst passes, and misses the cost

The CI gate's `crayon-scribbles` scenario, reproduced exactly: crayon mode on, then 22
back-and-forth scribbles of 1,200 points each in one synchronous task, so one drain covers every
dirty tile. On the device, one warm-up and three scored repeats:

| Run      | Burst task | Folds after the burst | `engine.crayonShadow` | Frame containing it |
| -------- | ---------: | --------------------- | --------------------: | ------------------: |
| scored-1 |    117.8 s | 7 ms, 2,896 ms        |                  0 ms |                4 ms |
| scored-2 |    117.9 s | 4,929 ms, 4,433 ms    |                  0 ms |                9 ms |
| scored-3 |    117.7 s | 4,916 ms, 4,442 ms    |                  0 ms |                3 ms |

A drawImage-instrumented diagnostic run confirmed the drain really ran: it read all 20 live tiles
plus 8 history-base tiles. Every repeat settled at 20 undo entries, 20 base tiles, and identical
ink. By this measure the drain is frame-scale.

It is also not what a child produces. After the burst the page went 13.3–13.7 s without a frame, and
the two folds inside that window took up to 4.9 s. By the time the drain ran, that work had been
absorbed, which is the macOS runner's shape inverted: there, the drain was the slow part.

## Real input: the drain after a fold is not frame-scale

`perf:device:frames --platform=ios --brush=crayon --orientation=PORTRAIT`, trusted WebDriverAgent
touch on the real app at `/`. Fidelity passed every check on every run, and the committed brush was
crayon. In each run the idle fold ran 1.5 s after the last lift, and on main the drain two frames
later froze one frame:

| Arm       | Post-fold drain frame, per run      | Worst frame after the last lift | Paint P95/P99/max, per run                       |
| --------- | ----------------------------------- | ------------------------------- | ------------------------------------------------ |
| main      | 754, 780, 612, 661, 617 ms (5 of 5) | 612–780 ms                      | 15/17/34, 15/17/28, 15/18/27, 15/18/49, 15/17/28 |
| treatment | no post-fold drain (0 of 5)         | 19–32 ms                        | 15/17/29, 15/16/43, 15/16/53, 15/16/27, 15/16/28 |

The main drain's frame held nothing but `engine.crayonShadow`. The drains at finger-lift, the ones
that refresh live tiles, measured 0–1 ms on both arms.

One treatment run's paint max was 53 ms, just over ADR-0085's 50 ms line. Its worst in-contact frame
(55 ms) carried 1 ms of `engine.draw` and nothing else. No fold ran during any capture, so the
in-contact code path is identical on the two arms. Main's own runs reached 49 ms, and an interleaved
extra pair read 49/28 ms (main) against 27/28 ms (treatment).

## Why: the fold stales history-base shadows

`foldOldestCommand` replays the oldest crayon command onto the offscreen history-base tiles. Each
pass flush there went through `flushCrayonBuffer`, which marked that base tile's shadow stale and
queued it for the deferred drain. So two frames after every crayon fold, the drain read each folded
base tile back into an under buffer, in one task. Only the next fold ever needs a base tile's
shadow, and a pass opening there already performs the synchronous read when the shadow is stale.

The duration alone does not show whether the time is CPU or GPU work, and nothing here attributes
it. What the measurements do show: live-tile drains are 0–1 ms in the same captures, and the
expensive drains are the ones that include base tiles.

## Paced A/B with a fold tail

The trusted-touch capture ends about two seconds after its last lift, so it sees one fold. Moving
the read into the next fold would be no improvement, and that needs several folds to rule out.
`paced-payload.js` draws 30 crayon scribbles on `/dev/engine` at two moves per frame, 300 ms apart,
then idles until the fold loop has folded every overflow command (ten folds). Runs were interleaved:
main-1, B-1..3, main-2, B-4, main-3.

| Arm       | Runs | Post-fold drain frames                    | Fold JS / fold frame | Lift drains |
| --------- | ---: | ----------------------------------------- | -------------------- | ----------- |
| main      |    3 | 902–916, 194–217, 696–717 ms in every run | 2–22 ms / 16–40 ms   | ≤1 ms       |
| treatment |    4 | none                                      | 2–19 ms / 16–51 ms   | ≤1 ms       |

Fold durations did not grow, so the read did not reappear inside the next fold. The largest fold
frame on either arm belongs to the first fold (33–40 ms on main, 28–51 ms on the treatment), and the
treatment does not touch the fold itself. Main-1 also carried two unattributed tail frames (153 and
92 ms) with no engine measure in them. They did not recur on main-2 or main-3.

## Not settled here

* The 13 s frameless window after the synchronous burst, and folds of up to 4.9 s inside it, belong
  to the harness's 117-second single task and did not appear under paced or trusted input. This is
  the same shape as the runner's "browser task after the synchronous burst" in
  [the issue 1578 note](../2026-09-06-issue-1578-history-settle.md).
