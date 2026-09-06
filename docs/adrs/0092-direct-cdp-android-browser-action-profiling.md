# ADR-0092: Drive Android Browser Action Profiles Directly over CDP

**Status:** Active — amends [ADR-0032](0032-performance-profiling-harness.md) and
[ADR-0090](0090-tiered-real-ipad-performance-regression-gates.md). **Date:** 2026-07

## Context

ADR-0090 reused the iPad Appium action runner for the cross-platform deployment matrix. That reuse
preserved the action vocabulary and metric schema, but Appium's Android browser path did not
preserve the thing being measured. UiAutomator2 and Chromedriver intermittently stopped presenting
Chrome frames around otherwise cheap taps, and native-coordinate mapping could target the wrong
element. The first Android-emulator web sweep consequently reported 34 failures among 46 actions,
including 166–350 ms drawer gaps with no corresponding JavaScript long task.

Serial isolation removed the drawer animation, compositor hints, the wake lock, hidden overlays, the
service worker, and idle startup work one at a time. Only shortening the genuine drawer animation
affected its product cost. The retained 75 ms animation measured a 16.8 ms maximum through Chrome's
DevTools Protocol but still measured 166–350 ms through Appium. A complete direct-CDP sweep reduced
the failure set from 34 actions to nine without another product change. Appium transport was
therefore creating false performance failures rather than merely adding automation latency outside
the page's in-process clock.

We considered keeping Appium for every deployment target, running local desktop Chromium with
Android geometry, and abandoning automated Android-browser measurement in favor of hand testing. The
first could not distinguish product frames from driver pauses, the second omitted the actual device
GPU and Chrome build, and the third made the matrix neither repeatable nor autonomous.

## Decision

Android Chrome discrete-action profiles use `perf:android:browser:actions`, implemented by
`tools/perf/android/capture-browser-actions.mjs`, instead of the Appium browser session:

* ADB launches an explicitly marked profiler tab and forwards Chrome's `chrome_devtools_remote`
  socket. The runner closes only old Splotch tabs carrying its profiler query parameters; it never
  closes an ordinary user tab.
* `tools/perf/lib/webdriver-client.mjs` adapts Playwright and direct `Input.dispatchTouchEvent`
  calls to the WebDriver-shaped interface expected by `runActionSweep()`. The Android and iPad paths
  therefore share the exact action plan, in-page probe, result schema, and gates rather than sharing
  an unreliable transport.
* Each repeat navigates to a unique profiling URL, clears service-worker and Cache Storage state,
  waits for the drawing surface, and requires 500 ms of stable animation frames after the initial
  page settle. This prevents earlier profiler tabs and background startup work from contaminating a
  discrete-action window; page-load performance remains a separate benchmark.
* Rotation uses ADB system settings and restores both the original rotation and auto-rotation
  preferences in `finally`. Browser coordinates are already CSS pixels, so their mapping excludes
  browser chrome while native Appium mappings retain the ADR-0090 behavior.

### Coloring-scroll delivery (September 2026)

The coloring-grid swipe uses `Input.synthesizeScrollGesture` with a touch source, its existing
start/end coordinates, and speed derived from the intended gesture duration. The browser schedules
the complete gesture. Taps, drawing/clear streams, desktop wheel input, and Appium input retain
their existing paths. The sample records `scrollDelivery: cdp-synthesized-scroll`; the ready
predicate, activity window, and frame gates are unchanged.

The serial CDP move loop awaited each acknowledgement and then slept for another frame interval. On
physical Android it delivered scroll updates about 50 ms apart despite a 16.7 ms browser frame
clock. The original control scored 33.4 / 33.3 / 33.4 ms repeat maxima, P95 33.3 ms. The Chrome
trace showed only one 0.133 ms raster task in the first 900 ms of the inspected repeat.
Browser-generated touch restored draw updates to roughly 16.7 ms without a product change. The
complete portrait/light action sequence then passed all 49 actions; scroll maxima were 33.3 / 33.3 /
16.8 ms, P95 16.8 ms.

The
[comparison corpus](../../perf-profiles/evidence/2026-09-05-epic-1567-android-scroll-study/index.json)
retains the original failure and the traced diagnostic's idle failures. The
[canonical validation](../../perf-profiles/evidence/2026-09-05-epic-1567-android-scroll-canonical/index.json)
measures the same main product. This is a capture correction, not a product optimization or a
four-row release certification. A protocol failure remains a capture failure; silently falling back
to the slow serial stream would make the provenance ambiguous.

Appium remains the transport for iOS and native Capacitor action profiles, where it provides the
native shell, context switching, and real-device XCUITest input required by ADR-0090. Direct CDP is
an Android-browser measurement path, not a claim that browser automation replaces final physical-
device acceptance.

## Consequences

* \+ Android browser sweeps measure trusted touch in the target Chrome renderer without the
  UiAutomator2/Chromedriver frame-presentation pauses that produced false failures.
* \+ The first full sweep left nine actionable failures instead of 34 ambiguous ones while keeping
  all 46 actions and the shared 20/33.5 ms gates.
* \+ The shared Playwright adapter removes the duplicate desktop WebDriver facade and gives desktop
  mouse and Android trusted-touch runs the same request surface.
* \+ Owned-tab cleanup, cache eviction, stable-frame waiting, and rotation restoration make
  unattended repeated runs independent of stale profiler state.
* − Direct CDP covers Android Chrome only. Native Android WebViews, iOS Safari, and native iOS still
  need their existing transports and device-specific fidelity checks.
* − CDP touch is browser-trusted input, but it does not reproduce a child's hand, display scanout,
  or system gesture interference. Physical-device testing remains the final gate.
* − The stable-frame precondition deliberately excludes page-load and startup contention from each
  discrete action. Those costs must remain covered by the mount and first-interaction profiles.
