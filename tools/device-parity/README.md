# Device parity and crash tooling

Device automation for the React Native migration: a crash harness that stress-runs the drawing
screen and returns a machine verdict per run, and parity drivers that capture the same states and
interactions from the native build and the shipping WebView build so the two can be compared. Both
drive a live app through Appium 2 (XCUITest on iOS, UiAutomator2 on Android) plus `simctl`,
`devicectl`, `adb`, and `pymobiledevice3`.

Nothing here runs in CI or has an npm script: every entry drives a device and is run by hand as
`node tools/device-parity/<entry>.mjs --flag=value …`. Every device, session, bundle id, port, and
output path comes from a flag; nothing is defaulted to a rig.

## Entry points

| Entry                             | What it does                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `start-appium-session.mjs`        | Opens an Appium session on one device and writes the session file the other entries read        |
| `explore-app-ui.mjs`              | `src`, `tap`, `tapxy`, `shot`, `orient`, `exec`, `win`, `close` against an open session         |
| `drive-android-ui.mjs`            | `dump`, `focus`, `tap`, `keys` through `uiautomator dump`, with no Appium session               |
| `run-crash-scenario.mjs`          | One crash scenario run (S1–S6, LEAK) with its verdict                                           |
| `run-crash-matrix.mjs`            | Relaunches the app and runs one scenario N times; run i uses seed i                             |
| `run-monkey-seed.mjs`             | S3 on the Android emulator as one `adb shell monkey` seed, with the verdict                     |
| `analyze-crash-matrix.mjs`        | Valid/invalid counts and verdicts per scenario, target, and arm                                 |
| `run-clear-drag-stress.mjs`       | A Clear drag oscillating across the accept threshold, footprint sampled, with the verdict       |
| `run-gesture-sequence.mjs`        | A JSON list of scribble/stroke/clear/wait/tap steps with a timestamp per step                   |
| `run-tap-probe.mjs`               | Taps one control as a burst or as separate calls and reports Appium's playback time             |
| `capture-undo-cue.mjs`            | Records Undo pressed at the end of history (the unavailable cue)                                |
| `capture-parity-states.mjs`       | DS-1: settled captures of the drawing screen's states per arm and style-theme-orientation combo |
| `compare-parity-states.mjs`       | DS-1 comparison: frames, control set, selection, token colours, pixel diff, side-by-side        |
| `run-parity-slice.mjs`            | DS-2 and its sibling slices: each step recorded, settled, and captured per arm                  |
| `compare-parity-slices.mjs`       | Slice comparison: end-state controls and motion-burst spans per step, side-by-side stills       |
| `analyze-motion-timeline.mjs`     | A recording's motion bursts                                                                     |
| `recompute-motion-sidecars.mjs`   | Rewrites the `motion` field of every step sidecar from its recording                            |
| `analyze-accessibility-trees.mjs` | A11Y-2: role differences, targets under 48 pt, and names only one arm exposes                   |
| `swap-js-bundle.mjs`              | Rebuilds only the JavaScript and installs it into an existing Release probe; see below          |

Supporting modules live in `lib/`: the Appium client and session file (`appium-session.mjs`), host
commands (`device-commands.mjs`), Display0 reads (`android-display.mjs`), the foreground guard
(`app-foreground.mjs`), W3C pointer chains (`pointer-chains.mjs`), the crash targets, scenarios,
driver, verdicts, and tally, and the parity arms manifest, driver, lifecycle, settle rule, paper
scan, recording, and motion analysis, and the Release JavaScript bundle build (`js-bundle.mjs`).
`lib/slices/` holds one step list per parity slice, registered in `lib/parity-slices.mjs`.

## Inputs

* **Session file** (`--session`): `{ base, id, platform, device }`, written by
  `start-appium-session.mjs`. It carries the device's UDID or serial, so it stays outside the repo.
