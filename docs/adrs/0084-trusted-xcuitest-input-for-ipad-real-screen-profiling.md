# ADR-0084: Trusted XCUITest Input for Physical-iPad Real-Screen Profiling

**Status:** Active — amended by [ADR-0090](0090-tiered-real-ipad-performance-regression-gates.md).
**Date:** 2026-07

> **Amended by [ADR-0111](0111-verb-object-tool-names-and-capability-documentation.md):** the
> trusted-input screen-capture contract remains in force, while its command is now
> `perf:ios:xcuitest:screen`.

## Context

ADR-0083 separated real-screen frame pacing from the engine gates, but its unattended `--drive` path
constructed JavaScript `PointerEvent` objects. Those events were untrusted, did not match the
physical digitizer signature, and stayed smooth on the same 2x build where a finger produced
335–1422 ms frame gaps. The instrument could record the problem but still needed a human to
reproduce it.

The alternatives were tested against MobileSafari on the physical iPad:

* **Maestro** — the installed runner addresses an iOS Simulator, not a physical iOS device.
* **SafariDriver actions** — produced `isTrusted === true`, but no coalesced samples, zero pressure,
  a synthetic 13,660 px contact size, and about 105 moves/s. It did not match the hand signature.
* **WebDriverAgent through Appium's XCUITest driver** — produced trusted touch events with the same
  zero coalescing/pressure, a comparable 73.76 px contact against the hand's 62.56 px, 9 ms p95 move
  gaps, and 121 moves/s against the established hand range of roughly 115–134. It repeatedly
  reproduced low-engine-work frame starvation.
* **A physical actuator and camera** — retained as the fallback if software-mediated input stops
  matching the hand, but unnecessary while XCUITest passes the fidelity gate.

The existing WebKit Inspector transport could not simply provide the recording half. Appium opens a
temporary Remote Automation Safari window that `ios-webkit-debug-proxy` does not list, while Appium
can execute JavaScript in that window and switch the same session into the native context.

## Decision

`npm run perf:ipad:xcuitest` (`scripts/perf/ipad-xcuitest.mjs`) is the trusted-input companion to
`perf:ipad:frames`. One Appium WebDriver session owns the whole capture:

1. open the real app in MobileSafari and inject `real-screen-probe.js` in the web context;
2. map the CSS canvas bounds into native coordinates below Safari's chrome;
3. switch to `NATIVE_APP` and perform two long plus eight short XCUITest touch strokes;
4. return to the web context, read the raw probe tables, and analyze them with
   `real-screen-stats.mjs`.

The gesture uses a small number of long, interpolated native moves. Subdividing it into hundreds of
8 ms WebDriver actions made WebDriverAgent serialize a nominal 8-second gesture for 211 seconds;
native interpolation emits digitizer-like samples while completing the mixed gesture in seconds.

Every run must pass the calibrated input-fidelity gate before its lag score is usable: 100% trusted
touch moves, 100–170 moves/s, p95 intra-stroke gaps no higher than 20 ms, zero coalescing and
pressure, and 40–100 px contact width and height. The artifact retains every raw event field so
those bounds can be recalibrated against another hand capture after an OS, device, or driver change.

`starvationEpisodes` is derived only from retained raw data. A frame gap qualifies when it exceeds
four observed frame intervals, contains at least two trusted touch moves handled during the gap, and
merged `engine.*` spans cover no more than 10% of it. Episodes are reported for in-contact,
between-strokes, and whole-window populations, with starvation milliseconds per drawing second,
worst gap, episodes per commit, and nearest lift/commit attribution within 250 ms. Attribution never
deletes an otherwise valid episode.

The probe records `performance.timeOrigin` as `meta.timeOriginUnixMs`. Adding an episode's `startMs`
or `endMs` to that origin maps its monotonic browser time onto the absolute clock used by an
Instruments trace. The system-correlation target is the Animation Hitches `hitches-frame-lifetimes`
table, not only its derived `hitches` table: presentation starvation can leave no expensive
submitted frame for the high-level detector to classify.

ADR-0090 adds the calibrated acceptance gates established by ADR-0085. The command exits nonzero
after fidelity succeeds when paint P95 exceeds 20 ms, paint P99 exceeds 33 ms, paint max exceeds 50
ms, or starvation exceeds 10 ms per drawing-second. A requested undo run also fails its existing
engine/next-frame gate. `--report-only` retains the pre-ADR-0090 diagnostic behavior when a complete
broken artifact is more useful than stopping with a failing command.

Appium and its XCUITest driver remain local external prerequisites, like `ios-webkit-debug-proxy`.
WebDriverAgent signing reads the ignored `ios/local.xcconfig`. Normal runs cannot change Apple
Developer account state; the capability that permits automatic provisioning and device registration
is sent only with the explicit `--allow-provisioning` flag.

## Consequences

\+ The real-screen starvation is reproducible and scored without a human gesture while still
traversing MobileSafari's trusted touch path.

\+ The same raw capture and pure analyzer serve hand, XCUITest, saved-file reanalysis, and unit
fixtures; the automation choice does not fork the metric definitions.

\+ A controlled A/B/A/B run showed stable severity separation: 2x repeated at 746/751 ms worst gaps
and 1205/1220 starvation ms, while 1.5x repeated at 252/254 ms and 559/674 ms under the same
gesture.

\+ A synchronized 2x Animation Hitches capture validated the proxy against the device compositor.
Its eight 181–914 ms scorer episodes paired one-for-one with 192–909 ms gaps in display frame
lifetimes, covering 92–98% of each scorer interval. The high-level `hitches` table and
MobileSafari's potential-hang rows had no overlapping entry: the device stopped presenting frames
rather than reporting one expensive app/GPU frame.

\+ First-time Apple provisioning is explicit and reviewable; steady-state captures need no
Apple-account mutation authority.

− Appium creates a temporary Safari automation window that the WebKit Inspector relay cannot see, so
the WebDriver session must also own probe injection and readback instead of reusing ADR-0079's
transport.

− Appium and `appium-xcuitest-driver` are local tools outside `package.json`; their versions and
Apple/Xcode compatibility must be maintained in the profiling runbook.

− XCUITest contact geometry is close to, not identical to, a physical finger. A passing fidelity
gate supports regression use; it does not make the driver a literal digitizer, and a failing gate
routes back to a hand capture or the actuator/camera fallback.

− Episode count alone is not a severity score: a mitigation can split one large freeze into several
smaller ones. Compare starvation milliseconds per drawing second and worst gap alongside
episodes/commit.
