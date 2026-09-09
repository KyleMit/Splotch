# Capture endpoints

An endpoint is a proved pairing of an input transport and a measurement channel on a platform.
There are nine. Each section lists what must be true before the endpoint can run, the guards the
package runs and records, the validations it cannot make for you, how to customise it, and the
traps that produce a plausible wrong number on it. `perf-rig capture --dry-run` prints the endpoint
a request resolves to and every refusal it would hit.

| Endpoint                      | Input                  | Measurement           | Platform                | Trusted input | Runs unattended | Calibrated hand-shape |
| ----------------------------- | ---------------------- | --------------------- | ----------------------- | ------------- | --------------- | --------------------- |
| `desktop`                     | `desktop-playwright`   | `same-process`        | desktop engines         | no            | yes             | no                    |
| `android-cdp-actions`         | `cdp-touch`            | `cdp-evaluate`        | Android Chrome          | yes           | yes             | taps only             |
| `android-split`               | `adb-input`            | `http-upload`         | Android Chrome, WebView | yes           | yes             | passes                |
| `android-bundled`             | `adb-input`            | `cdp-evaluate`        | Android packaged WebView | yes           | yes             | passes                |
| `android-native-actions`      | `appium-uiautomator2`  | `appium-execute`      | Android packaged WebView | yes           | yes             | taps only             |
| `ios-appium`                  | `appium-xcuitest`      | `appium-execute`      | iPad Safari, WKWebView  | yes           | needs a tunnel  | calibrated            |
| `ios-split`                   | `wda-http`             | `http-upload`         | iPad Safari             | yes           | yes             | passes                |
| `ios-bundled`                 | `appium-xcuitest`      | `preferences-mailbox` | iPad packaged WKWebView | yes           | needs a tunnel  | calibrated            |
| `ios-inspector`               | `human` or in-page     | `webkit-inspector`    | iPad Safari             | hand          | no              | the reference         |

## Guards every endpoint runs

These are recorded as `trust[]` entries in every artifact, in this order. A `failed` entry outside
the request's `tolerate` list stops the capture before measurement and exits 2.

1. `refused-build-variant` — the build directory does not hold a variant the contract refuses (a
   native static export written over the web build).
2. `build-seams-present` — the served page carries the instrumentation seams; a page without them
   completes every capture and reports zero measures.
3. `served-build-identity` — the entry module the port serves and every immutable chunk it
   references digest to what `outputDir` holds. Proves self-consistency and ownership, not currency.
4. `page-identity-nonce` — the page's query string echoes this run's nonce; a leftover tab that
   polls the same plan stands down instead of uploading near-empty tables.
5. `route-hydrated` — the contract's `hydrated` expression is true. Server-rendered routes answer
   every selector and do nothing when their modules fail to load.
6. `dimension-observed` — each requested dimension was set through the app's own controls and read
   back resolved; the artifact records the observed value, never the requested one.
7. `committed-mode` — the mode the engine reports equals the one selected; the value persists across
   navigations, so pen is selected explicitly like every other mode.
8. `hit-test-surface` — `elementFromPoint` at the surface centre resolves inside the hit-test
   ancestor; a menu left open over the surface produces frames and zero pointer events.
9. `prime-verified` — a mode's prime procedure met its postcondition, again after the settle.
10. `painted-output` — the output surfaces' digest changed across the capture; temporal gates pass a
    renderer that painted nothing.
11. `host-quiet` — host load per core stayed under the threshold across the window; the host drives
    the input, so contention changes cadence.
12. `instrument-restored` — every instrument's `restore` ran, including on an interrupted run.

Endpoint-specific guards are listed below.

## `desktop`

**Prerequisites.** Playwright with the engine installed. No device.

**Guards added.** None beyond the common set.

**Validations left to you.** Desktop input is synthetic and untrusted, so no fidelity check can pass;
the artifact records `input-fidelity: not-applicable` and the numbers are advisory. Headless capture
sees nothing presentational: a compositing hint can pass every desktop capture and render black on a
device. Desktop WebKit is not an iPad; `performance.now()` is clamped and there is no throttle.

**Customisation.** `options.instruments.cpuThrottle` (Chromium only; refused on other engines),
`options.instruments.trace` for a CDP trace, `target.viewport`, `target.engine`,
`options.build.mode: 'url'` with `allowForeignBuild` for an A/B against a historical build served
from an isolated worktree on its own port.

**Traps.** Any E2E run rebuilds the output directory without the seams; the identity guard passes
because the build is internally consistent and `build-seams-present` is the only tell. A preview
left running from another checkout keeps the port and serves that checkout's build; the identity
guard names the mismatch.

## `android-cdp-actions`

**Prerequisites.** `adb` with the device authorised; Chrome installed; the preview reachable from
the device over the LAN, with `adb reverse` or a LAN URL passed explicitly.

**Guards added.** `service-worker-blocked`; `entry-module-match` against `document.scripts`;
`instrument-restored` for `android-refresh-pin`, which pins an adaptive-sync panel to 60 Hz for the
sweep, verifies the pin against `dumpsys display`, and restores it on exit including interrupts.

**Validations left to you.** A restored Chrome tab can hold the foreground while the run's page
answers every poll; the tell is zero events and zero downs on the first action. An emulator started
from a snapshot is not a fresh boot; record guest uptime if the capture is a cold-boot control.

**Customisation.** `options.device.cdpPort`, `options.instruments.trace`, focused `actions`
scenarios (which keep their own id so a fold refuses them as the canonical sweep).

