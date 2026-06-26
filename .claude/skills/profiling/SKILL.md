---
name: profiling
description: Capture and read an automated performance profile of the drawing app (web, Android, iOS). Use when measuring drawing/canvas performance, investigating jank or a slow interaction, verifying a perf change, or checking for regressions over time. Covers the `npm run perf:*` harness, how to read report.md/summary.json, and the bottleneck decision guide.
---

<!-- cspell:ignore adb webview chromium devtools simctl iwdp keepNames toplevel -->

# Splotch — Performance Profiling

The harness (`scripts/perf/`, ADR-0032) drives a deterministic "toddler session"
— multi-finger draw, color changes, stroke-size changes, erase, undo, clear —
through the app while recording a profile, then writes a machine-readable report.
One command per platform; the analyzer is pure and re-runnable on any saved trace.

## Commands

| Command | Profiles | Capture |
| --- | --- | --- |
| `npm run perf:web` | Production preview in headless Chromium, phone viewport, **4× CPU throttle** | full CDP Chrome trace |
| `npm run perf:web:raw` | …no throttle | full CDP trace |
| `npm run perf:android` | the **real Capacitor WebView** on a connected device/emulator, no throttle | full CDP trace |
| `npm run perf:ios` | Playwright **WebKit** (the iOS WKWebView engine), production preview | engine marks + FPS (no CDP trace) |
| `npm run perf:analyze -- <dir or trace.json>` | re-summarize a saved trace | — |

Flags (web/ios): `--device=phone\|tablet\|desktop`, `--no-build` (reuse the last
build); web also `--throttle=N`. Android: `--no-build` (profile the installed app
as-is). Each run writes `perf-profiles/<timestamp>-<target>-…/` containing
`trace.json`, `metrics.json`, `summary.json`, `report.md`, and `screenshot.png`.
`perf-profiles/` is gitignored.

## How capture works (so the numbers make sense)

- **Engine marks** are the clean signal. `PERF_MARKS=true` at build time turns on
  `performance.mark/measure` around the engine's five hot paths (engine.ts:
  `draw`, `saveUndoSnapshot`, `scanCanvasIsEmpty`, `resizeCanvas`, `undo`). The
  `npm run perf:*` scripts set it; normal builds strip the marks entirely. If the
  report says "_No engine.* marks_", the build wasn't a `PERF_MARKS` build.
- **Headless + CPU throttle approximates a phone** — good for finding hotspots and
  catching regressions, but absolute frame numbers want the Android path. Don't
  compare across targets/throttle without checking the Settings table.
- **The self-time table excludes harness symbols** (the rAF sampler, the
  user-timing API, Playwright's input plumbing) so it reflects app compute. In
  production (minified) builds non-engine names may still be short; the engine.*
  marks stay readable.

## Reading report.md → picking a bottleneck

Read in this order:

1. **Frame health** — `Long frames (>32 ms)` and `Long tasks (>50 ms)`. Zero is
   healthy. A cluster of long tasks points to the phase they fall in (see the
   per-phase table's "Long tasks" column).
2. **Engine hot paths** — the `Total`/`Avg`/`Max` per operation. Map a hot row to
   its cause and fix:

   | Hot row | What it is | Where to look |
   | --- | --- | --- |
   | `engine.draw` high **Avg/Max** | per-pointermove stroking (coalesced replay + quadratic segments) | `strokeSmoothSegments` / `draw` in `web/src/lib/drawing/engine.ts`. A high *Max* (vs Avg) = a few heavy frames, often the first move after a resize. |
   | `engine.saveUndoSnapshot` high | full-canvas copy per stroke group, ×renderScale² pixels | undo snapshot cost — the ADR-0015 DPR tradeoff (see below). |
   | `engine.scanEmpty` high | `getImageData` readback after an **eraser** stroke | `scanCanvasIsEmpty`; already downscaled 0.25×. Costlier on real devices (GPU→CPU readback). |
   | `engine.resize` high/frequent | backing-store rebuild + virtual-canvas copy | should fire only on resize/rotation — if it fires mid-draw, that's the bug. |
   | `engine.undo` high | restore from snapshot | rare; usually fine. |
3. **Where the main thread went** (Chromium/Android only) — Scripting vs
   Rendering vs Painting. Painting/raster dominating = GPU/compositing cost (the
   high-DPR canvas), not JS.
4. **Per-phase main-thread busy** — which interaction actually costs CPU (busy,
   not wall-clock — wall is dominated by the scenario's pacing sleeps).
5. **Top JS by self-time** — corroborates 2–3. `drawImage` = canvas copies
   (snapshots / virtual-canvas sync); `getImageData` = the empty-scan.

For a forced-reflow / layout-thrash check, the harness confirmed **0 forced
synchronous layouts** in the drawing path (the engine caches `canvasRect`). If
that ever turns non-zero, look for a new `getBoundingClientRect` in a hot path.

## Known findings & deferred tradeoffs (as of ADR-0032)

The drawing path is already well-optimized; treat these as the baseline:

- **Healthy**: web (4× throttle) and Android (real WebView) both run at frame rate
  with `engine.draw` well under one frame and no long tasks; 0 forced reflows.
- **Deferred — real user tradeoffs, NOT low-risk oversights:**
  - **Capped-DPR canvas compositing (ADR-0015).** The dominant cost on-device is
    raster/paint of the 4×-pixel canvas (~4970 ms/session on the Android emulator
    vs ~210 ms throttled-desktop). Changing it (`MAX_RENDER_SCALE`, snapshot scale,
    undo depth) alters rendered crispness and/or undo memory — needs a deliberate
    decision, not a drive-by edit.
  - `engine.scanEmpty` ~14 ms on-device per erase-stroke-end — low impact (once per
    stroke), noted for the future.

When you fix something, re-run the same command and compare `summary.json` /
`report.md` against the prior run in `perf-profiles/`.

## Native specifics

- **Android** needs an emulator/device on `adb` and the toolchain. `perf:android`
  rebuilds + installs the native app with `PERF_MARKS=true`, launches it
  (`am start -n art.splotch.app/.MainActivity`), finds the WebView DevTools socket
  (`webview_devtools_remote_<pid>` in `/proc/net/unix`), `adb forward`s it, and
  connects Playwright over CDP. `--no-build` profiles the already-installed app
  (only shows engine marks if that build had `PERF_MARKS`). Local-only — see the
  `mobile` skill for the toolchain and the manual `chrome://inspect` flow.
- **iOS** `perf:ios` profiles the WebKit *engine*, not the Simulator app. For
  device-accurate numbers, run the app on the Simulator, record a **Timeline** in
  Safari Web Inspector (Develop → Simulator → Splotch — see the `mobile` skill),
  export it, and run `npm run perf:analyze -- <export>.json`. WebKit clamps
  `performance.now()` to ~1 ms, so its engine-mark timings are coarse.
