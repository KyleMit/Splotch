# Crash hunt: the Clear crash and a stress matrix, 2026-10-19 to 2026-10-20

The third unattended run of #2978 put a crash hunt first. The owner had seen the React Native app
crash after dragging the Clear button back and forth and letting go. This record covers four things:
how the crash was found and fixed, the detection harness, the pre-registered stress matrix on four
targets and both arms, and the defects the hunt turned up on the way. It makes no cutover
recommendation.

Physical-device media and traces stay private. This record holds no device identifiers.

## The owner's report

The preflight answers, quoted verbatim:

* **Which app and device:** "unsure which app - but on the ipad".
* **What the crash looked like:** "at first, screen froze and stayed there for ~5s and then app
  completely shut down and went to home screen".

A freeze followed by a return to the home screen, with no crash report, is the shape of an iOS
memory kill.

## The crash: Clear re-drew every Crayon stroke through Core Image (#3035)

**Reproduced** on the physical iPad with the RN app and a scripted W3C drag. The input was 12 Crayon
strokes, then Clear dragged back and forth across the accept ring and released past it. The app
froze, then went to the home screen.

**No crash report.** The device wrote no `.ips`. The unified log, collected with
`pymobiledevice3 syslog collect` after the run, showed launchd and SpringBoard ending the process
for `JETSAM_REASON_MEMORY_PERPROCESSLIMIT`.

**Cause.** The departing page in the Clear flight re-rendered every stroke on the paper through
react-native-svg. On iOS, react-native-svg applies a filter with Core Image
(`RNSVGFilter applyFilter`), and each Crayon stroke's `CrayonGlaze` filter (a `BackgroundImage`
blend plus a composite) covered the whole paper. So every pass allocated full-canvas RGBA half-float
buffers (`RGBAf16`), and memory grew with the number of Crayon passes times the paper's pixels. A
Time Profiler trace attached to the app put the flight's time in `applyFilter`.

**Memory**, measured with the physical iPad's own process monitor:

* **Before the fix:** 6 Crayon strokes, then Clear, peaked at 1,254 to 1,405 MB. 24 strokes reached
  4,628 MB or were killed for memory.
* **After the fix:** the same runs peaked at 359 and 396 MB.

Android was not affected: the same input stayed at 232 MB PSS on the physical Galaxy.

**Fix.** #3036, merged as f27c58f3aa7796c8463ab25893ef72ec626c93e6. The departing page now flies a
Skia snapshot of the native ink layer instead of re-drawing the strokes:

* `skiaInkScene.departing()` shares the layer's pixels copy-on-write.
* The sheet releases the snapshot when its flight ends.
* A recorded `SkPicture` reaches its `SkiaPictureView` through the `showPicture` JSI setter. The
  `picture` prop leaked a picture under StrictMode.
* RN web's DOM path is unchanged.

The scenario reran to the bar on the physical iPad (S1 below), and #3035 is closed with that
evidence.

## Detection harness

Every run ends with a machine-readable verdict: `alive`, `crashed` (with its report or exit record),
or `error-screened`. Each platform has its own signals:

* **iOS simulator:**
  * new `.ips` reports for the app's process;
  * the app's JavaScript errors from `log show`;
  * whether launchd still lists the app's process.
* **Android (emulator and physical phone):**
  * `logcat` from a start stamp read off the device's clock, matched for fatal exceptions, fatal
    signals, tombstone backtraces, "has died" and low-memory kills;
  * `dumpsys dropbox` crash and ANR entries since the start;
  * `pidof`.
  * The harness never clears the device's logs.
* **Physical iPad:**
  * new crash reports from `pymobiledevice3 crash ls` (the app's own, plus `JetsamEvent`,
    `ExcResource` and watchdog reports);
  * the app's run state from XCUITest;
  * after the run, launchd and SpringBoard exit records from a collected unified log, never a live
    stream.
* **Error screens.** On every platform the page source is searched for the `RsdScreenBoundary` and
  `RsdSurfaceBoundary` error screens.

Two cases needed an explicit rule:

* **Resource reports.** `cpu_resource`, `diskwrites_resource` and `wakeups_resource` reports are
  recorded as diagnostics, not crashes. They carry "Action taken: none".
