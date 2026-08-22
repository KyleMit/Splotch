<!-- cspell:ignore adb appium webview chromium devtools simctl iwdp keepNames toplevel xcuitest -->

> Running an unattended physical-device campaign? Read
> [PROFILING-CAMPAIGNS.md](PROFILING-CAMPAIGNS.md) first and start with `npm run perf:preflight`. It
> catalogues the setup mistakes that produce plausible, wrong numbers without raising an error.

# Splotch — Performance Profiling

The harness (`tools/perf/`, ADR-0032) drives a deterministic "toddler session" — multi-finger draw,
color changes, stroke-size changes, erase, undo, clear — through the app while recording a profile,
then writes a machine-readable report. One command per platform; the analyzer is pure and
re-runnable on any saved trace.

## Commands

| Command                                              | Profiles                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Capture                                                                                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run perf:web`                                   | Production preview in headless Chromium, phone viewport, **4× CPU throttle**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | full CDP Chrome trace                                                                                                                      |
| `npm run perf:web:raw`                               | …no throttle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | full CDP trace                                                                                                                             |
| `npm run perf:web:mount`                             | **page load / mount** (the Lighthouse-TBT window) — every other web command starts tracing *after* the page is loaded, so use this one for boot/startup questions; phone viewport, 4× throttle **+ Slow-4G network emulation**                                                                                                                                                                                                                                                                                                                                                                                                     | CDP trace across the navigation **+** load-phase long tasks, paint timings, and any user-timing measures (`mount-summary.json`)            |
| `npm run perf:android`                               | the **real Capacitor WebView** on a connected device/emulator, no throttle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | full CDP trace                                                                                                                             |
| `npm run perf:android:browser:actions`               | the shared discrete-action plan in Android Chrome on an ADB-connected emulator/device. It launches an owned profiler tab, uses direct CDP trusted touch, evicts browser caches, waits for stable frames, and restores rotation. Use this instead of Android browser automation through Appium, whose UiAutomator2/Chromedriver path can pause frame presentation (ADR-0092)                                                                                                                                                                                                                                                        | the same action-local raw samples and grouped verdicts as `perf:ios:xcuitest:actions` (`actions.json`)                                     |
| `npm run perf:web:webkit`                            | Playwright **WebKit** (the iOS WKWebView engine), production preview                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | engine marks + FPS (no CDP trace)                                                                                                          |
| `npm run perf:ios:webkit:gates`                      | a **real USB-connected iPad** — the ADR-0066 gates on real WebKit + Apple GPU + 120 Hz ProMotion. Serves the instrumented build, attaches over the WebKit Inspector Protocol (`brew install ios-webkit-debug-proxy`), and drives `/dev/engine`. Needs Safari open on a tab; see `docs/PROFILING-IPAD.md`                                                                                                                                                                                                                                                                                                                           | the per-scenario gates table (`ipad-gates.json`) — no trace, and no Timeline: recording one stays manual                                   |
| `npm run perf:ios:webkit:frames`                     | the **real screen** on a real USB-connected iPad — the app at `/`, not `/dev/engine`. Frame pacing, input queue delay, paint latency, `pointermove` delivery, finger-up→halo-gone, and undo-history growth, with a CSS A/B sweep over the blend nudge / `mix-blend-mode` / `PointerHalos` and blank-vs-coloring-page. `--drive` runs it with no human hand; see `docs/PROFILING-IPAD.md`                                                                                                                                                                                                                                           | four tables + worst-frame forensics + the raw tables (`real-screen.json`), re-readable with `perf:analyze:frames`                          |
| `npm run perf:ios:xcuitest:screen`                   | the Appium real-screen path, calibrated for **trusted physical-iPad touch** but reusable for Safari/Chrome and native Capacitor WebViews through capability files. It evicts stale caches, injects the existing probe, selects pen/crayon/magic/eraser through the real UI, switches to native coordinates for a repeatable two-long/eight-short stroke sequence, and can drive Undo. Non-iPad/simulator runs use `--report-only` until their input signature has a physical calibration                                                                                                                                           | fidelity verdict + enforced paint/lost-frame-time and requested undo gates + raw tables (`real-screen.json`)                               |
| `npm run perf:ios:xcuitest:actions`                  | discrete UI actions through the same Appium path — drawer, palette, brushes, stroke width, responsive Settings, themes, coloring-grid open/scroll/select, screenshot, undo, drag-to-clear, and rotation. It supports mobile web or a native Capacitor WebView, retains one warmup plus three scored repeats by default, records rAF inside the page, and fails uncaptured input or the 20 ms P95 / 33.5 ms first/worst-frame gates. `--actions=` focuses one family; `--report-only` ranks a broken sweep without stopping                                                                                                         | action-local raw samples + grouped first-frame/readiness/frame P95/max verdicts (`actions.json`)                                           |
| `npm run perf:web:actions`                           | the same full action plan and scorer in Playwright on a local desktop. Defaults to WebKit at 1512×982@2×; use `--engine=chromium\|firefox` for cross-browser comparisons and `--headed` when the real Mac presentation path matters. `--url=` can target an externally served historical build, keeping the current runner and input plan identical across an architecture comparison                                                                                                                                                                                                                                              | the same action-local raw samples and grouped verdicts (`actions.json`)                                                                    |
| `npm run perf:web:frames`                            | the same real-screen probe **without an iPad** — driven against `/` in Playwright at configurable viewport and DPR (iPad Pro 12.9" by default), so a frame-pacing baseline costs a command instead of a USB cable. `--engine=webkit` is the iOS engine family; `--engine=chromium` adds `--throttle=N`; `--engine=firefox` is Gecko, for the desktop matrix row only. `--undo-count=N` adds the shared undo-response measurement to the same capture. Compositor-side findings may not survive a different compositor — a stall that reproduces here is a cheap regression signal, one that does not says nothing about the device | the same tables + `summaries.json`                                                                                                         |
| `npm run perf:analyze:frames -- <file>`              | re-reads a saved `real-screen.json` and recomputes every metric from the raw tables — the probe records and computes nothing, so a capture outlives the metric definitions taken with it                                                                                                                                                                                                                                                                                                                                                                                                                                           | the same tables, plus `summaries.json`                                                                                                     |
| `npm run perf:web:undo`                              | the **undo** question specifically — drives `/dev/engine` (so it can read `getUndoDebug()`) through 7 shaped sessions (long squiggles, short marks, a mix, five-finger drags, pen scribbles, crayon squiggles, crayon reversal-scribbles); `--scenarios=a,b` runs a subset; tablet viewport, 4× throttle                                                                                                                                                                                                                                                                                                                           | CDP trace **+** per-scenario undo depth, live-patch and folded-base raster counts/bytes, retained commands, commit timing, and undo timing |
| `npm run perf:web:undo:webkit`                       | the same 7 scenarios in Playwright **WebKit** — the engine family the iOS app ships. **Enforces the commit gate** (exits non-zero past `COMMIT_GATE_MS`); no throttle                                                                                                                                                                                                                                                                                                                                                                                                                                                              | engine marks (no CDP trace, no JS-heap table) **+** the same per-scenario tables                                                           |
| `npm run perf:web:undo:webkit:fast`                  | the post-merge subset (ADR-0100): `multi-finger` (the sole multi-pointer exerciser) + `crayon-scribbles` (the sole mid-stroke pass-split exerciser), run on pushes to `main`. The named script owns the set; CI never repeats its scenario list. Multi-finger gates raw P95; crayon-scribbles normalizes P95 by same-run crayon renderer throughput so shared-host canvas slowdown does not impersonate new commit-only work                                                                                                                                                                                                       | raw and normalized gate evidence + the same per-scenario tables                                                                            |
| `npm run perf:web:replay -- --recording=<f>`         | **real recorded finger input** instead of synthetic strokes — replays a recording captured on-device with `tools/perf/probes/input-recorder.js` (see `docs/PROFILING-IPAD.md`) at real timing                                                                                                                                                                                                                                                                                                                                                                                                                                      | CDP trace **+** how your input landed in tiled history (`getUndoDebug`) + engine.draw/commit/undo cost                                     |
| `npm run perf:analyze:chrome -- <dir or trace.json>` | re-summarize a saved trace                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —                                                                                                                                          |

Flags (web/ios): `--device=phone\|tablet\|desktop`, `--no-build` (reuse the last build); web also
`--throttle=N`. Android: `--no-build` (profile the installed app as-is). `perf:web:undo` takes
`--engine=chromium\|webkit` / `--throttle=N` / `--no-throttle` / `--no-build`.
`perf:ios:webkit:gates` takes `--scenarios=a,b` / `--strokes=N` / `--ops=N` / `--url=` / `--port=N`
/ `--device-id=` / `--no-serve`, and skips its rebuild with `--ignore-scripts` rather than
`--no-build` (the build is a pre-hook). `perf:ios:xcuitest:screen` needs an existing Appium 3 server
and one of `--device-id=`, `--capabilities-file=`, or `--session-id=`. It also takes `--appium-url=`
/ `--xcode-config=` / `--wda-bundle-id=` / `--allow-provisioning` / `--native-app` /
`--native-webview-class=` / `--brush=pen|crayon|magic|eraser` / `--gesture-repeats=N` /
`--repeat-pause-ms=N` / `--undo-count=N` / `--undo-pause-ms=N` / `--history-settle-ms=N` /
`--rotate-before-undo` / `--label=` / `--output=` / `--url=` / `--port=N` / `--report-only` /
`--no-serve`. Free-draw capture belongs to `perf:ios:webkit:frames`, whose visible HUD lets the
operator start and stop the timed window. `perf:ios:xcuitest:actions` shares the Appium, capability,
session, native-app, and signing flags and also takes `--orientation=` / `--webdriver-clicks` /
`--actions=` / `--repeats=N` / `--report-only`. Use `--native-webview-class=android.webkit.WebView`
for Android native sessions. A native rotation sweep uses the real Settings toggle to unlock and
restore Splotch's orientation preference. `perf:android:browser:actions` takes `--device-id=` /
`--cdp-port=N` / `--orientation=` / `--actions=` / `--repeats=N` / `--label=` / `--output=` /
`--url=` / `--report-only` / `--no-serve`; skip its build pre-hook with `--ignore-scripts` when an
instrumented preview is already running. `perf:web:frames` takes `--viewport=WIDTHxHEIGHT` /
`--device-scale-factor=N` / `--headed` / `--url=` / `--brush=pen|crayon|magic|eraser` in addition to
its engine, throttle, phase, and drive flags. `perf:web:actions` takes
`--engine=webkit|chromium|firefox` plus those viewport, DPR, headed, and URL flags plus `--actions=`
/ `--repeats=N` / `--label=` / `--output=` / `--report-only` / `--no-build`. Interaction runs write
`perf-profiles/<timestamp>-<target>-…/` with `trace.json`, `metrics.json`, `summary.json`,
`report.md`, and `screenshot.png`; `perf:web:undo` also writes `undo-scenarios.json` /
`undo-scenarios.md` (the per-scenario tiled-history/undo-cost/memory tables). `perf:web:mount`
initially writes only `trace.json` and `mount-summary.json`; running `perf:analyze:chrome` on that
trace adds `summary.json` and `report.md`. The raw mount trace does not retain the harness settings
metadata, so the regenerated report's Settings table can say `n/a` / `none`; use the command and
output-directory suffix (for example, `mount-phone-4x`) for the actual capture profile.
`perf-profiles/` is gitignored.

**Undo memory caveat:** tiled history's patch and folded-base rasters live in **canvas backing
stores, not the JS heap** — so `performance.memory` / the heap table can't see them and stay flat.
`perf:web:undo` reports the real cost directly from `getUndoDebug()`:
`rasterBytes + baseRasterBytes` (ADR-0085/0086).

### Which undo run to reach for

Run **both** when you touch the commit or tiled-history path; they answer different questions and
neither substitutes for the other.

|         | `perf:web:undo` (Chromium)                                                | `perf:web:undo:webkit`                                                       |
| ------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Answers | how tiled history *behaves* — depth, patch/base memory, retained commands | whether a stroke-end **costs** what it should in the shipping engine family  |
| Has     | CDP trace, CPU throttle, JS-heap table, main-thread breakdown             | engine marks only                                                            |
| Gate    | none — its ms are advisory                                                | full: raw P95; fast crayon: control-normalized P95; both vs `COMMIT_GATE_MS` |

The split exists because Chromium and WebKit have materially different canvas implementations. The
deleted snapshot/blob history path supplied the worked example: a full-raster encode that was cheap
in Chromium but blocked WebKit. Tiled history removed that encode path, but WebKit remains the
closer desktop signal for the engine family shipped on iOS.

So: a number that must hold **on a user's device** is not settled by Chromium. WebKit is not an iPad
either — it is a desktop build with no throttle and `performance.now()` clamped to ~1 ms — so its
gate is deliberately blunt (catch full-raster work reappearing on the pointerup path, not police
drift). Absolute device milliseconds still come from `docs/PROFILING-IPAD.md`.

CI runs the fast named subset in a `macos-latest` job on pushes to `main`, after the merge rather
than before it, because its millisecond P95 was the wall-clock floor of a pull-request run. The
pre-merge structural half from ADR-0100 retired when tiled history removed the blob-encoding path it
asserted. All seven scenarios still run on `v*` release tags. Every gate job attempts to upload
`undo-scenarios.json` and `undo-scenarios.md` after a failure; a gate breach produces them, while an
earlier build/browser failure warns that none exist without masking the original error. An unknown
requested key, incomplete scenario, missing `engine.commit` samples, or timing breach fails closed.
The timing gate uses P95 so a catastrophic work shape must recur; it retains commit max and every
raw duration for diagnosing an isolated runner interruption. This is a catastrophic-regression gate
with a wide threshold, not physical-iPad approval; ADR-0090's real-device tier remains the authority
for frame pacing and device-calibrated budgets.

The post-merge fast tier gates `multi-finger` on raw P95 and preserves the sole multi-pointer path.
Its `crayon-scribbles` scenario preserves the sole mid-stroke pass-split path and divides raw commit
P95 by the same run's `engine.draw total / calls` slowdown relative to the controlled healthy crayon
reference. Shared macOS runs that slowed all crayon rendering by roughly 8–10× made raw commit P95
cross 25 ms without changing the work shape; normalization keeps those healthy runs below the
unchanged 25 ms contract. A commit-only regression with normal live-draw throughput still fails, as
does a new commit-only regression. Release and on-demand full runs stay on raw P95, and the
artifacts retain both measurements.

The named fast command reads `FAST_UNDO_SCENARIO_KEYS`; the npm script and workflow do not repeat
its members. Each scenario declares the commit paths it exercises, and the repo-script suite fails
when a sole exerciser leaves the fast set. Every release-tag full run restores the latest
`webkit-undo-full-history` artifact, appends per-scenario `commit P95 / 25 ms` headroom and whether
the fast set would have caught any breach, then uploads the rolling history for 90 days. The full
gate fails when the derived ideal membership differs or when two consecutive full-run breaches were
fast-set misses. A compatible committed seed starts the chain after artifact expiry or invalid
restored state, and a run without commit samples never enters the history.

> **Not available in a cloud session.** `.claude/cloud/setup.sh` installs Chromium only, so any
> WebKit-driving command (`perf:web:undo:webkit`, `perf:web:webkit`) fails there with Playwright's
> raw `Executable doesn't exist`. `tools/lib/playwright.mjs` self-heals a drifted *Chromium*
> revision and has no WebKit equivalent. Run these locally, or `npx playwright install webkit` first
> if the session's network allowlist covers `cdn.playwright.dev`.

