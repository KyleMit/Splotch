# WebKit snapshot experiments — issue 1750

No product change was selected. Six snapshot interventions failed to demonstrate a convincing
combined-path improvement, and physical validation was blocked: two host-side capture preflights
found neither the iPad nor the Android phone. This is an incomplete implementation attempt, not a
fix or a passing performance report.

The [evidence JSON](webkit-snapshot-experiments-1750.json) retains the canonical gate's initial and
confirmation samples, all draw/undo engine distributions, snapshot phase diagnostics, diagnostic
page timings, debug memory/depth readings, and intervention bodies. Its projection description names
the omitted fields. Full original captures and the temporary diagnostic driver remain in the local
`perf-profiles/issue-1750/` directory; the canonical baseline is in
`perf-profiles/2026-09-10T17-00-12-700Z-undo-scenarios-webkit-raw/`.

## Baseline and method

All captures used the instrumented production build of unchanged main at
1521c86639be58cefc1271da75e78e3d0c256454, including PR 1749's diagnostics. The host was Darwin
25.6.0 arm64, Node 24.16.0, Playwright WebKit 26.6. The viewport was 1024 × 1366 with DPR 2.
Captures ran serially on explicit ports 43175 and 43176. No builds or test suites ran alongside
them; a host process inspection showed desktop applications and this capture workload. This was a
development host, not a dedicated idle lab machine.

The canonical baseline command was:

```sh
npm run perf:build
npm run perf:web:undo:webkit:fast -- --no-build --port=43175
```

It exited 1 with a confirmed crayon breach. Multi-finger commit P95 was 50 ms initially and 16 ms in
confirmation, so the existing confirmation policy acquitted it. Crayon confirmed at 824/853 ms; its
draw totals were 2,275/2,286 ms, commit totals 9,098/9,381 ms, and undo totals 10,341/10,052 ms. The
raw 25 ms contract, inputs, synchronous pacing, and confirmation policy were unchanged.

Diagnostic arms rewrote only the built snapshot factory in the browser response. The repository's
source and build files were unchanged. Each arm used the original `buildScenarios` and
`runUndoScenario` functions with both fast scenarios, without changing stroke counts, coordinates,
pointer kinds, pacing, or history settlement. Each candidate was measured once; none is a validated
product result. Controls ran before the candidates and twice afterwards, serially rather than
competing for host resources. The JSON records their order and the source/build hashes.

Three additional diagnostics bracketed the page's complete synchronous draw evaluation, its second
subsequent animation-frame callback, and its undo loop. The draw timer begins after the payload has
arrived in the page. The undo loop includes the existing per-action frame waits. A second rAF is a
presentation opportunity, **not proof of displayed pixels**. The existing `harnessWallMs` fields
remain separate and include transport overhead. These intervals do not constitute the issue's full
input-to-presentation acceptance proof. Nested measures must not be added to their enclosing phases.

## Snapshot interventions

All timings below are milliseconds for the unchanged 22-command crayon-scribble workload. Page draw
already includes commits; draw-to-second-rAF already includes page draw.

| Arm                                                | Commit P95 | Page draw | Draw to second rAF | Page undo loop |
| -------------------------------------------------- | ---------: | --------: | -----------------: | -------------: |
| Initial control                                    |        827 |    12,230 |             12,784 |         11,785 |
| `willReadFrequently` on snapshot and crop contexts |        576 |    12,226 |             12,270 |         11,800 |
| `copy` compositing for snapshot and crop copies    |        839 |    12,112 |             12,790 |         11,790 |
| Offscreen snapshot and crop canvases               |        827 |    11,793 |             12,352 |         11,762 |
| Crop through `getImageData` / `putImageData`       |        571 |    12,368 |             12,383 |         11,812 |
| Read one crop pixel immediately after copying      |        597 |    12,596 |             12,610 |         11,882 |
| Read one snapshot pixel immediately after capture  |          1 |    11,946 |             12,499 |         11,836 |
| Final control with undo attribution                |        816 |    11,917 |             12,482 |         11,575 |
| Repeated final control with undo attribution       |        822 |    12,114 |             12,683 |         11,824 |

The one-pixel snapshot read makes commit appear fixed while leaving the combined page path in the
same range. The readback and crop interventions likewise change where the wait lands. The smaller
differences between other single samples do not establish an improvement against the final controls.
None earns adoption or a claim about every possible implementation of that strategy.

Multi-finger also rejects a commit-only reading: the readback hint lowered P95 from 56 to 25 ms,
while page draw increased from 356 to 506 ms. Reading one snapshot pixel lowered P95 to 0 ms while
page draw became 430 ms. The exact per-arm distributions are in the JSON.

Every arm reported the same retained debug state as its control: 11 undo steps for multi-finger and
20 for crayon, with unchanged patch/base byte counts. These observations are not pixel tests, redo
validation, or a proof of peak native memory. No candidate proceeded to correctness approval.

## Undo attribution

The broad `engine.undo` measure includes `createInkMotion().undo()` before `undoTiledCommand()`. The
animation builds a canvas and replays the removed command through `renderOp`, then flushes its
crayon buffer. Assuming the broad measure describes snapshot restoration therefore misattributes
this workload.

Two unchanged-product diagnostic passes bracketed that animation function from entry through
appending its overlay, with no animation disabled or replaced:

| Crayon pass              | Animation total | Entire `engine.undo` total | Animation calls |
| ------------------------ | --------------: | -------------------------: | --------------: |
| Initial attribution      |        9,714 ms |                   9,719 ms |              20 |
| Confirmation attribution |        9,964 ms |                   9,964 ms |              20 |

At the browser's timer resolution, essentially all synchronous undo time in these captures belongs
to animation replay. This explains why changing patch storage did not remove the large undo total.
It does not establish a CPU/GPU split, complete animation presentation time, or physical-device
behavior. No animation change was made under this issue.

## Scope and remaining work

The [1717 investigation](webkit-commit-gate-1717.md) retains the fresh-runner comparison and links
to its raw CI artifacts. This attempt adds local evidence only: no new fresh-runner or physical
comparison was obtained, and no Chromium candidate validation was run because no candidate was
selected. The iPad and Android preflight failures are missing validation, never zero-cost passes.

Issues 1700 and 1701 were read with their complete, empty comment threads. This experiment does not
establish a shared root cause. Issue 1700's post-burst interval outside engine measures was not
attributed here; issue 1701's deferred under-shadow drain is distinct from the measured undo
animation replay. Neither issue was relabeled, closed, or absorbed into this attempt.

Resume with connected, unlocked physical devices and a passing capture preflight. Locate the
snapshot wait on the actual target before selecting a further product experiment, and measure
animation replay separately from patch restoration. Any selected change still owes the complete
latency comparison, pixel/depth/memory correctness, initial and confirmation samples, fresh-runner
comparison, physical validation, and independent PR review required by issue 1750.