**Traps.** Awaiting each touch acknowledgement in series slowed a scroll to 50 ms between draws on a
16.7 ms clock and scored a false red; scrolls dispatch through a native gesture and the artifact
records `scrollDelivery`. A leaked refresh pin fails every later drawing cell on the phone as
off-regime and names nothing; `doctor` reports `renderFrameRate` when it does not match the panel.

## `android-split`

**Prerequisites.** A probe host (`perf-rig probe-host`) proxying the preview, reachable from the
phone by a LAN address that is not a loopback name (`localhost`, `localtest.me`, `*.nip.io` to
127.0.0.1 are refused at plan time); `adb`.

**Guards added.** `page-identity-nonce` is mandatory here; `orientation-followed` reads the
orientation the page reports after the stop → rotate → launch sequence; `runtime-user-agent` refuses
an artifact whose UA contradicts the labelled runtime; for packaged WebViews, `packaged-origin`.

**Validations left to you.** Cadence near half the calibrated band on a quiet rig is a degraded adb
server (`adb kill-server`), not the product. A native orientation lock can rotate the page after
readiness; the contract's orientation dimension declares how the lock is released and restored.

**Customisation.** `gesture.primeBetweenPasses` for modes that consume what they draw; `afterDrawing`
for a measured action proved through history depth and pixel deltas; `options.device.probeHost`.

**Traps.** Uploads carry the nonce, and the host keeps whichever report saw more input, because a
suspended tab once overwrote a real capture with near-empty tables. A capture that fails fidelity is
written and then fails; "the artifact parses" is not "the cell is complete".

## `android-bundled`

**Prerequisites.** The packaged app installed from an instrumented build; the WebView DevTools socket
forwardable. No server.

**Guards added.** `packaged-origin` (the attached target's origin is the packaged scheme, not a
remote preview); `runtime-user-agent` identifies the WebView.

**Validations left to you.** The installed build must be the instrumented one; installing through the
platform's normal run path re-chains a plain build and overwrites it, and the capture still runs.
Check `report.meta.counts.measures > 0`.

**Customisation.** `transport.input: 'human'` for a hand capture in place of `adb-input`.

## `android-native-actions`

**Prerequisites.** Appium with UiAutomator2 and a Chromedriver matching the WebView's Chromium major
(physical Chrome, the physical WebView and an emulator image routinely run different majors).

**Guards added.** WebView context selection is fail-closed on the app's package; the first debuggable
context may be a healthy page in the wrong process.

**Validations left to you.** UiAutomator2 is correct for taps and under-drives a drawing stream; the
package refuses it for `frames` scenarios at plan time.

## `ios-appium`

**Prerequisites.** Appium with XCUITest; a signed WebDriverAgent (`native.ios.wdaBundleId`,
`xcodeConfigFile`); the device's hardware UDID (`idevice_id -l`), not the CoreDevice UUID
`devicectl` prints; a running RemoteXPC tunnel, which is root-owned and prompts for a password, so
it is reused when present and named as a blocker when absent; the automation grant armed while a
launch is running (`perf-rig operator`).

**Guards added.** `entry-module-match`; `service-worker-blocked`; the Safari window rect is compared
with `screen.width` so a Stage Manager window is refused; the iOS identifier is classified by shape
before any session is attempted.

**Validations left to you.** Guided Access blocks every launch disguised as `xcodebuild` code 65;
read to the innermost error. A failed OS update leaves a full-screen alert that passes the window
check; read the alert text before accepting anything. A physical session omitting `deviceName`
still needs `deviceClass: tablet` on the target for the right allowances.

**Customisation.** `options.device.capabilitiesFile` replaces the whole capability set (this is how
`wdaLocalPort` moves off 8100 when another server owns it); `options.device.sessionId` borrows a
session.

**Traps.** Two Appium servers cannot share a WDA port; the second proxies into the first's session
with errors that never mention a port. The XCTest prompt exists only during a launch, so a human
asked to check an idle iPad correctly sees nothing.

## `ios-split`

**Prerequisites.** WebDriverAgent launched with `devicectl` and reached over `iproxy`; a probe host.
No Appium session and no RemoteXPC tunnel.

**Guards added.** As `android-split`.

**Validations left to you.** WebDriverAgent's own action synthesis re-derived at about 1.95 moves per
frame in 2026-08, but an earlier measurement read 60; treat its cadence as something to check on
every capture rather than assume.

## `ios-bundled`

**Prerequisites.** The packaged app installed from an instrumented build that carries the mailbox
hook; `devicectl` can copy files out of the app container. A plain-HTTP LAN host is mixed content
against the packaged origin, so no probe host is involved.

**Guards added.** The mailbox is armed with a nonce before measurement and cleared after; the pulled
payload must match the nonce, the page URL, the packaged origin, the user agent, every table count
and the exact byte length.

**Customisation.** `transport.input: 'human'` for a hand capture inside the packaged app.

## `ios-inspector`

**Prerequisites.** `pymobiledevice3` (the older `ios_webkit_debug_proxy` lists the device and zero
pages on iOS 17 and later, which reads like a disabled Web Inspector setting and is not); Safari
foregrounded on the page. Replies are matched by id because the bridge sends an unsolicited event
first.

**Guards added.** The selected tab is proved responsive with a bounded probe; a backgrounded tab
lists and announces a target and never runs JavaScript, so a command against it hangs.

**Validations left to you.** This is the endpoint that produces calibration data: a hand capture here
sets the fidelity bounds every driven endpoint on the same runtime is judged by. The WebKit Timeline
domain is available and too coarse to attribute per-frame cost; `xctrace` is the frame-level
instrument on this platform.

**Customisation.** `hud: true` walks the operator through phases; `phases[].suppressCss` for A/B
sweeps; `perf-rig probe render` writes the rendered probe for pasting into Web Inspector.
