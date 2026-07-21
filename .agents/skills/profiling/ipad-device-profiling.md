<!-- cspell:ignore promotion wkwebview ipconfig -->

# Capturing a performance profile on a real iPad

This is the manual runbook for profiling on a **physical iPad** — the highest- fidelity target we
have for the drawing engine, because it's the real **WebKit/JavaScriptCore engine + Apple GPU + 120
Hz ProMotion** display the app actually ships on.

It exists because the automated harness can't reach a physical iOS device:

* `npm run perf:web` / `perf:android` drive Chromium/the Android WebView over CDP.
* `npm run perf:ios` drives **Playwright's WebKit on the Mac** — the right *engine*, but not the
  iPad's CPU, GPU, or refresh rate.
* Apple exposes no CDP/automation socket for a physical device, so the device path is **Safari Web
  Inspector remote debugging**, driven by hand or by a console script.

Throughout, every step is tagged **[Mac]** or **[iPad]** so it's clear where the action happens.

---

## Which approach to use

| Approach                                                          | Fidelity                                                         | Determinism                                                       | Use when                                                                     |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **A. Safari on iPad → Mac's `/dev/engine` preview** (recommended) | Real iPad WebKit + GPU + ProMotion (Safari shell, not WKWebView) | High — driven by the same scenario as `perf:undo` via the console | You want repeatable engine numbers (undo/commit/draw cost at real op volume) |
| **B. Native Capacitor app, hand-driven**                          | Real WKWebView app shell *and* hardware                          | Low — gestures by hand, no `getUndoDebug`                         | You specifically need to rule out a WKWebView-vs-Safari difference           |

Safari-on-iPad and the native WKWebView run the **same** WebKit engine, so for engine/canvas
performance Approach A is the right default; Approach B is a sanity check on the app shell. Both are
documented below.

---

## One-time setup

**[iPad]** Enable Web Inspector: **Settings → Apps → Safari → Advanced → Web Inspector = ON** (on
older iOS: **Settings → Safari → Advanced → Web Inspector**).

**[Mac]** Enable the Develop menu: **Safari → Settings… (⌘,) → Advanced tab →** check **"Show
features for web developers"** (older macOS: **"Show Develop menu in menu bar"**). A new **Develop**
menu appears in the menu bar between **Bookmarks** and **Window** — it is *not* inside the "Safari"
application menu.

**[Mac] + [iPad]** Connect the iPad to the Mac by **USB**, unlock the iPad, and tap **Trust This
Computer** when prompted. Put both devices on the **same Wi‑Fi** network.

---

## Approach A — Safari on iPad against the Mac's `/dev/engine` build

### A1. Build the instrumented bundle — **[Mac]**

The engine's `performance.mark/measure` calls only exist when built with `PERF_MARKS=true`, and the
`/dev/engine` harness route (which exposes `window.__engine`, including `getUndoDebug()`) only loads
when `PUBLIC_ENABLE_DEV_HARNESS=true`:

```sh
PERF_MARKS=true PUBLIC_ENABLE_DEV_HARNESS=true npm run build
```

### A2. Serve it on the LAN — **[Mac]**

```sh
npm run perf:serve
```

This serves the build on `0.0.0.0:4173` with the `/dev/*` harness routes unlocked
(`PUBLIC_ENABLE_DEV_HARNESS` is read at **runtime** via `$env/dynamic/public`, so it must be set for
the server, which `perf:serve` does; `--host` exposes it beyond localhost). It prints the
**Network** URL to use from the iPad. Leave it running in its own terminal — and stop it before
`perf:replay` (same port).

Find the Mac's LAN IP (Wi‑Fi is usually `en0`; try `en1` if blank):

```sh
ipconfig getifaddr en0
```

### A3. Open the harness — **[iPad]**

In **Safari on the iPad**, go to `http://<mac-lan-ip>:4173/dev/engine` (e.g.
`http://192.168.1.42:4173/dev/engine`). You should see a blank canvas — that's the engine harness.
Leave this tab in the foreground.

### A4. Attach the Web Inspector — **[Mac]**

**Develop → [your iPad's name] → `…/dev/engine`.** A Web Inspector window opens, remote-debugging
that iPad page. (There's a **Develop → [device] → Connect via Network** toggle if you'd rather not
stay tethered after the first connection.)

### A5. Start a Timeline recording — **[Mac]**

In Web Inspector → **Timelines** tab → click the record button. This captures the frame/GPU view, so
you can *see* whether the commit's paper copy drops a ProMotion frame at finger-lift. (Optional but
recommended — the console table in A6 gives the raw engine timings either way.)

### A6. Drive the scenario — **[Mac]**