* **Crash targets** (`--target`): `ios-simulator`, `android-emulator`, `ios-device` (a physical
  iPad), `android-device`. The session's platform must match. iOS targets also need
  `--process-name`, the app's process name, which is how crash reports and log lines are found.
* **Arm** (`--arm`): the label a crash run is filed under (`rn`, `ref160`, …).
* **Arms manifest** (`--arms-file`, parity drivers): an object keyed by arm tag, each with `kind`
  (`native` or `webview-reference`), `bundleId`, `sourceSha`, an `ios` (`app`, `digest`) and/or
  `android` (`apk`, `digest`, `activity`) build, and optional `aliases` from a shipping accessible
  name to that arm's name. `lib/parity-arms.mjs` documents and validates it. The drivers branch on
  `webview-reference` where the shipping build's tree and settings differ.
* **Slices** (`--slice`): `ds2`, `key1`, `life1`, `life1-android-back` (Android), `save1` (iOS),
  `font`; `--steps` records only the named steps. Every step before the last named one still runs,
  unrecorded, so a named step starts from the state the earlier steps build; nothing after the last
  named step runs.

## Outputs

Everything goes under the `--out` directory the caller names; nothing writes into the repo.

* Crash runs: `<label>.json` per run (`<scenario>-<arm>-<run>`), with the verdict, the scenario
  error if any, notes, memory, and the platform evidence (crash report signatures, logcat and
  dropbox entries, app state, diagnostics, exit records); `<label>-<shot>.png` where the target can
  screenshot. `run-crash-matrix.mjs` writes into `<out>/<target>/`, the layout
  `analyze-crash-matrix.mjs --root=<out>` reads; reviewed runs moved to `<out>/invalid/<target>/`
  are only counted.
* DS-1: `<out>/<target>/<arm>/<style-theme-orientation>/` with `s01-blank.*` … `s12-farm-ink.*`
  (PNG, page source, sidecar), `paper.json`, `batch.json`, and with `--cardinality`,
  `cardinality.json`; a `run-<ms>.json` summary per run.
* Slices: `<out>/<target>/<arm>/raised-light-portrait-<motion>/` with `<step>.mp4`, `.png`, `.xml`,
  and `.json` per step, and `batch.json`.
* Comparisons write `results.json` or `compare.json` plus side-by-side PNGs into their `--out`.

A crash-run JSON, a sidecar, or a session file can carry a device identifier. Promote nothing from
an output directory without redacting it; `npm run check:device-identifiers` fails on a tracked one.

## Prerequisites

* Appium 2 with the `xcuitest` and `uiautomator2` drivers, already running, and a booted simulator,
  emulator, or attached device. Nothing here starts a server or boots a device.
* Xcode command-line tools (`xcrun simctl`, `xcrun devicectl`).
* Android SDK platform-tools (`adb`, found through `ANDROID_HOME`/`ANDROID_SDK_ROOT` by
  `tools/mobile/android/lib/android-toolchain.mjs`); the emulator console for `adb emu rotate`.
* `pymobiledevice3` for a physical iPad's crash list, its JetsamEvent reports
  (`crash pull --remote-file`), and its unified log.
* `ffmpeg` and `ffprobe` for motion timelines; ImageMagick `magick` for `compare-parity-states.mjs`.
  `sharp` comes from the repo's dependencies.
* `swap-js-bundle.mjs`: the newest Android SDK build-tools (`aapt2`, `zipalign`, `apksigner`), `zip`
  and `unzip` for Android; `codesign` and `plutil` for iOS.
* The parity drivers run on an iOS simulator or Android emulator: they install builds and screenshot
  through `simctl` and `adb`.

### Emulators on a shared host

Booting emulators is outside this tooling, but each of these cost a 2026-10-21 campaign a run:

* **Create AVDs under `~/.android/avd`, never under `/private/tmp`.** `avdmanager create avd --path`
  writes the AVD's `.ini` to `~/.android/avd` pointing at the given directory. macOS clears
  `/private/tmp`, and `emulator -list-avds` keeps listing the AVD after its directory is gone.