## How capture works (so the numbers make sense)

* **Session commands trace an already-loaded page.** `capture-web-session.mjs` (and every other
  driver) navigates first and starts the CDP trace afterwards, so nothing in
  `perf:web`/`perf:android`/`perf:web:undo` can see boot cost. `perf:web:mount` is the exception: it
  arms a buffered `longtask` observer via `addInitScript`, starts tracing, *then* navigates — and
  keeps recording ~5 s past load so idle-deferred boot work (overlay mounts, sound preload, texture
  warm) shows up instead of hiding as "moved off the load path" wins that just relocated a long
  task. Its `mount-summary.json` long-task list is the TBT signal; feed its `trace.json` to
  `perf:analyze:chrome` for the breakdown.
* **Engine marks** are the clean signal. `PERF_MARKS=true` at build time turns on
  `performance.mark/measure` around the engine's hot paths (`lib/drawing/` — `engine.draw`,
  `engine.commit`, `engine.undo`, `engine.resize`, and `engine.scanEmpty`; gated by the shared
  `perf.ts` flag across `engine.ts` and its sibling modules). The `npm run perf:*` scripts set it;
  normal builds strip the marks entirely. If the report says "*No engine.* marks*", the build wasn't
  a `PERF_MARKS` build.
* **Headless + CPU throttle approximates a phone** — good for finding hotspots and catching
  regressions, but absolute frame numbers want the Android path. Don't compare across
  targets/throttle without checking Settings table.
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

