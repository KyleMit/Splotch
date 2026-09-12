# Issue 1578 — where the WebKit gate's 10 s history settle went

Desk investigation of the recurring `crayon-scribbles:incomplete` signature on the post-merge WebKit
commit gate; no device time. The retained decision is
[ADR-0161](../../adrs/0161-history-settle-waits-for-the-fold-loop-and-never-decides-coverage.md);
this note is the evidence chain, including the numbers that ruled out "the history is slow to
settle" and "the poll cadence is too coarse".

## The recurrence, from the artifacts

Every `webkit-undo-fast-diagnostics` / `-retry-diagnostics` artifact linked from the issue thread,
plus the two passing runs, downloaded and read. Every timed-out scenario reports the same shape:
four samples, 10.0–13.9 s, and a final reading whose counters equal the completed reading a passing
runner took
(`undoEntries=20 livePatchEntries=20 patchBytes=29341600 baseTiles=20 baseRasterBytes=22380544 historyCommands=20|21 pendingCommands=0`).

| Run                                                                        | Job   | `crayon-scribbles`                                                                        | Draw phase (wall clock less settle) |
| -------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------- | ----------------------------------: |
| [33668738969](https://github.com/KyleMit/Splotch/actions/runs/33668738969) | first | skipped — 4 samples in 12,458 ms                                                          |                               ~82 s |
|                                                                            | retry | skipped — 4 samples in 10,111 ms                                                          |                               ~59 s |
| [33826117211](https://github.com/KyleMit/Splotch/actions/runs/33826117211) | first | skipped — 4 samples in 11,864 ms                                                          |                               ~67 s |
|                                                                            | retry | skipped — 4 samples in 11,509 ms                                                          |                               ~73 s |
| [33881633702](https://github.com/KyleMit/Splotch/actions/runs/33881633702) | first | skipped — 4 samples in 10,352 ms                                                          |                               ~74 s |
|                                                                            | retry | skipped — 4 samples in 10,238 ms                                                          |                               ~71 s |
| [33887304251](https://github.com/KyleMit/Splotch/actions/runs/33887304251) | first | skipped — 4 samples in 13,871 ms                                                          |                               ~57 s |
|                                                                            | retry | skipped — 4 samples in 11,117 ms                                                          |                               ~69 s |
| [33968514770](https://github.com/KyleMit/Splotch/actions/runs/33968514770) | first | skipped — 4 samples in 11,482 ms                                                          |                               ~44 s |
|                                                                            | retry | completed, 11 ms P95, draw 65,435 ms                                                      |                                     |
| [33997225193](https://github.com/KyleMit/Splotch/actions/runs/33997225193) | fast  | completed, 14 ms P95, draw 64,119 ms                                                      |                                     |
|                                                                            | full  | completed, 15 ms P95, draw 68,617 ms; `crayon-squiggles` skipped — 4 samples in 13,352 ms |                                     |
| [33998009243](https://github.com/KyleMit/Splotch/actions/runs/33998009243) | full  | completed, 9 ms P95, draw 48,224 ms                                                       |                                     |
| [34032201947](https://github.com/KyleMit/Splotch/actions/runs/34032201947) | first | skipped — 4 samples in 13,152 ms                                                          |                               ~91 s |
|                                                                            | retry | skipped — 4 samples in 10,203 ms                                                          |                               ~47 s |

Host speed does not predict the skip: the 44 s draw skipped and the 48 s draw completed.

## Base rate

Fast-gate job conclusions on every `push` to `main` the Actions API still lists (230 runs,
2026-08-11 → 2026-09-06), first-runner failures classified from the job log:

| Window                  | Main pushes | First runner failed | …of which settle skips | Both runners failed |
| ----------------------- | ----------: | ------------------: | ---------------------: | ------------------: |
| 2026-09-02 → 2026-09-06 |          70 |                  20 |                     16 |                   7 |
| 2026-08-11 → 2026-09-01 |         ~60 |                  13 |                      8 |                   3 |

Seven of seventy is what an independent 23 % chance per runner predicts (0.23² ≈ 5 %), so the
two-runner reproduction ADR-0158 requires was being met by a runner-class property, not by the
commit. The earliest settle skip in the retained logs is 2026-08-17; the pre-September skips often
report `baseTiles=0 historyCommands=22`, a reading taken before any fold.

## Where the time goes: two dispatches with a per-poll trace

Instrumentation (kept, in the same PR): each poll records its round trip, whether the reading
changed, the `engine.*` measures since the previous poll, and the rAF sampler's frame stamps since
the previous poll; `engine.fold` and `engine.crayonShadow` gained `PERF_MARKS` measures.

[Run 34057925219](https://github.com/KyleMit/Splotch/actions/runs/34057925219) (fold measure only):

| Scenario / job           | Poll 1 round trip | Poll 2 round trip            | Folds       | Outcome                         |
| ------------------------ | ----------------: | ---------------------------- | ----------- | ------------------------------- |
| `crayon-squiggles`, full |          9,673 ms | 3,251 ms (`engine.fold` 130) | 130 + 23 ms | skipped, 4 samples in 13,259 ms |
| `crayon-scribbles`, full |          4,961 ms | 2 ms (`engine.fold` 21)      | 21 ms       | settled at 5,385 ms             |
| `crayon-scribbles`, fast |          5,911 ms | 2,135 ms (`engine.fold` 50)  | 50 + 16 ms  | settled at 8,574 ms             |

[Run 34058312921](https://github.com/KyleMit/Splotch/actions/runs/34058312921) (shadow measure and
frames added):

| Scenario / job           | Poll 1 round trip                    | Poll 2 round trip                      | Folds      | Outcome             |
| ------------------------ | ------------------------------------ | -------------------------------------- | ---------- | ------------------- |
| `crayon-squiggles`, full | 4,601 ms — 1 frame stamp, no measure | 2,007 ms — `engine.crayonShadow` 2,070 | 27 + 12 ms | settled at 7,128 ms |
| `crayon-scribbles`, full | 42 ms — but frames 55 → 6,253 ms     | 2,788 ms — `engine.crayonShadow` 2,865 | 33 + 30 ms | settled at 3,408 ms |
| `crayon-scribbles`, fast | 4,880 ms — 1 frame stamp, no measure | 2,218 ms — `engine.crayonShadow` 2,263 | 48 + 14 ms | settled at 7,624 ms |

Reading the second table: the draw evaluate's `performance.now()` is taken at the end of the
strokes, and the full run's `crayon-scribbles` poll returned 42 ms after the evaluate did — but the
frame stamps show a 6.2 s gap right after the strokes ended, so there the stall sat *inside* the
draw evaluate's return rather than in front of the first poll. Same task, other side of the IPC.

So the 10 s decomposes into:

1. **4.6–9.7 s of one browser task** right after the synchronous burst — one rAF stamp, no
   `engine.*` measure, and the 1.5 s fold timer cannot fire through it. Not product JavaScript.
2. **2.1–2.9 s of `engine.crayonShadow`** — `refreshPendingCrayonShadows` reading twenty dirty tiles
   back into their under buffers. 0–492 ms on a developer Mac.
3. **Two folds at 12–130 ms each.**
4. Polls at 1–19 ms round trips, 100 ms apart, once the thread is free.

The history itself is quiescent within ~200 ms of main-thread time. Nothing the settle waited for
was slow; everything in front of it was.

## Local control

Developer Mac (M-series, GPU canvas), `npm run perf:web:undo:webkit:fast`, before the fix: both
scenarios settle in 308–312 ms with four 1 ms polls, reading `historyCommands=22 baseTiles=0` —
before the first fold. The runner, when it completed, read `historyCommands=20 baseTiles=20`. The
"quiescent" reading was a race decided by host speed.

After the fix (steady-state predicate, one confirming poll): `multi-finger` settles in 16,744 ms
over 161 polls (eleven folds, one `TILE_HISTORY_FOLD_IDLE_MS` apart, because the byte budget retains
eleven of its twenty-two commands); `crayon-scribbles` in 3,161 ms over 27 polls. Fast suite wall
clock 14.8 s → 33.7 s.

## Follow-ups this note does not settle

* The 4.6–9.7 s browser task after a 40–65 s canvas burst on `macos-latest` is bounded to WebKit
  itself (layer flush or collection after the burst are the candidates) and only matters if a
  physical device shows the same gap after a long crayon session.
* `engine.crayonShadow` at 2–3 s on a software-canvas host, and ~0.5 s once on a developer Mac, is
  the deferred whole-tile readback doing exactly what it was built to defer; whether twenty tiles
  per burst is the right granularity on a slow host is a product question, out of scope here.
