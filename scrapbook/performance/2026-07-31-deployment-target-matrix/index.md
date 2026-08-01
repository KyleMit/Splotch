# Deployment-target performance matrix — 2026-07-31

This is a measurement-only snapshot of the tiled renderer at product commit `09c4efac27ca`.
Profiling transport changes were made after that commit so the same probes could reach Android,
simulators, and Capacitor WebViews; no product performance fix was included in this campaign.

The [interactive matrix](./index.html) is the quickest way to compare gate margin and action-failure
patterns. [`data.json`](./data.json) is the committed normalized dataset behind it; it retains every
drawing phase/run and all grouped action results without copying raw event timelines or device
identifiers.

Regenerate both files after updating `sources.json` and the local raw captures with:

```sh
node scripts/perf/deployment-matrix-report.mjs \
  scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json
```

All nine requested targets were captured. The physical Android rows use a Samsung SM-G990U1 on
Android 16 with Chrome/WebView 150; like the other automated-touch rows, their timing results are
advisory until the Android input-fidelity gate is calibrated against hand input.

## Acceptance gates

Drawing passes when paint P95 is at most 20 ms, paint P99 is at most 33 ms, paint max is at most 50
ms, and render starvation is at most 10 ms per drawing-second. Undo passes when engine P95 is at
most 20 ms, next-frame P95 is at most 33 ms, and next-frame max is at most 50 ms. A discrete action
passes when first-frame P95 is at most 32 ms, post-action frame P95 is at most 20 ms, and every
post-action frame is at most 32 ms.

Simulator and local-browser timings are useful comparisons, but they do not approve a physical
device. The physical-iPad web run is the only capture that passed the existing Safari-calibrated
trusted-input fidelity gate. The native iPad had real XCUITest touch cadence and contact geometry,
but its Capacitor WebView produced coalesced samples that the Safari calibration rejects. Simulator
touches were slower than a hand, and Android automation reported no contact geometry. Those rows are
therefore advisory even when their timing gates pass.

## Target inventory

|  # | Deployment target         | Environment                                               | Capture status | Input fidelity                                    |
| -: | ------------------------- | --------------------------------------------------------- | -------------- | ------------------------------------------------- |
|  1 | iPad on device, native    | iPad13,8 · iPadOS 26.5 · Capacitor WebView                | Captured       | Physical timing; native-shell calibration pending |
|  2 | iPad simulator, web       | iPad Pro 13-inch (M5) · iOS 26.5 · Safari                 | Captured       | Advisory simulator input                          |
|  3 | iPad simulator, native    | iPad Pro 13-inch (M5) · iOS 26.5 · Capacitor WebView      | Captured       | Advisory simulator input                          |
|  4 | Android emulator, web     | Pixel 7 Pro API 33 · Android 13 · Chrome 149              | Captured       | Advisory emulator input                           |
|  5 | Android emulator, native  | Pixel 7 Pro API 33 · Android 13 · Capacitor WebView 149   | Captured       | Advisory emulator input                           |
|  6 | Android on device, web    | Samsung SM-G990U1 · Android 16 · Chrome 150               | Captured       | Advisory automated input                          |
|  7 | Android on device, native | Samsung SM-G990U1 · Android 16 · Capacitor WebView 150    | Captured       | Advisory automated input                          |
|  8 | iPad on device, web       | iPad13,8 · iPadOS 26.5 · MobileSafari                     | Captured       | Passed                                            |
|  9 | macOS, web                | MacBook Pro M5 · 32 GB · macOS 26.5.2 · Playwright WebKit | Captured       | Synthetic local input                             |

## Drawing

Each cell is paint `P95 / P99 / max` in milliseconds, followed by starvation milliseconds per
drawing-second. Device and simulator rows are one mixed-stroke capture per brush. macOS is the
median P95/P99 and worst max across three full nine-phase runs; the comparable blank-paper phase is
shown here. **FAIL** means an absolute drawing gate failed.

