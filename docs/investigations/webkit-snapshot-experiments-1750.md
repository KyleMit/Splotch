# WebKit snapshot experiments — issue 1750

No product optimization was selected. Eleven candidate snapshot interventions failed to demonstrate
a convincing combined-path improvement. Device readiness was restored and physical iPad diagnostics
were captured, but no candidate earned correctness or performance approval. The only code change
repairs multi-finger routing in the iPad measurement driver. Issue 1750 remains unresolved; this is
an incomplete implementation attempt, not a fix or a passing performance report.

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
product result. Controls bracketed groups of candidates, serially rather than competing for host
resources. The JSON records their order and the source/build hashes.

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

Every arm in the initial snapshot sweep reported the same retained debug state as its control: 11
undo steps for multi-finger and 20 for crayon, with unchanged patch/base byte counts. These
observations are not pixel tests, redo validation, or a proof of peak native memory. No candidate
proceeded to correctness approval.

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
to its raw CI artifacts. The initial desktop pass added local evidence only. The physical
diagnostics added on resumption are below; no new fresh-runner comparison or Chromium candidate
validation was obtained because no candidate was selected. The iPad and Android preflight failures
are missing validation, never zero-cost passes.

Issues 1700 and 1701 were read with their complete, empty comment threads. This experiment does not
establish a shared root cause. Issue 1700's post-burst interval outside engine measures was not
attributed here; issue 1701's deferred under-shadow drain is distinct from the measured undo
animation replay. Neither issue was relabeled, closed, or absorbed into this attempt.

Device readiness was resolved during the resumption below. A further attempt needs an attributed
rendering-cost hypothesis beyond the rejected snapshot interventions, with animation replay measured
separately from patch restoration. Any selected change still owes the complete latency comparison,
pixel/depth/memory correctness, initial and confirmation samples, fresh-runner comparison, physical
validation, and independent PR review required by issue 1750.

## Resumption: device readiness and two additional interventions

After the devices were connected, Android initially reported locked. Once unlocked, it passed
trusted input at 1.03 moves per frame (121.7 contact moves per second), then passed both device and
page rotation through landscape and portrait. Stay-awake and the thirty-minute screen timeout were
left set for the capture session.

Apple's CoreDevice tool could query the paired iPad and reported a wired transport with no passcode
required. However, neither `idevice_id -l` nor the Mac's IOUSB hardware registry enumerated the
iPad. These are conflicting connection observations, not evidence that the capture transport works.
The normal Appium launch rejected the hardware identifier as unknown. A separate Appium instance
using its installed driver's supported `APPIUM_XCUITEST_PREFER_DEVICECTL=true` option discovered the
identifier but failed its device OS-version query through the legacy connection. Neither launched
WebDriverAgent or completed physical validation. A direct data-cable reconnection and any required
Trust prompt remain the operator's next step; no capture check was weakened.

While readiness was being resolved, two further single-pass snapshot experiments used the same
unchanged-main build, scenario input, and diagnostic driver. Both retained the control's debug
memory and depth:

| Crayon intervention                                                  | Commit P95 | Page draw | Draw to second rAF | Page undo loop |
| -------------------------------------------------------------------- | ---------: | --------: | -----------------: | -------------: |
| Reset discarded full snapshot dimensions immediately after cropping  |        875 |    12,442 |             13,018 |         11,845 |
| Skip source copies for hidden blank snapshots, including their crops |        839 |    12,078 |             12,671 |         12,324 |

Immediate release increased multi-finger page draw to 510 ms despite lowering its commit P95 to 23
ms. Skipping blank copies left multi-finger page draw at 362 ms and commit P95 at 58 ms. Neither arm
demonstrated the required combined-path improvement. Their complete engine distributions join the
original six interventions in the adjacent JSON. No product change has been selected.

## Connected-device resumption and final snapshot experiments

After the iPad was reattached, USB enumeration succeeded. The operator approved the documented
RemoteXPC tunnel through the macOS administrator dialog. A fresh full preflight passed Android
trusted input at 1.02 moves per frame (121.7 contact moves per second), both Android rotations, and
iPad WebDriverAgent launch plus page rotation. Device connectivity is no longer the blocker.

Three further candidate implementations ran against the same unchanged desktop build, followed by
another unchanged control. They preserve the raw scenario input and pacing:

| Crayon arm                                                     | Commit P95 | Page draw | Draw to second rAF | Page undo loop |
| -------------------------------------------------------------- | ---------: | --------: | -----------------: | -------------: |
| Transfer the captured offscreen snapshot to `ImageBitmap`      |          1 |    11,907 |             13,154 |         12,334 |
| Transfer the cropped offscreen snapshot to `ImageBitmap`       |        872 |    12,581 |             13,142 |         12,171 |
| Crop retained commands only when the memory budget requires it |          0 |    11,988 |             13,235 |         12,394 |
| Unchanged control after these experiments                      |        874 |    12,542 |             13,161 |         12,327 |

The budget-triggered policy retains full snapshots until the existing six-paper budget is exceeded,
then crops retained commands oldest first before considering eviction. It retained twenty crayon
undo steps, but increased patch storage from 28.0 MiB to 128.1 MiB without reducing the combined
path. Multi-finger still breached the unchanged raw budget at 50 ms P95; its adjacent control was 48
ms. Both bitmap strategies retained the original debug depth and bytes. None warrants adoption.

