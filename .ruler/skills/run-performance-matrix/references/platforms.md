# Platform recipes

These recipes assume the repository root and a fresh read of the `perf:*` rows from `npm run info`.
Replace placeholders such as `<serial>`, `<url>`, and `<capabilities.json>` with locally verified
values. Add `--report-only` for a measurement-only snapshot that must retain all results.

## Shared preparation

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

## macOS web

Drawing on the production route, one brush at a time:

```sh
npm run perf:frames:local -- \
  --engine=webkit \
  --brush=pen \
  --drive=mixed \
  --contact-seconds=10
```

Repeat with `crayon`, `magic`, and `eraser`. For current-versus-historical comparisons, serve each
build separately and pass its URL through `--url=` while keeping the current runner.

Discrete actions:

```sh
npm run perf:desktop:actions -- \
  --engine=webkit \
  --headed \
  --repeats=4
```

The established comparison geometry is 1512×982 CSS pixels at 2× DPR. The runner defaults to that
profile; pass `--viewport=1512x982 --device-scale-factor=2` when recording an explicit command.

## Physical iPad web

Prerequisites: iPad unlocked, trusts the Mac, Web Inspector enabled, same network as the preview,
Safari open, Appium/XCUITest configured and signed.

High-fidelity real-screen drawing plus undo:

```sh
npm run perf:ipad:xcuitest --ignore-scripts -- \
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
npm run perf:ipad:actions --ignore-scripts -- \
  --device-id=<udid> \
  --url=<lan-url> \
  --no-serve \
  --repeats=4
```

Use the real-screen WebKit Inspector runner (`perf:ipad:frames`) for a hand-driven diagnostic and
`perf:ipad` for the legacy `/dev/engine` gate only when those narrower questions are in scope. A
passing engine harness does not approve the real presentation surface.

## Physical iPad native

Build/install an instrumented native app according to the profiling/mobile skills. Use the app’s
bundle capabilities and attach to its WebView without navigating to an HTTP page:

```sh
npm run perf:ipad:xcuitest --ignore-scripts -- \
  --appium-url=<appium-url> \
  --capabilities-file=<capabilities.json> \
  --native-app \
  --brush=pen \
  --gesture-repeats=10 \
  --undo-count=10
```

```sh
npm run perf:ipad:actions --ignore-scripts -- \
  --appium-url=<appium-url> \
  --capabilities-file=<capabilities.json> \
  --native-app \
  --repeats=4
```

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

Drawing uses the shared Appium real-screen runner with Android Chrome capabilities and a reachable
preview URL. Report missing contact geometry as advisory.

Actions must use direct CDP:

```sh
npm run perf:android:web:actions --ignore-scripts -- \
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

Do not navigate the native WebView to the hosted URL. Rotation runs must unlock and restore the real
Parent Center preference; the action runner owns that sequence.

## Physical Android web

Unlock the phone, enable developer mode and USB debugging, accept the Mac’s RSA prompt, and keep the
screen awake. Verify the exact serial shows `device`, not `unauthorized`:

```sh
npm run adb:devices
```

If the phone cannot reach the LAN preview running on port 4173, forward that exact preview port with
`adb -s <serial> reverse tcp:4173 tcp:4173`; the repository `adb:reverse` helper forwards the dev
server’s 5173 instead. Alternatively, pass a reachable network URL. Drawing uses Appium Android
Chrome capabilities. Actions use the direct-CDP command from the emulator recipe with
`--device-id=<serial>`.

Do not run with an unresolved shell variable for the serial; paste the verified explicit value into
the command/log.

## Physical Android native

Install the app on the verified serial using the repository command appropriate to the registered
device:

```sh
npm run android:run:device
```

For an unregistered/new device, use the mobile guide and explicit `ANDROID_SERIAL` procedure rather
than editing generated instructions or guessing a target. Build with marks, then use Appium with:

```sh
--native-app --native-webview-class=android.webkit.WebView
```

Capture four brushes, pen undo, and the four-repeat action suite. Keep the physical Android
calibration advisory until native/web hand input establishes expected cadence and contact geometry.

## Focused action reruns

Use `--actions=` to isolate one family. Current families are printed by `npm run info`; examples
include `theme`, `coloring`, `screenshot`, `undo`, `clear`, `rotation`, `parent-settings`, and
`idle`. Use at least ten repeats for a marginal candidate and three for the cross-target check.

When an Android web action is red, rerun its direct-CDP command with `--trace`. Compare a late
static failure with `--actions=idle` before attributing it to product code.

## Report regeneration

The committed source map is:

```text
scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json
```

Regenerate normalized JSON, Markdown, and HTML:

```sh
npm run perf:matrix:report -- \
  scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json
```

Every source must resolve locally while generating. The committed `data.json` is self-contained and
must identify one product commit. Inspect all three outputs before committing.
