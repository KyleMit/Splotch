# ADR-0032: Automated Performance Profiling Harness

**Status:** Active — amended by ADR-0066 (2026-07): the harness and the analyzer stand unchanged,
but the mark set below is replay-era — `engine.foldBaseline` (and ADR-0035's `engine.keyframe`) were
deleted with the replay system; a commit now splits into `engine.snapshot` + `engine.fold`, and
`engine.undo` pairs an explicit end mark. Further amended by ADR-0079 (2026-07): a **fourth capture
path** drives a physical iOS device over the WebKit Inspector Protocol, so "device-accurate iOS
profiling stays a documented manual step" below now holds only for Timeline recording. Further
amended by ADR-0090 (2026-07): calibrated physical-iPad drawing and discrete-action measurements are
absolute regression gates, while shared-runner browser profiles remain on-demand diagnostics.
Further amended by ADR-0092 (2026-07): Android Chrome discrete-action profiles use direct CDP rather
than Appium. See the amendments at the end. **Date:** 2026-06

## Context

ADR-0015 (capped-DPR canvas rendering) shipped strokes at `min(devicePixelRatio, 2)` — 4× the pixels
and fill rate — and explicitly marked the cost as "not yet verified on a real device," naming Chrome
DevTools profiling as the follow-up. That follow-up was manual: plug in a phone, open
`chrome://inspect`, draw by hand, click Stop, save a `.json`, and read it by eye. Manual profiling
isn't repeatable, isn't comparable run to run, and can't be handed to an agent — so the DPR cost
(and any future regression) went unmeasured.

We wanted to **programmatically** capture a profile while the app is driven through a realistic
session (multi-finger drawing, color/size changes, erasing, undo, clear), read that profile to find
bottlenecks, and re-run it later to catch degradation — across web, Android, and iOS.

## Decision

A profiling harness in `scripts/perf/`, built on the existing Playwright app-driver
(`scripts/lib/app-driver.mjs`), with these deliberate choices:

* **Build-flag-gated instrumentation, not always-on.** A `__PERF_MARKS__` compile-time constant
  (Vite `define`, ADR-0010), set only by `PERF_MARKS=true`, wraps `performance.mark/measure` around
  the engine's hot paths (`draw`, `scanCanvasIsEmpty`, `resizeCanvas`, `undo`, and — since ADR-0033
  replaced the snapshot stack — `commit`/`foldBaseline` in place of the old `saveUndoSnapshot`).
  With the literal `false` in normal builds the blocks — and their mark-name strings — dead-code-
  eliminate, so **nothing reaches production** (grep-verified in the harness). These marks are the
  clean, framework-agnostic signal the analyzer keys on; they survive minification where CPU-sampler
  names don't.

* **Profile the production preview build, not the dev server.** The harness builds with
  `PERF_MARKS=true`, serves via `vite preview`, and drives the minified bundle that actually ships.
  Profiling-only builds add `keepNames` so the CPU sampler's self-time is readable.

* **One shared session, three page sources.** `session.mjs` owns the deterministic scenario +
  capture; the platform entries differ only in how the page is obtained:
  * **Web** — headless Chromium + preview, selectable viewport and CPU throttle (4× to approximate a
    phone). Full CDP Chrome trace.
  * **Android** — the **real Capacitor WebView** on a device/emulator, reached over `adb forward` +
    `connectOverCDP`, no throttle (the device is the target). Full CDP trace; the native bundle is
    rebuilt with `PERF_MARKS=true`.
  * **iOS** — Playwright's **WebKit** (the same WebKit + JavaScriptCore engine the WKWebView runs).
    WebKit exposes no CDP/Chrome trace, so capture falls back to reading the `engine.*` marks via
    the Performance API + FPS. This profiles the *engine*, not the Simulator's app shell;
    device-accurate numbers come from a manual Safari Web Inspector Timeline export fed to the same
    analyzer. *(ADR-0079 added a fourth path that drives a physical device directly; the Timeline
    export remains the manual half.)*

* **A pure analyzer.** `analyze.mjs` takes only a saved `trace.json` (+ optional `metrics.json`) and
  is re-runnable standalone — so a native-exported trace, or an old capture, re-summarizes without
  re-driving. It emits both `report.md` (for a human or agent) and `summary.json`
  (machine-readable): per-phase main-thread busy time, the engine hot-path table, frame health, long
  tasks, JS self-time (harness/instrumentation symbols excluded), and heap.

### Alternatives rejected

* **Manual `chrome://inspect`** — not repeatable, not comparable, not agent-readable.
* **Playwright's coarse `browser.startTracing`** — less control than a direct CDP `Tracing` session
  and no clean reuse path for the native WebView.
* **Always-on user-timing marks** — measurable overhead (thousands of `measure` calls per session)
  and mark strings shipping to production for zero user benefit.
* **A hard CI perf gate** — headless-runner variance makes absolute-threshold gating flaky; the
  harness is run on demand (and the analyzer is cheap to re-run on a saved trace) rather than
  blocking PRs. Left for a future baseline-comparison pass.

## Consequences

* **+** Profiling is one command per platform (`npm run perf:web` / `perf:android` / `perf:ios`) and
  produces a machine-readable report an agent can act on.
