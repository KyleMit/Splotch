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

Cleanup runs from one place, the `finally` block. It restores the app lock while CDP is still
attached, then removes the forward and restores the adb rotation settings, each step independently.
A failed step exits non-zero after writing the artifact. The artifact is written only after cleanup,
so it cannot claim a restoration that has not happened. SIGINT/SIGTERM does not start a second,
concurrent cleanup, because an unlock still in flight could land after the lock was restored.
Instead the capture stops at its next step, cleanup runs, and the process exits with the signal's
code. A second signal exits at once without restoring. kill -9 leaks all of it.

Android-specific discovery and transport stay here. Shared device-session, action-scoring, trace,
and artifact behavior belongs in `../lib/`; the injected action payload belongs in `../probes/`. The
behavior-preserving issue #975 manifest leaves the shared action plan in
`../ios/capture-xcuitest-actions.mjs`, which this browser runner imports deliberately.
