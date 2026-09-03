# Performance-matrix capture platform recipes

These recipes assume the repository root and a fresh read of the `perf:*` rows from `npm run info`.
Replace placeholders such as `<serial>`, `<url>`, and `<capabilities.json>` with locally verified
values. Add `--report-only` for a measurement-only snapshot that must retain all results.

## Shared preparation

Run a campaign through `npm run perf:campaign -- --target=<id> …` rather than a one-off script. It
expands the target into its cells, retries, records a resumable ledger, and continues past an
exhausted cell instead of ending the run; `--dry-run` prints the queue without capturing. The
previous campaign's queue lived in a temporary shell script and survived only as long as
`/private/tmp` did.

**A fresh worktree needs two things the main checkout hides**, both gitignored and both failing
immediately rather than subtly:

* `android/local.properties` does not exist, so Gradle stops with "SDK location not found". Write
  `sdk.dir=<android-sdk-path>` into it, or export `ANDROID_HOME`.
* Appium's UiAutomator2 driver reads `ANDROID_HOME` from the **server's** environment, not the
  client's, so start Appium with it exported or every Android session fails to create.
* `ios/local.xcconfig` does not exist, so every physical-iPad runner stops on "No signing config".
  Copy it from the main checkout; it holds only a `DEVELOPMENT_TEAM` id.

**Build one runtime at a time.** `cap:sync` writes the static native export over `web/build`, which
is the same directory `perf:serve` hands the LAN — so a native build silently replaces the bundle
every web target is being measured against, and nothing in a later artifact records the swap.
Capture every web cell, then build native and capture every native cell; rerun `npm run perf:build`
before returning to web targets. Do not interleave them.

Check the worktree and product commit. Stop stale servers on the profiling port before rebuilding.
Build and serve one marked web bundle when several web targets will share it:

```sh
npm run perf:build
npm run perf:serve --ignore-scripts
```

The server prints localhost and LAN URLs. A device must use a reachable LAN/provider-tunnel URL, not
the Mac’s localhost. Keep the server running and pass `--no-serve` plus the URL to device runners.

Start Appium 3 only for Appium targets and confirm its driver for the platform is installed. Use a
capability file for simulators, Android, retained sessions, or hosted providers; do not commit the
file if it contains IDs or credentials.

**Run one target at a time, and do not chain them on a process check.** Waiting for the previous
campaign by polling `pgrep` looks obvious and fails twice over: it races at launch, because the
process being waited for may not be visible yet, and a wait that is still parked when you start
another run by hand leaves a second campaign armed against the same device — one that may begin by
deleting the output directory the live run is writing into. Two campaigns on one device invalidate
both, and nothing in either artifact records the overlap. Start the next target only after the
previous one has printed its `N/M cells complete` line.

Detach every viewer from the device before capturing. A mirrored or recorded screen is not a passive
observer: an editor's device panel, a simulator stream, QuickTime recording, or scrcpy encodes video
continuously and adds host load the measured baseline never had. That makes a run non-comparable
with evidence captured without it, which is worse than a slow run because nothing in the artifact
records that a mirror was attached. Simulator.app's own window is the exception — it is part of the
established baseline. Check for stray streams before starting:

```sh
pgrep -fl "simctl (io|spawn)|scrcpy|screenrecord"
xcrun simctl list devices booted
```

That first check finds streams, not idle load. A simulator left booted from an earlier phase keeps
rendering its app and costs real host CPU while a *physical* target is being driven — it is part of
the established baseline for a simulator cell and background load for a physical one. The second
command names it. Shut it down before a physical target, or decide deliberately to leave it and keep
that choice constant for the whole target, because a target measured half each way is comparable to
neither.

The gate that would catch it is per-cell input fidelity: a starved host shows up as driver cadence
drifting off the calibrated ~117 moves/second and a rising `gap p95`. Read those across a target's
cells before trusting them as a set — stable cadence is the evidence that host load stayed out of
the measurement.

Re-check after any tool offers to show you the device mid-campaign, and treat cells captured while a
mirror was attached as unmeasured rather than merging them.

## macOS web

Drawing on the production route, one brush at a time:

```sh
npm run perf:web:frames -- \
  --engine=webkit \
  --brush=pen \
  --drive=mixed \
  --contact-seconds=10
```