| Target                     |                     Pen |                         Crayon |                   Magic |                  Eraser |
| -------------------------- | ----------------------: | -----------------------------: | ----------------------: | ----------------------: |
| 1. iPad device native      |       13 / 14 / 17 · S0 |  **FAIL 14 / 35 / 69 · S8.64** |       14 / 19 / 43 · S0 |       13 / 14 / 21 · S0 |
| 2. iPad simulator web      |        8 / 15 / 17 · S0 |               7 / 14 / 19 · S0 |       15 / 16 / 17 · S0 |       13 / 16 / 19 · S0 |
| 3. iPad simulator native   |          5 / 7 / 9 · S0 |              13 / 22 / 30 · S0 |       16 / 18 / 20 · S0 |       12 / 16 / 21 · S0 |
| 4. Android emulator web    | 16.4 / 16.5 / 18.7 · S0 |        14.8 / 16.1 / 16.1 · S0 | 16.4 / 16.4 / 16.4 · S0 |   15.4 / 15.4 / 32 · S0 |
| 5. Android emulator native |   15.1 / 16 / 16.1 · S0 |        15.6 / 15.7 / 15.7 · S0 | 15.8 / 15.8 / 16.1 · S0 | 15.7 / 16.4 / 16.4 · S0 |
| 6. Android device web      | 15.6 / 16.4 / 23.1 · S0 |        15.5 / 16.4 / 24.2 · S0 | 15.5 / 16.4 / 16.7 · S0 | 15.5 / 16.3 / 16.6 · S0 |
| 7. Android device native   |    7.9 / 8.2 / 8.3 · S0 | **FAIL 7.9 / 8.2 / 64.8 · S0** |   7.9 / 8.2 / 20.7 · S0 |    7.8 / 8.2 / 8.4 · S0 |
| 8. iPad device web         |       16 / 17 / 38 · S0 |              16 / 27 / 40 · S0 |       16 / 17 / 35 · S0 |       15 / 20 / 24 · S0 |
| 9. macOS web               |       17 / 18 / 18 · S0 |              18 / 18 / 19 · S0 |       17 / 18 / 18 · S0 |       17 / 17 / 17 · S0 |

The physical native iPad's crayon failure came from one 73 ms in-contact frame gap: paint P95
remained 14 ms, but P99/max reached 35/69 ms. Its starvation score remained inside the 10 ms/s
budget. The run is preserved as a failure rather than repeated until green.

The physical Android web drawing runs passed every brush gate. Native pen, Magic, and eraser also
passed, while native crayon preserved one 64.8 ms maximum frame as a failure despite 7.9/8.2 ms
P95/P99 and zero starvation.

The macOS eraser's blank-paper path passed in all three runs. Across the full 27 renderer-phase
samples, one `page-no-nudge` sample reached 58 ms paint max and would fail the 50 ms hard maximum;
the other two identical runs measured 17 ms max for that phase. Pen, crayon, and Magic had no gate
failure in any of their 27 phase samples.

## Undo

Undo was measured after the pen history setup. Values are
`engine P95 / next-frame P95 /
next-frame max` in milliseconds.

| Target                     |       Undo timing | Actions | Result                                                                                   |
| -------------------------- | ----------------: | ------: | ---------------------------------------------------------------------------------------- |
| 1. iPad device native      |       1 / 12 / 12 |      10 | Pass                                                                                     |
| 2. iPad simulator web      |       1 / 14 / 14 |      10 | Pass, advisory input                                                                     |
| 3. iPad simulator native   |       1 / 14 / 14 |      10 | Pass, advisory input                                                                     |
| 4. Android emulator web    | 0.2 / 14.1 / 14.1 |      10 | Pass, advisory input                                                                     |
| 5. Android emulator native |   0.3 / 3.6 / 3.6 |      10 | Pass, advisory input                                                                     |
| 6. Android device web      | 1.2 / 11.8 / 11.8 |      10 | Pass, advisory input                                                                     |
| 7. Android device native   |   0.7 / 3.7 / 3.7 |      10 | Pass, advisory input                                                                     |
| 8. iPad device web         |       1 / 11 / 11 |       5 | Pass                                                                                     |
| 9. macOS web               |                 — |       — | No engine/next-frame undo probe in the desktop runner; the discrete undo action is below |