In Web Inspector → **Console** tab, paste the **entire contents** of
[`scripts/perf/ipad-console-driver.js`](../../../scripts/perf/ipad-console-driver.js) and press
Enter. It runs on the iPad page and:

* resizes the canvas to the full iPad screen (so the raster is the real on-device size),
* preflights the build with a probe stroke — if the probe emits no `engine.commit` measure,
  `PERF_MARKS` was off in the build and the driver bails immediately with a rebuild message instead
  of stalling through every undo wait,
* drives four real-volume scenarios — 22 long ~1200-op squiggles, 22 five-finger ~2400-op drags, 22
  crayon squiggles, and 22 crayon reversal-scribbles (mid-stroke pass splits) — matching
  `npm run perf:undo`; 22 strokes runs two past the depth-20 cap so the overflow path executes, and
  each scenario resets to blank paper **and** zero history first so its counts are its own,
* prints a `console.table` with, per scenario: `snapshots` / `blob KB`, **`snap copy max ms`** (the
  paper copy alone, `engine.snapshot`), **`fold max ms`** (rendering the committed ops,
  `engine.fold`), **`commit max ms`** (the stroke-end hitch), **`undo avg/p95/max ms`** (live blit
  vs deep blob decode), and the real `history MB` — then the ADR-0066 gates verbatim.

Keep the iPad screen awake and the tab foregrounded while it runs (a minute or two).

### A7. Stop and export — **[Mac]**

Stop the Timeline recording, then export it (**Timelines** tab → export icon → save a `.json`, e.g.
under `perf-profiles/web-inspector-timeline/`) and analyze it with the **dedicated** Web Inspector
analyzer:

```sh
npm run perf:ios:analyze -- perf-profiles/web-inspector-timeline/<export>.json
```

> **Not** `perf:analyze`. The Web Inspector export is a different shape from a Chrome trace
> (`{recording:{records, markers, samples}}`), and `perf:analyze` would read it as empty. Three
> things to know about the format, all handled by `perf:ios:analyze`:
>
> * It records `performance.mark()` as `markers` but **not** `performance.measure()`, so engine.\*
>   durations aren't stored directly — the analyzer recovers each op's main-thread cost from the
>   smallest timeline **record** spanning the mark (the commit's paper copy lands inside the
>   pointerup record; an undo inside its rAF record).
> * `markers` is a **ring buffer** — a long session keeps only the most recent marks (the analyzer
>   warns when the first mark is far past the recording start). Keep the driven scenario short, or
>   run one scenario per recording.
> * `performance.now()` is clamped to **~1 ms**, so sub-ms values are at the clock floor — read them
>   as "effectively free," not precise.
>
> GPU-side cost (the canvas raster) shows in the **paint/composite** records, not in the engine
> marks: the canvas is GPU-accelerated, so issuing draw calls is cheap on the main thread and
> rasterization is deferred.

---

## Approach C — Record real finger input, replay it through the harness (best fidelity for the profiler)

Instead of having the harness generate synthetic strokes, capture your own finger input on the
device once and feed it into the profiler. The replay reproduces the real op stream **and** real
frame pacing, and reports exactly how the engine stored *your* strokes (snapshot depth / blob
bytes).

### C1. Serve the app on the LAN — **[Mac]**

Build once, then serve (same as A1–A2):

```sh
PERF_MARKS=true PUBLIC_ENABLE_DEV_HARNESS=true npm run build
npm run perf:serve
```

Recording uses the **real app at the root** (`/`), not `/dev/engine`.

### C2. Record — **[iPad]** + **[Mac]**

1. **[iPad]** Open `http://<mac-lan-ip>:4173/` (the normal app).
2. **[Mac]** Attach Web Inspector (Develop → [iPad] → the page) and paste the whole of
   [`scripts/perf/ipad-recorder.js`](../../../scripts/perf/ipad-recorder.js) into the **Console**.
   It starts recording immediately.
3. **[iPad]** Draw, change colors, erase, undo — with your fingers or the Apple Pencil, however a
   real session goes. The recorder captures **every pointer event on the page** (canvas strokes and
   UI-targeted events alike, each with its target element, `buttons`, and pen pressure),
   pointer-capture transitions, and the UI actions it recognizes (color / size / eraser / undo /
   clear).
4. **[Mac]** When done, in the console: `__rec.stop()` then **`copy(__rec.json())`** (Safari's
   `copy()` puts it on the **Mac** clipboard). Paste into a file, e.g.
   `perf-profiles/recordings/my-session.json`.

