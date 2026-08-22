# ADR-0135: Split the Device Capture's Input and Measurement Channels

**Status:** Active — amends
[ADR-0079](0079-physical-ios-device-capture-webkit-inspector-protocol.md),
[ADR-0084](0084-trusted-xcuitest-input-for-ipad-real-screen-profiling.md), and
[ADR-0092](0092-direct-cdp-android-browser-action-profiling.md). **Date:** 2026-08

## Context

The physical-device drawing capture bundles two unrelated jobs into one transport. Appium drives the
touch **and** carries the script channel that injects the probe and reads its tables back. That
coupling produced two independent failures during issue 1196.

**It makes the capture unavailable when either half is unavailable.** On this host neither existing
iOS path could run: Appium's XCUITest driver needs a root-owned RemoteXPC tunnel to discover a
modern device, which an unattended session cannot open, and `ios_webkit_debug_proxy` listed no
inspectable pages because iPadOS 26.5 exposes no Web Inspector switch — not under Settings → Apps →
Safari → Advanced, and not under Settings → Developer. Two independent blockers, either of which
takes out the whole capture.

**It lets the input transport corrupt the measurement.** ADR-0092 already established that Appium's
Android browser path does not preserve frame presentation and moved *action* profiles to direct CDP.
Drawing cells stayed on Appium, and there the damage arrives through cadence rather than through
pauses. Appium delivered **46.8 contact moves per second** on the Galaxy S21 FE against a fidelity
band of 100–170; every Android cell in the 2026-08-21 campaign recorded `cadence: false`. Chrome
raises the display to 120 Hz only while touch input is actually arriving, so at that cadence the
boost lapses, the panel falls back to 60 Hz, and the lost-frame metric reads the fallback as dropped
frames. The committed Android physical-web cells recorded 10.1–31.7% lost in-contact frame time. The
same build under a real OS touch stream at 116 moves/s measures 0.41–1.55%.

## Decision

A physical-device drawing capture takes its input and its measurement from separate channels.

**Input** is the platform's own trusted injection, running the harness's existing
`trustedGestureActions` plan unchanged:

* iPadOS — WebDriverAgent's own HTTP API. The runner is launched with
  `xcrun devicectl device process launch` and reached over `iproxy`, so it needs no RemoteXPC tunnel
  and no Appium session. This is the same XCUITest touch ADR-0084 calibrated against; only the thing
  that dispatches it changes.
* Android — `adb shell input swipe` segments. Unlike CDP's `Input.dispatchTouchEvent` this is an OS
  touchscreen event stream, which is what Chrome's display frame-rate boost responds to.

**Measurement** comes back over HTTP. A capture host proxies the preview server and injects one
same-origin `<script src>` into the drawing route's HTML; the route's enforcing CSP (ADR-0073)
already allows `script-src 'self'`, so nothing about the policy is relaxed. That script loads the
unmodified real-screen probe, selects the brush, and uploads the probe's own tables when the runner
signals the gesture is done. Scoring imports the harness's existing modules, so a number from this
transport is comparable with a committed matrix cell.

Three guards exist because each one caught a capture that would otherwise have been scored:

* The plan carries a nonce. Safari keeps earlier tabs alive and their bootstraps poll the same plan;
  without the nonce a suspended tab's near-empty tables overwrote the real capture.
* The page proves the route hydrated before measuring. The drawing route's controls are
  server-rendered, so a page whose modules failed to load still answers every selector and simply
  does nothing when clicked.
* The page proves a touch at the canvas centre would hit the paper. Selecting a brush through the
  menu can leave it open over the canvas, which produced captures with frames but no pointer events
  at all.

Appium remains the transport for native Capacitor captures, where it provides the app shell and
context switching that this path does not.

## Consequences

* \+ A physical-device drawing capture no longer depends on a root-owned tunnel, on a Web Inspector
  setting, or on Appium being able to see the device.
* \+ Android browser input reaches a fidelity-passing cadence, so the Android cells measure the
  product rather than the driver.
* \+ The same host serves both platforms, so the two differ only in how touch is injected.
* − Two more device-side prerequisites to keep working: a WebDriverAgent build installed on the
  iPad, and `iproxy`.
* − The capture host must proxy the real preview server rather than serve files itself; serving the
  build directly missed the SvelteKit env module and the route failed to hydrate.
* − WebDriverAgent's action synthesis tops out near 60 events per second, below the 100–170 fidelity
  band, so an iPad capture through this transport is paced below a real finger. It is sound for
  comparing builds and for frame pacing at one move per frame; it cannot exercise the
  input-outruns-frames condition, and any candidate aimed at that must be judged on another
  transport.
