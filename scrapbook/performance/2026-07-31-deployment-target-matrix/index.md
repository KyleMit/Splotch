# Deployment-target performance matrix — 2026-07-31

This cumulative snapshot combines retained deployment-target evidence with focused final-state
recaptures. `4c57798b9ac1` is the final performance-affecting product commit. Every normalized
result retains the commit and raw artifact that produced it; focused action captures replace only
their declared scenarios.

The [interactive matrix](./index.html) is the quickest comparison. [`data.json`](./data.json)
contains every normalized drawing run and grouped action result, and
[`sources.json`](./sources.json) records the ordered source campaign.

Regenerate the JSON, Markdown, and HTML after updating the source manifest with:

```sh
node scripts/perf/deployment-matrix-report.mjs \
  scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json
```

## Acceptance gates

Drawing passes at paint P95 ≤ 20 ms, P99 ≤ 33 ms, max ≤ 50 ms, and starvation ≤ 10 ms per
drawing-second. Undo passes at engine P95 ≤ 20 ms, next-frame P95 ≤ 33 ms, and next-frame max ≤ 50
ms. A discrete action passes at first-frame P95 ≤ 33.5 ms, post-action frame P95 ≤ 20 ms, and
post-action frame max ≤ 33.5 ms.

## Capture limitations

* The final physical-iPad recapture could not start WebDriverAgent: Xcode timed out enabling UI
  automation, and the preinstalled-WDA launch timed out while the device was unavailable for
  automation. The retained physical-iPad evidence remains attributed to 09c4efac27ca.
* Drawing and undo were not rerun after the discrete-action fixes because those changes affect
  action readiness and layout transitions, not drawing or undo execution. Their original product
  commits remain explicit.
* Only physical iPad web uses the Safari-calibrated trusted-input release gate. Simulator, desktop,
  native-shell, and automated Android results are advisory.

## Commit provenance

| Target                       | Drawing      | Undo         | Action source commits      |
| ---------------------------- | ------------ | ------------ | -------------------------- |
| 1. iPad device · native      | 09c4efac27ca | 09c4efac27ca | 09c4efac27ca               |
| 2. iPad simulator · web      | 09c4efac27ca | 09c4efac27ca | 09c4efac27ca               |
| 3. iPad simulator · native   | 09c4efac27ca | 09c4efac27ca | 09c4efac27ca               |
| 4. Android emulator · web    | 09c4efac27ca | 09c4efac27ca | 09c4efac27ca               |
| 5. Android emulator · native | 09c4efac27ca | 09c4efac27ca | 09c4efac27ca               |
| 6. Android device · web      | b91fcc08fa63 | b91fcc08fa63 | b91fcc08fa63, 4c57798b9ac1 |
| 7. Android device · native   | b91fcc08fa63 | b91fcc08fa63 | b91fcc08fa63, 4c57798b9ac1 |
| 8. iPad device · web         | 09c4efac27ca | 09c4efac27ca | 09c4efac27ca               |
| 9. macOS · web               | 09c4efac27ca | —            | 4c57798b9ac1               |

## Drawing

Each cell is blank-paper paint `P95 / P99 / max` in milliseconds, followed by starvation
milliseconds per drawing-second. macOS values aggregate three runs; other targets use one run.

| Target                       | Pen                     | Crayon                         | Magic                   | Eraser                  |
| ---------------------------- | ----------------------- | ------------------------------ | ----------------------- | ----------------------- |
| 1. iPad device · native      | 13 / 14 / 17 · S0       | **FAIL 14 / 35 / 69 · S8.6**   | 14 / 19 / 43 · S0       | 13 / 14 / 21 · S0       |
| 2. iPad simulator · web      | 8 / 15 / 17 · S0        | 7 / 14 / 19 · S0               | 15 / 16 / 17 · S0       | 13 / 16 / 19 · S0       |
| 3. iPad simulator · native   | 5 / 7 / 9 · S0          | 13 / 22 / 30 · S0              | 16 / 18 / 20 · S0       | 12 / 16 / 21 · S0       |
| 4. Android emulator · web    | 16.4 / 16.5 / 18.7 · S0 | 14.8 / 16.1 / 16.1 · S0        | 16.4 / 16.4 / 16.4 · S0 | 15.4 / 15.4 / 32 · S0   |
| 5. Android emulator · native | 15.1 / 16 / 16.1 · S0   | 15.6 / 15.7 / 15.7 · S0        | 15.8 / 15.8 / 16.1 · S0 | 15.7 / 16.4 / 16.4 · S0 |
| 6. Android device · web      | 15.6 / 16.4 / 23.1 · S0 | 15.5 / 16.4 / 24.2 · S0        | 15.5 / 16.4 / 16.7 · S0 | 15.5 / 16.3 / 16.6 · S0 |
| 7. Android device · native   | 7.9 / 8.2 / 8.3 · S0    | **FAIL 7.9 / 8.2 / 64.8 · S0** | 7.9 / 8.2 / 20.7 · S0   | 7.8 / 8.2 / 8.4 · S0    |
| 8. iPad device · web         | 16 / 17 / 38 · S0       | 16 / 27 / 40 · S0              | 16 / 17 / 35 · S0       | 15 / 20 / 24 · S0       |
| 9. macOS · web               | 17 / 18 / 18 · S0       | 18 / 18 / 19 · S0              | 17 / 18 / 18 · S0       | 17 / 17 / 17 · S0       |