> **Input-bug diagnosis, not just perf.** Because the recording shows exactly what WebKit delivered
> and to which element, it doubles as the ground truth for dropped-input bugs. `__rec.diagnose()`
> (also run automatically by `__rec.stop()`) scans for the known WebKit merged-stream signature —
> contact `pointermove`s with **no** preceding `pointerdown` anywhere (e.g. the first Apple Pencil
> stroke after a color-swatch tap) — and reports which element(s) received them: WebKit sometimes
> hit-tests the down-less moves onto the canvas and sometimes keeps delivering them to the control
> the merged tap started on. Only the canvas-targeted events are replayed by `perf:replay`; the
> UI-targeted ones (`on` field present) are kept purely as diagnostics.

### C3. Replay under the profiler — **[Mac]**

```sh
npm run perf:replay -- --recording=perf-profiles/recordings/my-session.json
```

It opens `/dev/engine`, sizes the canvas to the recorded device, replays your input at its recorded
timing (add `--turbo` for as-fast-as-possible, `--throttle=N` to emulate a slower CPU), captures a
CDP trace + engine marks, and writes the usual `report.md` plus `replay-summary.md` (how your input
was stored + engine.draw/commit/undo cost). The replay runs in **headless Chromium on the Mac**, so
it's for op-stream/algorithm fidelity from real input — not on-device hardware numbers (for those,
profile the replay or your live drawing on the iPad via Approach A/B).

> The replay (`perf:replay`) takes over port 4173 and will stop the `--host` recording server.
> Record first, then replay.

---

## Approach B — Native WKWebView app, hand-driven

Use only to confirm the app shell behaves like Safari.

1. **[Mac]** Build + run the native app with marks on: `PERF_MARKS=true npm run ios` (see the
   `mobile` skill for the iOS toolchain and Simulator-vs-device specifics).
2. **[iPad]** Launch the Splotch app; draw something so the canvas is live.
3. **[Mac]** **Develop → [your iPad's name] → [the app's WebView entry]** to attach Web Inspector to
   the app (not Safari).
4. **[Mac]** Start a **Timelines** recording.
5. **[iPad]** By hand: draw one long continuous scribble (several seconds), then tap **undo**.
   Repeat a few times; try a five-finger drag too.
6. **[Mac]** Stop the recording. Read `engine.draw` / `engine.snapshot` / `engine.undo` in the
   Timeline's user-timing track, or export and `npm run perf:ios:analyze -- <export>.json`.

There's no `window.__engine` here (the real app doesn't expose the harness), so op counts aren't
controlled and `getUndoDebug()` is unavailable — you're reading the engine marks off organic input.

---

## Reading the results

* **`undo p95 ms` < 50** → the ADR-0066 undo gate (the driver computes p95 per scenario and prints
  the gate line verbatim). Shallow undos (the K_LIVE = 2 live rasters) should be a near-free blit;
  deep undos add a lossless blob decode — both are one-off costs at button-press.
* **`commit max ms` ≈ one 120 Hz frame ≈ 8.3 ms** → the ADR-0066 commit-hitch gate. The commit runs
  once at finger-lift, off the draw frame, but a commit slower than one frame can still drop a frame
  the instant the stroke ends; attribute a hot one via its inner columns — `snap copy max ms`
  (`engine.snapshot`, the paper copy alone) vs `fold max ms` (`engine.fold`, rendering the ops).
  Cross-check the Timeline for a long frame at that moment. This is the cost the desktop harness can
  only estimate — SwiftShader exaggerates it wildly.
* **`history MB`** → real raster memory for that scenario
  (`(live rasters + the paper) × max(w,h)² × 4 bytes + blob bytes`). On a 12.9″ iPad Pro the square
  raster is ~28 MB, so the resident tier is ~85 MB plus single-digit-MB blobs per deep entry —
  verify against the ≲150 MB gate with the Xcode memory gauge (no jetsam).

---

## Caveats & troubleshooting

* **WebKit clamps `performance.now()` to ~1 ms**, so sub-millisecond marks read as 0. Fine at our
  scale (telling a ~10 ms paper copy from a hundreds-of-ms hang), but don't trust the second
  decimal.
* **Safari ≠ WKWebView**, but the engine is identical; the difference is the app shell, which
  Approach B checks if needed.
* **iPad not under the Develop menu** → re-confirm the iPad's Web Inspector toggle, re-seat the USB
  cable, re-tap **Trust This Computer**, and make sure the iPad is unlocked with the Safari tab
  foregrounded.
* **Page won't load over LAN** → confirm both devices are on the same Wi‑Fi, that
  `npm run perf:serve` is running (it serves on `0.0.0.0:4173` — a plain `npm run preview` binds
  localhost only and lacks the harness flag), and that you used the Mac's LAN IP (not `localhost`).
  A firewall prompt on the Mac may need approving.
* **`window.__engine` is undefined** → the build wasn't made with `PUBLIC_ENABLE_DEV_HARNESS=true`,
  or you're not on the `/dev/engine` route.
* **No `engine.*` marks in the export** → the build wasn't made with `PERF_MARKS=true`.
