# Issue 2267: `capturedOn` backfill for the committed matrix sections

**Date:** 2026-09-25. **Decision record:**
[ADR-0175](../../adrs/0175-matrix-sections-report-capture-age-not-currency.md).

ADR-0175 gives every section of
`scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json` a `capturedOn` date. This
note records how each committed section was dated, so a later reader can tell a measured date from a
fallback.

## Method

* **Capture stamp first.** A section is dated by the `perf-run=<epoch ms>` stamp in the
  `automation.loadedUrl` of its artifacts, as a UTC day, taking the oldest artifact. This is the
  same `sectionCapturedOn` the fold uses (`tools/perf/lib/capture-date.mjs`).
* **Where the artifacts were found.** The source paths come from each section's published
  `data.json` entry. They were read from the worktree, from the main checkout's untracked
  `perf-profiles/`, or through a tracked evidence copy under `perf-profiles/evidence/<campaign>/`,
  whose `index.json` maps `capturedFrom` plus `source` to the kept file.
* **Fold date as fallback.** A section with no stamped artifact is dated by its fold: the earliest
  commit whose `sources.json` or `data.json` diff added one of the section's source paths (a pickaxe
  search of the history, `-S<path>`), as a UTC day. The raw captures for many older sections are
  gone, so the commit history is the only record of when they entered the matrix.

## Coverage

The issue did not verify that every artifact records the stamp, and most do not. Only the iOS
XCUITest drawing transport writes it (`tools/perf/ios/capture-xcuitest-screen.mjs`). Android,
desktop, and every action transport record no stamp, and some older artifacts are gone.

* **26 of 132 sections** are dated by the stamp: drawing and undo on physical iPad web and native
  (all four modes), iPad Simulator web (all four), and iPad Simulator native landscape-dark.
* **106 of 132 sections** are dated by the fold date.
* **In all 26 stamped sections, the stamp and the fold date fall on the same UTC day.** So the
  fallback held wherever it could be checked. A preserved sweep can still be folded days after its
  capture, and then its fold date makes it look younger than it is.

"Artifacts read" counts the section's source artifacts that could still be read. Preserved
simulator, emulator, and Mac sections mostly have none left.

