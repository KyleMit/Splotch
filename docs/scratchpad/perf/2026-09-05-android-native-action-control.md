# Physical Android native action control at the reviewed tip

The full four-mode action control at 8d0e1b4c1971b6240df3053c4da4ef2ae2494077 passed all 172 action
groups. Every group has one warmup and three scored repeats, valid activation in all four samples,
and no unconfirmed maximum warnings. This is a control of the reviewed product, not a new treatment
experiment.

The old landscape/dark empty-clear landscape-to-portrait red did not reproduce: first frames were
5.6 / 1.1 / 1.4 ms and scored-repeat maxima were 16.5 / 8.4 / 8.4 ms. No additional product change
is justified by this control. The historical failure remains part of the earlier matrix; this
action-only capture does not replace that matrix.

## Build and capture provenance

The isolated checkout was clean when `npm run perf:build:cap` built and synced the marked static
bundle. Installation used `tools/mobile/android/run-gradle.mjs :app:installDebug` with the
dynamically resolved physical handset; it did not run a second uninstrumented sync. The APK SHA-256
was `60a6ce8e809c96a315810119504fcbe433c129d969b21d4e352a29f3044e16f3`; the installed APK matched
that hash after all four captures. The product files are identical to
141288da477011a82a3c23a880e0f4df236eee32; intervening commits contain evidence and review
documentation.

Each artifact records `native-capacitor-webview`, `android-capacitor-webview`, and the packaged
`https://localhost/` origin. The attached WebView was 151.0.7922.199. Refresh overrides were unset
before capture, and the native idle beat was approximately 8.3 ms. This is not the 60 Hz Android-web
action regime. The preflight delivered 122 contact moves/s, 1.02 moves/frame, and verified
page/device rotation both ways. Drawing fidelity is a separate gate; the keeper reports action
suites as fidelity-unreported, while their activation records are verified here.

One initial landscape/dark attempt failed before measurement because a PID lookup raced app startup
and prevented the local capabilities file from being written. The failed-setup ledger remains. Once
the file existed, exactly one additional attempt captured that mode. The other modes each completed
on their first attempt. No valid measurement was retried for a greener result.

## Per-repeat results

Maxima below are computed independently from each scored repeat with `scoredActionFrameGaps`. They
are not pooled percentiles.

| Mode            | Groups passed | Idle maxima (ms) |
| --------------- | ------------- | ---------------- |
| portrait-light  | 50/50         | 16.6 / 8.5 / 8.4 |
| portrait-dark   | 50/50         | 16.6 / 8.4 / 8.4 |
| landscape-light | 36/36         | 8.4 / 8.4 / 8.4  |
| landscape-dark  | 36/36         | 16.6 / 8.4 / 8.4 |

