# ADR-0079: Drive a Physical iOS Device Over the WebKit Inspector Protocol

**Status:** Active **Date:** 2026-07

## Context

ADR-0032 built the profiling harness around three capture paths — headless Chromium over CDP, the
Android WebView over CDP, and Playwright's WebKit on the Mac — and recorded a fourth target as out
of reach:

> Device-accurate iOS profiling stays a documented manual step.

The physical iPad is the highest-fidelity target we have (real WebKit/JavaScriptCore, Apple GPU, 120
Hz ProMotion), and it is the target ADR-0066's gates and ADR-0082's byte budget are ultimately
decided on. Reaching it cost a human round trip per measurement: reload the tab, re-attach Web
Inspector, re-copy `scripts/perf/ipad-console-driver.js` from disk, paste, wait, copy the table
back. The issue #446 verification took roughly six of those and hit two failure modes that are
invisible in the output — a stale tab silently running an old bundle, and a leftover
`window.__perfScenarios` scoping a "full" run to one scenario.

The premise behind "out of reach" was that Apple exposes no automation socket on a device. That is
true of **CDP** specifically and understates what is reachable. Alternatives considered:

* **`pymobiledevice3`** — implements RemoteXPC and ships a `webinspector` command. Expected to be
  the only viable option, because Apple replaced the legacy usbmuxd/lockdown path with RemoteXPC in
  iOS 17. Its `sudo`-for-the-tunnel requirement was the main obstacle to putting any of this in an
  npm script. **Not needed** — see below.
* **`ios-webkit-debug-proxy`** — speaks the older lockdown path, and was therefore expected to be a
  dead end on a current OS. It **works on iPadOS 26.5**: whatever RemoteXPC changed, it did not take
  `com.apple.webinspector` with it. Chosen for this reason and because it is a single `brew install`
  with no privilege escalation.
* **Appium / WebDriverAgent** — a full automation stack for what is one `Runtime.evaluate` loop; it
  would also need its own agent installed on the device.
* **Keeping the manual flow** — rejected for the iteration cost above, but retained as the
  documented fallback, and it remains the only path for a Timeline recording.

## Decision

`npm run perf:ipad` (`scripts/perf/ipad.mjs`) is a fourth capture path: it serves the instrumented
bundle on the LAN, attaches to Safari on a USB-connected device through `ios-webkit-debug-proxy`,
navigates the tab to `/dev/engine`, injects the existing console driver, and reads back
`window.__perfRows` plus the driver's console warnings. The protocol client is
`scripts/perf/webkit-inspector.mjs`.

Four properties of the WebKit Inspector Protocol shape that client, and each one presents as
something other than what it is:

* **Every command multiplexes through the Target domain.** Sent bare, even `Runtime.evaluate`
  answers `'Runtime' domain was not found` — which reads as a missing capability and is really a
  missing envelope. Commands are JSON-encoded inside `Target.sendMessageToTarget` and replies
  unwrapped from `Target.dispatchMessageFromTarget`, on a separate id space.
* **A tab announces a `frame` target alongside its `page` target**, in no guaranteed order. The
  client latches onto the `page` target only; keeping whichever arrived last addresses commands to a
  frame.
* **There is no `awaitPromise`.** It is a CDP parameter; WebKit ignores it and returns the promise
  object. The driver is therefore fired and then polled for the global it publishes, never awaited.
  `returnByValue` likewise does not return structured values — anything non-primitive is an opaque
  remote object, so values cross as `JSON.stringify(expr)` and are parsed in Node.
* **iOS suspends a backgrounded tab.** It still lists and still announces an inspector target, but
  never runs JS, so a command against it *hangs* rather than failing, and the first-listed tab is
  not reliably the foreground one. Tab selection is a short-budget liveness probe.

Two behaviours exist specifically to kill the #446 failure modes: the tab is **always navigated**
rather than trusted when it already shows the harness URL, and **every** `window.__perf*` override
is assigned on each run rather than only the requested ones.

Deliberately out of scope: **Timeline capture stays manual.** The protocol has a `Timeline` domain,
but its event stream is not the shape `npm run perf:ios:analyze` parses — that reads a Web Inspector
*export* (`{recording:{records,markers}}`). Automating the gates run does not get Timeline recording
for free, and the paint/composite/dropped-frame questions still route through the manual runbook.

The device path is local-only by nature: it needs the hardware, a trusted USB connection, Safari's
Web Inspector toggle, and Safari open on a tab (the relay lists existing tabs and cannot create
one). It cannot run in CI or a cloud session, like the Android path before it.

## Consequences

* **+** An on-device measurement costs a command instead of a six-step human round trip, so the
  measure-change-remeasure loop that ADR-0078's tuning wants can actually run.
* **+** The two silent failure modes are designed out rather than documented as hazards.
* **+** The `perf:undo` scenarios, the console driver, and the ADR-0066 gates are all reused
  unchanged; only the transport is new.
* **−** Adds `ios-webkit-debug-proxy` as a local-only prerequisite, on a lockdown path Apple could
  remove in a future iOS. `pymobiledevice3` is the documented fallback candidate if that happens.
* **−** Still needs a human to unlock the device and open Safari, so it is not unattended.
* **−** Reports the table without enforcing the gates, unlike `perf:undo:webkit`'s `COMMIT_GATE_MS`
  exit. Gate-enforcing a device run needs a view on device-to-device variance nobody has yet.
* **−** On iPadOS 26.5 every measured column came back at or under 2 ms against WebKit's ~1 ms
  `performance.now()` clamp, so the table currently confirms the plumbing more than it
  discriminates. It also showed the encode tier never firing on that raster — real information about
  ADR-0082's budget, and a sign that the interesting costs on device are compositor-side, where the
  engine marks cannot see them.

The runbook (Approach A of `docs/PROFILING-IPAD.md`) documents both the command and the by-hand
fallback; the skill's design notes record the protocol findings.