* **One AVD runs once unless both instances are read-only.** A second emulator on a running AVD
  needs both started with `-read-only`, which also stops either from saving a snapshot. Otherwise,
  clone the AVD under its own name.
* **Stop an emulator by the PID recorded at launch.** `adb -s emulator-<port> emu kill` talks to the
  emulator console and hangs when the device is `offline`.
* **Count emulators against host memory.** Five emulators on a 32 GB host, beside native builds,
  left one `offline` and unresponsive.

## Failure behavior

* An unknown flag, a missing required flag, or an out-of-vocabulary value exits 1 before any device
  is touched (`tests/cli-entries.test.mjs` spawns every entry to prove it).
* Every input is preceded by a foreground check; a failed one throws `foreground is <id>`. In a
  crash run that throw becomes the run's `scenarioError` and the verdict is still taken, so the
  evidence is kept; `analyze-crash-matrix.mjs` counts such a run invalid, whatever its verdict, for
  a person to re-run or archive after reading it.
* A crash run that cannot start (bad session file, wrong platform for the target, app not in front)
  exits 1 without writing a result.
* `run-crash-matrix.mjs` and the parity drivers wrap each run or batch, keep completed results,
  report every failure at the end, and exit 1 if any failed; a failed parity batch leaves
  `failure.png` and `failure.xml` in its directory. A slice step whose action throws keeps its
  recording, capture, and sidecar, the batch runs on, and the step's error fails its arm.
* Verdict probes read only state created after a run starts and never clear a log.
* An Android logcat read that fails throws `No verdict: logcat is unreadable` with adb's stderr, so
  the run fails instead of coming back `alive` on `pidof` and dropbox alone.

## Checking a JS-only change without a native build

`swap-js-bundle.mjs` puts freshly built JavaScript into a Release probe that a full Gradle or Xcode
build already produced, then installs that copy. A change to TS or TSX reaches the device in about
ten seconds instead of a native rebuild, and the device stays on a Release build, so timing checks
still hold (issue 3083).

```sh
# Android: the base APK from `./gradlew assembleRelease`, signed again with the same keystore so
# `adb install -r` keeps the app's data
node tools/device-parity/swap-js-bundle.mjs --platform=android --base=<app-release.apk> \
  --bundle=<probe id> --keystore=<candidate-release.keystore> --key-alias=<alias> \
  --ks-pass=env:<VAR> --out=<new dir> --device=<serial>
# iOS: the base .app from `xcodebuild … -configuration Release`, signed again with the identity
# that signed it
node tools/device-parity/swap-js-bundle.mjs --platform=ios --base=<HelloWorld.app> \
  --bundle=<probe id> --identity="Apple Development" --out=<new dir> --device=<udid>
```

Relaunch the app afterwards. `--ks-pass` and `--key-pass` take apksigner's forms (`env:NAME`,
`file:PATH`, `pass:VALUE`); without `--device` the tool only writes the swapped build into `--out`.

* **It builds what the native build builds.** The bundle step and Hermes flags are the ones React
  Native's Gradle task and Xcode script pass for Release (`lib/js-bundle.mjs`), and
  `tests/js-bundle.test.mjs` fails when React Native changes them. At an unchanged commit the
  Android bundle is byte for byte the one Gradle packaged. The iOS one differs only in the path
  Hermes records for its source. On iOS the bundle step sources the app's `.xcode.env` files, as
  Xcode's bundle phase does; on Android it uses the calling environment, as a Gradle build started
  from it does, so an `EXPO_PUBLIC_*` value applies either way. The tool prints whether the
  JavaScript differs from the base build's, which catches a forgotten save.
* **Native code and Android resources come from the base build.** A Kotlin, Swift or native config
  change needs a full build. On Android, an image or sound the base APK lacks is refused, because
  React Native compiles those into the APK's resources; an edited one under an unchanged name is not
  detected. On iOS the bundle's images and sounds are plain files in the app, so they travel with
  the swap.
