# iOS performance capture

These entry points collect physical-device and Appium evidence:

* `perf:ios:webkit:gates` attaches to Mobile Safari through the WebKit Inspector Protocol and runs
  the engine gates.
* `perf:ios:webkit:frames` captures real-screen frame, input, paint, and optional Timeline data.
* `perf:ios:xcuitest:screen` drives trusted native-coordinate drawing and undo through Appium.
* `perf:ios:bundled:frames` carries a full bundled-WKWebView report through Capacitor Preferences
  and pulls the app-container plist with `devicectl`.
* `perf:ios:xcuitest:actions` drives the shared discrete-action regression sweep through Appium.

The web-delivery commands have build pre-hooks; use the documented `--ignore-scripts` form only when
the instrumented bundle is already current. `perf:ios:bundled:frames` instead requires an installed
`perf:build:cap` build and deliberately has no pre-hook that could replace it. Runs require the
device, relay/Appium, signing, and trust setup described in
[`docs/PROFILING-IPAD.md`](../../../docs/PROFILING-IPAD.md). Evidence is written beneath
`perf-profiles/`, and failures to attach, meet fidelity requirements, collect requested samples, or
pass enforced gates exit non-zero.

iOS attachment and trusted-touch orchestration stay here. WebKit protocol plumbing, statistics,
thresholds, and artifact schemas belong in `../lib/`; injected browser payloads belong in
`../probes/`. The behavior-preserving issue #975 manifest also keeps the cross-platform action plan
in `capture-xcuitest-actions.mjs` and the reusable probe configuration in
`capture-webkit-frames.mjs`; web and Android runners import those deliberate owners.
