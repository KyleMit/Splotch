---
name: profiling
description: Capture and read an automated performance profile of the drawing app (web, Android, iOS). Use when measuring drawing/canvas performance, investigating jank or a slow interaction, verifying a perf change, or checking for regressions over time. Covers the `npm run perf:*` harness, how to read report.md/summary.json, and the bottleneck decision guide.
---

<!-- cspell:ignore adb webview chromium devtools simctl iwdp keepNames toplevel -->

# Splotch — Performance Profiling

The harness (`scripts/perf/`, ADR-0032) drives a deterministic "toddler session" — multi-finger
draw, color changes, stroke-size changes, erase, undo, clear — through the app while recording a
profile, then writes a machine-readable report. One command per platform; the analyzer is pure and
re-runnable on any saved trace.

## Commands

| Command                                       | Profiles                                                                                                                                                                                                                                                                                                 | Capture                                                                                                                                          |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run perf:web`                            | Production preview in headless Chromium, phone viewport, **4× CPU throttle**                                                                                                                                                                                                                             | full CDP Chrome trace                                                                                                                            |
| `npm run perf:web:raw`                        | …no throttle                                                                                                                                                                                                                                                                                             | full CDP trace                                                                                                                                   |
| `npm run perf:mount`                          | **page load / mount** (the Lighthouse-TBT window) — every other web command starts tracing *after* the page is loaded, so use this one for boot/startup questions; phone viewport, 4× throttle **+ Slow-4G network emulation**                                                                           | CDP trace across the navigation **+** load-phase long tasks, paint timings, and any user-timing measures (`mount-summary.json`)                  |
| `npm run perf:android`                        | the **real Capacitor WebView** on a connected device/emulator, no throttle                                                                                                                                                                                                                               | full CDP trace                                                                                                                                   |
| `npm run perf:ios`                            | Playwright **WebKit** (the iOS WKWebView engine), production preview                                                                                                                                                                                                                                     | engine marks + FPS (no CDP trace)                                                                                                                |
| `npm run perf:undo`                           | the **undo** question specifically — drives `/dev/engine` (so it can read `getUndoDebug()`) through 7 shaped sessions (long squiggles, short marks, a mix, five-finger drags, pen scribbles, crayon squiggles, crayon reversal-scribbles); `--scenarios=a,b` runs a subset; tablet viewport, 4× throttle | CDP trace **+** per-scenario snapshot depth / live-raster / blob counts, commit + patch-capture + undo timing, and analytic raster + blob memory |
| `npm run perf:replay -- --recording=<f>`      | **real recorded finger input** instead of synthetic strokes — replays a recording captured on-device with `scripts/perf/ipad-recorder.js` (see `ipad-device-profiling.md`) at real timing                                                                                                                | CDP trace **+** how your input landed on the snapshot stack (`getUndoDebug`) + engine.draw/commit/undo cost                                      |
| `npm run perf:analyze -- <dir or trace.json>` | re-summarize a saved trace                                                                                                                                                                                                                                                                               | —                                                                                                                                                |

Flags (web/ios): `--device=phone\|tablet\|desktop`, `--no-build` (reuse the last build); web also
`--throttle=N`. Android: `--no-build` (profile the installed app as-is). `perf:undo` takes
`--throttle=N` / `--no-throttle` / `--no-build`. Interaction runs write
`perf-profiles/<timestamp>-<target>-…/` with `trace.json`, `metrics.json`, `summary.json`,
`report.md`, and `screenshot.png`; `perf:undo` also writes `undo-scenarios.json` /
`undo-scenarios.md` (the per-scenario snapshot/undo-cost/memory tables). `perf:mount` initially
writes only `trace.json` and `mount-summary.json`; running `perf:analyze` on that trace adds
`summary.json` and `report.md`. The raw mount trace does not retain the harness settings metadata,
so the regenerated report's Settings table can say `n/a` / `none`; use the command and
output-directory suffix (for example, `mount-phone-4x`) for the actual capture profile.
`perf-profiles/` is gitignored.

**Undo memory caveat:** history rasters (the paper and the live snapshot tier) live in **canvas
backing stores, not the JS heap** — so `performance.memory` / the heap table can't see them and stay
flat. `perf:undo` reports the *real* cost analytically:
`live patch bytes (rasterBytes) + the paper (max(w,h)² × 4 bytes) + encoded blob bytes`
(ADR-0066/0069 — live snapshots are dirty-rect patches, so their bytes come from `getUndoDebug`, not
raster count × full-raster size).

## How capture works (so the numbers make sense)

* **Session commands trace an already-loaded page.** `scenario.mjs` (and every other driver)
  navigates first and starts the CDP trace afterwards, so nothing in
  `perf:web`/`perf:android`/`perf:undo` can see boot cost. `perf:mount` is the exception: it arms a
  buffered `longtask` observer via `addInitScript`, starts tracing, *then* navigates — and keeps
  recording ~5 s past load so idle-deferred boot work (overlay mounts, sound preload, texture warm)
  shows up instead of hiding as "moved off the load path" wins that just relocated a long task. Its
  `mount-summary.json` long-task list is the TBT signal; feed its `trace.json` to `perf:analyze` for
  the breakdown.
* **Engine marks** are the clean signal. `PERF_MARKS=true` at build time turns on
  `performance.mark/measure` around the engine's hot paths (`lib/drawing/` — `engine.draw`,
  `engine.commit`, `engine.snapshot`, `engine.fold`, `engine.undo`, `engine.resize`,
  `engine.scanEmpty`; gated by the shared `perf.ts` flag across `engine.ts` and its sibling
  modules). The `npm run perf:*` scripts set it; normal builds strip the marks entirely. If the
  report says "*No engine.* marks*", the build wasn't a `PERF_MARKS` build.
* **Headless + CPU throttle approximates a phone** — good for finding hotspots and catching
  regressions, but absolute frame numbers want the Android path. Don't compare across
  targets/throttle without checking the Settings table.
* **`perf:web` measures compute, not compositing/presentation.** It runs headless with no real
  display, overlay planes, or GPU compositor, so it **cannot** surface transparency/alpha bugs,
  overlay-promotion bugs, tearing, or finger-to-ink presentation latency — a passing run is *not*
  validation that the change renders correctly, and the E2E readback flows don't cover it either.
  Any change to a canvas **context attribute**
  (`getContext('2d', { alpha, desynchronized, willReadFrequently })`) or to GPU compositing **must
  be verified on a real Android device** (`perf:android`, or the `mobile` skill's `chrome://inspect`
  flow) before it counts as validated. (Learned the hard way: a `desynchronized` hint passed
  `perf:web` + E2E and rendered the transparent canvas black on Android — ADR-0051.)