## Undo

Undo timing is `engine P95 / next-frame P95 / next-frame max` in milliseconds.

| Target                       | Timing            | Result       | Product commit |
| ---------------------------- | ----------------- | ------------ | -------------- |
| 1. iPad device · native      | 1 / 12 / 12       | Pass         | 09c4efac27ca   |
| 2. iPad simulator · web      | 1 / 14 / 14       | Pass         | 09c4efac27ca   |
| 3. iPad simulator · native   | 1 / 14 / 14       | Pass         | 09c4efac27ca   |
| 4. Android emulator · web    | 0.2 / 14.1 / 14.1 | Pass         | 09c4efac27ca   |
| 5. Android emulator · native | 0.3 / 3.6 / 3.6   | Pass         | 09c4efac27ca   |
| 6. Android device · web      | 1.2 / 11.8 / 11.8 | Pass         | b91fcc08fa63   |
| 7. Android device · native   | 0.7 / 3.7 / 3.7   | Pass         | b91fcc08fa63   |
| 8. iPad device · web         | 1 / 11 / 11       | Pass         | 09c4efac27ca   |
| 9. macOS · web               | —                 | Not measured | —              |

## Discrete actions

The idle-frame profiling control remains in normalized data but is excluded below. The post-action
column is `P95 / max` in milliseconds. Full per-action timing and provenance are available in the
interactive matrix and normalized JSON.

| Target                       | Passing | At final commit | Worst first P95 | Worst post P95 / max | Failed actions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------- | ------- | --------------- | --------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. iPad device · native      | 43 / 46 | 0 / 46          | 24              | 17 / 160             | select coloring page; clear drawing; with ink: LANDSCAPE to PORTRAIT rotation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2. iPad simulator · web      | 35 / 46 | 0 / 46          | 43              | 18 / 72              | open custom color picker; open Parent Center; open Parent Center section: What's New; switch dark theme to light; select coloring page; clear drawing; empty after clear: LANDSCAPE to PORTRAIT rotation; clear restored drawing after blank rotation; empty after clear: PORTRAIT to LANDSCAPE rotation; with ink: LANDSCAPE to PORTRAIT rotation; with ink: PORTRAIT to LANDSCAPE rotation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 3. iPad simulator · native   | 39 / 46 | 0 / 46          | 38              | 19 / 108             | open Parent Center section: What's New; open coloring book; select coloring page; clear coloring page; clear drawing; clear restored drawing after blank rotation; with ink: LANDSCAPE to PORTRAIT rotation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 4. Android emulator · web    | 12 / 46 | 0 / 46          | 28.8            | 33.3 / 283.3         | expand action drawer; collapse action drawer; select custom color; open brush menu; select Magic brush; select eraser; select pen brush; open Parent Center; open Parent Center section: Sound; open Parent Center section: Saving; open Parent Center section: Controls & Buttons; open Parent Center section: AI Art; open Parent Center section: Setup Guide; open Parent Center section: What's New; open Parent Center section: Submit Feedback; open Parent Center section: About; switch dark theme to light; switch light theme to dark; disable drawing sounds; enable drawing sounds; disable auto-save on delete; disable advanced controls; enable advanced controls; disable screenshot action button; enable screenshot action button; open coloring books; open coloring book; select coloring page; clear coloring page; save screenshot; clear restored drawing after blank rotation; empty after clear: LANDSCAPE to PORTRAIT rotation; with ink: PORTRAIT to LANDSCAPE rotation; with ink: LANDSCAPE to PORTRAIT rotation |
| 5. Android emulator · native | 42 / 46 | 0 / 46          | 53.1            | 16.8 / 100           | empty after clear: PORTRAIT to LANDSCAPE rotation; empty after clear: LANDSCAPE to PORTRAIT rotation; with ink: PORTRAIT to LANDSCAPE rotation; with ink: LANDSCAPE to PORTRAIT rotation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 6. Android device · web      | 45 / 46 | 11 / 46         | 24              | 16.8 / 50            | with ink: LANDSCAPE to PORTRAIT rotation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 7. Android device · native   | 43 / 46 | 5 / 46          | 32              | 8.4 / 75             | empty after clear: PORTRAIT to LANDSCAPE rotation; empty after clear: LANDSCAPE to PORTRAIT rotation; with ink: PORTRAIT to LANDSCAPE rotation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 8. iPad device · web         | 46 / 46 | 0 / 46          | 29              | 17 / 32              | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 9. macOS · web               | 45 / 46 | 46 / 46         | 56              | 19 / 25              | open Parent Center section: What's New                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Method

Action sources are applied in manifest order. A focused capture replaces only its declared labels;
all other labels retain their earlier measurement and provenance. Physical iPad web remains the
Safari-calibrated release gate. Simulator, desktop, native-shell, and automated Android input are
advisory comparisons.
