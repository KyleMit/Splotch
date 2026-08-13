# iOS performance capture

These entry points collect physical-device and Appium evidence:

* `perf:ios:webkit:gates` attaches to Mobile Safari through the WebKit Inspector Protocol and runs
  the engine gates.
* `perf:ios:webkit:frames` captures real-screen frame, input, paint, and optional Timeline data.
* `perf:ios:xcuitest:screen` drives trusted native-coordinate drawing and undo through Appium.
* `perf:ios:xcuitest:actions` drives the shared discrete-action regression sweep through Appium.

Each npm command has a build pre-hook; use the documented `--ignore-scripts` form only when the
instrumented bundle is already current. Runs require the device, relay/Appium, signing, and trust
setup described in [`docs/PROFILING-IPAD.md`](../../../docs/PROFILING-IPAD.md). Evidence is written
beneath `perf-profiles/`, and failures to attach, meet fidelity requirements, collect requested
samples, or pass enforced gates exit non-zero.

iOS attachment and trusted-touch orchestration stay here. WebKit protocol plumbing, statistics,
thresholds, and artifact schemas belong in `../lib/`; injected browser payloads belong in
`../probes/`.
