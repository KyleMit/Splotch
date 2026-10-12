# WebKit commit-gate investigation — issue 1717

> **Bisected 2026-09-11.** The breaches this investigation explains were measured on WebKit 26.6
> only. The [issue 1751 bisect](webkit-commit-gate-1751-bisect.md) measured PR 1733's product on
> WebKit 26.5 and the pre-1733 product on WebKit 26.6 on the same macOS runner: the confirmed commit
> breaches follow the `@playwright/test` 1.62.1 → 1.63.0 browser bump that landed in the same
> not-comparable window, not the product. PR 1733's measured regression is on the undo path, and is
> fixed there. The evidence below is unchanged.

The confirmed multi-finger and crayon breaches include deferred canvas rendering paid by undo
snapshot cropping. They are real synchronous waits inside `engine.commit`; the available evidence
does not establish a new commit-only algorithmic regression. The raw 25 ms P95 gate remains in
force. This investigation explains the breaches; it does **not** claim that the renderer meets the
budget or that the same behavior is acceptable on a physical iPad.

## Evidence and scope

Read all 16 issue comments before building. The
[final intake comment](https://github.com/KyleMit/Splotch/issues/1717#issuecomment-5621486359)
allows explaining or fixing each breach, requires unchanged timing thresholds, and distinguishes
earlier build failures from measured results. Full commit distributions and experimental
interventions are preserved in [the evidence JSON](webkit-commit-gate-1717.json). Initial and
confirmation passes are separate, with every raw commit duration retained. This committed JSON is a
curated projection: `measureSummary` contains only `count`, `total`, and `max` from the capture's
`draw.measures`; its per-call `durationsMs` arrays are omitted. The linked original capture
artifacts retain the full distributions. Crop measures cover one crop invocation, not each
individual tile copy. Historical `draw.wallMs` fields in this evidence use the harness-inclusive
interval described below; they have not been relabeled as page time.

The [post-merge main run](https://github.com/KyleMit/Splotch/actions/runs/34498053518) at
cf19b6b8936c671667b44dd8c6e8e7a3d39c0a98 includes PR 1748. Both its first job and fresh-runner retry
built successfully at 529,324 instrumented startup bytes and uploaded diagnostics. These are
measured timing failures, distinct from the preceding `unknown:not-comparable` reports whose builds
produced no commit samples. The reporter correctly retains the non-comparable sentinel; missing
evidence is not a zero-millisecond pass.

| Capture                       | Multi-finger P95, initial / confirmation | Crayon P95, initial / confirmation | Crayon draw total, initial / confirmation | Crayon commit total, initial / confirmation |
| ----------------------------- | ---------------------------------------: | ---------------------------------: | ----------------------------------------: | ------------------------------------------: |
| PR 1748 fresh macOS runner    |                              66 / 106 ms |                         42 / 39 ms |                        94,290 / 96,567 ms |                                597 / 569 ms |
| Post-merge main, first runner |                              85 / 163 ms |                   3,236 / 3,924 ms |                          8,347 / 6,952 ms |                          34,468 / 37,837 ms |
| Post-merge main, fresh retry  |                              91 / 130 ms |                   2,077 / 2,177 ms |                                  See JSON |                                    See JSON |
| Quiet local baseline          |                               50 / 52 ms |                       832 / 851 ms |                          2,311 / 2,321 ms |                            9,230 / 9,263 ms |

Local captures ran serially on the same host and unchanged production build, with an explicit unused
preview port, without concurrent builds or test suites. A process-load check found desktop
applications but no competing test or performance workload. This is an idle development host, not a
dedicated lab machine. The earlier local capture mentioned in the intake comment overlapped reviewer
builds and is not used as a controlled comparison here.

## Attribution

`commitStrokeGroup()` brackets `commitTiledCommand()` and the stroke-end callbacks.
`commitTiledCommand()` crops the pre-command undo patches, retains the command, enforces the byte
budget, and schedules idle folding. The crop copies full pre-command tile snapshots into canvases
sized to the dirty bounds. The two measured scenarios retain the same patch memory and undo depth
across the diagnostic interventions.

A temporary in-page probe wrapped `CanvasRenderingContext2D.drawImage` and tracked whether
`engine.commit:start` had occurred without `engine.commit:end`. It recorded call durations and
source/destination dimensions without modifying the pixels, workload, pacing, or timing boundary.
The local crayon probe measured an 889 ms commit with 889 ms in its crop copies; other repeated
750–834 ms commits likewise spent all but timer quantization in those calls. Multi-finger commits of
58 and 52 ms spent 57 and 52 ms in the same copies. Crop targets were dirty-region canvases copied
from 512-pixel-wide tile snapshots, not an accidental full-paper export or blob encode.

This attributes the blocking API call, not a browser-internal CPU stack. A `drawImage` duration can
include renderer execution, process synchronization, and host scheduling. The repeated
scenario-shaped crayon costs and the interventions below establish deferred canvas work as a
material contributor; they do not prove that every millisecond is CPU rasterization or that no
runner preemption occurred.

The purported local-versus-CI crayon discrepancy is especially misleading when read as commit P95
alone. The earlier CI runner spent about 95 seconds drawing and 0.6 seconds committing, whereas the
main runner spent roughly 8 seconds drawing and 34 seconds committing. The same runtime source can
charge canvas work at different API boundaries. Lower commit P95 did not mean a faster drawing
session. The remaining host-to-host magnitude difference is not calibrated by these captures; there
is no justified normalization factor.

## Interventions rejected as product fixes

These experiments used the same built runtime and full scenario input through temporary browser API
wrappers. None ships. They are causal probes, not passing replacement gate runs.

| Intervention                                          |           Crayon commit P95 | Crayon draw total | Crayon commit total | Disposition                             |
| ----------------------------------------------------- | --------------------------: | ----------------: | ------------------: | --------------------------------------- |
| Baseline                                              |                      832 ms |          2,311 ms |            9,230 ms | Confirmed breach                        |
| Read one snapshot pixel immediately after capture     |                        1 ms |         12,045 ms |                6 ms | Moves the wait into drawing             |
| Read one live-source pixel immediately before capture |                        1 ms |         11,939 ms |                8 ms | Moves the wait into drawing             |
| Copy crop pixels using getImageData/putImageData      | 585 ms; confirmation 567 ms |          1,244 ms |           11,102 ms | Still breaches, increases combined work |

The first two interventions also reduced multi-finger commit P95 to 1 ms while raising its draw
total from 39 ms to 277–297 ms. That is the same relocation, not evidence of an optimization. Moving
crop work to an idle callback, widening the budget, normalizing by draw throughput, or changing the
synchronous burst to paced input would similarly require a different contract. None was adopted.

## Changes and disposition

The committed diagnostics were recaptured locally at 5823b17af6c9c87f2a72949e6ab5d8e1663aade2,
without API wrappers (WebKit 26.6, Darwin 25.6.0 arm64, Node 24.16.0). Crayon remained a confirmed
908/818 ms breach: crop accounted for 9,207 of 9,208 ms in the initial commit total and all 8,956 ms
in confirmation. Snapshot capture itself recorded 1/0 ms total. Multi-finger measured 51/12 ms and
was correctly acquitted by its clean confirmation; crop accounted for 204/151 ms of the respective
207/152 ms commit totals. This variability is further reason to retain confirmation and avoid
claiming that each recurrence is new JavaScript work.

A [fresh macOS run of the same code](https://github.com/KyleMit/Splotch/actions/runs/34500285786)
(WebKit 26.6, Darwin 25.6.0 arm64, Node 22.23.2) built successfully and uploaded both passes with
the new measures. Multi-finger confirmed at 52/129 ms: crop accounted for 811/1,925 ms of 814/1,933
ms commit totals. Crayon confirmed at 42/46 ms: crop accounted for 580/606 ms of 588/610 ms commit
totals, while drawing took 95,474/100,134 ms. The fresh-runner diagnostics therefore locate the same
commit-blocking phase even when most crayon work is paid during drawing. This performance job failed
the unchanged gate; the PR's ordinary tests passed separately.

Capture was not free on that runner: multi-finger snapshot capture totalled 1,477/1,788 ms. Its
initial single-call maximum was 568 ms, larger than the same pass's draw maximum of 106 ms and
commit maximum of 57 ms. That call therefore ran outside both bracketed engine measures. Capture can
also run from progressive clear-capture callbacks and repaint outside a queue drain; these summaries
do not identify which path produced the outlier. The local 1/0 ms capture totals do not generalize
to this host. The commit gate does not cover every synchronous snapshot wait.

The same instrumented build and two scenarios completed in unthrottled Chromium with multi-finger
commit P95 2.0 ms and crayon 1.3 ms. Crayon draw/commit totals were 3,327/20 ms, with 19 ms in crop.
This is advisory evidence that the canvas implementation matters, not a substitute WebKit pass.

Profiling builds emit `engine.undoPatchCapture` around the initial snapshot copy and
`engine.undoPatchCrop` around cropping. Normal builds eliminate these blocks. The scenario JSON
retains each draw/undo measure's distribution, each phase's `harnessWallMs`, browser version, and
host platform/version. Both initial and confirmation passes carry this evidence; the Markdown report
shows the nested timings. Crop is included in commit during drawing and can run during undo/repaint,
so nested totals must not be added.

The harness interval includes Playwright round trips and driver-side payload serialization/transfer
before page execution. A review probe with the same payloads and no drawing measured 355–452 ms for
multi-finger and 179–208 ms for crayon across WebKit and Chromium. These are illustrative host
samples, not a fixed subtraction. The field is explicitly named `harnessWallMs`; it cannot establish
page-only latency or presentation completion. The attribution above uses the nested engine/API
measurements, not this wall interval.

The documentation and generated report no longer claim that fast-tier crayon is normalized, that
`engine.draw` counts individual pointer moves, or that commit costs are independent of burst pacing.
Regression coverage verifies that diagnostic crop costs do not discount the gate and that
confirmation distributions survive serialization.

The remaining product work is a renderer/undo-capture optimization that reduces combined input,
drawing, commit, and presentation latency while retaining pixels, depth, and memory guarantees. It
needs controlled browser and physical-device captures. Issues 1700 and 1701 discuss adjacent
post-burst and readback behavior, but this experiment does not establish that their exact paths
share one cause. The retained raw gate continues to report these breaches rather than concealing
them with an apparent timing-only fix.
