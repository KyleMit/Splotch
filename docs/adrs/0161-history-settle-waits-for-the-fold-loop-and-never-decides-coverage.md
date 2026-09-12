# ADR-0161: The History Settle Waits for the Fold Loop and Never Decides Gate Coverage

**Status:** Active — amends [ADR-0158](0158-a-retry-confirms-only-the-same-failure.md) **Date:**
2026-09

## Context

The post-merge WebKit commit gate kept filing the same failure against `main`:
`crayon-scribbles:incomplete`, the scenario skipped because "history never settled within 10000 ms",
reproduced on both runners ([issue 1578](https://github.com/KyleMit/Splotch/issues/1578)). Over the
70 pushes to `main` between 2026-09-02 and 2026-09-06 the first runner skipped it 16 times and both
runners 7 times — the rate an independent one-in-four chance per runner predicts — and the job logs
show the same skip once in roughly eight pushes back to 2026-08-17. Every recurrence was a scenario
that never produced a measurement, never a measured commit P95 over budget: the same scenario
completed at 5–15 ms P95 whenever it did complete.

`settleHistory` in `tools/perf/web/run-undo-scenarios.mjs` waited, after each scenario's batched
draw, for four consecutive identical `getUndoDebug()` readings 100 ms apart inside a 10 s budget,
and threw when the budget expired. [ADR-0158](0158-a-retry-confirms-only-the-same-failure.md) had
already guarded that expiry so it could not fire before four readings existed, and recorded that the
artifact kept only the final reading, not the sequence — so it could not say what the wait had been
spent on.

This change first made the sequence observable: every poll now records when it returned, how long
its round trip took, whether the reading changed, which `engine.*` measures landed since the
previous poll, and the injected rAF sampler's frame stamps since the previous poll; the idle history
fold (`engine.fold`) and the deferred crayon shadow drain (`engine.crayonShadow`) gained
`PERF_MARKS` measures so that trace could name them. Two on-demand dispatches on 2026-09-06
([run 34057925219](https://github.com/KyleMit/Splotch/actions/runs/34057925219),
[run 34058312921](https://github.com/KyleMit/Splotch/actions/runs/34058312921)) then measured what
the 10 s held, on `macos-latest`, after the crayon scenarios' 37–65 s synchronous draw:

| Stage after the draw returns     | Measured                                                                         | What it is                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Before the first poll can return | 4,601 / 4,880 / 4,961 / 5,911 / 9,673 ms; one frame stamp, no `engine.*` measure | One uninterruptible browser task. Not product JavaScript; it also holds the 1.5 s fold timer.            |
| `engine.crayonShadow`            | 2,070 / 2,263 / 2,865 ms                                                         | The deferred whole-tile shadow readback of the twenty dirty tiles (`crayonPassBuffer.ts`). 0 ms locally. |
| `engine.fold`, twice             | 12–130 ms each                                                                   | The idle compaction the settle was nominally waiting for.                                                |
| Polls once the thread is free    | 1–19 ms round trips, 100 ms apart                                                | The observation cadence.                                                                                 |

Every one of the 24 recorded timeouts took exactly four samples in 10.0–13.9 s. A developer Mac
settles the same scenario in 310 ms and reads twenty-two retained commands with no base tiles; the
runner, when it completed, read twenty commands and a full base. Which side of the folds the
"quiescent" reading landed on depended only on how fast the host was, so the memory table the wait
existed to fill was never comparable across hosts.

None of this touches what the gate scores. The `engine.commit` samples are all taken inside the
synchronous draw, before the wait begins. Skipping the scenario discarded a complete measurement
because a diagnostic wait had expired, and the fresh-runner retry reproduced it because the stall is
a property of the runner class, not of one VM.

Alternatives considered:

* **Raise the 10 s.** Rejected on its own: the deadline would still decide coverage, and the wait
  would still race the folds, so the table stays host-dependent and a slower runner class files the
  same issue again.
* **Keep sample agreement but ignore the fold counters.** The polls still queue behind the stall, so
  four agreeing samples cost the same wall clock; and the reading is still pre-fold on a fast host.
* **Have the harness force the folds.** Needs a product seam with no production caller.
* **Split `incomplete` into subcauses** as ADR-0158 proposed. The settle subcause is the only one
  that has occurred, and it is not a coverage failure at all, so it is removed rather than named.

## Decision

**The settle waits for the steady state the product itself defines.** `historyIsQuiescent` reads the
debug contract for the fold loop's own stopping condition — no open command and no more retained
commands than undo entries (`scheduleTiledHistoryFold` in `tiledRenderer.ts`) — and confirms it with
one more identical poll (`SETTLE_STABLE_SAMPLES = 2`). Every host now reads the post-fold steady
state.

**Expiry is recorded, never thrown.** `settleHistory` returns
`{ debug, settled, samples, elapsedMs, trace }`; an expired wait returns the last reading with
`settled: false`, the scenario warns and continues into its undo phase, the scenario result carries
the object as `settle`, and `undo-scenarios.md` reads "Completed; history unsettled after N ms (k
samples)" in the status column. A scenario is `skipped` — and fingerprints as `<key>:incomplete` —
only when it genuinely threw.

**The deadline is derived, bounds wall clock only, and is drift-guarded.**
`DEFAULT_HISTORY_SETTLE_TIMEOUT_MS = 45_000` covers the deepest fold backlog a scenario can leave
(its stroke count less `MIN_TILED_UNDO_COMMANDS`, one `TILE_HISTORY_FOLD_IDLE_MS` apart) plus the
measured post-burst stall with margin; `tools/perf/tests/history-settle-deadline.test.mjs` reads
both product constants and fails if the deadline falls under that sum. ADR-0158's guard stands: the
deadline cannot expire before `SETTLE_STABLE_SAMPLES` readings exist.

**The trace is part of the artifact.** Each poll's timing, measures, frames, and reading ride on
`scenario.settle.trace`, so the next investigation reads the sequence instead of inferring it.

## Consequences

* \+ A slow runner no longer converts a complete measurement into missing coverage. The recurring
  `crayon-scribbles:incomplete` signature in issue 1578 cannot be produced by a settle wait.
* \+ The "Tiled history after drawing" and "History raster memory" tables describe the same state on
  every host: the post-fold steady state, base tiles included. Rows captured before this change on a
  fast host read the pre-fold state (no base tiles) and are not comparable with rows after it.
* \+ The runner's post-burst cost is now attributable from an ordinary artifact:
  `engine.crayonShadow` names 2–3 s of product work on a software-canvas host that costs nothing on
  a GPU, and the unnamed 4.6–9.7 s task is bounded to the browser rather than to any engine code.
* − **Wall clock.** `multi-finger` retains eleven of its twenty-two commands under the byte budget,
  so the settle now waits through eleven folds (≈ 11 × `TILE_HISTORY_FOLD_IDLE_MS`) where it used to
  return in 0.3 s; every other scenario waits through two. The fast suite grows by roughly 17 s, the
  full suite by roughly 35 s, on every host.
* − **A history that never reaches its steady state no longer fails the job.** It is visible in
  every artifact and report row, and a run that expires on every scenario would be obvious, but it
  is telemetry rather than a red. A fold-loop regression that needs a red would be a separate check
  on `settle.settled`, not added here because nothing has ever produced that state.
* − The 4.6–9.7 s browser task is named as not-product but not explained. It is worth its own
  investigation only if the same stall appears on a physical device after a long crayon session; the
  shared runner's software canvas is the likelier owner.