* **Symbolication.** The harness keeps the dSYM of every iOS build it runs, for symbolication. No
  crash in the matrix produced a stack to symbolicate.

## Stress matrix

The matrix was pre-registered on #2978 before any run.

**Arms:**

* `rn`: the RN Release build at f27c58f3aa7796c8463ab25893ef72ec626c93e6. This is
  `codex/native-migration` with the #3035 fix.
* `ref160`: the reconstructed v1.6.0, `art.splotch.app.baseline.release`.

**Targets:**

* an iPad Pro 12.9-inch simulator on iOS 26.5;
* an API 36 tablet emulator with 2 GB of RAM;
* the physical iPad;
* the physical Galaxy phone.

**Bar**, per scenario and target: `rn` is crash-free in at least as many runs as `ref160`.

**Scenarios:**

* **S1, Clear drag:** the owner's gesture as a script.
* **S2, toddler scribble:** 40 strokes, brushes cycled on a coloring page, with Undos and Clears.
* **S3, chrome mashing:**
  * the emulator ran `monkey`: 3,000 events per seed, network off, and system keys, navigation and
    app switching at 0%;
  * the simulator ran 120 random taps across the chrome.
* **S4, lifecycle under load:** background and resume mid-stroke, rotation mid-drag, and Settings
  opened mid-stroke.
* **S5, long session:** 2,000 strokes on the simulator and the emulator, 300 on the devices.
* **S6, audio collisions:** a stroke held under a second finger's committing Clear drag, with sound
  on.

### Results

Every valid run is alive on both arms and every target: no crash, no error screen, and no memory
kill in the iPad's collected log. The bar is met in every cell.

| Scenario        | Simulator, rn / ref160 | Emulator, rn / ref160 | iPad, rn / ref160 | Galaxy, rn / ref160 |
| --------------- | ---------------------- | --------------------- | ----------------- | ------------------- |
| S1 Clear drag   | 6 / 6                  | 6 / 6                 | 6 / 6             | 6 / 6               |
| S2 scribble     | 3 / 3                  | 3 / 3                 | 2 ¹ / 2           | 2 / 2               |
| S3 chrome mash  | 2 / 2                  | 5 seeds / 5 seeds     | not run           | not run             |
| S4 lifecycle    | 1 / 1                  | 1 / 1                 | 1 / 1             | 1 / 1               |
| S5 long session | 1 / 1                  | 1 / 1                 | 1 / 1             | 1 / 1               |
| S6 audio        | 3 / 3                  | 3 / 3                 | 2 / 2             | 2 / 2               |

Each entry is the number of runs alive. Each S4 run holds 3 cycles on the simulator and emulator and
2 on the devices.

¹ One iPad S2 run wrote a `cpu_resource` report, counted as alive. It recorded 90 s of CPU in 102 s,
against a limit of 50% over 180 s, with "Action taken: none".

The monkey used seeds 1 to 5 with a 40 ms throttle and airplane mode on, restored afterwards.
Monkey's own network stats confirm no connection. Every seed reached 3,000 events with no `// CRASH`
or `// NOT RESPONDING`.

### Memory

Read the PSS figures below with care. `ref160`'s Android PSS counts the app process only; its
WebView renderer runs in a separate process. So the Android columns compare RN with part of the
reference.

* **S5 on the simulator, 2,000 strokes, eight Clears.**
  * `rn`'s resident memory moved between 357 and 569 MB. It ended lower than it started (499, then
    431 MB), so it showed no steady growth.
  * `ref160` held 247 to 287 MB.
  * Simulator resident memory includes the simulator's own share, so compare the two arms with each
    other, not with a device.
* **S5 on the emulator, 2,000 strokes, eight Clears.**
  * `rn`'s total PSS moved between 207 and 345 MB, with its native heap between 90 and 175 MB. It
    fell back after collections and Clears, and showed no steady growth.
  * `ref160` held 68 to 70 MB.
* **S5 on the Galaxy, 300 strokes.**
  * `rn` held a native heap of 295 to 345 MB, and 558 to 597 MB total.
  * `ref160` held 175 to 190 MB.