| Target                  | Section | Modes                                          | Evidence  | Artifacts read | Dated by         | Fold date  | `capturedOn` |
| ----------------------- | ------- | ---------------------------------------------- | --------- | -------------- | ---------------- | ---------- | ------------ |
| ipad-device-web         | drawing | all four                                       | captured  | 4/4            | `perf-run` stamp | 2026-09-23 | 2026-09-23   |
| ipad-device-web         | undo    | all four                                       | captured  | 1/1            | `perf-run` stamp | 2026-09-23 | 2026-09-23   |
| ipad-device-web         | actions | all four                                       | preserved | 1/1            | fold date        | 2026-09-07 | 2026-09-07   |
| ipad-device-native      | drawing | all four                                       | captured  | 4/4            | `perf-run` stamp | 2026-09-23 | 2026-09-23   |
| ipad-device-native      | undo    | all four                                       | captured  | 1/1            | `perf-run` stamp | 2026-09-23 | 2026-09-23   |
| ipad-device-native      | actions | portrait-light, portrait-dark                  | captured  | 1/1            | fold date        | 2026-09-23 | 2026-09-23   |
| ipad-device-native      | actions | landscape-light, landscape-dark                | preserved | 1/1            | fold date        | 2026-09-07 | 2026-09-07   |
| ipad-simulator-web      | drawing | all four                                       | preserved | 4/4            | `perf-run` stamp | 2026-09-01 | 2026-09-01   |
| ipad-simulator-web      | undo    | all four                                       | preserved | 1/1            | `perf-run` stamp | 2026-09-01 | 2026-09-01   |
| ipad-simulator-web      | actions | all four                                       | preserved | 1/1            | fold date        | 2026-09-01 | 2026-09-01   |
| ipad-simulator-native   | drawing | portrait-light, portrait-dark, landscape-light | preserved | 0/4            | fold date        | 2026-08-28 | 2026-08-28   |
| ipad-simulator-native   | undo    | portrait-light, portrait-dark, landscape-light | preserved | 0/1            | fold date        | 2026-08-28 | 2026-08-28   |
| ipad-simulator-native   | actions | all four                                       | preserved | 0/1            | fold date        | 2026-08-28 | 2026-08-28   |
| ipad-simulator-native   | drawing | landscape-dark                                 | preserved | 4/4            | `perf-run` stamp | 2026-08-28 | 2026-08-28   |
| ipad-simulator-native   | undo    | landscape-dark                                 | preserved | 1/1            | `perf-run` stamp | 2026-08-28 | 2026-08-28   |
| android-device-web      | drawing | all four                                       | captured  | 4/4            | fold date        | 2026-09-23 | 2026-09-23   |
| android-device-web      | undo    | all four                                       | captured  | 1/1            | fold date        | 2026-09-23 | 2026-09-23   |
| android-device-web      | actions | portrait-light, portrait-dark                  | captured  | 1/1            | fold date        | 2026-09-23 | 2026-09-23   |
| android-device-web      | actions | landscape-light, landscape-dark                | preserved | 1/1            | fold date        | 2026-09-07 | 2026-09-07   |
| android-device-native   | drawing | all four                                       | captured  | 4/4            | fold date        | 2026-09-23 | 2026-09-23   |
| android-device-native   | undo    | all four                                       | captured  | 1/1            | fold date        | 2026-09-23 | 2026-09-23   |
| android-device-native   | actions | all four                                       | preserved | 1/1            | fold date        | 2026-09-07 | 2026-09-07   |
| android-emulator-web    | drawing | portrait-light, portrait-dark, landscape-light | preserved | 0/4            | fold date        | 2026-08-28 | 2026-08-28   |
| android-emulator-web    | undo    | all four                                       | preserved | 0/1            | fold date        | 2026-08-21 | 2026-08-21   |
| android-emulator-web    | actions | all four                                       | preserved | 0/1            | fold date        | 2026-08-28 | 2026-08-28   |
| android-emulator-web    | drawing | landscape-dark                                 | preserved | 4/4            | fold date        | 2026-08-28 | 2026-08-28   |
| android-emulator-native | drawing | portrait-light, portrait-dark                  | preserved | 0/4            | fold date        | 2026-08-28 | 2026-08-28   |
| android-emulator-native | undo    | all four                                       | preserved | 0/1            | fold date        | 2026-08-21 | 2026-08-21   |
| android-emulator-native | actions | all four                                       | preserved | 0/1            | fold date        | 2026-08-28 | 2026-08-28   |
| android-emulator-native | drawing | landscape-light, landscape-dark                | preserved | 0/4            | fold date        | 2026-09-03 | 2026-09-03   |
| mac-chrome              | drawing | portrait-light, portrait-dark, landscape-light | preserved | 0/4            | fold date        | 2026-09-03 | 2026-09-03   |
| mac-chrome              | undo    | portrait-light, portrait-dark, landscape-light | preserved | 0/1            | fold date        | 2026-09-03 | 2026-09-03   |
| mac-chrome              | actions | all four                                       | preserved | 0/1            | fold date        | 2026-09-03 | 2026-09-03   |
| mac-chrome              | drawing | landscape-dark                                 | preserved | 4/4            | fold date        | 2026-09-03 | 2026-09-03   |
| mac-chrome              | undo    | landscape-dark                                 | preserved | 1/1            | fold date        | 2026-09-03 | 2026-09-03   |
| mac-safari              | drawing | portrait-light, portrait-dark, landscape-light | preserved | 0/4            | fold date        | 2026-09-03 | 2026-09-03   |
| mac-safari              | undo    | portrait-light, portrait-dark, landscape-light | preserved | 0/1            | fold date        | 2026-09-03 | 2026-09-03   |
| mac-safari              | actions | all four                                       | preserved | 0/1            | fold date        | 2026-09-03 | 2026-09-03   |
| mac-safari              | drawing | landscape-dark                                 | preserved | 4/4            | fold date        | 2026-09-03 | 2026-09-03   |
| mac-safari              | undo    | landscape-dark                                 | preserved | 1/1            | fold date        | 2026-09-03 | 2026-09-03   |
| mac-firefox             | drawing | portrait-light, portrait-dark, landscape-light | preserved | 0/4            | fold date        | 2026-09-03 | 2026-09-03   |
| mac-firefox             | undo    | portrait-light, portrait-dark, landscape-light | preserved | 0/1            | fold date        | 2026-09-03 | 2026-09-03   |
| mac-firefox             | actions | all four                                       | preserved | 0/1            | fold date        | 2026-09-03 | 2026-09-03   |
| mac-firefox             | drawing | landscape-dark                                 | preserved | 4/4            | fold date        | 2026-09-03 | 2026-09-03   |
| mac-firefox             | undo    | landscape-dark                                 | preserved | 1/1            | fold date        | 2026-09-03 | 2026-09-03   |