* **Use a full build for committed performance captures**, whose provenance names a built commit.
* The tool refuses `art.splotch.app`, an artifact whose bundle id is not `--bundle`, a bundle built
  for a different Hermes bytecode version, and an `--out` that already holds files.

React Native's Debug build loading from Metro is the other way to skip a native build, for
functional checks only; `experiments/native-architecture/DEVELOPMENT.md` describes it.

## Scripted multi-finger touch on a physical Android device

`adb shell input` drives a single pointer, so it cannot put down a second finger, hold one finger
for a timed interval while another moves, or re-grab mid-motion, and UiAutomator2 has answered 400
to multi-finger W3C actions on a physical phone. SELinux refuses `sendevent` on the real
touchscreen. What works is a virtual touchscreen: `/system/bin/uinput` reads a JSONL script that
registers one and then injects Linux multi-touch events into it. Fill in the two `maximum`
placeholders before running the example.

```jsonl
{"id": 1, "command": "register", "name": "Diag Touchscreen", "vid": 6353, "pid": 20225, "bus": "usb", "port": "usb:diag", "configuration": [{"type": "UI_SET_EVBIT", "data": [1, 3]}, {"type": "UI_SET_KEYBIT", "data": [330, 325]}, {"type": "UI_SET_ABSBIT", "data": [47, 48, 53, 54, 55, 57]}, {"type": "UI_SET_PROPBIT", "data": [1]}], "abs_info": [{"code": 47, "info": {"value": 0, "minimum": 0, "maximum": 9, "fuzz": 0, "flat": 0, "resolution": 0}}, {"code": 48, "info": {"value": 0, "minimum": 0, "maximum": 255, "fuzz": 0, "flat": 0, "resolution": 0}}, {"code": 53, "info": {"value": 0, "minimum": 0, "maximum": <width - 1>, "fuzz": 0, "flat": 0, "resolution": 0}}, {"code": 54, "info": {"value": 0, "minimum": 0, "maximum": <height - 1>, "fuzz": 0, "flat": 0, "resolution": 0}}, {"code": 55, "info": {"value": 0, "minimum": 0, "maximum": 2, "fuzz": 0, "flat": 0, "resolution": 0}}, {"code": 57, "info": {"value": 0, "minimum": 0, "maximum": 65535, "fuzz": 0, "flat": 0, "resolution": 0}}]}
{"id": 1, "command": "delay", "duration": 1500}
{"id": 1, "command": "inject", "events": [3, 47, 0, 3, 57, 11, 3, 55, 0, 3, 53, 540, 3, 54, 800, 3, 48, 10, 1, 330, 1, 1, 325, 1, 0, 0, 0]}
{"id": 1, "command": "delay", "duration": 16}
{"id": 1, "command": "inject", "events": [3, 47, 0, 3, 54, 815, 0, 0, 0]}
{"id": 1, "command": "delay", "duration": 16}
{"id": 1, "command": "inject", "events": [3, 47, 1, 3, 57, 12, 3, 55, 0, 3, 53, 850, 3, 54, 1900, 3, 48, 10, 0, 0, 0]}
{"id": 1, "command": "delay", "duration": 16}
{"id": 1, "command": "inject", "events": [3, 47, 1, 3, 57, -1, 0, 0, 0]}
{"id": 1, "command": "delay", "duration": 16}
{"id": 1, "command": "inject", "events": [3, 47, 0, 3, 57, -1, 1, 330, 0, 1, 325, 0, 0, 0, 0]}
{"id": 1, "command": "delay", "duration": 500}
```

* **`register`** declares key and absolute events (`UI_SET_EVBIT` 1, 3), `BTN_TOUCH` 330 and
  `BTN_TOOL_FINGER` 325, the multi-touch axes, and `INPUT_PROP_DIRECT` (`UI_SET_PROPBIT` 1), which
  makes it a touchscreen rather than a touchpad. In `abs_info`, X (53) and Y (54) span the screen's
  pixels from `adb shell wm size`, the slot (47) runs 0–9, the tracking id (57) 0–65535, and the
  tool type (55) 0–2. The first `delay` gives Android time to add the device.
