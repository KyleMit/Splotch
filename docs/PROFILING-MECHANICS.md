<!-- cspell:ignore adb appium chromedriver devicectl devtools framestats gfxinfo iproxy iwdp lockdown osascript perfetto pftrace pymobiledevice simctl uiautomator webdriveragent webview xcrun xctest xctrace xcuitest -->

# Splotch — Performance Harness Mechanics

What the harness is *made of*: which technology drives input, which one carries the measurement
back, and which platform instruments can watch. Its siblings answer different questions —
[`PROFILING.md`](PROFILING.md) is what each `perf:*` command measures,
[`PROFILING-IPAD.md`](PROFILING-IPAD.md) and [`PROFILING-ANDROID.md`](PROFILING-ANDROID.md) are the
per-device runbooks, and [`PROFILING-CAMPAIGNS.md`](PROFILING-CAMPAIGNS.md) is the catalogue of
setup mistakes that produce plausible wrong numbers.

Read this when choosing a transport, when a capture path fails and the question is whether the tool
or the device is at fault, or when a term in a capture artifact is unfamiliar.

## The layers

The harness is six layers, and most confusion about it comes from conflating two of them. The
load-bearing idea is ADR-0135's: **input and measurement are separate channels**, and coupling them
lets the driver corrupt the number.

| Layer                     | What it is                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Build instrumentation** | `PERF_MARKS=true` compiles `performance.mark/measure` around the engine's hot paths; `PUBLIC_ENABLE_DEV_HARNESS=true` adds `/dev/engine`, invoke handles, and the iOS report mailbox. Release builds strip both, and post-build guards assert it. |
| **In-page probe**         | A recorder, not an analyzer. It appends numeric rows — frame intervals, pointer events with their trust/pressure/geometry fields, engine spans — and hands them back verbatim.                                                                    |
| **Input transport**       | How a touch or tap is produced: an automation framework, an OS input command, or synthetic in-page events.                                                                                                                                        |
| **Measurement channel**   | How the probe's tables get off the device: same process, a debugger's evaluate call, an HTTP upload, or an app-container file copy.                                                                                                               |
| **Platform instruments**  | What the OS says the display did, which the page cannot see. Supplements the probe; never replaces it.                                                                                                                                            |
| **Scoring and gates**     | Every percentile and verdict is computed in Node from the raw rows, so a capture outlives the metric taken with it and a whole corpus can be re-derived offline.                                                                                  |

Because scoring is pure, `perf:rescore` can re-price an entire corpus when a gate turns out to be
wrong — which the 2026-08 campaign needed three times, each time asking what the correction does to
every number already banked.

## Which transport drives which target

`tools/perf/lib/campaign-plan.mjs` owns this table;
`tools/perf/tests/profiling-mechanics-doc.test.mjs` fails if the two disagree. Change the module,
not this table.

| Target                    | Label                     | Drawing   | Actions   | Fidelity runtime            | Regime  |
| ------------------------- | ------------------------- | --------- | --------- | --------------------------- | ------- |
| `ipad-simulator-web`      | iPad Simulator · web      | `appium`  | `appium`  | `ios-safari`                | `60hz`  |
| `ipad-simulator-native`   | iPad Simulator · native   | `appium`  | `appium`  | `ios-capacitor-webview`     | `60hz`  |
| `ipad-device-web`         | iPad device · web         | `appium`  | `appium`  | `ios-safari`                | `60hz`  |
| `ipad-device-native`      | iPad device · native      | `appium`  | `appium`  | `ios-capacitor-webview`     | `60hz`  |
| `android-emulator-web`    | Android emulator · web    | `split`   | `cdp`     | `android-chrome`            | `60hz`  |
| `android-emulator-native` | Android emulator · native | `split`   | `appium`  | `android-capacitor-webview` | `60hz`  |
| `android-device-web`      | Android device · web      | `split`   | `cdp`     | `android-chrome`            | `120hz` |
| `android-device-native`   | Android device · native   | `split`   | `appium`  | `android-capacitor-webview` | `120hz` |
| `mac-chrome`              | Mac · Chrome              | `desktop` | `desktop` | `desktop-playwright`        | `120hz` |
| `mac-safari`              | Mac · Safari              | `desktop` | `desktop` | `desktop-playwright`        | `60hz`  |
| `mac-firefox`             | Mac · Firefox             | `desktop` | `desktop` | `desktop-playwright`        | `120hz` |

