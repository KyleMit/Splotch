# Android performance capture

`perf:android` rebuilds, installs, and profiles the real Capacitor WebView on an ADB-connected
Android emulator or device. `perf:android:browser:actions` runs the shared action plan directly in
Android Chrome over CDP; its npm pre-hook prepares an instrumented production build.

Both commands require a working Android SDK and a connected target. The browser runner may also
serve the local build unless given an external URL. They write captures beneath `perf-profiles/` and
fail non-zero when device discovery, WebView/CDP attachment, capture, or an enforced gate fails.

Android-specific discovery and transport stay here. Shared device-session, action-scoring, trace,
and artifact behavior belongs in `../lib/`; the injected action payload belongs in `../probes/`.
