# Capture endpoints

An endpoint is a proved pairing of an input transport and a measurement channel on a platform. There
are ten. Each section lists what must be true before the endpoint can run, the guards it adds to the
common set in [`guards.md`](guards.md), the validations the package cannot make for you, how to
customise it, and the traps that produce a plausible wrong number on it.
`perf-rig capture --dry-run` prints the endpoint a request resolves to and every refusal it would
hit.

| Endpoint                 | Input                | Measurement           | Platform                 | Trusted | Unattended     | Drives                   |
| ------------------------ | -------------------- | --------------------- | ------------------------ | ------- | -------------- | ------------------------ |
| `desktop`                | `desktop-playwright` | `same-process`        | desktop engines          | no      | yes            | session, frames, actions |
| `android-cdp-session`    | `desktop-playwright` | `cdp-evaluate`        | Android packaged WebView | no      | yes            | session                  |
| `android-cdp-actions`    | `cdp-touch`          | `cdp-evaluate`        | Android Chrome           | yes     | yes            | actions                  |
| `android-split`          | `adb-input`          | `http-upload`         | Android Chrome, WebView  | yes     | yes            | frames                   |
| `android-bundled`        | `adb-input`          | `cdp-evaluate`        | Android packaged WebView | yes     | yes            | frames                   |
| `android-native-actions` | `appium`             | `appium-execute`      | Android packaged WebView | yes     | yes            | actions                  |
| `ios-appium`             | `appium`             | `appium-execute`      | iPad Safari, WKWebView   | yes     | needs a tunnel | frames, actions          |
| `ios-split`              | `wda-http`           | `http-upload`         | iPad Safari              | yes     | yes            | frames                   |
| `ios-bundled`            | `appium`             | `preferences-mailbox` | iPad packaged WKWebView  | yes     | needs a tunnel | frames                   |
| `ios-inspector`          | `human` or in-page   | `webkit-inspector`    | iPad Safari              | hand    | no             | frames                   |

Whether an endpoint's input is hand-shaped enough to score is the app's calibration for that
runtime, never a column here. `appium` drives taps on every platform and draws only on iOS, where
XCUITest was calibrated against a hand; on Android it under-drives a drawing stream and the plan
refuses it for `frames`.

## `desktop`

**Prerequisites.** Playwright with the engine installed. No device, no rig definition.

**Validations left to you.** Desktop input is synthetic, so `input-fidelity` is not applicable and
the numbers are advisory. Headless capture sees nothing presentational: a compositing hint can pass
every desktop capture and render black on a device. Desktop WebKit is not an iPad; its clock is
clamped and there is no throttle.

**Customisation.** `instruments: cdp-cpu-throttle` (Chromium only; refused elsewhere),
`cdp-tracing`, `cdp-network-emulation`; `viewport`, `headed`; `build.mode: 'url'` with
`allowForeignBuild` for an A/B against a historical build served from an isolated worktree on its
own port; `input.kind: 'probe-synthetic'` for the frames probe's own hand at a chosen rate.

**Traps.** Any E2E run rebuilds the output directory without the seams; identity passes because the
build is internally consistent and `build-seams-present` is the only tell. A preview left running
from another checkout keeps the port and serves that checkout's build; identity names it.

## `android-cdp-session`

**Prerequisites.** `adb`, the packaged app installed from an instrumented build
(`native.android.build` and `install`), its WebView DevTools socket forwardable.

**Guards added.** `foreground-package`, `packaged-origin`.

**Validations left to you.** Installing through the platform's normal run path re-chains a plain
build and overwrites the instrumented one; the capture still runs. `build-seams-present` on the
attached page is the guard; check `report.meta.counts.measures` before believing an engine table.

## `android-cdp-actions`

**Prerequisites.** `adb` with the device authorised; Chrome installed; the preview reachable from
the device over the LAN.

**Guards added.** `service-worker-blocked`, `entry-module-match`, `foreground-package`;
`instrument-restored` for `android-refresh-pin`, which pins an adaptive-sync panel for the sweep,
verifies the pin against `dumpsys display`, and restores it on exit including interrupts.

**Validations left to you.** A restored tab can hold the foreground while the run's page answers
every poll; `input-received` reads zero events on the first action. An emulator started from a
snapshot is not a fresh boot; the artifact records guest uptime for a cold-boot control to compare.

**Customisation.** `device.cdpPort`, `instruments: cdp-tracing`, `focusActions` by group id.

**Traps.** Awaiting each touch acknowledgement in series once slowed a scroll to three vsyncs apart
and scored a false red; scrolls dispatch as native gestures and the artifact records
`scrollDelivery`. A leaked refresh pin fails every later drawing cell on the phone as off-regime and
names nothing; `doctor` reports the panel rate.

## `android-split`

**Prerequisites.** A probe host proxying the preview, reachable from the phone by a LAN address that
is not a loopback name (`localhost`, `localtest.me`, `*.nip.io` to `127.0.0.1` are refused at plan
time); `adb`.