## Discrete-action overview

All measured targets ran the current 46-action plan three times. The physical Android captures also
recorded the five-second idle-frame control added to the runner; it remains in `data.json` but is
excluded from this user-action comparison. Worst columns are the maximum grouped value across the
actions, not a percentile across actions.

| Target                     | Passing actions | Worst first P95 | Worst post P95 | Worst post max | Failed actions                                        |
| -------------------------- | --------------: | --------------: | -------------: | -------------: | ----------------------------------------------------- |
| 1. iPad device native      |         43 / 46 |              24 |             17 |            160 | Select coloring page; clear drawing; ink rotation out |
| 2. iPad simulator web      |         35 / 46 |              43 |             18 |             72 | 11 failures; see full table                           |
| 3. iPad simulator native   |         39 / 46 |              38 |             19 |            108 | 7 failures; see full table                            |
| 4. Android emulator web    |         12 / 46 |            28.8 |           33.3 |          283.3 | 34 failures; see full table                           |
| 5. Android emulator native |         42 / 46 |            53.1 |           16.8 |            100 | All four rotations                                    |
| 6. Android device web      |         34 / 46 |            86.2 |             25 |           75.1 | 12 failures; see interactive matrix                   |
| 7. Android device native   |         42 / 46 |              32 |            8.4 |           66.8 | All four rotations                                    |
| 8. iPad device web         |         46 / 46 |              29 |             17 |             32 | None                                                  |
| 9. macOS web               |         45 / 46 |              34 |             19 |             27 | Cold What's New first frame                           |

The Android emulator web action result is much noisier than its drawing paint result. The physical
Chrome run improved from 12/46 to 34/46 passing rows, separating substantial emulator/host
contention from failures that also reproduce on hardware. Native Android held every non-rotation
action inside the gates on both emulator and device; all four physical-device rotation actions
failed, with post-action maxima up to 66.8 ms.

## Full 46-action results

Each cell is `first-frame P95 / post-action P95 / post-action max` in milliseconds. The physical
Android columns are available in the interactive matrix and normalized dataset; they remain omitted
from this already-wide Markdown table. A bold **FAIL** means one of the 32/20/32 ms action gates
failed.