* **`inject`** takes flat `[type, code, value, …]` triples (type 3 an axis, 1 a key), each batch
  ending in `0, 0, 0` (SYN). The first finger down selects its slot, sets a tracking id, tool type,
  X, Y and touch major (48), and presses 330 and 325; a later finger sets the same axes without the
  keys. A move selects the slot and sets the axes that changed. Lifting a finger sets its tracking
  id to -1; the last one up also releases 330 and 325.
* **`delay`** is in milliseconds; 16 ms between moves is one 60 Hz frame. The device exists only
  while the command runs, so end with a delay that outlasts the last event's delivery.

Push the script to `/data/local/tmp/` and run `adb shell uinput /data/local/tmp/<file>.jsonl`. It
sends no foreground check of its own: read
`adb shell dumpsys activity activities | grep topResumedActivity` first, and never inject Back (the
rules below).

## Rules the device work learned

* **Never send Back.** Back on the app's root screen leaves the app, and every later input lands on
  whatever is in front. `sendAndroidKey` refuses `KEYCODE_BACK`, the monkey runs with system keys
  and navigation at zero, and the parity driver sends Back only for the `life1-android-back` slice,
  whose subject is Back (`tests/system-back.test.mjs`).
* **Check the foreground app before every input.** The drivers call `createForegroundGuard` before
  every tap, stroke, drag, and key they send; `drive-android-ui.mjs keys` reads Display0's focus
  before each key, since a key such as Home moves focus off the app. The exceptions are the hand-run
  `explore-app-ui.mjs`, the click that dismisses Android's immersive-mode notice (OS chrome over the
  app), and a Clear-drag stress's re-grabs, which must land while the release motion is still
  running. On iOS a hosted `com.apple.*ViewService` (DockFolderViewService) can hold XCUITest's
  active-app slot while the app is in front; it is accepted only when the app's own `queryAppState`
  is 4, and the crash runner also sets Appium's `defaultActiveApplication`.
* **Bind Android display checks to Display0.** A device with a second display dumps one section per
  display; focus, rotation, and orientation are read from Display0's own section, and the package is
  matched whole (`tests/android-display.test.mjs`).
* **Cap simultaneous fingers at 3 on iPadOS** (four- and five-finger swipes switch apps; Samsung
  phones add multi-finger capture gestures); only the emulator keeps 5 (`lib/crash-targets.mjs`).
  `run-clear-drag-stress.mjs` refuses a `--fingers` above its target's limit before any input.
  Crash-harness strokes stay 80 pt clear of every screen edge: a stroke along the bottom edge is the
  swipe-between-apps gesture. A press on a control near an edge stays where the control is.
* **The reference WebView names its controls in `text`, not `content-desc`**, so Android lookups
  fall back to an XPath over both.
* **WDA plays W3C actions slowly and can return before playback ends.** A chain that opens with a
  pause is rejected, so it gets a zero-length move to its first press point
  (`tests/pointer-chains.test.mjs`); scenarios wait out a gesture's length rather than trusting the
  call's return; `run-tap-probe.mjs` measures the playback time. UiAutomator2 sometimes refuses a
  multi-finger chain; its fingers then draw one at a time and the run notes it.
* **Collect the iPad's unified log after a run, never as a live stream**: a live stream perturbs the
  device. `--collect-log` archives the run's window with `pymobiledevice3 syslog collect` and reads
  launchd's and SpringBoard's exit records from it.
* **Resource reports are diagnostics.** `cpu_resource`, `diskwrites_resource`, and
  `wakeups_resource` reports record a limit crossed and survived; they are listed as `diagnostics`
  and never make a run `crashed` (`tests/crash-verdict.test.mjs`).
