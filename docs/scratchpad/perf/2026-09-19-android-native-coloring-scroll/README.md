# Android native coloring capture: the swipe Android refused

Issue 1870, unit `coloring-android-r1`, 2026-09-19. A working note: the evidence behind one harness
change, not a performance result.

## What failed

Physical Android native action captures (`perf:ios:xcuitest:actions --native-app`, Appium
UiAutomator2) failed in sweep 1 with `Timed out waiting for coloring pages to scroll`. The first
overnight run had passed all four sweeps.

## Cause

The harness began its native swipe on the picker's centre column. The picker is centred, so that is
the screen's centre column, physical x = 540. On this phone a navigation-gesture accessibility
service (`nu.nav.bar`) keeps one-pixel-wide, full-height overlay windows on exactly that column.
They are not trusted overlays, and each has alpha 0.7998.

Android refuses a touch that starts under untrusted overlays whose combined opacity passes
`mMaximumObscuringOpacityForTouch` (0.80). One such window stays under the limit. Two stack to 0.96,
and InputDispatcher drops the touch before any app sees it:

```
Untrusted touch due to occlusion by nu.nav.bar/<uid> (obscuring opacity = 0.96, maximum allowed = 0.80)
Stack of obscuring windows during untrusted touch (540.0, 1667.0):
Dropping untrusted touch event due to nu.nav.bar/<uid>
```

UiAutomator2 still answers 200, because injection succeeded; the drop happens at dispatch. Taps
elsewhere in the dialog kept arriving, which is why only the scroll failed.

The same column explains the unexplained "centre dead spot" recorded for adb `input swipe` calls
that start at (540, ~1013) in the bundled capture. That path was not retested here.

## Treatment

`COLORING_SCROLL_OFF_CENTRE_PX` starts the swipe 8 native pixels off centre. On the phone that is
still the gutter between the two tile columns, where the centred swipe used to land (CSS x 182.67
against 180), so the measured action begins on the same element as the earlier passing captures. A
scroll timeout now also reports what the page received, which is what made this diagnosable in one
run.

Nothing else changed: real native touch, the same wait, the same gates, the same actions.

## Evidence

| Directory                | What it holds                                                                                                                                                                 | Support                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `retained-log/`          | Script and output re-deriving, from the overnight Appium server log, that gesture, geometry and driver acceptance were identical in the passing session and four failing ones | machine-checked; the raw log names the device and stays local                                           |
| `control-centre/`        | Fresh failure on the pre-treatment swipe with the new timeout state (`uncaptured`, dialog scrollable, `scrollTop` 0), the logcat verdict, and the overlay windows             | machine-checked, except `overlay-windows.txt`, an operator reduction of a local `dumpsys input` listing |
| `treatment-coloring/`    | Original command with `--actions=coloring`: 4/4 sweeps pass                                                                                                                   | machine-checked                                                                                         |
| `treatment-full-groups/` | Original command with the overnight run's eleven groups: 24 actions, 4/4 sweeps, all pass                                                                                     | machine-checked                                                                                         |

`node check.mjs` verifies every machine-checked claim and the manifest hashes.
`actions.reduced.json` files are produced by `reduce-actions.jq` from raw artifacts whose SHA-256
each file records; the raw artifacts carry per-frame arrays and the device id, and stay local.

Operator-observed only: zero `Dropping untrusted touch` lines in logcat during both treatment runs
(logcat was cleared before each; the counts were read at the terminal and not saved).

## Reproduce

```sh
npm run perf:ios:xcuitest:actions --ignore-scripts -- --appium-url=http://127.0.0.1:<appium> \
  --native-app --native-webview-class=android.webkit.WebView \
  --capabilities-file=<UiAutomator2 caps, noReset> --device-id=<phone> \
  --actions=coloring --output=<dir>/actions.json
adb logcat -d | grep 'untrusted touch'
adb shell dumpsys input | grep -A12 'nu.nav.bar'
```

Negative control for the tests: `tools/perf/tests/coloring-scroll.test.mjs` against the parent
commit's `capture-xcuitest-actions.mjs` fails the off-centre test and the timeout-state test.

## Identity

* Harness: the control ran at ec573f2552e6 (timeout state only); both treatment runs ran on the
  harness source committed as 8c8ab113f7af.
* Product: the installed perf debug APK of main a8ff7916ea93, unchanged by this unit. Native
  artifacts carry no product commit, so this rests on the rig's install record.
* Phone: Android 16, portrait, 1080x2340, CSS viewport 360x780, light theme.

## Limits

* One control and two treatment captures. The overlay state is the device owner's and was not
  changed, so the "one window passes" half of the explanation rests on the 0.80 limit and the first
  overnight run, not on a run made here with a single window.
* The treatment frame gaps sit near 8.4 ms where the overnight captures sat near 16.7 ms: the panel
  was presenting at 120 Hz. These runs validate capture completeness only. They are not comparable
  with the overnight timings and carry no performance verdict.
* A centre-line overlay wider than the offset, or a layout whose gutter is narrower, would need the
  constant revisited. The timeout state now says so directly when it happens.
* iPad and Android Chrome routes share the constant. Android Chrome uses CDP touch, which does not
  pass through InputDispatcher's occlusion check. Neither was captured here.