Repeat with `crayon`, `magic`, and `eraser`. For current-versus-historical comparisons, serve each
build separately and pass its URL through `--url=` while keeping the current runner.

Discrete actions:

```sh
npm run perf:web:actions -- \
  --engine=webkit \
  --headed \
  --repeats=4
```

The established comparison geometry is 1512×982 CSS pixels at 2× DPR. The runner defaults to that
profile; pass `--viewport=1512x982 --device-scale-factor=2` when recording an explicit command.

Headed, that CSS viewport plus the browser's own chrome can make the outer window taller than a
shorter physical display, so the bottom looks cut off at 100% zoom. Playwright still gives the page
the requested viewport, so the artifact is correct and the crop is cosmetic — scroll or move the
outer window to inspect it. Do not shrink the geometry to make the window fit: that changes the
matrix cell. A smaller exploratory viewport is fine, but label it non-comparable.

## Physical iPad web

Prerequisites: iPad unlocked, trusts the Mac, Web Inspector enabled, same network as the preview,
Safari open, Appium/XCUITest configured and signed.

High-fidelity real-screen drawing plus undo:

```sh
npm run perf:ios:xcuitest:screen --ignore-scripts -- \
  --device-id=<udid> \
  --url=<lan-url> \
  --no-serve \
  --brush=pen \
  --gesture-repeats=10 \
  --undo-count=10
```

Repeat drawing for crayon, Magic, and eraser; undo is required at least on pen. Physical iPad
calibration must pass before interpreting drawing gates as approval.

Discrete actions:

```sh
npm run perf:ios:xcuitest:actions --ignore-scripts -- \
  --device-id=<udid> \
  --url=<lan-url> \
  --no-serve \
  --repeats=4
```

Use the real-screen WebKit Inspector runner (`perf:ios:webkit:frames`) for a hand-driven diagnostic
and `perf:ios:webkit:gates` for the legacy `/dev/engine` gate only when those narrower questions are
in scope. A passing engine harness does not approve the real presentation surface.

## Physical iPad native

Install an instrumented native app first — the normal command does not carry marks, and an app
without them reaches the canvas and then measures nothing:

```sh
PERF_MARKS=true PUBLIC_ENABLE_DEV_HARNESS=true npm run ios:run:device
```

`--native-app` with `--device-id` opens the Capacitor bundle and attaches to its WebView; a
capability file stays the path for Simulators and hosted providers:

```sh
npm run perf:ios:xcuitest:screen --ignore-scripts -- \
  --device-id=<udid> \
  --native-app \
  --brush=pen \
  --gesture-repeats=10 \
  --undo-count=10
```

```sh
npm run perf:ios:xcuitest:actions --ignore-scripts -- \
  --device-id=<udid> \
  --native-app \
  --repeats=4
```

Do not pass a URL: the runner must not navigate an app-owned WebView.

The native WebView’s coalescing signature is not the MobileSafari calibration. Report it as
physical/native advisory until separately calibrated.

## iPad Simulator web

Boot the requested iPad Simulator and start Appium/XCUITest with a Safari capability file. Use the
same drawing/action commands as physical iPad web, replacing `--device-id` with:

```sh
--appium-url=<appium-url> --capabilities-file=<capabilities.json>
```

Pass the Mac preview URL through `--url=<url> --no-serve`. Simulator input is advisory. For a
historical architecture negative control, serve the pre-tiling app at `2769ceae` while using the
current runner and same capabilities/input plan.

## iPad Simulator native

Build and launch the Capacitor app on the chosen Simulator:

```sh
npm run ios:run:emulator
```

For a profiling build, follow the profiling/mobile build inputs instead of assuming the normal
command contains marks. Attach using the physical-native command pattern with `--native-app` and
Simulator capabilities. Do not pass a web URL once attached to the app-owned WebView.

The historical pre-tiling Simulator native build is a strong negative control for Magic, crayon, and
undo. Keep the current runner and only swap the installed app build.

## Android emulator web

Boot the repository emulator and verify it is the intended ADB target:

```sh
npm run android:boot
npm run adb:devices
```

Physical Chrome, the physical WebView, and the emulator image routinely run different Chromium
majors, so one pinned Chromedriver cannot serve them all. Record the versions and either point the
capability file at a matching cached driver or start Appium with the download explicitly authorized:

```sh
appium server --port <owned-port> --allow-insecure uiautomator2:chromedriver_autodownload
```

Keep downloaded drivers and device-specific capability files untracked.

Drawing uses the shared Appium real-screen runner with Android Chrome capabilities and a reachable
preview URL. Report missing contact geometry as advisory. Web *actions* use direct CDP rather than
Appium (ADR-0092).

Actions must use direct CDP:

```sh
npm run perf:android:browser:actions --ignore-scripts -- \
  --device-id=emulator-5554 \
  --url=<url> \
  --no-serve \
  --repeats=4
```

Use `--trace` only for a focused attribution run; broad traces are large and mix unrelated actions.

## Android emulator native

Build/install/launch the Capacitor app:

```sh
npm run android:emulator
```

Use an instrumented build for actual profiling. Drawing and actions use the Appium patterns with:

```sh
--native-app --native-webview-class=android.webkit.WebView
```

Do not navigate the native WebView to the hosted URL. Rotation runs must go through whatever
orientation control the product offers in that mode; the action runner owns that sequence.

**Several debuggable WebViews can satisfy the context search.** If Chrome is running with an open
tab, a native capture can attach to Chrome's WebView instead of the Capacitor one and still look
successful. Stop Chrome before a native run and verify the artifact's identity rather than the exit
code:

```sh
adb -s "$SERIAL" shell am force-stop com.android.chrome
```

Accept the artifact only when its metadata says `transport: native-capacitor-webview` with the
expected app URL, device, orientation, and theme. Never accept the first `WEBVIEW_*`/`CHROMIUM`
context without that check.

`perf:campaign` enforces the transport half: a native cell is accepted only if its artifact records
the native transport, and a web cell only if it does not, so a cell that attached to the wrong
WebView retries instead of landing. The rest of the identity — app URL, device, orientation, theme —
is still yours to read, and a one-off runner outside the campaign has no such gate at all.

## Physical Android web

Unlock the phone, enable developer mode and USB debugging, and accept the Mac’s RSA prompt. Verify
the exact serial shows `device`, not `unauthorized`:

```sh
npm run adb:devices
```

Pin the screen awake for the whole campaign rather than trusting the display timeout — a phone that
dozes mid-queue fails every remaining cell:

```sh
adb -s <serial> shell svc power stayon true
```

`stayon usb` is the trap: it sets the keep-awake mask to USB-only, and a phone that negotiates the
same cable as an **AC** charger never matches it, so the screen sleeps with the setting still
reading as applied. `stayon true` covers every power source. Confirm against what the device thinks
it is plugged into, not what the cable is:

```sh
adb -s <serial> shell dumpsys battery | grep -E "AC powered|USB powered"
adb -s <serial> shell settings get global stay_on_while_plugged_in   # want 7 or 15, not 2
adb -s <serial> shell dumpsys power | grep mWakefulness              # want Awake, not Dozing
```

Re-check `mWakefulness` between targets. A device that dozed reports `Dozing` long after the cells
it would have failed, and nothing in a capture records that the screen was off.

**Confirm the phone is unlocked, not merely awake.** This is the one that wastes an afternoon: a
locked phone still answers ADB, still exposes its WebView to CDP and Appium, and still passes every
portrait cell — while the keyguard holds the display in portrait, so `user_rotation` is accepted and
ignored, and `screencap` returns a constant black frame because Android blocks capture of a secure
window. The result is a target where portrait cells land and landscape cells fail at rotation, which
reads like an orientation bug in the product.

```sh
adb -s <serial> shell dumpsys trust | grep -o "deviceLocked=[0-9]"   # want 0
adb -s <serial> shell dumpsys window displays | grep -o "rotation=[A-Z_0-9]*"
```

Waking the screen is not unlocking it: `KEYCODE_WAKEUP` clears Doze and leaves the keyguard up. A
swipe-only lock screen yields to a swipe gesture; anything stronger needs the device's owner, and no
agent should be entering that credential. Check `deviceLocked` before queueing any landscape cells,
and again after any period where the device was left alone.

If the phone cannot reach the LAN preview running on port 4173, forward that exact preview port with
`adb -s <serial> reverse tcp:4173 tcp:4173`; the repository `adb:reverse` helper forwards the dev
server’s 5173 instead. Alternatively, pass a reachable network URL. Drawing uses Appium Android
Chrome capabilities. Actions use the direct-CDP command from the emulator recipe with
`--device-id=<serial>`.

