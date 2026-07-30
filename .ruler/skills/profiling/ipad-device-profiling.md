<!-- cspell:ignore promotion wkwebview ipconfig -->

# Capturing a performance profile on a real iPad

This is the runbook for profiling on a **physical iPad** — the highest-fidelity target we have for
the drawing engine, because it's the real **WebKit/JavaScriptCore engine + Apple GPU + 120 Hz
ProMotion** display the app actually ships on.

The gates run is automated: **`npm run perf:ipad`** drives it end to end. This file covers the
one-time device setup that command needs, the Timeline recording it deliberately does *not* do, and
the by-hand fallback for when it won't attach.

Where the device sits among the harness targets:

* `npm run perf:web` / `perf:android` drive Chromium/the Android WebView over CDP.
* `npm run perf:ios` drives **Playwright's WebKit on the Mac** — the right *engine*, but not the
  iPad's CPU, GPU, or refresh rate.
* Apple exposes no **CDP** endpoint on a physical device — but it does expose Safari's own **WebKit
  Inspector Protocol** over USB, which carries `Runtime.evaluate` and `Console.messageAdded`.
  `npm run perf:ipad` speaks that protocol directly; Safari's Web Inspector is the same channel with
  a UI on top.

Throughout, every step is tagged **⟨Mac⟩** or **⟨iPad⟩** so it's clear where the action happens.

---

## Which approach to use

| Approach                                                          | Fidelity                                                         | Determinism                                                       | Use when                                                                     |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **A. Safari on iPad → Mac's `/dev/engine` preview** (recommended) | Real iPad WebKit + GPU + ProMotion (Safari shell, not WKWebView) | High — driven by the same scenario as `perf:undo` via the console | You want repeatable engine numbers (undo/commit/draw cost at real op volume) |
| **B. Native Capacitor app, hand-driven**                          | Real WKWebView app shell *and* hardware                          | Low — gestures by hand, no `getUndoDebug`                         | You specifically need to rule out a WKWebView-vs-Safari difference           |

Safari-on-iPad and the native WKWebView run the **same** WebKit engine, so for engine/canvas
performance Approach A is the right default; Approach B is a sanity check on the app shell. Both are
documented below.

Approach A has two forms, and they produce the same table: **`npm run perf:ipad`** (next section)
and the by-hand paste in A1–A4. Reach for the command first — the hand path exists for when it won't
attach, and for the Timeline run in A5–A6, which stays manual.

---

## One-time setup

**⟨iPad⟩** Enable Web Inspector: **Settings → Apps → Safari → Advanced → Web Inspector = ON** (on
older iOS: **Settings → Safari → Advanced → Web Inspector**).

**⟨Mac⟩** Enable the Develop menu: **Safari → Settings… (⌘,) → Advanced tab →** check **"Show
features for web developers"** (older macOS: **"Show Develop menu in menu bar"**). A new **Develop**
menu appears in the menu bar between **Bookmarks** and **Window** — it is *not* inside the "Safari"
application menu.

**⟨Mac⟩ + ⟨iPad⟩** Connect the iPad to the Mac by **USB**, unlock the iPad, and tap **Trust This
Computer** when prompted. Put both devices on the **same Wi‑Fi** network.

**⟨Mac⟩** For `npm run perf:ipad`, install the USB relay once:

```sh
brew install ios-webkit-debug-proxy
```

---

## The automated gates run — `npm run perf:ipad` — **⟨Mac⟩**

```sh
npm run perf:ipad                                # all four scenarios
npm run perf:ipad -- --scenarios=crayon-scribbles # one of them
npm run perf:ipad --ignore-scripts               # skip the rebuild
```

One command does what A1–A4 do by hand: rebuilds the instrumented bundle, serves it on the LAN,
attaches to Safari on the device, **navigates the tab to `/dev/engine`**, injects
`ipad-console-driver.js`, and prints the same table plus the driver's warnings. It writes
`ipad-gates.json` (the exact values, so nothing depends on copying the table out) to
`perf-profiles/<timestamp>-ipad-<device>/`. A full run is a couple of minutes.

**⟨iPad⟩ Before running it:** unlock the device and leave **Safari open on at least one tab**. The
relay lists Safari's tabs, so a device with no tab exposes nothing to attach to — that one step is
manual and cannot be automated away. Keep the screen awake and the tab foregrounded while it runs;
iOS throttles a backgrounded tab and the numbers stop meaning anything.