Two **attribution-only fault injections** deliberately omitted copying the before-image. They break
undo pixels and are not correctness candidates; their undo timings cannot be treated as equivalent
work. Omitting capture copying alone left crayon draw-to-second-rAF at 13,198 ms and commit P95 at
606 ms. Omitting both capture copying and cropping left draw-to-second-rAF at 13,067 ms, despite
commit P95 becoming zero. This bounds the useful claim: in this workload, those copy operations do
not explain the total delay. It does not identify the remaining renderer work or prove a shared
cause with issues 1700 or 1701.

## Physical iPad diagnostics and the invalid multi-finger row

The local diagnostic used the repository's Appium client, capabilities, cache cleanup and preview
identity helpers. The older `perf:ios:webkit:gates` entry uses the legacy inspector proxy that
`PROFILING-CAMPAIGNS.md` documents as incompatible with modern iOS. The diagnostic instead injected
the same `engine-gates.js` workload over Appium and retained every measure after each scenario. It
verified the served entry module against the page before measuring. The device reported iOS 26.5,
Safari 26.5, a visible 1024 × 1227 viewport and DPR 2. The product build remained unchanged main;
exact build provenance and raw measures are in the adjacent JSON.

This device workload awaits a frame after each stroke. It is **not comparable** to the desktop
burst's pacing, is synthetic rather than calibrated trusted finger input, and does not prove actual
presentation completion. Its page intervals include frame waits but exclude host transport. They
show why a small engine measure cannot acquit the complete interaction:

| Valid physical row                   | Page draw and frame waits | Page undo and frame waits | Commit max | Undo max | Patch storage |
| ------------------------------------ | ------------------------: | ------------------------: | ---------: | -------: | ------------: |
| Crayon scribbles, initial diagnostic |                132,980 ms |                145,207 ms |       1 ms |     6 ms |      24.6 MiB |
| Multi-finger, corrected dispatch     |                  1,693 ms |                    186 ms |       2 ms |     1 ms |     112.0 MiB |

The original multi-finger row is preserved but **invalid**: both a point sequence and a group of
pointer sequences are arrays, so `Array.isArray(s)` dispatched the group to `strokeSync`. Its zero
patch bytes and absent capture measures were missing ink, not a fast multi-touch result. Corrected
dispatch produced 420 snapshot captures and twelve retained undo steps. The physical correction used
the scenario key; the committed driver uses an explicit `multi` flag on that scenario. Its
regression test executes the complete standalone driver and verifies both argument shapes and call
counts. It failed against the original routing (five single-pointer calls instead of three) and
passes with the correction.

These are single diagnostic physical samples, not initial/confirmation candidate approval. No
candidate was selected for a physical A/B, pixel/redo checks, fresh-runner comparison, or
independent PR review. The original issue's done-when remains unmet. The evidence branch contains
the rejected experiments and the small driver correction; it must not close issue 1750 or be
described as a product performance fix.

## Self-heal: connection failure and OS version history

The initial statement that the iPad could not be driven was too broad. The observed failure was
session-specific USB capture discovery. Neither that failure nor the legacy inspector wrapper's
separate limitation established that this iPad was incompatible with automation.

The retained history supports the owner's report that this device was already being driven on 26.5:

* The [July 29 investigation notes](../scratchpad/perf/2026-07-29-ipad-real-screen/findings.md) name
  iPad13,8 and iPadOS 26.5. This is a historical narrative, not an OS installation log.
* The
  [September 3 native crayon artifact](../../perf-profiles/evidence/2026-09-03-deployment-target-matrix-ipad-native/ipad-device-native-crayon.json)
  and
  [September 5 Safari action artifact](../../perf-profiles/evidence/2026-09-05-epic-1567-advanced-controls-control/ipad-device-web-actions.json)
  each record `device.os` as `26.5`.
* The [automation grant log](../../perf-profiles/evidence/operator/ipad-grant-log.tsv) records
  successful WDA launch and page rotation on September 5, 6 and 7, as well as the two September 10
  successes in this session. Those rows prove the exercised launch operations, not continuous
  availability between sessions.
* Before this session's reconnect, CoreDevice already reported `osVersionNumber: 26.5` and build
  `23F77`. After recovery, the physical capture recorded iOS/Safari 26.5. The local discovery output
  remains in `/tmp/issue-1750-ipad-discovery.json`; its exact device identifiers are not copied into
  this report.

The recovery sequence was USB reconnection, starting the missing root-owned RemoteXPC tunnel through
the approved macOS dialog, and successful WDA launch/rotation. No OS or Appium dependency upgrade
was required by those recovery steps. The records do not establish why enumeration failed, why the
tunnel was absent, or when 26.5 was installed; they do not support a recent OS-update explanation.
Nor do they establish an expired XCTest grant as the cause of the initial discovery failure.

Desktop Playwright reported WebKit 26.6. That is a different runtime from the physical iPad's 26.5
and was never a required iPadOS version. The multi-finger driver defect was discovered after
connectivity worked and did not cause the initial inability to discover or launch on the iPad.

The documentation failure was separate and actionable: this runbook's transport catalogue had
already documented the old inspector proxy's modern-iOS limitation, while the iPad reference still
said to reach for that wrapper first. The profiling entry points now direct current-device sessions
to Appium, and the campaign guide requires reports to name the failing connection layer without
inferring an unsupported device or recent OS change.
