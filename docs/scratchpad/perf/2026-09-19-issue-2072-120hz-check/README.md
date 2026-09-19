# Issue 2072: the 120 Hz fold-flush check (120 Hz unresolved; pin-free 60 Hz replication confirmed)

This is the evidence package for the reviewed result in
[issue 2072's comment 5741857656](https://github.com/KyleMit/Splotch/issues/2072#issuecomment-5741857656).
That comment holds the tables, the verdict, and the compact data. This package holds what the
comment could not:

* the full sanitized raw runs;
* the frozen plan and its amendments;
* the cadence-probe records;
* the trace extracts;
* a manifest of hashes;
* a script that rebuilds every derived output and checks it against the session's originals.

The product change is PR 2074 (merge a8ff7916ea9395ed50534e9da9b22d489e256e86). Its original
confirmation is in
[`../2026-09-18-issue-2072-android-fold-flush/`](../2026-09-18-issue-2072-android-fold-flush/README.md).

## Outcome

* **120 Hz: unresolved.** On this phone with Chrome 153, the no-touch in-page workload's
  `requestAnimationFrame` ran at 60 Hz, although the panel reported 120 Hz. Pinning the panel to 120
  Hz did not change that, so the harness could not hold 120 Hz. Nothing here is a 120 Hz result.
* **Pin-free 60 Hz replication: confirmed.** The comparison was 5 runs against 5 on main
  73b77dfbcd4a3f0d414d86928cbdeb3fd349bcd4, with the refresh pins unset.
  * The worst undo-phase interval fell from a median of 1,424.5 to 23.1 ms.
  * The worst idle-fold frame rose from a median of 58.3 to 83.3 ms.
  * All ten runs were valid and none was replaced.

## Identities

| Item          | Value                                                                                                                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Treatment     | main 73b77dfbcd4a3f0d414d86928cbdeb3fd349bcd4, unmodified `npm run perf:build`, entry `start.BE2GeFJm.js`                                                                                             |
| Control       | the same commit plus [`original/control.diagnostic-only.diff`](original/control.diagnostic-only.diff), entry `start.BWCvNp7k.js`                                                                      |
| Harness       | `run-session-android.mjs`, `score.mjs`, `run-traced.mjs`, `trace-hist.mjs`, `trace-folds.mjs` from the 2026-09-18 package; the 1750 package's `session-payload.js`. Hashes: `original/harness.sha256` |
| Workload      | `restamp` crayon, `paced`, `{"undoGapMs":700,"margin":24}`, on `/dev/engine`                                                                                                                          |
| Runtime       | physical Android phone (SM-G990U1), Chrome 153 web (`Android 10; K` reduced UA), portrait 360×643 at DPR 3                                                                                            |
| Measured rate | the panel reported `renderFrameRate 120`; the page's rAF ran at 16.6–16.7 ms in every scored run                                                                                                      |

**The control diff is diagnostic only.** It replaces `withCanvasRasterFlush(foldOldestCommand)` with
`foldOldestCommand()` so that the fold skips the flush. It must never be applied to production
source.

## Contents

| Path                                                                                        | What it is                                                                                                                         |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `runs/scored/*.json.gz`                                                                     | The ten scored runs, byte-for-byte JSON apart from the dropped `harnessUrl`, with every rAF stamp and every `engine.*` measure     |
| `runs/traced/*.json.gz`                                                                     | The two traced, unscored runs' session results                                                                                     |
| `traces/*.extract.json.gz`                                                                  | Trace extracts described below                                                                                                     |
| `original/PLAN.md.txt`                                                                      | The frozen plan: the run order, validity rules, decision rules, the method-review amendments, and Amendment B (the 120 Hz blocker) |
| `original/prechecks.log`, `driver.log`, `run-set-scored.out`                                | Per-run pre-checks (pins, panel rate, wake state, tab counts, host load) and driver output, in capture order                       |
| `original/cadence-probe.log`, `cadence-probe.mjs`                                           | The seven probe records behind the refresh observation, and the base probe script                                                  |
| `original/*.mjs`, `run-set.sh`                                                              | The scoring, export, and run scripts as used                                                                                       |
| `original/scored-summary.json`, `scored-cadence.json`, `compact.json`, `trace-analysis.txt` | The session's derived outputs; `reproduce.sh` checks against these                                                                 |
| `original/rival-*-findings.json`                                                            | The Codex method review (before capture) and the three evidence-review rounds                                                      |
| `MANIFEST.json`                                                                             | Each packaged file's SHA-256, the SHA-256 of the local original it came from, and the transform applied                            |
| `package.mjs`                                                                               | Builds this directory from the local capture directory                                                                             |
| `reproduce.sh`                                                                              | Rebuilds every derived output from the packaged files and compares it with the original                                            |

### Sanitization

* **Run files** drop `harnessUrl`, which held a LAN address. Nothing else changes.
* **Scripts and review records** have the device serial replaced by `<serial>`, the LAN address by
  `<lan-ip>`, and home paths by `<evidence>` or `<home>`. The manifest marks each file that changed.
* **Trace extracts** keep only two processes: the scored page's renderer and the GPU process.
  * They keep only the events `trace-hist.mjs` and `trace-folds.mjs` read: the frame-callback and
    `BeginMainFrame` events, `RasterCHROMIUM`, `DoRasterCHROMIUM`,
    `Canvas2DResourceProvider::Snapshot`, the renderer's channel-flush events, and
    `CommandBufferService:PutChanged` with its `handler`.
  * They keep the `thread_name` and `process_name` metadata for those two processes.
  * Timestamps, durations, categories, pids, and tids are unchanged. Other processes, other tabs,
    other arguments, and the trace's host metadata are dropped.

## Run order, rules, and deviations

* **Order.** The order was fixed and balanced: `c1 t1 t2 c2 c3 t3 t4 c4 c5 t5`, one fresh page load
  per run. `original/run-set-scored.out` shows it with timestamps.
* **Rules.** The validity, replacement, stopping, and decision rules are in `original/PLAN.md.txt`
  as frozen before the first scored run. The only replaceable class was an independently established
  setup failure. None occurred. The plan is stored as `.txt` so the Markdown formatter cannot
  rewrite its bytes. Its SHA-256 equals the `amendB … PLAN.md` line in `original/harness.sha256`;
  the earlier `PLAN.md` line is the plan before Amendment B.
* **Deviations and failed samples** are disclosed as recorded:
  * **Amendment B, made before capture.** The cadence band moved from 7.8–8.9 ms to 16.2–17.2 ms
    after the probes showed that 120 Hz page cadence was unavailable. The plan hash lines prefixed
    `amendB` record the amended files.
  * **Leftover tabs.** Before every run, Chrome held eight page targets from earlier sessions, one
    of them an older `/dev/engine` tab. The plan required none. The counts were recorded; the
    identities were not.
  * **Orientation.** The phone was lying sideways with auto-rotate on, so the first two probes
    loaded landscape (699×274). Portrait was then held with `accelerometer_rotation=0` and
    `user_rotation=0`, and restored after the session.
  * **An uninformative probe.** The first touch probe, `trt-pin120-touch`, showed no rise above 60
    Hz. Its swipe ran from (540, 2250) to (560, 2260) on a 1080×2340 screen, near the bottom edge.
    The swipe may have missed the page or the measuring window; the cause was not established. The
    next probe swiped mid-page and did show the rise.

### Probe procedure

These seven records are the whole probe set. `cadence-probe.mjs` is the base script: it loads
`/dev/engine`, records 5 s of idle rAF, and reports the page's cadence, viewport, entry, and panel
rate.

The three touch probes ran one-off variants of it. Each variant was made with `sed` and deleted
after use, so the variant scripts themselves were not kept. Their edits and the timed `adb` commands
are recorded here from the session transcript:

| Record                     | Pins      | Variant edits                                    | Concurrent input                                        |
| -------------------------- | --------- | ------------------------------------------------ | ------------------------------------------------------- |
| `trt`, `ctl`               | unset     | none (landscape page)                            | none                                                    |
| `trt-pin120`, `ctl-pin120` | 120 / 120 | none (portrait)                                  | none                                                    |
| `trt-pin120-touch`         | 120 / 120 | 8 s window; adds `per500ms` (frames/s per 0.5 s) | `sleep 7; adb shell input swipe 540 2250 560 2260 2500` |
| `trt-pin120-touch2`        | 120 / 120 | 10 s window; adds `per500ms`                     | `sleep 6; adb shell input swipe 300 1200 800 1300 4000` |
| `trt-pin120-decay`         | 120 / 120 | 20 s window; adds `per1s` (frames/s per second)  | `sleep 5; adb shell input swipe 300 1200 800 1300 1500` |

The pins were set with `settings put system peak_refresh_rate 120.0` and the same for
`min_refresh_rate`, and deleted afterwards. The `sleep` delays count from launching the probe, which
includes page load, so where each swipe landed in the window is approximate.

## Reproduce

From the repository root:

```sh
bash docs/scratchpad/perf/2026-09-19-issue-2072-120hz-check/reproduce.sh
```

It unpacks the runs and extracts to a temporary directory, then checks four outputs byte-for-byte
against the session's originals. The expected output is four `MATCH` lines and exit 0:

| Script                                                  | Reproduces                                                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `score.mjs`                                             | the per-run rows and the arm comparison: medians, ranges, bootstrap CIs, and permutation p           |
| `phase-cadence.mjs`                                     | the phase medians, maxima in beats, the >1.5-beat sensitivity excess, and the settle-interior maxima |
| `export-compact.mjs`                                    | the `compact.json` embedded in the issue comment, which `reproduce.mjs` then scores                  |
| `trace-hist.mjs` and `trace-folds.mjs`, on the extracts | `trace-analysis.txt`, which was computed from the full traces                                        |

To rebuild the package itself from the local originals:

```sh
EVIDENCE_ROOT=<capture-dir> ANDROID_SERIAL=<serial> node --max-old-space-size=8000 docs/scratchpad/perf/2026-09-19-issue-2072-120hz-check/package.mjs
```

A new capture uses the commands in the issue comment's Reproduce section.

## What stays local or is unavailable

The capture machine keeps the following locally. It is not committed here.

* **Full CDP traces.** They are 72 MB and 79 MB, and their SHA-256 sums are in
  `original/trace-analysis.txt`. The repository has no large-artifact route (no LFS, no evidence
  release), so the extracts are the durable copy. Nothing beyond `trace-hist.mjs` and
  `trace-folds.mjs` can be recomputed from them.
* **Unsanitized originals.** Their hashes are in `MANIFEST.json` as `sourceSha256`.
* **The rival agents' session logs.** Their findings documents are included.
* **The builds, the worktrees, and the machine-specific rig state.** These are deliberately
  excluded.

Unavailable:

* The exact touch-probe variant scripts. Only their recorded edits survive (see above).
* The identities of the leftover Chrome tabs.
* Any 120 Hz measurement, and any measurement of single or Undo taps.

## Effort

The same failure, counted across sessions:

| Session                                | Active time |
| -------------------------------------- | ----------- |
| Fix (PR 2074)                          | about 2h45m |
| Native check                           | about 40m   |
| 120 Hz check                           | about 55m   |
| **Reported total before this package** | **4h20m**   |
