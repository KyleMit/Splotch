# Per-fix segmentation — 2026-08 Splotch performance campaign (Claude lane)

> **Archived copy (2026-09-24).** This file was copied here from the branch that produced it. The
> per-session `reports/`, `ledgers/`, and `manifest.json` it cites were not kept, so its
> session-line citations are historical and cannot be followed; see [the README](../README.md).

Generated mechanically from git markers in the raw transcripts. Read the caveats before the table:
they bound what these numbers can and cannot say.

## What a "fix" is here

A fix is a branch created inside a session. This campaign shipped stacked PRs with one branch per
causal cluster, so a branch is the unit the work was organised around.

## Caveats — binding

**These windows bracket delivery, not investigation.** Median time from branch creation to first
commit is 3 minutes across 105 fixes, which means the branch was typically created AFTER the
diagnostic work, to commit onto. So min_to_first_code_change and min_to_first_measurement measure
how fast delivery followed branch creation, NOT how long the fix took to find. Investigation start
must come from the per-session report narrative, not from git markers.

**Window boundaries.** A window runs from one branch creation to the next (or to session end). Where
a session created many branches in quick succession the window is genuinely short; where diagnostic
work preceded the first branch, that work falls outside every window.

**Unsegmentable sessions.** Sessions that created no branch are marked unsegmentable rather than
given invented precision. Most are review sessions, which correctly produce no fix.

**Physical-device validation.** True only means the session both ran a capture and touched a
physical device. It does not prove the capture for THIS fix ran on hardware; that requires the
report narrative.

## Corpus totals

| Measure                                                        | Value                            |
| -------------------------------------------------------------- | -------------------------------- |
| Fixes segmented from git markers                               | **105**                          |
| Sessions contributing a fix                                    | 15                               |
| Sessions marked unsegmentable                                  | 26                               |
| Median fix window                                              | 22 min                           |
| Fix-window distribution (p10 / p25 / median / p75 / p90 / max) | 3 / 5 / 22 / 84 / 202 / 2227 min |
| Median delivery-to-first-measurement                           | 5 min                            |
| Median delivery-to-first-code-change                           | 3 min                            |
| Median delivery-to-first-local-validation                      | 2 min                            |
| Fixes with a capture in-window                                 | 55                               |
| Fixes with an instrumented build in-window                     | 27                               |
| Fixes with a failed validation in-window                       | 12                               |
| Fixes with a matrix regeneration in-window                     | 11                               |

## Distinct alternative approaches, where the branch names make them explicit

A campaign that tries several shapes for one problem names them `exp/` or `spike/`. These are the
only places the count is unambiguous from git alone; elsewhere it needs the report narrative.