Two asymmetries in that table are the whole story of how it got this way. **Android draws and acts
over different transports** — Appium under-drives the drawing stream badly enough that its cells
cannot be scored, while it taps perfectly well, so drawing left and actions stayed. And **the iPad
rows are the only ones still on a transport that needs a human**, because Appium's device discovery
needs a root-owned tunnel whose password prompt an overnight run cannot answer.

Targets outside this table exist and are not campaign cells: `perf:web`, `perf:web:mount`,
`perf:web:settings` and `perf:web:undo` drive headless Chromium under CPU throttle as the local
regression tier, and `perf:web:undo:webkit` is the CI commit gate in Playwright WebKit.

## What each transport is

| Transport | Input                                                                                       | Measurement                                                                                | Notes                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `desktop` | The probe's own synthetic pointer events for drawing, Playwright's mouse for actions        | Same process                                                                               | Not trusted input, and honest about it — desktop calibration stays advisory.                                        |
| `appium`  | XCUITest through WebDriverAgent (iOS) or UiAutomator2 (Android native)                      | The same Appium session's script channel, switching between the web and native contexts    | The only transport that provides an app shell plus context switching, which is why native work stays on it.         |
| `split`   | The platform's own trusted injection: `adb shell input swipe`, or WebDriverAgent's HTTP API | An HTTP upload to a probe host that proxies the preview and injects one same-origin script | ADR-0135. Needs no debugger channel and no RemoteXPC tunnel (iOS reaches WDA over `iproxy`), so it runs unattended. |
| `cdp`     | `Input.dispatchTouchEvent` over a forwarded DevTools socket                                 | The same CDP connection                                                                    | ADR-0092. Android browser only.                                                                                     |

The split transport carries three guards, each of which caught a capture that would otherwise have
been scored: a **nonce** on the plan, because a suspended tab's bootstrap polls the same plan and
its near-empty tables once overwrote a real capture; a proof the route **hydrated**, because the
drawing route is server-rendered and a page whose modules failed still answers every selector; and a
proof a touch at the canvas centre would **hit the paper**, because selecting a brush can leave its
menu open over the canvas and produce a capture with frames but no pointer events at all.

The iOS native runtime cannot use that HTTP upload — a plain-HTTP LAN host is mixed content against
`capacitor://localhost`, and loading the page from the host stops measuring the bundled app. It
writes its report into Capacitor Preferences under a random key instead, and the Mac copies the
app-container plist off with `devicectl` (ADR-0151).

## Platform instruments

These see what the page cannot: whether a frame was actually presented, and whether the app was slow
or merely descheduled. **Android gives up far more than iOS does.**

| Instrument                     | Platform                  | Answers                                                                   | Blind to                                                                                      |
| ------------------------------ | ------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `dumpsys gfxinfo … framestats` | Android                   | Per-frame stage timings from vsync to present                             | Browser targets — Chrome composites outside the instrumented pipeline and reports zero frames |
| Perfetto                       | Android                   | The whole device: GPU, SurfaceFlinger, scheduler, other processes         | Page-internal work                                                                            |
| CDP `Tracing`                  | Android, desktop Chromium | Renderer work — script, style, layout, paint, raster                      | Anything outside the renderer; **has no iPad counterpart**                                    |
| `xctrace` / Instruments        | iOS                       | Frame lifetimes and hitches, correlated to the probe through `timeOrigin` | Page-internal attribution                                                                     |