| Action                                         |       iPad native |      iPad sim web |   iPad sim native |              Android web |          Android native | iPad web |           Mac web |
| ---------------------------------------------- | ----------------: | ----------------: | ----------------: | -----------------------: | ----------------------: | -------: | ----------------: |
| expand action drawer                           |           7/17/17 |           1/17/20 |           2/17/23 |  **FAIL** 6.2/33.3/283.3 |          13.2/16.8/16.8 |  7/17/21 |          14/19/19 |
| collapse action drawer                         |           9/17/18 |           1/17/19 |           1/17/17 | **FAIL** 15.5/16.8/249.9 |          10.3/16.8/16.8 |  7/17/17 |          16/19/20 |
| change ink color                               |           6/17/19 |           1/17/21 |           2/17/17 |           15.9/16.7/16.8 |          15.5/16.8/16.8 |  8/17/24 |          13/19/19 |
| open custom color picker                       |          12/17/17 |  **FAIL** 4/17/72 |           5/17/32 |           15.7/16.7/16.8 |          14.1/16.7/16.8 |  9/17/20 |          15/19/19 |
| select custom color                            |           8/17/18 |           4/17/19 |           4/17/18 |  **FAIL** 14.1/16.8/66.7 |            16/16.8/16.8 | 26/17/29 |          17/19/19 |
| open brush menu                                |           6/17/18 |           1/17/18 |           1/17/17 |  **FAIL** 15.8/16.8/66.6 |          14.4/16.8/16.8 |  8/17/19 |          14/19/19 |
| select crayon brush                            |           7/17/19 |           2/17/18 |           3/17/18 |           11.2/16.7/16.8 |           4.4/16.8/16.8 |  7/17/19 |          15/19/19 |
| select Magic brush                             |           7/17/18 |           2/17/18 |           2/17/18 |  **FAIL** 15.9/16.8/33.3 |          11.8/16.8/16.8 |  7/17/19 |          15/19/19 |
| select eraser                                  |           6/17/18 |           2/17/32 |           2/17/17 |  **FAIL** 15.5/33.3/66.6 |            14/16.8/16.8 |  7/17/18 |          12/19/20 |
| select pen brush                               |          13/17/17 |           2/17/18 |           3/17/18 |    **FAIL** 12/16.8/33.3 |          13.1/16.7/16.8 |  8/17/19 |          15/19/19 |
| open stroke-width menu                         |           6/17/19 |           1/17/22 |           1/17/18 |           14.4/16.7/16.8 |          14.3/16.8/16.8 |  8/17/17 |          15/19/19 |
| change stroke width                            |           7/17/18 |          17/17/18 |           1/17/18 |           11.9/16.7/16.8 |          13.9/16.8/16.8 |  8/17/19 |          16/19/19 |
| open Parent Center                             |          13/17/18 |  **FAIL** 7/17/41 |          11/17/24 |  **FAIL** 28.8/16.8/83.3 |             6/16.7/16.8 | 18/17/19 |          25/19/20 |
| open Parent Center section: Sound              |           5/17/17 |          11/17/21 |           5/17/18 |   **FAIL** 5.4/16.8/33.4 |          13.4/16.8/16.8 |  5/17/18 |          12/19/19 |
| open Parent Center section: Saving             |           4/17/18 |           8/17/18 |           7/17/18 |  **FAIL** 10.9/16.7/33.3 |          10.8/16.8/16.8 |  6/17/17 |          10/19/19 |
| open Parent Center section: Controls & Buttons |           7/17/17 |           8/17/19 |           9/17/22 |   **FAIL** 8.5/16.8/33.3 |           1.5/16.7/16.8 | 10/17/18 |          10/19/19 |
| open Parent Center section: AI Art             |           8/17/17 |           7/17/19 |           9/17/17 |  **FAIL** 10.6/16.7/33.4 |          11.8/16.7/16.8 | 15/17/17 |          13/19/19 |
| open Parent Center section: Setup Guide        |           9/17/17 |           8/17/19 |           6/17/17 |  **FAIL** 15.3/16.7/33.4 |          12.4/16.7/16.8 |  8/17/17 |          12/19/19 |
| open Parent Center section: What's New         |           9/17/17 | **FAIL** 43/17/40 | **FAIL** 12/17/35 |    **FAIL** 13.6/16.8/50 |          12.1/16.7/16.8 | 16/17/25 | **FAIL** 34/19/19 |
| open Parent Center section: Submit Feedback    |           5/17/17 |           7/17/19 |           8/17/19 |    **FAIL** 12.8/16.7/50 |          13.9/16.7/16.8 |  8/17/17 |          13/19/19 |
| open Parent Center section: About              |           7/17/17 |          12/17/19 |           5/17/20 |   **FAIL** 9.7/16.7/33.3 |          13.9/16.8/16.8 |  6/17/19 |          11/19/19 |
| switch dark theme to light                     |           7/17/18 |  **FAIL** 9/17/34 |          10/17/31 |  **FAIL** 6.1/16.8/133.3 |          15.7/16.8/16.8 | 10/17/21 |          11/19/19 |
| switch light theme to dark                     |           5/17/17 |           8/18/29 |           8/19/29 |  **FAIL** 11.7/16.8/66.7 |          16.7/16.8/16.8 |  8/17/18 |          12/19/19 |
| disable drawing sounds                         |           4/17/17 |          12/17/18 |           8/17/18 |  **FAIL** 14.9/16.8/33.4 |          11.9/16.8/16.8 |  3/17/18 |          13/19/19 |
| enable drawing sounds                          |           5/17/17 |          12/17/18 |          12/17/18 |     **FAIL** 8.5/16.8/50 |          12.8/16.7/16.8 |  7/17/18 |          11/19/19 |
| enable auto-save on delete                     |          10/17/17 |          10/17/18 |           5/17/17 |           10.3/16.7/16.8 |            16/16.7/16.8 |  1/17/17 |          12/19/19 |
| disable auto-save on delete                    |          10/17/17 |           3/17/18 |           6/17/18 |  **FAIL** 12.9/16.7/33.4 |           7.6/16.8/16.8 |  2/17/19 |          10/19/19 |
| disable advanced controls                      |          10/17/17 |           5/17/26 |           6/17/26 |   **FAIL** 8.2/16.8/66.7 |          15.3/16.8/16.8 |  5/17/17 |          12/19/19 |
| enable advanced controls                       |           8/17/17 |           7/17/27 |          10/17/27 |  **FAIL** 10.6/16.8/50.1 |          13.6/16.7/16.8 | 10/17/19 |          14/19/19 |
| disable screenshot action button               |           4/17/17 |           5/17/19 |           7/17/17 |   **FAIL** 6.2/16.8/66.7 |            14/16.8/16.8 |  4/17/18 |          11/19/19 |
| enable screenshot action button                |          10/17/18 |          13/17/18 |           6/17/18 |  **FAIL** 15.4/16.7/33.4 |          15.7/16.7/16.8 |  5/17/17 |          11/19/19 |
| close Parent Center                            |           4/17/17 |          12/17/25 |           9/17/23 |           13.6/16.7/16.8 |          14.3/16.8/16.8 |  7/17/18 |          11/19/19 |
| open coloring books                            |           9/17/18 |           3/17/24 |           4/17/24 |  **FAIL** 10.1/16.7/99.9 |            16/16.7/16.8 | 10/17/32 |          18/19/19 |
| open coloring book                             |           8/17/18 |           3/17/22 |  **FAIL** 9/17/33 |    **FAIL** 12.3/16.7/50 |          16.7/16.7/16.8 |  5/17/17 |           9/19/19 |
| select coloring page                           |  **FAIL** 5/17/39 |  **FAIL** 8/17/40 |  **FAIL** 7/17/41 |   **FAIL** 12.5/16.8/100 |          16.2/16.8/16.8 |  7/17/27 |          11/19/27 |
| clear coloring page                            |           9/17/19 |          24/17/19 | **FAIL** 38/17/19 |  **FAIL** 14.4/16.8/33.4 |          13.9/16.8/16.8 |  5/17/18 |           9/19/19 |
| save screenshot                                |           8/17/17 |           9/17/18 |           9/17/18 |  **FAIL** 15.6/16.8/50.1 |           8.3/16.7/16.8 |  9/17/18 |          14/19/20 |
| undo latest stroke                             |          24/17/18 |           5/17/18 |           5/17/18 |           16.2/16.7/16.8 |          13.6/16.8/16.8 | 29/17/17 |          15/19/19 |
| clear drawing                                  |  **FAIL** 5/17/47 |  **FAIL** 3/17/41 |  **FAIL** 2/18/38 |           14.9/16.7/16.8 |          14.8/16.7/16.8 | 11/17/20 |          15/19/21 |
| empty rotation out                             |          19/17/21 | **FAIL** 14/17/34 |          17/17/29 |            9.5/16.7/16.8 | **FAIL** 53.1/16.8/33.4 | 18/17/18 |           0/19/20 |
| undo clear after blank rotation                |           4/17/19 |           2/17/24 |           1/17/23 |           15.3/16.8/16.8 |          14.2/16.8/16.8 |  8/17/17 |          15/19/19 |
| undo restored stroke after blank rotation      |           6/17/17 |           1/17/18 |           1/17/18 |           16.4/16.8/16.8 |          12.1/16.8/16.8 |  8/17/17 |          16/19/19 |
| clear restored drawing after blank rotation    |           6/17/19 |  **FAIL** 3/17/33 |  **FAIL** 1/17/43 |  **FAIL** 14.8/16.7/33.3 |          15.2/16.8/16.8 |  8/17/21 |          16/19/21 |
| empty rotation return                          |           0/17/18 | **FAIL** 13/17/34 |           0/17/26 |  **FAIL** 11.2/16.8/66.6 | **FAIL** 23.3/16.7/33.4 | 19/17/22 |           0/19/19 |
| ink rotation out                               | **FAIL** 0/17/160 | **FAIL** 12/17/33 | **FAIL** 0/17/108 |   **FAIL** 9.6/16.8/49.9 |  **FAIL** 12.9/16.8/100 | 15/17/20 |           0/19/19 |
| ink rotation return                            |           0/17/25 | **FAIL** 11/17/35 |           0/17/22 |   **FAIL** 8.9/16.7/49.9 | **FAIL** 17.6/16.8/33.4 | 15/17/21 |           0/19/20 |