* **A crash counts only when it is the target's.** On Android an uncaught exception, fatal signal,
  tombstone, or process death counts when it names the target's package or one of its pids (the
  current one or any a line names beside the package, so a crash before a restart still counts);
  another process's is kept as `otherProcessFatal`. The verdict reads the whole log since the start,
  and only the excerpts stored in the result are capped. On a physical iPad a new JetsamEvent is
  pulled and counts only when its process list shows the target's process with a kill `reason` (or
  `killed`); any other is a diagnostic, with each report's kills under `jetsam`.
* **adb passes logcat's `-T` stamp as one argv element, unquoted.** adb escapes each argument for
  the device shell, so shell quotes around the stamp reach logcat as part of the time and it rejects
  it (`tests/crash-verdict.logcat.test.mjs`). Every Android verdict this harness reached before
  issue 3106, including the device sweep that found it, rested on `pidof` and dropbox alone; the
  2026-10-20 crash hunt's came from the scratch harness it was ported from and may share the gap.
* `log show` reads a zone-less time as host-local, so every timestamp passed to it carries `+0000`.
* **Never edit a runner script while it runs.** The shell reads a script from disk as it executes
  it, so during the 2026-10-20 crash hunt an edit to a shell queue that looped the device matrix
  corrupted every later loop ("command not found", syntax errors), and those runs had to be redone.
  Copy the queue to a run-specific file and launch the copy.

## Domain ownership

This capability owns the migration's crash verdicts and parity captures: the scenario and slice
definitions, how a verdict is reached per platform, and the capture layout the comparators read.
Performance capture belongs to `tools/perf/`, and browser-driven app automation to
`tools/app-driver/`; neither is imported here. Shared host details come from
`tools/mobile/android/lib/android-toolchain.mjs` (the `adb` path) and `tools/lib/proc.mjs` (CLI
helpers).

## Maintenance

* Run `npm run test:tools -- tools/device-parity` after any change; the tests cover the pointer
  chains, verdict classification and crash attribution, the foreground rule, Display0 reads, the
  Back refusal, the finger limit, slice step selection and step errors, the tally, and every entry's
  flag refusal, each with a negative control.
* A new entry uses `parseFlags` from `lib/cli-flags.mjs`, which refuses unknown flags with the
  shared message, and gates on `isMain(import.meta.url)`; `tests/cli-entries.test.mjs` picks it up.
* A new slice is a step list in `lib/slices/` registered in `lib/parity-slices.mjs` with the
  platforms it runs on. A step's `run` returns the time of its last input; `setup` and `after` are
  unrecorded.
* Control names (`Clear drawing`, `Expand controls`, `Brushes`, …) are the shipping accessible
  names. When the app renames one, update the scenarios and slices, or add an arm alias when only
  one arm differs.

Ported from scratch campaigns, with these changes and omissions:

* Arms come from the manifest and `--arm` instead of bundle ids hard-coded in the drivers or
  inferred from a bundle id containing `baseline`, and the crash targets are named for the device
  class.
* The iOS process name is a flag; the scratch harness matched one app's process name for both arms,
  so a reference-arm simulator crash report filed under another process name was never read.
* `log show` timestamps carry their zone; the scratch passed UTC as local time.
* Archived invalid runs are counted by their JSON files; the scratch count included screenshots.
* Resource-report classification also applies to simulator reports, and `run-clear-drag-stress.mjs`
  on a physical iPad diffs the crash list itself instead of relying on a wrapper script.
* Left out: the one-off shell queues and redo scripts, rig provisioning (emulator boot, status-bar
  demo mode, Appium and simulator start-up), the Python Time Profiler and footprint helpers, the
  physical iPad's `sysmon` footprint monitor (a live stream), and the `timing`, `triple-tap`,
  `scribble`, `probe-src`, and `xc-triple` probes. `run-tap-probe.mjs` no longer launches an app
  that is not in front; the foreground check fails instead. The DS-2 driver's unused `hold` input
  and per-step motion filter were dropped.