Do not assume an instrument is free. The technique for checking is cheap and transfers: capture the
same gesture untraced, lightly traced, and fully traced, then score all three with the app's own
probe. Instruments sampling was measured to have no effect on iPad scores; that result explicitly
does **not** transfer to Perfetto's `sched`, which is closer to instrumenting than sampling.

## Ruled-out drivers, and why

Each of these was tried or evaluated and rejected on evidence. They are recorded because the
alternative is re-litigating them, and because several fail in ways that look like a device problem
rather than a tool problem.

### Input

* **Appium UiAutomator2 for the Android browser.** Three independent indictments. It intermittently
  stops presenting frames: a 75 ms drawer measured 16.8 ms through CDP and 166–350 ms through
  Appium, and a full CDP sweep cut the failure set from 34 of 46 actions to nine with no product
  change (ADR-0092). It under-drives the stream: 46.8 contact moves/s, 0.44 moves per frame, which
  `lostFrameTimeShare` prices as roughly 11% lost — a catastrophic-looking red that means nothing
  (ADR-0135). And on a 60 Hz emulator it reaches 0.82 moves per frame with per-run distortion no
  stream statistic separates from real starvation (ADR-0145). It remains correct for discrete taps.
* **Synthetic `PointerEvent`s on a device.** Untrusted and the wrong digitizer signature: they
  stayed smooth on the very build where a finger produced 335–1422 ms frame gaps. Retained for
  desktop rows, where nothing claims they are a hand.
* **SafariDriver actions.** Trusted, but no coalescing, zero pressure, a synthetic 13,660 px contact
  size, and about 105 moves/s. Trusted is not the same as hand-shaped.
* **Maestro.** Its installed runner addresses a Simulator, not a physical iOS device. It remains the
  native smoke-test tool; it was never a profiling candidate.
* **Sub-divided WebDriver actions.** Hundreds of 8 ms actions made WebDriverAgent serialize a
  nominal 8-second gesture over 211 seconds. Native interpolation of a few long moves emits
  digitizer-like samples and finishes in seconds.
* **A physical actuator and camera.** Retained as the fallback if software input stops matching a
  hand; unnecessary while XCUITest passes the fidelity gate.

### Measurement

* **CDP on an iOS device.** No such endpoint exists. This is the single fact that gives iOS its own
  transport family rather than a variant of the Android one.
* **`ios_webkit_debug_proxy`.** Obsolete on iOS 17 and newer: it asks the lockdown service Apple
  moved the web inspector off, so it lists the device and **zero pages**. That reads exactly like a
  disabled Web Inspector setting, and a campaign can lose a day to the misdiagnosis.
* **The `pymobiledevice3` CDP bridge's `Tracing` and `Performance` domains.** Not translated; both
  answer `domain was not found`. `Runtime.evaluate` is the durable win there.
* **WebKit's `Timeline` domain.** Protocol-available and too coarse: a recording spanning 200
  painted frames emitted one aggregated event. It is also not the shape `perf:analyze:web-inspector`
  parses, which is a human-made Safari export.
* **`dumpsys gfxinfo` and `SurfaceFlinger --latency` for browser targets.** Zero frames and all-zero
  rows respectively.
* **`performance.memory` for undo memory.** Tiled history lives in canvas backing stores, so the
  heap table stays flat while real memory grows. `getUndoDebug()` reports the true cost.
* **Headless capture for anything presentational.** No display, overlay planes, or GPU compositor,
  so it cannot see alpha bugs, overlay promotion, tearing, or ink latency. A `desynchronized` hint
  once passed both headless profiling and E2E and rendered the canvas black on a device (ADR-0051).
* **A local TLS report host, or a native profiling plugin, for the bundled iOS report.** TLS adds
  certificate trust and host lifecycle to every capture while still moving data over a network the
  product does not use; a plugin would add a production-capable native surface for profiling alone
  (ADR-0151).
