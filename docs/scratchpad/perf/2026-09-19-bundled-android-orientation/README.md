# Bundled Android capture: verifying the actual orientation (2026-09-19)

This is the evidence for the orientation repair to `npm run perf:android:bundled:frames`
(`tools/perf/android/capture-bundled-frames.mjs`). The defect was found as a follow-up in
[issue 2065's device validation](https://github.com/KyleMit/Splotch/issues/2065#issuecomment-5732834005).
The app's own rotation lock can keep the Activity in portrait through the adb `user_rotation` the
capture writes. The artifact still said `LANDSCAPE`.

This package proves capture validity only. It makes no performance claim; the one-repeat pen
captures here are controls, not matrix cells.

## Outcome

* **Reproduced on main.** Run `a0` was requested as LANDSCAPE with the app lock on its default. It
  measured a 360x780 portrait page and wrote `orientation: "LANDSCAPE"`.
* **Fixed.**
  * **Verifying the page.** The capture reads the page's own viewport after launch.
  * **Getting the requested orientation.** When the page disagrees with the request, the capture
    releases the app's rotation lock through Settings, which is the product path. It then writes
    `user_rotation` again.
  * **Refusing an artifact.** No artifact is written unless the page measured the requested
    orientation before contact and did not resize or rotate during it.
  * **Cleanup.** The app lock and adb rotation are restored on success, on failure, and on
    SIGINT/SIGTERM.
* **The product's lock behavior is unchanged.** The harness releases the lock for the capture and
  restores its exact prior side afterwards.

### Why the capture writes `user_rotation` again

Releasing the lock does not by itself turn the display. On this phone, with `user_rotation=1`
asserted, the unlocked Activity stayed in portrait:

* through the harness's whole 10 s follow timeout plus its 2.5 s settle, in `a2-attempt1` and `n1`;
* across four reads spanning about 1.5 s in each experiment. The experiment scripts label those
  reads `+0/+500/+1500/+3000`, but their loop waits 500 ms between reads, so those labels overstate
  the elapsed time. The PR 2083 review caught this; the scripts and logs are kept as they ran.

It turned only when `user_rotation` was written again, and writing the same value was enough. Both
experiments are in `diag/` (`unlock-experiment-1.log.txt` and
`unlock-experiment-2-same-value.log.txt`). The first device run of the fix lacked that step and
failed loudly (`a2-attempt1`). That run is kept here as a real mismatch negative.

## Identities

| Item               | Value                                                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Installed product  | perf debug APK of main a8ff7916ea9395ed50534e9da9b22d489e256e86 (`perf:build:cap` + `:app:assembleDebug`), sha256 `e5e2d0ed217fe8b76ae434c5a1e42e285ce785801bb5f05a56fed6fe14e35320`, verified on the device with `sha256sum` before the session |
| Product delta      | a8ff7916 to main 20d26b9ca86f37e3936959743c0bf83d0b5d6cbe touches no `web/src`, `web/static`, native, or Capacitor config; only dependency version bumps in `package.json`                                                                       |
| Harness, before    | main 20d26b9ca86f37e3936959743c0bf83d0b5d6cbe (run `a0`)                                                                                                                                                                                         |
| Harness, fix       | branch `claude/bundled-capture-verify-orientation`. Run `a2-attempt1` used the first commit (no re-assert); every other run used the re-assert commit. The PR records the merged SHA                                                             |
| Device and runtime | Samsung SM-G990U1, Android 16, Android System WebView 151.0.7922.199 (`wv` UA in every artifact), DPR 3                                                                                                                                          |
| Cadence            | panel `renderFrameRate 120`, with no refresh pins set                                                                                                                                                                                            |
| Workload           | `--brush=pen --gesture-repeats=1`, the fixed trusted-gesture plan through `adb input swipe`, light theme, blank paper                                                                                                                            |
| Rig state before   | `accelerometer_rotation=1` and `user_rotation=0`. App lock on, portrait (read through Settings by `diag/read-lock.mjs`)                                                                                                                          |

## Controls

| Run           | Request                                                                                               | Result                                                                                                                                                                                         | Artifact | Afterwards                                  |
| ------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------- |
| `a0`          | LANDSCAPE, main before the fix                                                                        | **Mismatch reproduced.** Labelled LANDSCAPE, measured 360x780                                                                                                                                  | written  | adb restored                                |
| `a1`          | PORTRAIT                                                                                              | Observed PORTRAIT 360x780. The lock was not touched. Fidelity PASS                                                                                                                             | written  | lock on, portrait; adb `1`/`0`              |
| `a2`          | LANDSCAPE                                                                                             | Launched portrait. The lock was released and the rotation re-asserted, giving an observed LANDSCAPE of 780x360 (canvas 747x360 at x=33). Geometry was unchanged through contact. Fidelity PASS | written  | lock restored to portrait; adb `1`/`0`      |
| `a2-attempt1` | LANDSCAPE, fix without the re-assert                                                                  | Lock released, page stayed portrait. **Failed loudly**, exit 1                                                                                                                                 | none     | lock restored; adb `1`/`0`                  |
| `n1`          | LANDSCAPE, forced mismatch (diagnostic)                                                               | The re-assert was disabled by `diag/n1-forced-mismatch.diagnostic-only.diff`. **Failed loudly**, exit 1                                                                                        | none     | lock restored; adb `1`/`0`                  |
| `n2`          | LANDSCAPE, `--theme=bogus`                                                                            | The page reached landscape (lock released), then the theme step threw. Exit 1                                                                                                                  | none     | lock restored; adb `1`/`0`; no forward left |
| `n3`          | LANDSCAPE, 4 repeats, SIGINT mid-gesture, before the fence                                            | Interrupted during the swipes. Exit 130                                                                                                                                                        | none     | lock restored; adb `1`/`0`; no forward left |
| `n3b`         | LANDSCAPE, 4 repeats, SIGINT mid-gesture, with the interrupt fence                                    | Interrupted during the swipes; the capture stopped at its next step, then cleanup ran. Exit 130                                                                                                | none     | lock restored; adb `1`/`0`; no forward left |
| `n4`          | LANDSCAPE, SIGINT 12 s after start, with the interrupt fence                                          | Interrupted before contact (no `canvas` line), which is the orientation-setup window. Exit 130 after 6 s. The log cannot show whether the signal landed inside the lock release itself         | none     | lock restored; adb `1`/`0`; no forward left |
| `n5`          | LANDSCAPE, `--input=hand --seconds=300`, SIGINT 3 s into the drawing window, with interruptible waits | Exit 130 came 2.1 s after the signal, including the lock restore through Settings (before this change the review reproduced a wait for the whole window)                                       | none     | lock restored; adb `1`/`0`; no forward left |

Run `n3` used the first signal handler, which ran cleanup concurrently with the capture. The PR 2083
review showed that handler could restore the lock before an in-flight unlock landed. The fix is the
interrupt fence, and `n3b` and `n4` exercised it. Round 2 of the review found that a long wait (the
`--input=hand` window) still held the deferred exit until it ended. Every wait in the capture now
checks the fence every 250 ms, and `n5` exercised that. "No forward left" means `adb forward --list`
printed no `tcp` entry; its output is a single blank line.

The exit codes and the absence of a negative run's artifact were observed in the session terminal
(`ls` of the requested `--output` path). The logs record the error text but not the exit code.
"Afterwards" is the adb `settings get` read in that terminal plus the `controls/*-lock-after.json`
read of the Settings controls.

**The diagnostic diff is for the negative control only.** It must never be applied to production
source.

## Previously affected evidence

* **Committed artifacts are not affected.** Every committed `cdp-bundled` or bundled-hand artifact
  is PORTRAIT and measured 360x780:
  * `perf-profiles/evidence/2026-08-26-android-bundled-channel/android-device-native-pen.json`;
  * `perf-profiles/evidence/2026-08-24-hand-native/*`.
* **The committed performance matrix is not affected.** Its `android-device-native` drawing cells
  come from the split transport (`transport: 'split-input-measurement'` in
  `tools/perf/lib/campaign-plan.mjs`), not from this CLI. That transport already refuses a page
  whose orientation disagrees with the request (`capture-device-frames.mjs`, the
  `ready.geometry.orientation` check), so it fails rather than mislabels.
* **The issue 2065 local validation set has proven mismatches.** Cases `02`, `05`, `09`, and `10`
  were labelled LANDSCAPE and measured 360x780. That set is kept locally, uncommitted, under
  `perf-profiles/bundled/issue-2065-evidence-2026-09-18/artifacts/` in the primary checkout.
  * Their brush-selection conclusion stays valid: the committed brush is independent of orientation.
  * They are **not valid landscape performance evidence**, and none was used as such.
  * Cases `15`–`17` measured a real 780x360, because the setting was turned off by a seed.

## Limitations

* **Stroke placement in landscape is unverified.** Landscape `a2` put the canvas at x=33 CSS px. The
  capture sends `input swipe` at CSS x DPR with no WebView-origin offset. Trusted-input fidelity
  passed, but whether strokes landed exactly on their planned path in landscape was not checked, and
  it is outside this repair.
* **kill -9 skips cleanup.** It leaks the released lock and the rotation settings, as it does for
  every runner.
* **Only one physical phone was tested** (Samsung, Android 16). The need for the re-assert was
  measured on it; other devices may turn without it, and the re-assert is harmless there.

## Reproduce

`node docs/scratchpad/perf/2026-09-19-bundled-android-orientation/check.mjs` verifies each file
against `MANIFEST.json` and re-derives every claim above from the packaged bytes. `package.mjs`
rebuilt this directory from the session's local capture directory.

To repeat the device controls, install a debug perf build (`npm run perf:build:cap`, then
`:app:assembleDebug`), then run:

```bash
npm run perf:android:bundled:frames -- --device-serial=<serial> --brush=pen --orientation=PORTRAIT --gesture-repeats=1
npm run perf:android:bundled:frames -- --device-serial=<serial> --brush=pen --orientation=LANDSCAPE --gesture-repeats=1
node diag/read-lock.mjs <serial>
```

Run `diag/read-lock.mjs` from `perf-profiles/bundled/units-2026-09-19/diag/`, where it ran; its
relative import expects that location. It reads the lock through Settings without changing it.

## Effort

Cumulative active effort on this failure (the Android bundled orientation mislabel) is about 35 min
through this package (2026-09-19 09:09 to 09:44, including intake shared with the eraser unit). No
earlier effort was tracked separately: issue 2065 found the defect as a side observation. The review
and merge time is recorded on the PR.
