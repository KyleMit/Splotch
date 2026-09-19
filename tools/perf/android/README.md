# Android performance capture

`perf:android` rebuilds, installs, and profiles the real Capacitor WebView on an ADB-connected
Android emulator or device. `perf:android:browser:actions` runs the shared action plan directly in
Android Chrome over CDP; its npm pre-hook prepares an instrumented production build.

Both commands require a working Android SDK and a connected target. The browser runner may also
serve the local build unless given an external URL. They write captures beneath `perf-profiles/` and
fail non-zero when device discovery, WebView/CDP attachment, capture, or an enforced gate fails.

The browser action runner pins an adaptive-sync panel to 60Hz for the sweep (ADR-0143), verifies the
pin against `dumpsys display`, records `refreshRatePin: { requestedHz, observedHz }` in the
artifact, records the guest's `/proc/uptime` as `device.uptimeSeconds`, and restores the settings
alongside rotation in its `finally`. An exit that never reaches the `finally` (Ctrl-C, a `fail()` on
an unserved URL, kill -9) leaks the pin; the recovery — and why a leaked pin fails later drawing
cells as off-refresh-regime — is in `docs/PROFILING-CAMPAIGNS.md` under "Capture state that survives
between runs".

`perf:android:bundled:frames` (`capture-bundled-frames.mjs`) measures drawing in the installed debug
app's own bundled page over the WebView DevTools socket. The request is not the measurement,
especially for orientation. The app's rotation lock (on by default) holds the Activity against the
adb `user_rotation` the capture writes. So after launch the capture reads the page's viewport. When
it disagrees with `--orientation`, the capture releases the lock through Settings and writes
`user_rotation` again, because on the rig phone an unlocked Activity does not turn until that
setting is rewritten. It then refuses to write an artifact unless the page measured the requested
orientation before contact and neither resized nor rotated during it. The artifact records
`observedOrientation`, `pageGeometry` (the launched, pre-contact, and post-contact viewport, canvas
rect, DPR, and `screen.orientation.type`), `rotationLock`, and a per-step `cleanup` result.

An eraser capture (`--brush=eraser`, adb input only) erases verified ink, not blank paper.

* **Setup.** After the eraser is committed, the capture applies the shared verified fill
  (`../lib/eraser-fill.mjs`) and re-checks it after a settle.
* **Each pass.** Passes run one at a time, with checks between contacts:
  * **Before the pass,** a point census on a 64x64 lattice over every live tile backing must be
    fully opaque. It samples hidden tiles too, because their backing is what the eraser works on.
  * **After the pass,** at least 85% of the planned strokes must have reached the page, and every
    one received must have lifted, with no cancel. The census must show at least 0.5% of samples
    erased, with no tile backing resized and no tile left with no ink.
  * **Between passes,** the verified refill runs, then two idle frames before the next contact.
* **Failures.** Blank preparation, a failed refill, a pass that erased nothing, or a stroke left
  down refuses the capture.
* **Artifact.** It records `eraserFill`, `eraserRefills` (the shape the campaign readers check),
  `eraserPasses` (each pass's census and lifts), and `eraserWidthSetting`.

Every adb capture also records `strokes: { planned, delivered }`. On the rig phone in portrait, two
of the plan's sixteen swipes per pass start at the screen centre, a point where `input swipe`
delivers no pointer events to the page. The cause is unexplained, and it affects every brush alike.
So an eraser pass requires 85% of its planned strokes (`MIN_DELIVERED_STROKE_SHARE`) rather than all
of them, which tolerates exactly that gap and refuses a third lost stroke.

Cleanup runs from one place, the `finally` block. It restores the app lock while CDP is still
attached, then removes the forward and restores the adb rotation settings, each step independently.
A failed step exits non-zero after writing the artifact. The artifact is written only after cleanup,
so it cannot claim a restoration that has not happened. SIGINT/SIGTERM does not start a second,
concurrent cleanup, because an unlock still in flight could land after the lock was restored.
Instead the capture stops at its next step, cleanup runs, and the process exits with the signal's
code. A second signal exits at once without restoring. kill -9 leaks all of it.

**The AI waiting print needs a secure context.** Served to the phone at a LAN `http://` address, the
page lacks `crypto.randomUUID` and `crypto.subtle`, and both AI actions are blocked coverage. Serve
the preview to Chrome as `http://localhost:<port>` through `adb reverse tcp:<port> tcp:<port>`
instead; a localhost origin is trustworthy, and no certificate is involved. The finish sample's
`aiRun` record then proves the secure context, the crypto APIs, and that the in-page stub answered
every generate request. The capture fails without that proof. Commands and evidence are in
`docs/scratchpad/perf/2026-09-19-device-web-secure-origin/`.

Android-specific discovery and transport stay here. Shared device-session, action-scoring, trace,
and artifact behavior belongs in `../lib/`; the injected action payload belongs in `../probes/`. The
behavior-preserving issue #975 manifest leaves the shared action plan in
`../ios/capture-xcuitest-actions.mjs`, which this browser runner imports deliberately.