Do not run with an unresolved shell variable for the serial; paste the verified explicit value into
the command/log.

## Physical Android native

Install a marked build on the verified serial. `android:run:device` pins one registered handset,
which is **not** the phone the committed `android-device-*` rows were measured on — check the row's
`environment` string against `adb:devices` before assuming the script targets it, and address any
other phone through `ANDROID_SERIAL`:

```sh
PERF_MARKS=true PUBLIC_ENABLE_DEV_HARNESS=true ANDROID_SERIAL=<serial> npm run android:run
```

Then use Appium with a capability file — the Android session is UiAutomator2, which the iOS runner's
built-in capabilities cannot express:

```sh
--capabilities-file=<capabilities.json> --native-app --native-webview-class=android.webkit.WebView
```

**CacheStorage wedges the Capacitor WebView.** In Android System WebView 151, `caches.keys()` never
settles — and worse, once one is pending, async-script callbacks stop being delivered for the rest
of the session, plain `setTimeout` included, while synchronous evaluation keeps working. An in-page
deadline therefore cannot rescue it: the timer is the thing being wedged. That cost a wrong fix
before a probe separated the two, so measure before theorising here.

The runner now reads service worker registrations first and touches `caches` only when a worker
exists to serve from one. A native app ships no service worker, so the common case never calls the
wedging API at all — setup went from a 30 s timeout to 22 ms on the device that exposed this. That
ordering is load-bearing, not stylistic. If a native capture dies on cache eviction, check what the
WebView reports before suspecting the app:

```sh
adb -s <serial> shell dumpsys webviewupdate | grep "Current WebView package"
```

Record that version — it moves independently of the app and of Chrome, and a row whose cells were
captured across a WebView update is not internally comparable.

The file names the platform, the driver, the serial, and the Capacitor package:

```json
{
  "platformName": "Android",
  "appium:automationName": "UiAutomator2",
  "appium:udid": "<serial>",
  "appium:appPackage": "art.splotch.app",
  "appium:appActivity": ".MainActivity",
  "appium:noReset": true,
  "appium:newCommandTimeout": 600
}
```

Capture four brushes, pen undo, and the four-repeat action suite. Keep the physical Android
calibration advisory until native/web hand input establishes expected cadence and contact geometry.

## Focused action reruns

Use `--actions=` to isolate one family. Current families are printed by `npm run info`; examples
include `theme`, `coloring`, `screenshot`, `undo`, `clear`, `rotation`, `settings-controls`, and
`idle`. Use at least ten repeats for a marginal candidate and three for the cross-target check.

When an Android web action is red, rerun its direct-CDP command with `--trace`. Compare a late
static failure with `--actions=idle` before attributing it to product code.

## Report regeneration

The committed source map is:

```text
scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json
```

Fold a finished campaign into it rather than hand-writing cells — the tool derives each evidence
path from the same plan that wrote it, and accepts a mode only when all four brushes plus the action
sweep landed through the target's own transport:

```sh
npm run perf:campaign:sources -- \
  --target=<id> \
  --output-root=<campaign-output-root> \
  --product-commit=<sha> \
  --manifest=scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json
```

Omit `--manifest` to print the modes instead of writing them. A mode it reports as skipped keeps
whatever the manifest already says, so a partly captured target never half-lands as measured.

Raw captures live under gitignored `perf-profiles/`, so a manifest that names them regenerates only
while they are still on the box. Copy them somewhere durable before switching host or worktree, or
convert those cells to `preserved` — a manifest pointing at deleted scratch cannot be regenerated at
all.

Regenerate normalized JSON, Markdown, and HTML:

```sh
npm run gen:performance-matrix -- --strict \
  scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json
```

`--strict` is what makes this regenerate a currency claim: the chained staleness check fails it on
any captured row whose product surface has moved (ADR-0159). Mark the rows this campaign did not
recapture `preserved` first, then regenerate with the flag. Without it the check only reports, which
is the right default between campaigns and the wrong one here.

Every source must resolve locally while generating. The committed `data.json` is self-contained and
must identify one product commit. Inspect all three outputs before committing.