* **The self-time table excludes harness symbols** (the rAF sampler, the user-timing API,
  Playwright's input plumbing) so it reflects app compute. In production (minified) builds
  non-engine names may still be short; the engine.* marks stay readable.

## Reading report.md → picking a bottleneck

Read in this order:

1. **Frame health** — `Long frames (>32 ms)` and `Long tasks (>50 ms)`. Zero is healthy. A cluster
   of long tasks points to the phase they fall in (see the per-phase table's "Long tasks" column).
2. **Engine hot paths** — the `Total`/`Avg`/`Max` per operation. Map a hot row to its cause and fix:

   | Hot row                        | What it is                                                                          | Where to look                                                                                                                                                                                                                                            |
   | ------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `engine.draw` high **Avg/Max** | per-pointermove stroking (coalesced samples + quadratic segments)                   | `strokeSmoothSegments` / `draw` in `web/src/lib/drawing/engine.ts`. A high *Max* (vs Avg) = a few heavy frames, often the first move after a resize.                                                                                                     |
   | `engine.commit` high           | the stroke-end pipeline: patch capture + folding the stroke's ops into the paper    | the pointerup hitch candidate (ADR-0066). Its two inner measures attribute it: `engine.snapshot` dominating = the patch capture; `engine.fold` dominating = rendering the ops.                                                                           |
   | `engine.snapshot` high         | the pre-stroke paper patch (alone) pushed onto the snapshot stack at commit         | patch-sized `drawImage`s per commit — one per disjoint stroke cluster of the fold region (ADR-0069/0074); a clear is an O(1) paper swap — off the draw frame (`undoHistory.ts pushCommand`). Software renderers exaggerate it heavily — judge on-device. |
   | `engine.fold` high             | rendering the committed stroke's ops onto the paper, inside the commit              | `foldPendingIntoPaper` (`undoHistory.ts`) — scales with op count and brush cost; heaviest for crayon strokes (per-pass pattern stamps).                                                                                                                  |
   | `engine.scanEmpty` high        | `getImageData` readback after an **eraser** stroke                                  | `scanCanvasIsEmpty`; already downscaled 0.25×. Costlier on real devices (GPU→CPU readback).                                                                                                                                                              |
   | `engine.resize` high/frequent  | backing-store rebuild + one paper blit (plus pending/in-flight ops)                 | should fire only on resize/rotation — if it fires mid-draw, that's the bug.                                                                                                                                                                              |
   | `engine.undo` high             | restoring the top snapshot: a blit for a hot raster, decode + blit for a blob entry | deep entries (past MAX_HOT_RASTERS = 2) decode from their lossless blob; a one-off cost at button-press, not per-frame.                                                                                                                                  |
3. **Where the main thread went** (Chromium/Android only) — Scripting vs Rendering vs Painting.
   Painting/raster dominating = GPU/compositing cost (the high-DPR canvas), not JS.
4. **Per-phase main-thread busy** — which interaction actually costs CPU (busy, not wall-clock —
   wall is dominated by the scenario's pacing sleeps). Its **Compositor commit** column totals the
   `Commit` events in the phase — the raster/damage push of the high-DPR canvas (the ADR-0015 cost).
   A phase whose long tasks are commit-dominated is paying for pixel area (full-canvas damage, e.g.
   `repaintAll`), not JS.
5. **Long tasks attributed** — each top >50 ms task tagged with its phase and its largest nested
   trace events, so the jank names itself: `Commit` = compositor raster; `EventDispatch (pointerup)`
   = the stroke-end pipeline (check `engine.commit`/`engine.snapshot`); `RunMicrotasks` on an undo
   phase = the async paper-chain step (blob decode + restore); `MajorGC` = allocation pressure. In
   `perf:undo` draw phases, huge `Receive mojo message` rows are the harness's synchronous stroke
   dispatch — an artifact, not app cost.
6. **Top JS by self-time** — corroborates 2–3. `drawImage` = canvas copies (the commit's patch
   capture, undo restores, the resize blit); `stroke`/`quadraticCurveTo` = live drawing and the
   commit fold; `getImageData` = the empty-scan. Playwright/driver plumbing that isn't in
   `HARNESS_SYMBOLS` yet (e.g. `setupDragListeners`) can still appear — verify a symbol exists in
   `web/src/` before chasing it.

For a forced-reflow / layout-thrash check, the harness confirmed **0 forced synchronous layouts** in
the drawing path (the engine caches `canvasRect`). If that ever turns non-zero, look for a new
`getBoundingClientRect` in a hot path.

## Known findings & deferred tradeoffs (as of ADR-0032)

The drawing path is already well-optimized; treat these as the baseline:

* **Healthy**: web (4× throttle) and Android (real WebView) both run at frame rate with
  `engine.draw` well under one frame and no long tasks; 0 forced reflows.
* **Deferred — real user tradeoffs, NOT low-risk oversights:**
  * **Capped-DPR canvas compositing (ADR-0015).** The dominant cost on-device is raster/paint of the
    4×-pixel canvas (~4970 ms/session on the Android emulator vs ~210 ms throttled-desktop).
    Changing it (`MAX_RENDER_SCALE`) alters rendered crispness — needs a deliberate decision, not a
    drive-by edit. Undo memory is tiered (ADR-0066): the paper + 2 live snapshot rasters, with
    deeper history as encoded blobs — single-digit MB per entry, not full rasters.
  * `engine.scanEmpty` ~14 ms on-device per erase-stroke-end — low impact (once per stroke), noted
    for the future.

When you fix something, re-run the same command and compare `summary.json` / `report.md` against the
prior run in `perf-profiles/`. A committed baseline to compare against (high-DPI tablet toddler
session + the seven `perf:undo` scenarios, with a ranked findings write-up) lives in
`scrapbook/perf/2026-07-22-draw-profile/`.

## Native specifics

* **Android** needs an emulator/device on `adb` and the toolchain. `perf:android` rebuilds +
  installs the native app with `PERF_MARKS=true`, launches it
  (`am start -n art.splotch.app/.MainActivity`), finds the WebView DevTools socket
  (`webview_devtools_remote_<pid>` in `/proc/net/unix`), `adb forward`s it, and connects Playwright
  over CDP. `--no-build` profiles the already-installed app (only shows engine marks if that build
  had `PERF_MARKS`). Local-only — see the `mobile` skill for the toolchain and the manual
  `chrome://inspect` flow.
* **iOS** `perf:ios` profiles the WebKit *engine*, not the Simulator app. For device-accurate
  numbers, run the app on the Simulator, record a **Timeline** in Safari Web Inspector (Develop →
  Simulator → Splotch — see the `mobile` skill), export it, and run
  `npm run perf:ios:analyze -- <export>.json` (the Web Inspector export is mark-only/ring-buffered —
  a different format from `perf:analyze`; see `ipad-device-profiling.md`). WebKit clamps
  `performance.now()` to ~1 ms, so its engine-mark timings are coarse.
* **Real iPad** (the highest-fidelity target — real WebKit + GPU + 120 Hz ProMotion): there's no
  automation socket, so it's a manual Safari Web Inspector flow. Full step-by-step runbook
  (Mac-vs-iPad tagged) in [`ipad-device-profiling.md`](ipad-device-profiling.md); it drives the same
  `perf:undo` scenarios via the pasteable console driver `scripts/perf/ipad-console-driver.js`.
