# Android performance capture

`perf:android` rebuilds, installs, and profiles the real Capacitor WebView on an ADB-connected
Android emulator or device. `perf:android:browser:actions` runs the shared action plan directly in
Android Chrome over CDP; its npm pre-hook prepares an instrumented production build.

Both commands require a working Android SDK and a connected target. The browser runner may also
serve the local build unless given an external URL. They write captures beneath `perf-profiles/` and
fail non-zero when device discovery, WebView/CDP attachment, capture, or an enforced gate fails.

The browser action runner pins an adaptive-sync panel to 60Hz for the sweep (ADR-0143), verifies the
pin against `dumpsys display`, records `refreshRatePin: { requestedHz, observedHz }` in the
artifact, and restores the settings alongside rotation in its `finally`. An exit that never reaches
the `finally` (Ctrl-C, a `fail()` on an unserved URL, kill -9) leaks the pin; the recovery — and why
a leaked pin fails later drawing cells as off-refresh-regime — is in `docs/PROFILING-CAMPAIGNS.md`
under "Capture state that survives between runs".

Android-specific discovery and transport stay here. Shared device-session, action-scoring, trace,
and artifact behavior belongs in `../lib/`; the injected action payload belongs in `../probes/`. The
behavior-preserving issue #975 manifest leaves the shared action plan in
`../ios/capture-xcuitest-actions.mjs`, which this browser runner imports deliberately.