| Session    | Approaches | Branches                                                                                                                                           |
| ---------- | ---------: | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aad29a65` |          4 | `exp/1203-c2-checkpoint-32`, `exp/1203-c1-area-checkpoint`, `exp/1203-c4-no-midstroke-checkpoint`, `exp/1203-c5-adaptive-checkpoint`               |
| `7c37d255` |          1 | `exp/crayon-ablate-1-no-split`                                                                                                                     |
| `4d4e2ec9` |          1 | `spike/gpu-crayon`                                                                                                                                 |
| `01a0556d` |          4 | `exp/perf-crayon-restamp-grid-3x3`, `exp/perf-crayon-restamp-grid-5x5`, `exp/perf-remove-vestigial-crayon-dom`, `exp/perf-crayon-restamp-grid-4x5` |

## Fixes by session

Sessions ordered by start. `cap` = captures, `bld` = instrumented builds, `val` = validations
(failed in brackets), `mtx` = matrix regenerations, `fail` = failed events of any kind in the
window.

### `01a01b7f` — build-test, core

2026-08-19T19:29Z to 2026-08-19T19:54Z · elapsed 25 min · active 0.28h · user-idle 0.00h · iPad 1
min · Android 0 min

*Unsegmentable: no branch created in this session.*

### `01a01b9b` — implementation, core

2026-08-19T19:59Z to 2026-08-19T21:24Z · elapsed 85 min · active 0.61h · user-idle 0.63h · iPad 1
min · Android 0 min

| Fix (branch)                                  | Window | to-meas | to-code | to-val | cap | bld | val | mtx | fail |
| --------------------------------------------- | -----: | ------: | ------: | -----: | --: | --: | --: | --: | ---: |
| `codex/issue-1161-browser-action-performance` | 44 min |       — |      29 |      2 |   0 |   0 |   7 |   0 |    1 |

### `01a0221a` — capture-profiling, core

2026-08-21T02:15Z to 2026-08-21T12:19Z · elapsed 604 min · active 7.58h · user-idle 1.81h · iPad 1
min · Android 1 min

| Fix (branch)                          |  Window | to-meas | to-code | to-val | cap | bld | val | mtx | fail |
| ------------------------------------- | ------: | ------: | ------: | -----: | --: | --: | --: | --: | ---: |
| `codex/performance-matrix-2026-08-20` | 600 min |       — |      22 |     21 |   0 |   0 |  10 |   5 |    2 |

### `28542214` — capture-profiling, core

2026-08-21T10:50Z to 2026-08-21T15:44Z · elapsed 294 min · active 1.73h · user-idle 2.24h · iPad 5
min · Android 0 min

*Unsegmentable: no branch created in this session.*

### `56595d7d` — build-test, aux-planning

2026-08-21T16:29Z to 2026-08-21T16:39Z · elapsed 10 min · active 0.09h · user-idle 0.00h · iPad 0
min · Android 0 min

*Unsegmentable: no branch created in this session.*

### `6e508a29` — capture-profiling, core

2026-08-21T16:42Z to 2026-08-21T22:02Z · elapsed 320 min · active 2.46h · user-idle 1.51h · iPad 8
min · Android 18 min

*Unsegmentable: no branch created in this session.*

### `aad29a65` — implementation, core

2026-08-23T02:38Z to 2026-08-23T13:48Z · elapsed 670 min · active 7.60h · user-idle 2.92h · iPad 28
min · Android 14 min

| Fix (branch)                          |  Window | to-meas | to-code | to-val | cap | bld |    val | mtx | fail |
| ------------------------------------- | ------: | ------: | ------: | -----: | --: | --: | -----: | --: | ---: |
| `fix/1226-preflight-exit`             |   3 min |       — |       3 |      0 |   0 |   0 |      4 |   0 |    0 |
| `feat/1219-campaign-split-transport`  |   7 min |       0 |       4 |      — |   8 |   0 |      0 |   0 |    0 |
| `chore/1223-promote-campaign-tooling` |   5 min |       2 |       3 |      1 |   2 |   0 |      3 |   0 |    0 |
| `docs/1224-capture-evidence-adr`      |   5 min |       — |       3 |      2 |   0 |   0 |      1 |   0 |    0 |
| `docs/1221-android-profiling`         |   3 min |       1 |       2 |      1 |   2 |   0 |      1 |   0 |    0 |
| `perf/1214-desktop-recapture`         |  23 min |       4 |      22 |     21 |   6 |   1 |      3 |   0 |    0 |
| `exp/1203-c2-checkpoint-32`           |   0 min |       — |       — |      — |   0 |   0 |      0 |   0 |    0 |
| `exp/1203-c1-area-checkpoint`         |   1 min |       — |       — |      — |   0 |   0 |      0 |   0 |    0 |
| `exp/1203-c4-no-midstroke-checkpoint` |   2 min |       1 |       — |      — |   2 |   0 |      0 |   0 |    1 |
| `exp/1203-c5-adaptive-checkpoint`     | 213 min |       3 |       1 |      1 |  12 |   2 |      1 |   0 |    0 |
| `perf/1216-ipad-recapture`            |  22 min |       3 |       1 |     21 |   1 |   3 |      2 |   1 |    0 |
| `chore/campaign-sweep-up`             | 157 min |     100 |       1 |      0 |   2 |   1 |      4 |   3 |    1 |
| `chore/matrix-staleness-check`        |   3 min |       — |       2 |      2 |   0 |   0 |      1 |   1 |    0 |
| `docs/reproduce-before-optimizing`    |   1 min |       — |       0 |      — |   0 |   0 |      0 |   0 |    0 |
| `feat/campaign-status-command`        |   1 min |       — |       1 |      0 |   0 |   0 |      1 |   0 |    0 |
| `docs/route-deferred-decisions`       |  55 min |       — |       1 |      — |   0 |   0 |      0 |   0 |    0 |
| `fix/campaign-review-feedback`        | 156 min |       5 |       1 |      2 |   7 |   2 | 33 (1) |  14 |    2 |

### `01a02e2c` — review, core

2026-08-23T10:31Z to 2026-08-23T12:56Z · elapsed 145 min · active 0.74h · user-idle 1.40h · iPad 3
min · Android 3 min

*Unsegmentable: no branch created in this session.*

### `80cceecf` — implementation, core

2026-08-23T18:43Z to 2026-08-24T01:29Z · elapsed 405 min · active 2.35h · user-idle 4.18h · iPad 3
min · Android 17 min

| Fix (branch)                                   |  Window | to-meas | to-code | to-val | cap | bld | val | mtx | fail |
| ---------------------------------------------- | ------: | ------: | ------: | -----: | --: | --: | --: | --: | ---: |
| `claude/issue-1234-per-runtime-input-fidelity` | 399 min |      63 |      10 |      5 |   4 |   2 |  57 |  15 |    2 |

### `01a030e0` — review, core

2026-08-23T23:06Z to 2026-08-24T01:04Z · elapsed 118 min · active 0.73h · user-idle 1.02h · iPad 2
min · Android 8 min

*Unsegmentable: no branch created in this session.*

### `f7618b89` — planning, aux-planning

2026-08-24T01:34Z to 2026-08-25T01:28Z · elapsed 1434 min · active 4.25h · user-idle 18.32h · iPad
24 min · Android 57 min

| Fix (branch)                               |  Window | to-meas | to-code | to-val | cap | bld | val | mtx | fail |
| ------------------------------------------ | ------: | ------: | ------: | -----: | --: | --: | --: | --: | ---: |
| `claude/issue-1218-hand-capture-harness`   |  12 min |       2 |       — |      9 |   3 |   0 |   4 |   0 |    0 |
| `claude/issue-1218-cadence-calibration`    |   7 min |       — |       — |      3 |   0 |   0 |   7 |   0 |    0 |
| `claude/issue-1269-fidelity-retry`         |   4 min |       — |       — |      2 |   0 |   0 |   3 |   0 |    0 |
| `claude/issue-1271-ipad-rotation`          |   2 min |       — |       — |      2 |   0 |   0 |   1 |   0 |    0 |
| `claude/issue-1270-matrix-currency`        |  99 min |       3 |       2 |      0 |   7 |   0 |   3 |   3 |    0 |
| `claude/issue-1282-actions-regime`         |   1 min |       — |       — |      — |   0 |   0 |   0 |   0 |    0 |
| `claude/issue-1220-android-web-recapture`  | 202 min |       4 |       1 |    198 |   6 |   0 |   3 |   0 |    0 |
| `claude/issue-1274-native-split-transport` | 163 min |      27 |       — |      — |   2 |   1 |   0 |   0 |    0 |
| `claude/pr-1288-review-fixes`              | 190 min |       0 |       1 |      0 |   7 |   0 |  12 |   0 |    0 |
| `claude/pr-1289-review-fixes`              | 120 min |      11 |       1 |      0 |   4 |   0 |  15 |   0 |    1 |
| `claude/pr-1291-review-fixes`              | 574 min |      11 |       2 |      1 |  12 |   0 |  16 |   1 |    0 |

### `01a03302` — review, core

2026-08-24T09:03Z to 2026-08-24T22:34Z · elapsed 811 min · active 1.81h · user-idle 11.17h · iPad 21
min · Android 33 min

*Unsegmentable: no branch created in this session.*

### `3e6f6f97` — capture-profiling, core

2026-08-25T01:26Z to 2026-08-25T18:31Z · elapsed 1025 min · active 5.13h · user-idle 9.67h · iPad 29
min · Android 26 min

| Fix (branch)                                    |  Window | to-meas | to-code | to-val | cap | bld | val | mtx | fail |
| ----------------------------------------------- | ------: | ------: | ------: | -----: | --: | --: | --: | --: | ---: |
| `claude/issue-1198-blank-rotation-undo-repaint` |  44 min |      38 |      23 |     20 |   1 |   2 |  14 |   0 |    2 |
| `claude/issue-1197-rotation-resize-anchor`      |  40 min |      20 |      19 |     17 |   2 |   0 |  15 |   0 |    0 |
| `claude/issue-1294-landscape-wrong-tab`         | 198 min |      20 |      33 |     16 |   4 |   1 |  19 |   0 |    0 |
| `claude/campaign-review-feedback`               |  25 min |       1 |       5 |      3 |   2 |   0 |   3 |   0 |    0 |
| `claude/1321-review-followups`                  |  83 min |      18 |      17 |      3 |   8 |   0 |   6 |   3 |    1 |
| `claude/1322-android-matrix-fold`               | 168 min |       2 |      93 |     91 |  16 |   1 |   7 |   1 |    0 |
| `claude/1237-rotation-undo-tap`                 |  54 min |      16 |      34 |     15 |   3 |   0 |   4 |   0 |    0 |
| `claude/1251-pin-action-sweep-refresh`          |  20 min |       4 |      18 |      4 |   6 |   0 |   6 |   0 |    0 |
| `claude/1236-native-crayon-op-granularity`      |   1 min |       — |       — |      — |   0 |   0 |   0 |   0 |    0 |
| `claude/1236-discarded-per-sample-split`        |  36 min |      16 |       5 |     15 |   1 |   0 |   4 |   0 |    1 |

### `01a038a2` — review, core

2026-08-25T11:16Z to 2026-08-25T11:45Z · elapsed 29 min · active 0.36h · user-idle 0.00h · iPad 2
min · Android 3 min

*Unsegmentable: no branch created in this session.*

### `d2249b1c` — implementation, core

2026-08-25T18:32Z to 2026-08-25T22:03Z · elapsed 211 min · active 2.26h · user-idle 0.92h · iPad 3
min · Android 4 min

| Fix (branch)                                 | Window | to-meas | to-code | to-val | cap | bld |    val | mtx | fail |
| -------------------------------------------- | -----: | ------: | ------: | -----: | --: | --: | -----: | --: | ---: |
| `perf-instrument-fixes-base`                 |  3 min |       — |       — |      — |   0 |   0 |      0 |   0 |    0 |
| `claude/issue-1324-rotation-firstframe-na`   |  7 min |       — |       4 |      3 |   0 |   0 |      3 |   0 |    0 |
| `claude/issue-1290-single-sample-verdicts`   |  4 min |       — |       1 |      1 |   0 |   0 |      2 |   0 |    0 |
| `claude/issue-1297-gesture-repeats-contract` | 12 min |       — |       5 |      4 |   0 |   0 |      1 |   0 |    0 |
| `claude/issue-1292-eraser-cells`             | 11 min |       — |       8 |      3 |   0 |   0 |      4 |   0 |    0 |
| `claude/issue-1315-mark-contaminated-corpus` | 10 min |       — |       4 |      1 |   0 |   0 | 10 (3) |   0 |    4 |
| `claude/issue-1316-operator-first-contact`   |  3 min |       — |       3 |      1 |   0 |   0 |      2 |   0 |    0 |
| `claude/issue-1307-floor-control-nonce`      |  4 min |       — |       3 |      2 |   0 |   0 |      1 |   0 |    0 |
| `claude/issue-1300-finish-heartbeat`         |  4 min |       — |       3 |      2 |   0 |   0 |      2 |   0 |    0 |
| `claude/issue-1301-campaign-server-guard`    |  5 min |       — |       4 |      2 |   0 |   0 |      3 |   0 |    0 |
| `claude/issue-1306-error-report-acceptance`  |  3 min |       — |       1 |      0 |   0 |   0 |      1 |   0 |    0 |
| `claude/stack-1336-review-fixes`             | 84 min |       4 |       6 |      3 |   5 |   0 |      8 |   0 |    0 |
| `claude/stack-1336-review-feedback-2`        | 61 min |      37 |       2 |      2 |   1 |   1 |     14 |   0 |    1 |

### `01a03a8c` — review, core

2026-08-25T20:11Z to 2026-08-25T23:36Z · elapsed 205 min · active 0.43h · user-idle 2.65h · iPad 2
min · Android 0 min

*Unsegmentable: no branch created in this session.*

### `abcb7ded` — implementation, core

2026-08-25T21:59Z to 2026-08-26T00:23Z · elapsed 144 min · active 1.46h · user-idle 0.64h · iPad 1
min · Android 0 min

| Fix (branch)                            | Window | to-meas | to-code | to-val | cap | bld | val | mtx | fail |
| --------------------------------------- | -----: | ------: | ------: | -----: | --: | --: | --: | --: | ---: |
| `claude/gesture-plan-contract`          |  8 min |       — |       5 |      4 |   0 |   0 |   3 |   0 |    0 |
| `claude/desktop-rotation-declaration`   | 16 min |       — |      15 |     14 |   0 |   0 |   2 |   0 |    0 |
| `claude/delimiter-aware-attribution`    |  1 min |       — |       1 |      0 |   0 |   0 |   1 |   0 |    0 |
| `claude/rescore-refuses-unattributable` |  4 min |       — |       3 |      1 |   0 |   0 |   1 |   0 |    0 |
| `claude/evidence-keep-prefers-passing`  |  3 min |       — |       3 |      2 |   0 |   0 |   2 |   0 |    0 |
| `claude/campaign-review-test-gaps`      | 24 min |       — |       8 |      5 |   0 |   0 |   6 |   0 |    2 |
| `claude/stack-1353-review-feedback`     | 70 min |       — |       1 |      3 |   0 |   0 |   9 |   0 |    0 |
| `claude/stack-1353-review-feedback-2`   | 14 min |       — |       1 |      1 |   0 |   0 |   3 |   0 |    0 |

### `01a03b48` — capture-profiling, core

2026-08-25T23:37Z to 2026-08-26T00:02Z · elapsed 26 min · active 0.32h · user-idle 0.00h · iPad 1
min · Android 1 min

*Unsegmentable: no branch created in this session.*

### `51590def` — planning, aux-planning

2026-08-26T00:27Z to 2026-08-26T12:21Z · elapsed 713 min · active 2.65h · user-idle 7.97h · iPad 3
min · Android 1 min

| Fix (branch)                            |  Window | to-meas | to-code | to-val | cap | bld | val | mtx | fail |
| --------------------------------------- | ------: | ------: | ------: | -----: | --: | --: | --: | --: | ---: |
| `claude/stack-regime-android-native`    |   4 min |       — |       3 |      1 |   0 |   0 |   5 |   0 |    0 |
| `claude/stack-coalescing-witness`       |   7 min |       — |       5 |      1 |   0 |   0 |   4 |   0 |    0 |
| `claude/stack-density-floor`            |  19 min |       6 |      11 |      1 |   3 |   1 |   7 |   0 |    2 |
| `claude/stack-eraser-fill-invalidation` |   5 min |       — |       3 |      2 |   0 |   0 |   2 |   0 |    1 |
| `claude/stack-trust-block`              |  16 min |       — |       2 |      1 |   0 |   0 |   1 |   0 |    0 |
| `claude/stack-review-sweep`             |  23 min |      20 |       0 |      0 |   3 |   0 |  12 |   0 |    0 |
| `claude/stack-emulator-regime`          | 266 min |       0 |       4 |      3 |   3 |   0 |   2 |   0 |    2 |
| `claude/stack-1365-review-feedback`     |  18 min |       0 |       7 |      3 |   5 |   0 |   9 |   0 |    0 |
| `claude/coachmark-idle-animation`       | 201 min |       2 |      10 |      1 |   4 |   2 |  15 |   0 |    0 |

### `01a03d10` — review, core

2026-08-26T07:55Z to 2026-08-26T08:37Z · elapsed 43 min · active 0.61h · user-idle 0.00h · iPad 6
min · Android 6 min

*Unsegmentable: no branch created in this session.*

### `01a03d72` — capture-profiling, core

2026-08-26T09:42Z to 2026-08-26T10:06Z · elapsed 25 min · active 0.30h · user-idle 0.00h · iPad 1
min · Android 1 min

*Unsegmentable: no branch created in this session.*

### `91dcbd84` — planning, aux-planning

2026-08-26T12:41Z to 2026-08-26T20:19Z · elapsed 458 min · active 3.13h · user-idle 2.51h · iPad 19
min · Android 29 min

| Fix (branch)                                   |  Window | to-meas | to-code | to-val | cap | bld | val | mtx | fail |
| ---------------------------------------------- | ------: | ------: | ------: | -----: | --: | --: | --: | --: | ---: |
| `claude/adr-0146-crayon-op-granularity`        |  13 min |       — |       2 |      2 |   0 |   0 |   1 |   0 |    0 |
| `claude/issue-1356-cell-attributable-producer` |   6 min |       — |       5 |      4 |   0 |   0 |   2 |   0 |    0 |
| `claude/issue-1296-silent-catch-audit`         |  13 min |       — |      12 |     11 |   0 |   0 |   2 |   0 |    0 |
| `claude/issue-1299-grant-expiry-visibility`    |   5 min |       — |       4 |      3 |   0 |   0 |   2 |   0 |    0 |
| `claude/issue-1304-host-quiet-producer`        |  20 min |       8 |       3 |      2 |   3 |   0 |   4 |   0 |    0 |
| `claude/issue-1274-android-native-split`       |  22 min |       — |      22 |     22 |   0 |   0 |   1 |   0 |    0 |
| `claude/issue-1250-fresh-runner-acquittal`     |   0 min |       — |       — |      — |   0 |   0 |   0 |   0 |    0 |
| `claude/calibrate-android-webview-fidelity`    |  33 min |       6 |       5 |      1 |   2 |   0 |   8 |   0 |    0 |
| `claude/issue-1344-quiet-host-studies`         |  26 min |       3 |       1 |      1 |   4 |   0 |   1 |   0 |    0 |
| `claude/1130-open-settings-max-allowance`      |  17 min |       4 |      11 |      1 |   2 |   0 |   9 |   0 |    1 |
| `claude/issue-1323-bundled-channel`            | 200 min |       5 |       7 |      6 |  17 |   0 |   1 |   0 |    0 |
| `claude/campaign-1225-review-feedback`         |  61 min |      13 |      38 |      0 |   1 |   0 |  17 |   0 |    0 |

### `01a03f61` — review, core

2026-08-26T18:42Z to 2026-08-26T19:10Z · elapsed 28 min · active 0.32h · user-idle 0.00h · iPad 1
min · Android 2 min

*Unsegmentable: no branch created in this session.*

### `7c37d255` — implementation, core

2026-08-26T20:24Z to 2026-08-28T09:39Z · elapsed 2236 min · active 4.20h · user-idle 31.27h · iPad 5
min · Android 1 min

| Fix (branch)                   |   Window | to-meas | to-code | to-val | cap | bld | val | mtx | fail |
| ------------------------------ | -------: | ------: | ------: | -----: | --: | --: | --: | --: | ---: |
| `exp/crayon-ablate-1-no-split` | 2227 min |      10 |       0 |     48 |  19 |   7 |  39 |   0 |    3 |

### `01a04260` — review, core

2026-08-27T08:40Z to 2026-08-27T13:03Z · elapsed 264 min · active 0.98h · user-idle 3.13h · iPad 24
min · Android 3 min

*Unsegmentable: no branch created in this session.*

### `332ba4fb` — implementation, core

2026-08-27T13:50Z to 2026-08-28T09:22Z · elapsed 1172 min · active 6.56h · user-idle 12.18h · iPad
102 min · Android 3 min

*Unsegmentable: no branch created in this session.*

### `01a047b9` — implementation, core

2026-08-28T09:35Z to 2026-08-28T19:49Z · elapsed 614 min · active 9.67h · user-idle 0.00h · iPad 2
min · Android 1 min

*Unsegmentable: no branch created in this session.*

### `01a049ec` — handoff-resume, core

2026-08-28T19:51Z to 2026-08-29T02:36Z · elapsed 405 min · active 4.20h · user-idle 1.86h · iPad 21
min · Android 4 min

| Fix (branch)             | Window | to-meas | to-code | to-val | cap | bld | val | mtx | fail |
| ------------------------ | -----: | ------: | ------: | -----: | --: | --: | --: | --: | ---: |
| `codex/pr1486-self-heal` |  9 min |       — |       1 |      0 |   0 |   0 |   3 |   0 |    0 |

### `503bcdde` — review, aux-review

2026-08-29T00:47Z to 2026-08-29T02:12Z · elapsed 85 min · active 0.64h · user-idle 0.72h · iPad 3
min · Android 5 min

*Unsegmentable: no branch created in this session.*

### `9c6625d1` — review, aux-review

2026-08-29T10:28Z to 2026-08-29T10:45Z · elapsed 17 min · active 0.25h · user-idle 0.00h · iPad 0
min · Android 0 min

*Unsegmentable: no branch created in this session.*

### `01a04d49` — implementation, core

2026-08-29T11:31Z to 2026-08-31T01:04Z · elapsed 2253 min · active 10.98h · user-idle 18.59h · iPad
71 min · Android 32 min

| Fix (branch)                                                     |   Window | to-meas | to-code | to-val | cap | bld |    val | mtx | fail |
| ---------------------------------------------------------------- | -------: | ------: | ------: | -----: | --: | --: | -----: | --: | ---: |
| `codex/performance-matrix-zero-red-20260829`                     |  109 min |       5 |       3 |      3 |  10 |   5 |     17 |   0 |    2 |
| `codex/performance-actions-post-frame-20260829`                  |   48 min |       1 |      35 |     15 |   8 |   0 |      4 |   0 |    0 |
| `codex/performance-capture-review-feedback-20260829`             |   41 min |       4 |       0 |      2 |   2 |   0 | 12 (1) |   0 |    5 |
| `codex/performance-action-frame-attribution-20260829`            |   46 min |      15 |       0 |     12 |   2 |   2 |      6 |   0 |    0 |
| `codex/performance-action-attribution-review-20260829`           |   36 min |       — |       4 |      2 |   0 |   0 |  8 (1) |   0 |    1 |
| `codex/performance-demand-priority-overlays-20260829`            |   57 min |      16 |       0 |      1 |   2 |   3 | 20 (1) |   0 |    1 |
| `codex/performance-coloring-selector-presentation-20260829`      |  218 min |      28 |     116 |      3 |  28 |  17 | 40 (1) |   0 |    1 |
| `codex/performance-coloring-review-feedback-20260829`            |   30 min |       — |       0 |      4 |   0 |   0 | 11 (1) |   0 |    1 |
| `codex/performance-merge-readiness-20260829`                     | 1552 min |    1283 |       0 |      8 |   5 |   2 | 41 (6) |   0 |    7 |
| `codex/performance-responsive-selector-review-feedback-20260830` |  117 min |       — |       5 |      4 |   0 |   0 | 11 (1) |   0 |    2 |

### `cd2d1ac2` — review, aux-review

2026-08-29T12:18Z to 2026-08-29T13:21Z · elapsed 63 min · active 0.36h · user-idle 0.68h · iPad 0
min · Android 0 min

*Unsegmentable: no branch created in this session.*

### `0742f1b4` — review, aux-review

2026-08-29T13:59Z to 2026-08-29T14:09Z · elapsed 10 min · active 0.14h · user-idle 0.00h · iPad 0
min · Android 0 min

*Unsegmentable: no branch created in this session.*

### `e21aeb77` — review, aux-review

2026-08-29T14:18Z to 2026-08-29T14:44Z · elapsed 27 min · active 0.29h · user-idle 0.12h · iPad 0
min · Android 0 min

*Unsegmentable: no branch created in this session.*

### `69b8d12f` — review, aux-review

2026-08-29T15:16Z to 2026-08-29T15:35Z · elapsed 19 min · active 0.29h · user-idle 0.00h · iPad 0
min · Android 0 min

*Unsegmentable: no branch created in this session.*

### `d7a932a0` — review, aux-review

2026-08-29T15:41Z to 2026-08-29T16:09Z · elapsed 28 min · active 0.39h · user-idle 0.00h · iPad 0
min · Android 0 min

*Unsegmentable: no branch created in this session.*

### `ebf22b39` — review, aux-review

2026-08-29T16:31Z to 2026-08-29T17:08Z · elapsed 37 min · active 0.40h · user-idle 0.18h · iPad 0
min · Android 0 min

*Unsegmentable: no branch created in this session.*

### `3d85518e` — review, aux-review

2026-08-29T20:28Z to 2026-08-29T20:42Z · elapsed 15 min · active 0.24h · user-idle 0.00h · iPad 0
min · Android 0 min

*Unsegmentable: no branch created in this session.*

### `4d4e2ec9` — planning, core

2026-08-29T20:38Z to 2026-08-30T06:41Z · elapsed 603 min · active 1.65h · user-idle 8.18h · iPad 0
min · Android 0 min

| Fix (branch)       |  Window | to-meas | to-code | to-val | cap | bld |    val | mtx | fail |
| ------------------ | ------: | ------: | ------: | -----: | --: | --: | -----: | --: | ---: |
| `spike/gpu-crayon` | 462 min |       — |      24 |      9 |   0 |   0 | 24 (1) |   0 |    1 |

### `7b134243` — review, aux-review

2026-08-29T21:40Z to 2026-08-29T21:58Z · elapsed 17 min · active 0.25h · user-idle 0.00h · iPad 0
min · Android 0 min

*Unsegmentable: no branch created in this session.*

### `01a0556d` — implementation, core

2026-08-31T01:27Z to 2026-08-31T17:04Z · elapsed 937 min · active 8.45h · user-idle 4.44h · iPad 178
min · Android 5 min

| Fix (branch)                                          |  Window | to-meas | to-code | to-val | cap | bld |    val | mtx | fail |
| ----------------------------------------------------- | ------: | ------: | ------: | -----: | --: | --: | -----: | --: | ---: |
| `codex/performance-matrix-zero-red-current-20260830`  |  22 min |       5 |       — |      — |   5 |   1 |      0 |   0 |    0 |
| `exp/perf-crayon-restamp-grid-3x3`                    |   3 min |       1 |       0 |      — |   1 |   1 |      0 |   0 |    0 |
| `exp/perf-crayon-restamp-grid-5x5`                    |  17 min |       1 |       0 |      — |   6 |   2 |      0 |   0 |    0 |
| `exp/perf-remove-vestigial-crayon-dom`                |   4 min |       1 |       1 |      — |   1 |   1 |      0 |   0 |    1 |
| `exp/perf-crayon-restamp-grid-4x5`                    |  66 min |       1 |       0 |     26 |  14 |   2 |  7 (2) |   0 |    3 |
| `codex/performance-action-frames-current-20260830`    | 186 min |       1 |       1 |      0 |  33 |  27 | 29 (1) |   0 |    2 |
| `codex/performance-theme-coloring-residency-20260831` | 343 min |     239 |     229 |    220 |   5 |   5 |     38 |   0 |    0 |
| `codex/performance-stack-ci-sweep-20260831`           | 199 min |      49 |      35 |      1 |   2 |   1 |     20 |   0 |    3 |
| `codex/fix-performance-matrix-skill-20260831`         |  93 min |       — |       7 |      5 |   0 |   0 |     11 |   4 |    0 |