* **+** First real-hardware numbers for ADR-0015: on the Android emulator the capped-DPR canvas
  spends ~4970 ms in raster/paint over the session (vs ~210 ms on throttled desktop), confirming the
  "4× fill rate" cost — while the main thread stays at 60 FPS with `engine.draw` well under one
  frame. The DPR/compositing cost is a real crispness-vs-perf tradeoff, left for a separate decision
  rather than changed here.
* **+** The web drawing path profiled clean (0 forced reflows, sub-ms `draw`, no long tasks),
  validating the engine's rect-caching and deferred-snapshot design.
* **−** Headless + CPU throttle only *approximates* a phone; absolute frame numbers want the Android
  path. The harness labels each capture's target/throttle/build so numbers aren't compared across
  modes by accident.
* **−** The iOS path measures the WebKit engine, not the Simulator app, and WebKit clamps
  `performance.now()` to ~1 ms so its marks are coarse. Device-accurate iOS profiling stays a
  documented manual step. *(Superseded in part by ADR-0079: the gates run is automated on a physical
  device; the Timeline recording is what stays manual.)*
* **−** `perf:android` / `perf:ios` are local-only (need the device/emulator + toolchain and a
  `PERF_MARKS` native build); they can't run in CI or a cloud session.

The `profiling` skill is the entry point for running the harness and reading a report.

## Amendment (ADR-0066, 2026-07)

ADR-0066 replaced command-replay undo (ADR-0033) with snapshot undo — the paper raster is the
committed source of truth, with a depth-20 stack of pre-stroke snapshots. The harness, the three
capture paths, and the analyzer are untouched; what changes is the engine mark set the Decision's
first bullet lists:

* **Current set:** `engine.draw`, `engine.commit`, `engine.snapshot`, `engine.fold`,
  `engine.encode`, `engine.reinflate`, `engine.undo`, `engine.resize`, `engine.scanEmpty`
  (`web/src/lib/drawing/engine.ts`, `undoHistory.ts`, `emptyScan.ts`).
* **`engine.foldBaseline` is deleted** with the replay system, as is ADR-0035's `engine.keyframe` —
  there is no baseline fold or keyframing left to measure.
* **`engine.snapshot` and `engine.fold` sit inside `engine.commit`** and split the commit cost by
  stage: `engine.snapshot` isolates the pre-stroke paper copy (canvas alloc + `drawImage` + stack
  push), `engine.fold` isolates rendering the committed stroke's ops onto the paper — the exact
  workload ADR-0066's commit-hitch gate bounds — so a hot commit attributes to the right stage.
* **`engine.undo` is measured end-to-end across tasks.** A deep undo is async (pop, await blob
  decode, restore blit), so the undo step emits an explicit `engine.undo:end` mark at restore
  completion (closed in a `finally`, so a failed decode still ends the pair) and the measure spans
  `engine.undo:start` → `engine.undo:end`. Marks-only consumers — WebKit's Web Inspector timeline
  export exposes marks but not measures — pair the start/end marks instead of the
  smallest-enclosing-record heuristic, which bounded only the first task of an async undo.
* **`engine.draw`, `engine.commit`, and `engine.scanEmpty` also emit an explicit `:end` mark now,**
  each closed in a `finally` alongside its function body. All three have early returns (a buffered
  edge-swipe candidate in `draw`, the deferred-restore/no-op paths in `commitStrokeGroup`, a missing
  scratch context in `scanCanvasIsEmpty`) that used to leave the `:start` mark unmatched — a mark
  with no measure isn't just missing a number, it corrupts the marks-only consumer above: WebKit's
  timeline export has no measures to fall back on, so an orphaned start left the Web Inspector
  marker stream with a dangling `:start` and no way to attribute its cost. The `finally` guarantees
  the pair closes on every exit path, matching `engine.undo`'s shape.

ADR-0066 also deleted the `perf:sweep`/`perf:units` harnesses that tuned the replay machinery; the
platform commands this ADR ships (`perf:web`/`perf:android`/`perf:ios`) are unchanged.

## Amendment (ADR-0079, 2026-07)

The Decision's capture list gains a **fourth path**. `npm run perf:ipad` drives a physical iOS
device over the **WebKit Inspector Protocol** (relayed by `ios-webkit-debug-proxy`), reusing the
same `/dev/engine` scenarios and the same ADR-0066 gates that `perf:undo` drives — only the
transport is new. So this ADR's "device-accurate iOS profiling stays a documented manual step" now
holds **only for Timeline recording**: the protocol's `Timeline` domain does not emit the Web
Inspector *export* shape `perf:ios:analyze` parses, so paint/composite and dropped-frame questions
still route through the manual runbook.

This ADR's premise that a physical device offers no automation socket was true of **CDP** and
overstated for automation generally. ADR-0079 records the protocol's non-obvious shapes (Target
multiplexing, no `awaitPromise`, `page`-vs-`frame` targets, suspended background tabs) and why
`ios-webkit-debug-proxy` was chosen over `pymobiledevice3`.

The analyzer, the mark set, and the three original paths are untouched.