* **Hosted device clouds.** BrowserStack, Sauce Labs, and AWS Device Farm were evaluated and none
  adopted. Firebase Test Lab was rejected outright: its iOS path is XCTest rather than a remote
  Appium session and its Appium support is not committed, so it would need a second runner
  (ADR-0090).

Two things are rejected as *approval* rather than as instruments. Desktop WebKit is not an iPad — no
throttle, and `performance.now()` clamped to about 1 ms — so its gate is deliberately blunt. And
simulators and emulators are a rejection tier: a failure is a useful lead, a pass proves nothing.
Never relabel one target's calibration as another target's approval.

## Glossary

### Protocols

**CDP — Chrome DevTools Protocol.** JSON-RPC over a WebSocket. Domains used here: `Runtime`, `Page`,
`Input`, `Emulation` (CPU and network throttling), and `Tracing`. Present on Chromium desktop,
Android Chrome, and Android WebView; absent from every iOS device.

**CDP `Tracing`.** The domain producing the DevTools performance timeline — script, style, layout,
paint, raster, compositor commit, GC. The only instrument here that attributes cost to *page* work.

**WebKit Inspector Protocol.** Safari's equivalent, and not CDP. Four traps, each presenting as
something else: every command must be enveloped in `Target.sendMessageToTarget`, so a bare
`Runtime.evaluate` answers `'Runtime' domain was not found`, which reads as a missing capability and
is a missing envelope; a tab announces both a `page` and a `frame` target in no guaranteed order;
there is no `awaitPromise` and `returnByValue` does not return structured values, so the driver is
fired and polled and values cross as JSON text; and a backgrounded tab still lists and still
announces a target but never runs JS, so a command against it hangs rather than failing.

**W3C WebDriver.** The HTTP protocol behind Appium and WebDriverAgent: `POST /session`,
`/session/{id}/actions` for the pointer plan, `/element`, `/window/size`.

**RemoteXPC.** The transport Apple moved iOS device services behind in iOS 17. Discovery needs a
root-owned tunnel, which is where the password prompt comes from.

**lockdown.** The legacy pre-iOS-17 device service daemon, and the reason `ios_webkit_debug_proxy`
is dead here.

### Drivers

**Appium.** The cross-platform automation server, and a router: it delegates to a platform driver.
Its value is the native app shell plus web/native context switching.

**UiAutomator2.** Appium's Android driver. A browser session chains onward to Chromedriver. Its
server reads `ANDROID_HOME` from its own environment, not the client's.

**Chromedriver.** The WebDriver server for Chrome and WebView, pinned per Chromium major. Physical
Chrome, the physical WebView, and an emulator image routinely run different majors, so one pinned
driver cannot serve them all.

**XCUITest.** Apple's UI-testing framework, part of XCTest. Runs out of process and injects touch
through the real event path, so events arrive trusted and digitizer-shaped.

**WebDriverAgent (WDA).** The XCUITest runner app installed on the device, exposing a WebDriver HTTP
server on port 8100. "Appium XCUITest" means Appium drives WDA; driving WDA's HTTP API directly
needs no Appium session and no RemoteXPC tunnel, and is reached over `iproxy`.

**SafariDriver.** Apple's own WebDriver. Ruled out above.

**Playwright.** The local browser automation library, driving all three desktop engines in process
and also serving as the CDP client when attaching to an Android target.

**Maestro.** This repo's native smoke-test tool, not a profiling driver.

### Host tools

**`adb forward`.** Host to device. Opens a local port onto a device-side socket — Chrome's or a
WebView's DevTools socket — which is how CDP reaches an Android target.

**`adb reverse`.** Device to host, the mirror image: makes the capture host's preview server
reachable from the phone. The repository's `adb:reverse` helper forwards the dev-server port, so a
capture against the preview port needs its own explicit forward.

**`adb shell input swipe`.** The Android drawing input path. Unlike CDP touch it is an OS
touchscreen event stream, which is what Chrome's display frame-rate boost responds to.