Navigating the tab is the point of the automation as much as the driving is: a tab left open from an
earlier run keeps serving that run's bundle, and nothing about its URL says so. The command also
assigns **every** `window.__perf*` override on each run, so a leftover `window.__perfScenarios`
can't silently scope a "full" run down to one scenario. Both of those cost real measurements before
it existed.

Flags: `--scenarios=key1,key2`, `--strokes=N`, `--ops=N`, `--url=`, `--port=N`, `--device-id=` (pick
among several attached devices), `--no-serve` (attach to a server you started yourself).

Read the table against [Reading the results](#reading-the-results) — the gates and the column
meanings are identical to the hand-driven run.

**What it deliberately does not do:** record a Timeline. The protocol has a `Timeline` domain, but
its event stream is not the shape `npm run perf:ios:analyze` parses, so a recording still means Web
Inspector by hand — A5 and A6 below.

It also cannot see the real screen at all. That is the next section.

---

## The real screen — `npm run perf:ipad:frames` — **⟨Mac⟩**

```sh
npm run perf:ipad:frames                              # hand-drawn, full phase sweep
npm run perf:ipad:frames -- --drive                    # synthetic input, no human hand
npm run perf:ipad:frames -- --phases=blank,page --contact-seconds=20
npm run perf:frames:analyze -- perf-profiles/<dir>/real-screen.json
```

**Why this exists.** `perf:ipad` reports every column ≤ 2 ms and clears every ADR-0066 gate on
hardware while the real app at `/` visibly lags. Both are true, because `/dev/engine` is a bare
canvas: no line-art overlay, no `PointerHalos`, no per-stroke Svelte reactivity. Those costs are
compositor/paint and unmarked-JS work — they make the device slower **without making any `engine.*`
measure larger**, so no amount of gates tuning can surface them. This command measures the screen
instead of the engine, on the surface users touch.

It opens `/` (not `/dev/engine`), injects `scripts/perf/real-screen-probe.js`, and records four raw
numeric tables which Node then turns into numbers (`real-screen-stats.mjs`):

| Metric                                                                  | What it answers                                                                                       |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| rAF delta over in-contact frames                                        | is the screen keeping up — see the 60 Hz caveat below                                                 |
| **input queue delay** (`event.timeStamp` → handler `performance.now()`) | did input sit waiting. Felt as lag with every frame on time                                           |
| **paint latency** (per move → next frame)                               | how stale the ink is when a frame runs                                                                |
| moves per in-contact frame, `getCoalescedEvents()`                      | input never delivered vs delivered merged vs **per-event work repeated within one presentable frame** |
| `engine.*` ms **inside late frames**                                    | is the drawing engine even in the stall                                                               |
| **finger-up → halo-gone**                                               | the whole lift path (reactivity + commit + a rendering update) in one number                          |
| undo history per lift (`getUndoDebug`)                                  | does stall onset track accumulated raster bytes                                                       |
| worst-frame forensics                                                   | *where* each freeze sat: after which event, with how many moves and which marks inside                |

### Hand-drawn vs `--drive`

Both matter, for opposite reasons.

* **Hand-drawn** (default) is the fidelity reference — real touch coalescing, real digitizer rate,
  real queue delay. An on-device banner drives the operator (they are holding the iPad, not reading
  the Mac's terminal): it asks for blank paper or a coloring page, waits until the DOM agrees, then
  says "draw!". A phase ends on banked **finger-down** time, so lifting pauses the clock.
* **`--drive`** dispatches one `pointermove` per frame — the rate WebKit coalesces real touch down
  to — from inside the frame loop, and drives the app's own coloring-book UI by selector to set up
  each phase. It needs no human, so it is the only way to get **identical input per phase**, which
  attribution requires.

> **A hand-drawn A/B cannot attribute anything.** In the first capture a human ran 7 to 45 strokes
> per phase; the suppression deltas came out non-monotonic and the "worst" phase was simply the one
> where the operator happened to do 41 short strokes. Use hand-drawn runs to establish *what the lag
> is*, and `--drive` to establish *what causes it*.

> **What `--drive` cannot measure:** touch coalescing, ProMotion input pacing, and queue delay — a
> constructed event's `timeStamp` is set when the probe builds it, so `at - stamp` is ~0 by
> construction. Read those columns from a hand-drawn run only.

### The phase sweep

`blank` → `page` → `page-no-nudge` → `page-no-blend` → `page-no-halos` → `page-bare` → `page-again`.

Suppressions are stylesheet rules with `!important`, which beat the app's inline styles, so
**production carries no probe-only surface**:

* `nudge` pins `.paper-view`'s computed transform, so `DrawingCanvas.nudgeBlendLayer`'s per-event
  `translateZ` epsilon no longer changes a computed value. The style write still happens; the
  compositor damage it exists to cause does not. **Do not rotate the device during a pinned phase**
  — the paper transform is frozen with it.
* `blend` forces `mix-blend-mode: normal` on `.paper-view`.
* `halos` sets `display: none` on `.brush-ring, .eraser-bubble`.

Nothing clears the paper between phases, so ink and undo history accumulate across a run. That is a
confound *and* the effect the reported lag scales with, so `page-again` repeats `page` verbatim at
the end: whatever separates the two is accumulation, and every suppression delta has to be read
against it.

### The one dev seam

`lib/boot/devHarnessSeam.ts` exposes the already-exported `getUndoDebug()` on `/` behind the same
gate as `routes/dev/*` (`PUBLIC_ENABLE_DEV_HARNESS`, which the Netlify deploy never sets). It is
**read-only on purpose**: a probe that can change the app can invalidate its own measurement.
Nothing else about the app is touched — the synthetic hand loads a coloring page by clicking the
real UI.

### Counting the rendering work — `--timeline`

```sh
npm run perf:ipad:frames -- --drive --timeline --phases=page --contact-seconds=10
```

`Timeline.enable` + `Timeline.start` **do** work over the protocol and stream the full record tree —
`RenderingFrame`, `Composite`, `Paint`, `RecalculateStyles`, `Layout`, `EventDispatch`,
`FireAnimationFrame`. So the compositor side is reachable without a Web Inspector recording, with
one hard limit: **every record arrives with `startTime: 0` and `endTime: 0`**, mid-recording ones
included.

That means counts and structure, never durations — and no record can be placed in time, which is why
`--timeline` requires exactly one `--phases` key. It is also the specific reason the hand-driven
Timeline export above remains the only source of paint/composite **durations**.
(`Timeline.setInstruments` with an explicit list, and `setAutoCaptureEnabled: false`, were tried:
the rendering records stop arriving entirely.)

Counts still compare across conditions, which is what makes them worth having. Two results from the
first use, both against identical synthetic input:

* Suppressing the per-event blend nudge leaves `Composite` at **1.29 per frame either way**. WebKit
  composites once per frame no matter how many times the layer is damaged inside it, so a per-event
  nudge never multiplied recomposites — only style recalculations, which sat at **3.43 per frame**,
  tracking the input rate exactly.
* Coalescing that work to once per frame (PR #662) took `RecalculateStyles` from 3.43 to **1.32**
  per frame, left `Composite`/`Paint` unchanged, and added ~2 `FireAnimationFrame` per frame.

### Re-reading a capture

The probe records raw tables and computes nothing, so `perf:frames:analyze` recomputes every metric
from a saved `real-screen.json`. This is not a convenience: four metric definitions were wrong in
the first device capture (see the 60 Hz caveat, plus move gaps that spanned stroke boundaries, paint
latency that counted the idle after a finger-lift, and a finger-lift into an idle page reported as a
2.4-second hitch). All four were corrected against that capture with no re-drawing.

---

## Approach A — Safari on iPad against the Mac's `/dev/engine` build

A1–A4 are the hand-driven form of the section above; run them when `npm run perf:ipad` won't attach,
or when you want to watch a step. A5–A6 are the Timeline run, which has no automated form.

### A1. Build and serve the instrumented bundle — **⟨Mac⟩**

```sh
npm run perf:serve
```

One command does both. Its `preperf:serve` hook runs `npm run perf:build` — a production build with
`PERF_MARKS=true`, which is what bakes in the engine's `performance.mark/measure` calls and keeps
function names readable through minification — so the iPad always gets a fresh instrumented bundle
rather than whatever was last built. Pass `--ignore-scripts` to skip the rebuild when the bundle on
disk is already the one you want.

It then serves that build on `0.0.0.0:4173` with the `/dev/*` harness routes unlocked, which is what
makes `/dev/engine` (and its `window.__engine` / `getUndoDebug()`) reachable
(`PUBLIC_ENABLE_DEV_HARNESS` is read at **runtime** via `$env/dynamic/public`, so it must be set for
the server, which `perf:serve` does; `--host` exposes it beyond localhost). Leave it running in its
own terminal — and stop it before `perf:replay` (same port).

It prints the two URLs to open on the iPad:

```text
➜  Network: http://192.168.40.75:4173/
➜  Harness: http://192.168.40.75:4173/dev/engine
```

`scripts/perf/serve.mjs` wraps vite to print those. Bare `vite --host` advertises one URL per bound
interface, including the `169.254.x.x` link-local address macOS self-assigns to the virtual
interface it creates for a USB-tethered iPad — a dead end no browser can reach. The wrapper still
binds every interface (so `localhost` keeps working); it only filters what it advertises.

### A2. Open the harness — **⟨iPad⟩**

In **Safari on the iPad**, open the **Harness** URL from A1. You should see a blank canvas — that's
the engine harness. Leave this tab in the foreground. (The **Network** URL is the real app at `/`,
which is what Approach C records against.)

### A3. Attach the Web Inspector — **⟨Mac⟩**

**Develop → ⟨your iPad's name⟩ → `…/dev/engine`.** A Web Inspector window opens, remote-debugging
that iPad page. (There's a **Develop → ⟨device⟩ → Connect via Network** toggle if you'd rather not
stay tethered after the first connection.)

### A4. Gates run — **⟨Mac⟩**

The driver has **two modes, and they are separate runs.** This is the first: full op volume, **no
Timeline recording**, and its table is the ADR-0066 verdict. A4 tells you *how much*; A5 tells you
*where* and *whether a frame dropped*. Never try to get both from one run — the reasons are in A5.

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
  patch capture alone, `engine.snapshot`), **`fold max ms`** (rendering the committed ops,
  `engine.fold`), **`encode max ms`** (demoting cold snapshots to blobs, `engine.encode`),
  **`commit max ms`** (the stroke-end hitch, which the previous three attribute),
  **`undo
  avg/p95/max ms`** (live blit vs deep blob decode), and the real `history MB` — then the
  ADR-0066 gates verbatim.

Narrow it to some scenarios with `window.__perfScenarios = 'crayon-scribbles'` (comma-separated for
several) set in its own console statement first; unset runs all four. Keep the iPad screen awake and
the tab foregrounded while it runs (a minute or two).

Read the table against the gates in [Reading the results](#reading-the-results). If every row
passes, you're done — Approach A's whole point is these numbers, and A5–A6 exist only to explain a
row that doesn't pass.

### A5. Timeline run — **⟨Mac⟩**

Only worth doing once A4 has named a row to chase. The Timeline sees what the engine marks
structurally cannot: whether a ProMotion frame was actually **dropped** at finger-lift, and the
**paint/composite** cost of the canvas raster — the canvas is GPU-accelerated, so issuing draw calls
is cheap on the main thread and the marks *understate* the real cost.

It is a **separate run from A4**, in the driver's other mode, for a blunt reason: a recorded gates
run melts Web Inspector. Measured from one 117-second recording of a full run —

| What Web Inspector had to ingest | Count  | Share                          |
| -------------------------------- | ------ | ------------------------------ |
| `engine.draw` markers            | 52,850 | 99.7% of all markers           |
| Marks you were recording *for*   | 135    | 0.3%                           |
| `event-dispatched` records       | 52,943 | 13.9 MB                        |
| Screenshot records               | 68     | **34.8 MB of a 115 MB export** |

Web Inspector streams every one of those over USB, models them, and renders them into a UI that is
itself a WebKit app on your Mac. That is what pins it at 100% CPU — not your hardware.

**1. Turn off the instruments you aren't reading.** In the **Timelines** tab, uncheck at minimum
**Screenshots** (a third of the payload, and nothing here reads it) and **Network Requests**
(irrelevant to a canvas workload). Keep **JavaScript & Events** — the marks live there — and
**Layout & Rendering** for the paint/composite records.

**2. Switch the driver to timeline mode.** In the **Console**, as its own statement before pasting:

```js
window.__perfTimeline = true;
window.__perfScenarios = 'crayon-scribbles';
```

Timeline mode runs the same code path at roughly a twentieth of the volume — 6 strokes of ~200 ops
instead of 22 of ~1200. Draw marks and event records both scale with op count, so cutting ops cuts
the noise at its source. Six strokes is plenty for the shape of a commit — since ADR-0082 the
resident window is a byte budget, so thin strokes encode nothing at any depth, and a recording is
for where the time goes rather than for watching the tier demote. Override with
`window.__perfStrokes` / `window.__perfOps` in either mode.

Scenario keys are the `key` column of the A4 table — `long-squiggles`, `multi-finger`,
`crayon-squiggles`, `crayon-scribbles` — the same keys `npm run perf:undo --scenarios=` takes, so a
row that's hot here names the desktop scenario that reproduces it. Timeline mode **requires exactly
one**: you record because A4 flagged a specific row, and Web Inspector's marker ring buffer drops
the front of a longer run anyway. It refuses with the key list if you forget.

> **Timeline mode measures shape, not magnitude.** Shorter strokes make smaller patches and cheaper
> encodes, so its milliseconds are *not* gate numbers. Read it for where the time goes and whether a
> frame dropped; quote A4 for how much.

**3. Record.** **Timelines** tab → record button → paste the driver → let it finish → stop.

### A6. Export and analyze — **⟨Mac⟩**

Export the recording (**Timelines** tab → export icon → save a `.json`, e.g. under
`perf-profiles/web-inspector-timeline/`) and analyze it with the **dedicated** Web Inspector
analyzer:

```sh
npm run perf:ios:analyze -- perf-profiles/web-inspector-timeline/<export>.json
```

> **Not** `perf:analyze`. The Web Inspector export is a different shape from a Chrome trace
> (`{recording:{records, markers, samples}}`), and `perf:analyze` would read it as empty. Three
> things to know about the format, all handled by `perf:ios:analyze`:
>
> * It records `performance.mark()` as `markers` but **not** `performance.measure()`, so engine.\*
>   durations aren't stored directly — the analyzer recovers most ops' main-thread cost from the
>   smallest timeline **record** spanning the mark (the commit's patch capture lands inside the
>   pointerup record). `engine.undo` is the one exception: a deep undo spans multiple tasks, so the
>   analyzer pairs its own `:start`/`:end` marks instead of using a record.
>   `engine.commit`/`engine.draw`/`engine.scanEmpty` also emit an `:end` mark now (closing on every
>   early return, so a buffered edge-swipe candidate or a hover commit can't leave its `:start`
>   unmatched), but since those three stay single-slice, the analyzer only uses the pair to flag an
>   orphaned start — their reported cost still comes from the enclosing record.
> * `markers` is a **ring buffer** — a long session keeps only the most recent marks (the analyzer
>   warns when the first mark is far past the recording start). This is one of the reasons A5 is a
>   separate, smaller run than A4 — see its instrument and timeline-mode steps.
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

### C1. Serve the app on the LAN — **⟨Mac⟩**

Same as A1 — build and serve in one command:

```sh
npm run perf:serve
```

Recording uses the **real app at the root** (`/`), not `/dev/engine`.

### C2. Record — **⟨iPad⟩** + **⟨Mac⟩**

1. **⟨iPad⟩** Open `http://<mac-lan-ip>:4173/` (the normal app).
2. **⟨Mac⟩** Attach Web Inspector (Develop → ⟨iPad⟩ → the page) and paste the whole of
   [`scripts/perf/ipad-recorder.js`](../../../scripts/perf/ipad-recorder.js) into the **Console**.
   It starts recording immediately.
3. **⟨iPad⟩** Draw, change colors, erase, undo — with your fingers or the Apple Pencil, however a
   real session goes. The recorder captures **every pointer event on the page** (canvas strokes and
   UI-targeted events alike, each with its target element, `buttons`, and pen pressure),
   pointer-capture transitions, and the UI actions it recognizes (color / size / eraser / undo /
   clear).
4. **⟨Mac⟩** When done, in the console: `__rec.stop()` then **`copy(__rec.json())`** (Safari's
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

### C3. Replay under the profiler — **⟨Mac⟩**

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

1. **⟨Mac⟩** Build + run the native app with marks on: `PERF_MARKS=true npm run ios` (see the
   `mobile` skill for the iOS toolchain and Simulator-vs-device specifics).
2. **⟨iPad⟩** Launch the Splotch app; draw something so the canvas is live.
3. **⟨Mac⟩** **Develop → ⟨your iPad's name⟩ → ⟨the app's WebView entry⟩** to attach Web Inspector to
   the app (not Safari).
4. **⟨Mac⟩** Start a **Timelines** recording.
5. **⟨iPad⟩** By hand: draw one long continuous scribble (several seconds), then tap **undo**.
   Repeat a few times; try a five-finger drag too.
6. **⟨Mac⟩** Stop the recording. Read `engine.draw` / `engine.snapshot` / `engine.undo` in the
   Timeline's user-timing track, or export and `npm run perf:ios:analyze -- <export>.json`.

There's no `window.__engine` here (the real app doesn't expose the harness), so op counts aren't
controlled and `getUndoDebug()` is unavailable — you're reading the engine marks off organic input.

---

## Reading the results

* **`undo p95 ms` < 50** → the ADR-0066 undo gate (the driver computes p95 per scenario and prints
  the gate line verbatim). Undos inside the resident byte budget (ADR-0082) should be a near-free
  blit; deep undos add a lossless blob decode — both are one-off costs at button-press.
* **`commit max ms` ≈ one 120 Hz frame ≈ 8.3 ms** → the ADR-0066 commit-hitch gate. The commit runs
  once at finger-lift, off the draw frame, but a commit slower than one frame can still drop a frame
  the instant the stroke ends; attribute a hot one via its inner columns — `snap copy max ms`
  (`engine.snapshot`, the patch capture alone) vs `fold max ms` (`engine.fold`, rendering the ops).
  Cross-check the Timeline for a long frame at that moment. This is the cost the desktop harness can
  only estimate — SwiftShader exaggerates it wildly.
* **`history MB`** → real raster memory for that scenario
  (`(hot rasters + the paper) × max(w,h)² × 4 bytes + blob bytes`). On a 12.9″ iPad Pro the square
  raster is ~28 MB, so the resident tier is ~85 MB plus single-digit-MB blobs per deep entry —
  verify against the ≲150 MB gate with the Xcode memory gauge (no jetsam).

---

## What the `engine.*` marks structurally cannot see

Recorded so the next person doesn't re-derive it: **the gates can pass while the app feels slow, and
that is not a gates bug.** Measured on iPad13,8 / iPadOS 26.5, drawing on `/`:

|                                             | measured                |                            |
| ------------------------------------------- | ----------------------- | -------------------------- |
| `engine.draw`                               | ~0.06 ms mean, 1 ms max | per `pointermove`          |
| `engine.commit`                             | 1–3 ms max              | the finger-lift path       |
| `engine.*` **total inside a 1422 ms frame** | **5 ms**                | —                          |
| that frame's actual duration                | **1422 ms**             | 154 pointermoves inside it |

Every marked span is at or under the clock floor while frames stop arriving for over a second. The
marks are not wrong — they measure main-thread spans inside the engine, and the cost is neither.
What they cannot see:

* **Compositing and paint.** The canvas is GPU-accelerated, so issuing draw calls is cheap and
  rasterization is deferred; a `mix-blend-mode` plate that has to re-read its backdrop, or a
  compositing tree that churns per stroke, costs nothing a mark can hold.
* **Unmarked main-thread work** — Svelte reactivity, style recalc, layout — on the same paths.
* **Frame production itself.** Safari exposes no `longtask` entry type and no frame-timing API, so
  rAF deltas are the only proxy, and they measure when rAF *ran*, not when a pixel reached the
  glass.

The practical rule: `perf:ipad` answers "is an engine operation expensive". `perf:ipad:frames`
answers "did the screen keep up". A regression hunt that starts with the first one on a felt-lag
report will find nothing, comfortably.

---

## Timeline on `/`, hand-drawn — **⟨Mac⟩** + **⟨iPad⟩**

The definitive instrument for the compositor side, and the only one that shows **paint** and
**composite** records directly. Do this when `perf:ipad:frames` has named a phase to chase and you
need to know what the rendering pipeline was doing inside its stalls.

It is A5–A6's procedure pointed at `/` instead of `/dev/engine`, with two differences that make it
*more* tractable than the gates-run Timeline the runbook warns about:

1. **Hand-drawing is required, not a compromise.** `perf:ios:analyze` carries its own warning that
   frame durations are unreliable when input came from the synchronous console driver (a whole
   stroke dispatched in one blocking tick). A hand-drawn session on `/` has no such problem — and
   the real-screen findings only reproduce under a real hand anyway.
2. **The volume is manageable.** A few hundred ops in a hand-drawn session, against the ~53k
   `engine.draw` markers that pin Web Inspector at 100% CPU on a gates run.

Still uncheck **Screenshots** (34.8 MB of a 115 MB export) and **Network Requests** in the
**Timelines** tab, and keep **Layout & Rendering** — the paint/composite records are the entire
point here.

```sh
npm run perf:serve                                    # ⟨Mac⟩ serve the instrumented build
# ⟨iPad⟩ open the Network URL (the app at /, NOT the Harness URL)
# ⟨Mac⟩ Develop → ⟨iPad⟩ → the page → Timelines → record
# ⟨iPad⟩ draw by hand: long slow strokes, then rapid short ones, on a coloring page
# ⟨Mac⟩ stop, export the .json, then:
npm run perf:ios:analyze -- perf-profiles/web-inspector-timeline/<export>.json
```

Read the **paint** and **composite** rows against the engine rows: the shape to expect from the
findings above is negligible engine cost beside long rendering-side records.

---

## A/B-ing two builds on one device — **⟨Mac⟩**

Bisecting a rendering cost means recording the same hand-drawn gesture against several builds. Doing
that by switching branches wastes the session on rebuilds and invites comparing a build to itself,
so serve every build at once — a **git worktree per branch, `node_modules` symlinked in, one port
each**:

```sh
git worktree add /tmp/splotch-main origin/main
ln -s "$PWD/node_modules" /tmp/splotch-main/node_modules
(cd /tmp/splotch-main && npm run perf:build \
  && PUBLIC_ENABLE_DEV_HARNESS=true node scripts/perf/serve.mjs --port=4174 --strict-port &)
```

`--strict-port` is load-bearing: without it a taken port silently slides to the next one and the two
URLs you then hand the iPad are not the builds you think. Remove the worktrees
(`git worktree
remove`) when the comparison is done.

**Verify each build by behavior before recording against it.** Two ways this rig produces a
meaningless A/B, both of which look completely normal in the output:

* **A single `cd` ahead of two backgrounded launches puts both servers on the same worktree** — an
  "A/B" comparing a commit to itself. Check each server's actual working directory, not the command
  you meant to type.
* **Grepping the served bundle is not verification.** Fetching a build's entry scripts to check for
  a change reported "absent" for a build that had it — the code was in a lazily-loaded chunk. Assert
  on behavior through the seam instead: `window.__drawingDebug.getUndoDebug().rasterBytes` after a
  stroke, `document.querySelector('#drawingCanvas').width` for a render-scale change.

Then compare the two exports on the rate that survives a different amount of drawing in each:

```sh
npm run perf:ipad:strip-layers                     # bisect rung: drop the optional layers, no reload
# record the Timeline on each build by hand, export both, then:
npm run perf:timeline:compare -- <baseline>.json <candidate>.json
```

`perf:timeline:compare`'s headline row is **long composites per commit** — read that, not the
totals. `perf:ipad:strip-layers` injects `display: none` for the optional compositing layers over
the inspector connection, so record the Timeline immediately afterwards; a reload undoes it.

The 2026-07 iPad bisect used this rig to close the visible-lag investigation. A 1× render-scale
diagnostic reduced long composites from 1.0 to 0.02 per commit and active-window composite time from
543.7 to 171.4 ms per second; the operator described it as “not too bad.” Hiding every optional
layer at 2× did not improve normalized composite time and felt worse. ADR-0015 therefore caps
production rendering at 1.5×: its physical-device verification recorded 0.13 long composites per
commit and 422.6 composite ms per drawing second. The cost scales with backing-store area, not the
optional layers.

---

## Caveats & troubleshooting

* **Stop the perf servers before running Playwright.** `perf:serve` holds **4173**, which is also
  the port the E2E suite's preview server wants; with one running, `npm run test:e2e` fails to start
  rather than reporting a port conflict.

* **Safari gives web content a 60 Hz `requestAnimationFrame` beat — even on a 120 Hz ProMotion iPad
  Pro.** Measured on iPad13,8 / iPadOS 26.5: a bare rAF sampler reports **16–17 ms both idle and
  while animating**. So a drawing loop pacing at 17 ms is *at the ceiling*, not failing, and a fixed
  8.33 ms budget reports a perfectly-paced capture as 64% late — which the first version of
  `perf:ipad:frames` did. `perf:frames:analyze` derives the beat per capture from the observed
  deltas instead of assuming one.

  Two consequences worth carrying: **ADR-0066's 8.3 ms commit-hitch gate is stricter than the
  platform** on Safari/iPad (the presentable frame is 16.7 ms), and **input outruns frames** — a
  digitizer delivering 120 Hz+ into a 60 Hz frame means per-`pointermove` work runs 2–4× per frame
  it can possibly be shown in.
* **WebKit clamps `performance.now()` to ~1 ms**, so sub-millisecond marks read as 0. Fine at our
  scale (telling a ~10 ms patch capture from a hundreds-of-ms hang), but don't trust the second
  decimal.
* **A synthetic-input run is not a substitute for a hand.** One `pointermove` per frame measured
  *perfectly clean* on device — zero stalls in every phase — on the same build where a hand stalled
  for 1.4 s. Use `--drive` for A/B attribution (identical input per phase) and a hand-drawn run to
  establish that the lag is present at all.
* **Safari ≠ WKWebView**, but the engine is identical; the difference is the app shell, which
  Approach B checks if needed.
* **iPad not under the Develop menu** → re-confirm the iPad's Web Inspector toggle, re-seat the USB
  cable, re-tap **Trust This Computer**, and make sure the iPad is unlocked with the Safari tab
  foregrounded.
* **`perf:ipad` says "No iOS device on the inspector relay"** → the same causes as the Develop-menu
  entry above; the relay and the Develop menu read the same channel, so if one can't see the device
  neither can the other. Check the Develop menu first — it's the faster signal.
* **`perf:ipad` says "The iPad exposes no Safari pages"** → the device is attached but Safari has no
  tab to attach to. Open Safari on the iPad (any page) and re-run; the command navigates whatever
  tab it finds.
* **`perf:ipad` reports the driver stopped early** → it surfaces the driver's own `console.error`
  verbatim, so read that message: the two it raises are a build without `PERF_MARKS=true` and an
  unknown `--scenarios=` key.
* **More than one `Network:` URL** → `perf:serve` filters out link-local addresses but still prints
  every genuinely-routable one, so a machine on a VPN or with a second active adapter shows several.
  The Wi‑Fi one is the one the iPad can reach — `ipconfig getifaddr en0` names it. Whichever you
  use, take it from the current run: it's a DHCP lease, not a fixed address.
* **Page won't load over LAN** → confirm both devices are on the same Wi‑Fi (a guest SSID with
  client isolation blocks this even though both say "same network"), that `npm run perf:serve` is
  running (it serves on `0.0.0.0:4173` — a plain `npm run preview` binds localhost only and lacks
  the harness flag), and that you used the Mac's LAN IP (not `localhost`). A firewall prompt on the
  Mac may need approving.
* **`window.__engine` is undefined** → paste this to see which case it is:

  ```js
  ({
    url: location.href,
    engine: typeof window.__engine,
    sw: navigator.serviceWorker?.controller?.scriptURL ?? null,
  });
  ```

  A `url` that isn't `/dev/engine` means you opened the **Network** URL (the plain app) instead of
  the **Harness** one. The right `url` with no engine means the tab is stale — reload it. If `sw` is
  non-null and a reload doesn't help, a service worker is serving the page from cache: the app is a
  PWA whose NetworkFirst handler falls back to the cache, so a tab opened while the server was down
  keeps serving a build with no harness on it. Unregister and reload:

  ```js
  navigator.serviceWorker.getRegistrations()
    .then((rs) => Promise.all(rs.map((r) => r.unregister())))
    .then(() => location.reload());
  ```

  Failing all that, confirm Web Inspector is attached to the `…/dev/engine` tab and not another one
  — the Develop submenu lists every open tab. Serving with anything other than `npm run perf:serve`
  also does it: `PUBLIC_ENABLE_DEV_HARNESS` gates the route at runtime, on the server.
* **No `engine.*` marks in the export** → the served build wasn't made with `PERF_MARKS=true`.
  `npm run perf:serve` rebuilds with it via `preperf:serve`, so this means the rebuild was skipped
  (`--ignore-scripts`) or the bundle is being served some other way.