| Mode            | Rotation                                          | First frames (ms) | Scored-repeat maxima (ms) |
| --------------- | ------------------------------------------------- | ----------------- | ------------------------- |
| portrait-light  | empty after clear: PORTRAIT to LANDSCAPE rotation | 4.7 / 3.6 / 2.4   | 8.4 / 8.4 / 16.6          |
| portrait-light  | undo clear after blank rotation                   | 7.9 / 4.8 / 5.0   | 8.5 / 16.7 / 16.7         |
| portrait-light  | undo restored stroke after blank rotation         | 1.7 / 6.7 / 7.9   | 8.4 / 8.4 / 8.7           |
| portrait-light  | clear restored drawing after blank rotation       | 1.4 / 3.0 / 4.4   | 8.5 / 8.5 / 8.4           |
| portrait-light  | empty after clear: LANDSCAPE to PORTRAIT rotation | 24.0 / 0.4 / 4.2  | 16.7 / 16.7 / 16.7        |
| portrait-light  | with ink: PORTRAIT to LANDSCAPE rotation          | 0.8 / 6.1 / 1.6   | 8.4 / 8.5 / 16.7          |
| portrait-light  | with ink: LANDSCAPE to PORTRAIT rotation          | 6.2 / 3.1 / 10.4  | 16.7 / 8.5 / 25.1         |
| portrait-dark   | empty after clear: PORTRAIT to LANDSCAPE rotation | 8.2 / 7.5 / 5.5   | 16.6 / 8.5 / 8.4          |
| portrait-dark   | undo clear after blank rotation                   | 5.1 / 6.7 / 7.9   | 8.4 / 8.5 / 8.4           |
| portrait-dark   | undo restored stroke after blank rotation         | 1.8 / 2.0 / 7.0   | 8.4 / 8.4 / 16.9          |
| portrait-dark   | clear restored drawing after blank rotation       | 0.2 / 3.2 / 1.7   | 8.5 / 8.5 / 8.5           |
| portrait-dark   | empty after clear: LANDSCAPE to PORTRAIT rotation | 0.2 / 6.1 / 8.3   | 16.7 / 25.1 / 8.4         |
| portrait-dark   | with ink: PORTRAIT to LANDSCAPE rotation          | 13.7 / 1.3 / 3.7  | 16.7 / 8.5 / 8.4          |
| portrait-dark   | with ink: LANDSCAPE to PORTRAIT rotation          | 0.7 / 1.1 / 12.1  | 16.7 / 8.4 / 8.4          |
| landscape-light | empty after clear: LANDSCAPE to PORTRAIT rotation | 1.1 / 4.7 / 0.5   | 33.4 / 8.4 / 33.3         |
| landscape-light | undo clear after blank rotation                   | 5.7 / 5.3 / 2.8   | 16.7 / 8.4 / 8.4          |
| landscape-light | undo restored stroke after blank rotation         | 4.9 / 2.8 / 5.0   | 16.7 / 8.5 / 8.6          |
| landscape-light | clear restored drawing after blank rotation       | 5.3 / 0.8 / 6.5   | 8.5 / 8.5 / 16.7          |
| landscape-light | empty after clear: PORTRAIT to LANDSCAPE rotation | 4.5 / 0.5 / 6.9   | 8.4 / 16.6 / 8.4          |
| landscape-light | with ink: LANDSCAPE to PORTRAIT rotation          | 3.3 / 3.1 / 5.3   | 16.6 / 16.7 / 8.4         |
| landscape-light | with ink: PORTRAIT to LANDSCAPE rotation          | 0.2 / 0.4 / 4.4   | 8.5 / 16.7 / 8.5          |
| landscape-dark  | empty after clear: LANDSCAPE to PORTRAIT rotation | 5.6 / 1.1 / 1.4   | 16.5 / 8.4 / 8.4          |
| landscape-dark  | undo clear after blank rotation                   | 4.2 / 4.9 / 3.4   | 16.6 / 8.4 / 8.4          |
| landscape-dark  | undo restored stroke after blank rotation         | 4.4 / 7.3 / 5.3   | 8.6 / 8.4 / 8.4           |
| landscape-dark  | clear restored drawing after blank rotation       | 2.6 / 2.0 / 5.8   | 8.5 / 8.5 / 8.4           |
| landscape-dark  | empty after clear: PORTRAIT to LANDSCAPE rotation | 6.7 / 1.1 / 3.6   | 8.4 / 16.6 / 16.7         |
| landscape-dark  | with ink: LANDSCAPE to PORTRAIT rotation          | 1.4 / 4.0 / 0.0   | 16.7 / 16.8 / 8.4         |
| landscape-dark  | with ink: PORTRAIT to LANDSCAPE rotation          | 8.3 / 3.1 / 4.4   | 8.4 / 8.4 / 8.4           |

Landscape/light compact Night Mode enable maxima were 25.0 / 25.0 / 25.0 ms (scored P95 8.5 ms);
disabling was 16.7 / 16.8 / 16.6 ms. All Settings, coloring, drawing-sound, and undo action groups
passed. Whole retained artifacts contain every action and repeat.

## Retention and limits

Raw root: `perf-profiles/epic-1567-september-resume/native-reviewed-control/`. The keeper promoted
all four complete artifacts into `perf-profiles/evidence/2026-09-05-epic-1567-native-actions/`. Its
index maps each retained file to its source mode and product commit. All four original files and
their isolated-worktree copies retained the following hashes after promotion; retained copies passed
device-identifier scans.

| Source beneath raw root                                      | SHA-256                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `android-device-native/portrait-light/actions/actions.json`  | `88cd851b89923ef9e68ad67c0f5be3c9285517a8da790589eb611389afb4c87d` |
| `android-device-native/portrait-dark/actions/actions.json`   | `2954eb7467799975b0d279615e5932b8cdc41c311b1c74a39cbaf92d6d01ba93` |
| `android-device-native/landscape-light/actions/actions.json` | `9315eeb5914b5036c71724c8844c5c0fab74222e9536d6e8582b580165f7c4f0` |
| `android-device-native/landscape-dark/actions/actions.json`  | `e63b78bc1cfa716cb062a5ba9fe4a5e17fcb571494733c7c32ec7244b14ba036` |

This does not complete the physical Android row: four-brush drawing and split-transport undo remain
required. Action undo does not satisfy issue #1630. The final single-product-commit four-row
recapture and strict matrix remain outstanding; issues #1563 and #1567 stay open. No child is closed
by this control.
