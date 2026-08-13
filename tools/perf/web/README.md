# Web performance capture

These entry points profile production-preview builds in Playwright:

* `perf:web` and `perf:web:raw` capture the deterministic toddler session in Chromium.
* `perf:web:mount` records startup and navigation cost.
* `perf:web:settings` isolates the first Settings-open cost.
* `perf:web:webkit` runs the session in Playwright WebKit.
* `perf:web:actions` measures the shared discrete-action plan on desktop.
* `perf:web:frames` runs the real-screen probe locally.
* `perf:web:replay` replays a recording created by `probes/input-recorder.js`.
* `perf:web:undo`, `perf:web:undo:webkit`, and `perf:web:undo:webkit:fast` measure and gate tiled
  history behavior.

Commands accept the flags documented by `npm run info`, build unless their documented opt-out is
used, and write evidence beneath `perf-profiles/`. They require the repository dependencies and
installed Playwright browsers. Gate commands exit non-zero for missing samples or threshold
breaches; capture commands also fail when they cannot build, serve, or drive the app.

Shared capture formats and scoring belong in `../lib/`; browser-injected payloads belong in
`../probes/`. Keep platform-neutral action behavior shared with the Android and iOS runners.