1. **Frame health** — `Long frames (>33.5 ms)` and `Long tasks (>50 ms)`. Zero is healthy. A cluster
   of long tasks points to the phase they fall in (see the per-phase table's "Long tasks" column).
2. **Engine hot paths** — the `Total`/`Avg`/`Max` per operation. Map a hot row to its cause and fix:

   | Hot row                        | What it is                                                          | Where to look                                                                                                                                                  |
   | ------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `engine.draw` high **Avg/Max** | per-pointermove stroking (coalesced samples + quadratic segments)   | `strokeSmoothSegments` / `draw` in `web/src/lib/drawing/engine.ts`. A high *Max* (vs Avg) = a few heavy frames, often the first move after a resize.           |
   | `engine.commit` high           | finalizing one tiled undo command when the last pointer lifts       | `commitStrokeGroup` → `commitTiledCommand`; inspect retained command bookkeeping, base-tile folding at the depth cap, and synchronous `onStrokeEnd` consumers. |
   | `engine.scanEmpty` high        | `getImageData` readback after an **eraser** stroke                  | `scanCanvasIsEmpty`; already downscaled 0.25×. Costlier on real devices (GPU→CPU readback).                                                                    |
   | `engine.resize` high/frequent  | backing-store rebuild + one paper blit (plus pending/in-flight ops) | should fire only on resize/rotation — if it fires mid-draw, that's the bug.                                                                                    |
   | `engine.undo` high             | restoring the latest command from tile-local before-images          | `undoTiledCommand`; inspect the touched tile set and patch blits.                                                                                              |
3. **Where the main thread went** (Chromium/Android only) — Scripting vs Rendering vs Painting.
   Painting/raster dominating = GPU/compositing cost (the high-DPR canvas), not JS.
4. **Per-phase main-thread busy** — which interaction actually costs CPU (busy, not wall-clock —
   wall is dominated by the scenario's pacing sleeps). Its **Compositor commit** column totals the
   `Commit` events in the phase — the raster/damage push of the high-DPR canvas (the ADR-0015 cost).
   A phase whose long tasks are commit-dominated is paying for pixel area (full-canvas damage, e.g.
   `repaintAll`), not JS.
5. **Long tasks attributed** — each top >50 ms task tagged with its phase and its largest nested
   trace events, so the jank names itself: `Commit` = compositor raster; `EventDispatch (pointerup)`
   = the stroke-end pipeline (check `engine.commit`); `MajorGC` = allocation pressure. In
   `perf:web:undo` draw phases, huge `Receive mojo message` rows are the harness's synchronous
   stroke dispatch — an artifact, not app cost.
6. **Top JS by self-time** — corroborates 2–3. `drawImage` = canvas copies (the commit's patch
   capture, undo restores, the resize blit); `stroke`/`quadraticCurveTo` = live drawing;
   `getImageData` = the empty-scan. Playwright/driver plumbing that isn't in `HARNESS_SYMBOLS` yet
   (e.g. `setupDragListeners`) can still appear — verify a symbol exists in `web/src/` before
   chasing it.

For a forced-reflow / layout-thrash check, the harness confirmed **0 forced synchronous layouts** in
the drawing path (`canvasMeasure.ts` caches the canvas rect for it). If that ever turns non-zero,
look for a new `getBoundingClientRect` in a hot path.

## Known findings & deferred tradeoffs (as of ADR-0032)

The drawing path is already well-optimized; treat these as the baseline:

* **Healthy**: web (4× throttle) and Android (real WebView) both run at frame rate with
  `engine.draw` well under one frame and no long tasks; 0 forced reflows.
* **Deferred — real user tradeoffs, NOT low-risk oversights:**
  * **Capped-DPR canvas compositing (ADR-0015).** The dominant cost on-device is raster/paint of the
    4×-pixel canvas (~4970 ms/session on the Android emulator vs ~210 ms throttled-desktop).
    Changing it (`MAX_RENDER_SCALE`) alters rendered crispness — needs a deliberate decision, not a
    drive-by edit. Undo memory is tiled (ADR-0085/0086): touched tiles retain before-images, and
    commands past the undo depth fold into base tiles.
  * `engine.scanEmpty` ~14 ms on-device per erase-stroke-end — low impact (once per stroke), noted
    for the future.

When you fix something, re-run the same command and compare `summary.json` / `report.md` against the
prior run in `perf-profiles/`. A committed baseline to compare against (high-DPI tablet toddler
session + the seven `perf:web:undo` scenarios, with a ranked findings write-up) lives in
`scrapbook/perf/2026-07-22-draw-profile/`.

## Native specifics

* **Android** needs an emulator/device on `adb` and the toolchain. `perf:android` rebuilds +
  installs the native app with `PERF_MARKS=true`, launches it
  (`am start -n art.splotch.app/.MainActivity`), finds the WebView DevTools socket
  (`webview_devtools_remote_<pid>` in `/proc/net/unix`), `adb forward`s it, and connects Playwright
  over CDP. `--no-build` profiles the already-installed app (only shows engine marks if that build
  had `PERF_MARKS`). Local-only — see the `mobile` skill for the toolchain and the manual
  `chrome://inspect` flow.
* **Android Chrome actions** use `perf:android:browser:actions` rather than Appium. The runner
  launches and owns one marked Chrome tab, forwards `chrome_devtools_remote`, and dispatches trusted
  touch directly through CDP while the shared in-page probe scores frames. Appium remains the
  native- WebView transport; it is not an approval path for Android browser frames (ADR-0092).
* **iOS** `perf:web:webkit` profiles the WebKit *engine*, not the Simulator app. For device-accurate
  numbers, run the app on the Simulator, record a **Timeline** in Safari Web Inspector (Develop →
  Simulator → Splotch — see the `mobile` skill), export it, and run
  `npm run perf:analyze:web-inspector -- <export>.json` (the Web Inspector export is
  mark-only/ring-buffered — a different format from `perf:analyze:chrome`; see
  `docs/PROFILING-IPAD.md`). WebKit clamps `performance.now()` to ~1 ms, so its engine-mark timings
  are coarse.
* **Real iPad** (the highest-fidelity target — real WebKit + GPU + 120 Hz ProMotion): the gates run
  is automated — **`npm run perf:ios:webkit:gates`** (ADR-0079) attaches over the WebKit Inspector
  Protocol and drives the same `perf:web:undo` scenarios through
  `tools/perf/probes/engine-gates.js`; trusted-touch real-screen capture is automated separately by
  **`npm run perf:ios:xcuitest:screen`** (ADR-0084), because Appium's temporary Safari window is not
  visible to the Inspector relay. There is no *CDP* endpoint on a device, which is why these are
  their own transports rather than the Android path. **A Timeline recording is still a manual Safari
  Web Inspector flow** — the protocol's `Timeline` domain isn't the export shape
  `perf:analyze:web-inspector` parses. Full step-by-step runbook (Mac-vs-iPad tagged), including the
  by-hand fallback and Appium setup, in [`docs/PROFILING-IPAD.md`](PROFILING-IPAD.md).