**`dumpsys`.** Android's system-service dump. Used for `gfxinfo`, `display`, `battery`, `power`,
`trust`, `window displays`, and `webviewupdate` — the last because the WebView package version moves
independently of both the app and Chrome.

**Perfetto.** The on-device system tracer. `sched` is the category that pays for itself: whether the
app was slow or descheduled has no answer from inside the app.

**`xcrun devicectl`.** Xcode's CoreDevice CLI. Launches the app deterministically rather than
trusting whatever is foregrounded, and copies files out of the app data container. It prints a
CoreDevice UUID rather than the hardware UDID, and reports a successful launch behind a locked
screen.

**`xcrun simctl`.** Simulator control, and the way to find a simulator left booted while a physical
target is being measured.

**`xcrun xctrace`.** Instruments' CLI: record against a template, then export one schema's table by
XPath. Instruments interns repeated values, so a parser that ignores `id`/`ref` reads most columns
as empty.

**`ios_webkit_debug_proxy`.** Relays the WebKit Inspector Protocol to localhost. Ruled out above.

**`pymobiledevice3`.** A Python implementation of RemoteXPC. Its opened-tabs listing is the
one-command test of whether remote inspection works at all. Its CDP bridge sends an unsolicited
event before any reply, so a client that resolves on the first frame it receives concludes every
method timed out.

**`iproxy`.** TCP over USB. Forwards port 8100 to reach WebDriverAgent — required by the direct-WDA
path, which avoids the RemoteXPC tunnel but not this.

**`osascript`.** Not a profiling mechanic. `do shell script … with administrator privileges` routes
the tunnel's root password prompt to the macOS GUI — one human, once per host boot, and precisely
the cost an unattended run cannot pay.

### Metrics and gates

**rAF.** `requestAnimationFrame`, the harness's frame clock: the probe records one row per callback.
Safari gives web content a 60 Hz rAF beat on a 120 Hz iPad, so page-observed frames and panel frames
are not the same population.

**Beat.** The capture's frame interval, derived as the dominant interval rather than a percentile
(ADR-0134), because a percentile drags toward doubled intervals.

**Refresh regime.** The presentation rate a target is scored against, declared from measurement. A
beat outside every band is classified as no regime rather than snapped to the nearest one. It exists
because a ProMotion iPad presents at either rate, and the same cell minutes apart produced two
correctly derived numbers differing sixfold.

**`lostFrameTimeShare`.** Lost time over elapsed time, priced against the observed beat, and refined
so a late frame the next frame gives back is not charged (ADR-0136).

**Input fidelity.** Whether a capture may be scored at all, per runtime. Two universal checks:
`trustedTouch`, and `cadence` — which gates on **moves per frame**, not on a rate, because a rate
encodes the panel's refresh rather than the stream's quality (ADR-0145). A companion cap on the p95
gap between moves owns burstiness, which density alone cannot see.

**Not-applicable versus uncalibrated.** An uncalibrated check is a gap the instrument can still
close by measuring. A not-applicable one **has been** measured and found to carry no information,
and is absent from the recorded checks rather than present and true, so silence cannot be mistaken
for a pass (ADR-0141).

**Coalescing.** A witness, not a check: informative to record, never gating (ADR-0144).

**Input queue delay.** The event's own timestamp against `performance.now()` inside the handler —
main-thread congestion a child feels as lag with no dropped frame anywhere.

**Starvation episode.** A frame gap exceeding four observed intervals, containing at least two
trusted moves, with engine spans covering no more than a tenth of it. The page was given input and
produced nothing, and the engine was not why.

**Build freshness.** A preview server left from an earlier build keeps its port and keeps serving
the manifest it loaded at startup. The HTML then names chunks that 404 and the route never hydrates
— but the drawing route is server-rendered, so every selector still resolves and the capture
measures dead markup and reports a plausible number. Every capture that starts its own preview
asserts against this.

**Runtime match.** A native cell banks only an artifact recording a native transport, and a web cell
only one that does not. An artifact whose fields contradict each other matches neither, fail-closed.