* **The LEAK probe on the Galaxy** (12 Crayon strokes five times, five Clears, then Pen).
  * `rn`'s native heap climbed by about 100 MB per 12 strokes: 80, 173, 274, then 391 MB.
  * It fell to 116 MB after the next Clears, then rose again with Pen.
  * So the heap is reclaimed late rather than leaked. It is still worth a look; it is not a crash.
* **The iPad.** Its S5 runs did not sample memory: the scenario has no iPad sampler. The fix's
  memory figures above come from the device's process monitor.

### Deviations from the pre-registration

* **Fingers.** At most 3 simultaneous fingers on iOS and the Galaxy, against 1 to 5 as registered.
  On iPadOS a 4- or 5-finger swipe switches apps. The emulator kept 5.
* **Relaunch.** Each run starts from a relaunched app, so one run's leftover state (an open sheet, a
  held Clear) cannot invalidate the next.
* **Trim memory.** S4 on the emulator sends `am send-trim-memory COMPLETE` while the app is in the
  background. Android refuses `RUNNING_CRITICAL` for a foreground process ("Unable to set a higher
  trim level than current level").
* **Invalid runs.** 35 runs were invalidated by the harness, not by either app. They were archived
  and redone:
  * UiAutomator2 refused a multi-finger W3C chain (8 runs). The driver now draws the fingers in turn
    when that happens.
  * WDA rejects a pointer chain that starts with a pause (9 runs). Each chain now starts with a
    zero-length move.
  * Clear was not found (15 runs), for three reasons:
    * the control rail started collapsed;
    * the reference app opens Coloring books on its shelf, not a page;
    * iPadOS reported a hosted Dock-folder view service as the foreground app, which hid the
      reference app's tree from XCUITest. The driver now expands the rail, descends from book to
      page, and pins Appium's `defaultActiveApplication` to the app under test.
  * `RUNNING_CRITICAL` was refused, as above (2 runs).
  * The reference app was in front for an RN run (1 run).
  * Three more iPad runs ended before writing a verdict, on the same Dock-folder foreground. They
    were redone too.

## Defects found on the way

* **#3037: Clear could stay held after the finger lifted, and #3013: three quick taps never showed
  the coachmark.**
  * The cause was the same for both. A press lifts the Clear face, and that swaps its icon from
    `trash-closed` to `trash-open`; react-native-svg replaces the icon's native views for the new
    markup. On iOS a touch that had landed on the icon belonged to one of those views, so its moves
    and lift went with it.
  * A simulator build that logged the responder showed it: every tap had two touch starts, and every
    other tap lost its release.
  * Fixed by #3041, merged as 2a37becf4116ee5a5bdcca22327316d0bc9d5af6: the button is `box-only`, so
    it alone owns the touch.
  * On an API 36 phone emulator, a Release build of #3041 showed the coachmark after three quick
    taps, cleared on a drag, and left the tab docked after a tap. The physical Galaxy was not
    rechecked.
* **#3012: Undo at the end of history played no cue.** Fixed by #3040, merged as
  ea670da046fbb013100ed5c0a3206fdb825d6281.
* **#3031: hardware keys did not reach the grown-up check on Android phones.** The modal's shortcut
  scope held focus. Fixed by #3042, merged as 77de12ac84174e19e9bff41dbb387ebebd09bba0.
* **Input-tool limits, not app defects:**
  * WDA plays W3C actions at about 2 to 8 times their nominal duration and can return before
    playback ends.
  * WDA's single-chain triple tap and XCTest's `tapWithNumberOfTaps` each deliver only two of three
    taps to an RN view.
  * The reference WebView names its controls in `text`, not `content-desc`.
  * `simctl recordVideo` records at a variable frame rate.

## What the matrix does not cover

* **Real fingers.** The owner's ~25-minute session will try the Clear gesture by finger on both
  devices.
* **#3041 on the physical Galaxy.** Its Android check ran on the emulator only.
* **Low-memory devices.** Every target here has at least 2 GB.
* **iOS older than 26.5.**
* **RN web.** It was outside this matrix. Its CSP and credential fixes (#3039, #3038) were checked
  in Chromium.