## Harness adaptations and caveats

The campaign generalized the existing Appium transport rather than introducing a second metric
implementation:

* capability files and external Appium endpoints can select Safari, Chrome, or a native Capacitor
  app;
* both `WEBVIEW_*` and Android's `CHROMIUM` context names are recognized;
* CSS canvas bounds are mapped through either browser chrome or an edge-to-edge native WebView;
* responsive Parent Center navigation works with the tablet sidebar and phone drill-in shell;
* native screenshot profiling uses an instrumented-build persistence sink after PNG export, so it
  measures app work without mutating the photo library or waiting on a system permission sheet;
* native rotation changes the real Parent Center lock toggle, reloads so the Capacitor plugin
  releases the Activity lock, and restores the original setting when the session ends;
* setup/reopen clicks execute deterministically inside the WebView while measured drawing controls
  still use native touch.

The native screenshot interception means the `save screenshot` action measures Splotch's export and
handoff preparation, not the OS gallery write. First-observed readiness includes Appium round-trip
latency and is retained for diagnosis but is not a gate. Android emulator web timing may include
host/emulator contention. Simulator drawing is `--report-only` because its touch cadence and
coalescing cannot pass the physical fidelity gate.

## Source artifacts

Raw profiler JSON remains in the gitignored `perf-profiles/` workspace. The keeper report commits a
normalized, schema-versioned `data.json` with all reported results, but intentionally omits raw
events, screenshots, device identifiers, and redundant probe internals. Primary action artifacts:

* `2026-07-31T13-11-19-189Z-ipad-actions-matrix-ipad-device-native/actions.json`
* `2026-07-31T12-39-07-355Z-ipad-actions-matrix-ipad-simulator-web/actions.json`
* `2026-07-31T12-47-22-749Z-ipad-actions-matrix-ipad-simulator-native/actions.json`
* `2026-07-31T13-02-57-213Z-ipad-actions-matrix-android-emulator-web/actions.json`
* `2026-07-31T13-22-56-341Z-ipad-actions-matrix-android-emulator-native/actions.json`
* `2026-08-01T00-45-06-725Z-android-web-actions-matrix-android-device-web/actions.json`
* `2026-08-01T01-08-46-611Z-ipad-actions-matrix-android-device-native/actions.json`
* `2026-07-31T09-43-50-043Z-ipad-actions-expanded-46-action-regression/actions.json`
* `2026-07-31T10-59-26-734Z-desktop-actions-webkit-current-tiled-mac-confirmation-3x/actions.json`

Drawing artifacts use matching `matrix-<target>-<brush>/real-screen.json` labels. The physical-iPad
web sources are the three `final-*-undo-regression` captures plus `matrix-ipad-device-web-eraser`.
The Mac sources are the three current tiled captures per brush; eraser is `13-27-52`, `13-29-58`,
and `13-32-01` UTC.