**Guards added.** `page-identity-nonce` is mandatory for the browser; `dimension-observed` reads
orientation from the page after the stop, rotate, launch sequence; `runtime-user-agent`. A packaged
WebView on this endpoint is `remote-preview` delivery (ADR-0135): the shell loads the instrumented
native export from the served preview through its capture-only server URL, so
`refused-build-variant` requires the export rather than the web build, `packaged-origin` and
`page-identity-nonce` are both not applicable (the fixed URL carries no per-cell nonce), and the
artifact records `pageIdentity: unprovable`; the served build is proved by `served-build-identity`
and `entry-module-match`. The delivery follows the request's channel: the same packaged target
measured over `cdp-evaluate` or `appium-execute` is `packaged` delivery.

**How it runs.** The page fetches a plan carrying the nonce, runs the compiled bootstrap (identity,
hydration, tool selection, dimensions, prime, probe), posts readiness, polls the plan, and uploads
its tables when the host marks the plan finished. Between passes the host writes a prime request
into the plan and awaits the page's acknowledgement, which proves a new trusted lift landed before
priming again. Procedure postconditions are evaluated in the page and posted back.

**Validations left to you.** Cadence near half the calibrated band on a quiet rig is a degraded adb
server, not the product. A native orientation lock can rotate the page after readiness; the
orientation dimension declares how the lock is released and restored.

**Customisation.** `gesture.primeBetweenPasses`, `repeatedAction`, `device.probeHost`,
`transport.input: 'human'` for a hand capture through the same channel.

**Traps.** Uploads carry the nonce and the host keeps the report that saw more input, because a
suspended tab once overwrote a real capture with near-empty tables. A capture that fails fidelity is
written and then fails; the artifact parsing is not the cell being complete.

## `android-bundled`

**Prerequisites.** The packaged app installed from an instrumented build; the WebView DevTools
socket forwardable. No server.

**Guards added.** `packaged-origin`, `runtime-user-agent`, `foreground-package`.

**Customisation.** `transport.input: 'human'` in place of `adb-input`.

## `android-native-actions`

**Prerequisites.** Appium with UiAutomator2 (through a capabilities file) and a Chromedriver
matching the WebView's Chromium major.

**Guards added.** WebView context selection is fail-closed on `native.android.package`; the first
debuggable context may be a healthy page in the wrong process.

## `ios-appium`

**Prerequisites.** Appium with XCUITest; a signed WebDriverAgent (`native.ios.wdaBundleId`,
`xcodeConfigFile`); the device's hardware UDID, not the CoreDevice UUID `devicectl` prints; a
running RemoteXPC tunnel, which is root-owned and prompts for a password, so it is reused when
present and named as a blocker when absent; the automation grant armed while a launch is running
(`operatorSession`).

**Guards added.** `window-fills-screen`, `entry-module-match`, `service-worker-blocked`; the
identifier is classified by shape before any session is attempted.

**Validations left to you.** Guided Access blocks every launch disguised as `xcodebuild` code 65;
read to the innermost error. A failed OS update leaves a full-screen alert that passes the window
check; read the alert text before accepting anything. A physical session omitting `deviceName` still
needs `device.deviceClass: 'tablet'` for the right allowances.

**Customisation.** `device.capabilitiesFile` replaces the whole capability set (this is how
`wdaLocalPort` moves off 8100 when another server owns it); `device.sessionId` borrows a session;
`transport.activation: 'webdriver-element-click'` for the WebDriver click path.

**Traps.** Two Appium servers cannot share a WDA port; the second proxies into the first's session
with errors that never mention a port. The XCTest prompt exists only during a launch, so a human
asked to check an idle iPad correctly sees nothing.

## `ios-split`

**Prerequisites.** WebDriverAgent launched with `devicectl` and reached over `iproxy`; a probe host.
No Appium session and no RemoteXPC tunnel.

**Guards added.** As `android-split`.

**Validations left to you.** WebDriverAgent's own action synthesis measured near two moves per frame
in one session and near one in an earlier one; treat its cadence as something the verdict checks on
every capture rather than a property of the transport.

## `ios-bundled`

**Prerequisites.** The packaged app installed from an instrumented build that carries the mailbox
hook; `devicectl` can copy files out of the app container. A plain-HTTP LAN host is mixed content
against the packaged origin, so no probe host is involved.

**Guards added.** The mailbox is armed with a nonce before measurement and cleared after; the pulled
payload must match the nonce, the page URL, the packaged origin, the user agent, every table count
and the exact byte length.

**Customisation.** `transport.input: 'human'` for a hand capture inside the packaged app.

## `ios-inspector`

**Prerequisites.** `pymobiledevice3` (the older proxy lists the device and zero pages on iOS 17 and
later, which reads like a disabled Web Inspector setting and is not); Safari foregrounded on the
page. Replies are matched by id because the bridge sends an unsolicited event first.

**Guards added.** `tab-responsive`.

**Validations left to you.** This endpoint produces calibration data: a hand capture here, with a
known-bad control, is what `calibrate` turns into the fidelity bounds every driven endpoint on the
same runtime is judged by. The WebKit Timeline domain is available and too coarse to attribute
per-frame cost; `xctrace` is the frame-level instrument on this platform.

**Customisation.** `hud: true` walks the operator through phases; `phases[].suppress` for A/B
sweeps, including `pin-computed` for a transform nudge; `perf-rig probe render` writes the rendered
probe for pasting into Web Inspector.
