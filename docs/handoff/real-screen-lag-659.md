# Handoff — real-screen lag on iPad (issue #659)

> 2026-07-29 · branch `capture-real-screen-perf` · PR pending · Instrument, capture and attribute
> the visible drawing lag on `/` on a physical iPad, where the ADR-0066 engine gates pass but the
> screen does not keep up.

## Objective & non-goals

**Objective.** Build instruments that make the felt lag visible as numbers on the **real app surface
(`/`)** on real hardware, attribute it to a named subsystem, and land a repeatable way to
re-measure. Then ideate fixes and try a couple.

Working session grant (2026-07-29, autonomous overnight): throwaway test seams on the canvas are
acceptable **for capture**; the merge-worthy outcome is a non-invasive dev seam that does not
complicate production. Also asked for: a device-free replication (Playwright) so a baseline does not
require plugging in an iPad.

**Non-goals.** Raising or re-tuning the ADR-0066 gates. Touching the undo/history tiering
(ADR-0078). Shipping a fix as part of the capture work — a fix lands only with a measured
before/after.

## Why the existing numbers are clean while the screen lags

`npm run perf:ipad` (#655) reports every column ≤ 2 ms on iPadOS 26.5 and clears every gate. It
measures `engine.*` main-thread spans on `/dev/engine`, a bare canvas with **no line-art overlay, no
`PointerHalos`, and no Svelte reactivity on the stroke path**. Four real-screen costs are therefore
structurally invisible to it (issue #659 lists them):

1. `DrawingCanvas.nudgeBlendLayer` toggles a `translateZ` epsilon **once per input event** so the
   overlay's `mix-blend-mode` recomposites against current canvas pixels (the #307 fix). Gated on
   `overlayUrl()`, so blank paper pays nothing and `/dev/engine` never pays.
2. `PointerHalos` — one DOM element per active pointer, a `$state` write + transform per
   `pointermove`.
3. Per-stroke Svelte reactivity (`strokeCount++`, `canUndo` fan-out) on the pointerup path.
4. Real paper geometry is contain-fit/aspect-locked, so `paperBytes` — and with it the encode
   threshold — differs from the harness.

All four are compositor/paint or unmarked-JS costs: they make the device slower **without making any
`engine.*` measure larger**. Hence a probe that measures the screen, not the engine.

## State

| sha | what |
| --- | ---- |

(unpushed work in progress — see Next steps)

Files added:

* `scripts/perf/real-screen-probe.js` — browser probe injected into `/`. Records four numeric
  tables: `frames [t, dt, contact]`, `events [stamp, at, type, id, buttons, coalesced, onCanvas]`,
  `measures [start, dur, nameIndex]`, plus per-phase metadata. Deliberately a **recorder only**.
* `scripts/perf/real-screen-stats.mjs` — all the maths (percentiles, per-phase summaries, the
  input-vs-frame verdict, the long-stroke degradation trend). Pure, unit-testable, shared by the
  device path and the planned Playwright path.
* `scripts/perf/ipad-frames.mjs` — `npm run perf:ipad:frames`. Serves the build, attaches over the
  WebKit Inspector Protocol, navigates to `/`, injects the probe, reads the tables back in slices,
  prints four tables, writes `perf-profiles/<stamp>-ipad-frames-<device>/real-screen.json`.
* `scripts/perf/ipad-session.mjs` — device-session plumbing extracted from `ipad.mjs` (relay, LAN
  server, suspended-tab-aware tab choice, navigation, readiness gate, poll-for-a-global).

Files changed: `scripts/perf/ipad.mjs` (now uses the shared module), `package.json` (script +
`scripts-info`).

## What the probe measures, and why each metric is there

* **`dt` (rAF delta) over in-contact frames** — pacing. Late = > 16.67 ms (a dropped 120 Hz beat);
  stall = > 50 ms. Safari has no `PerformanceObserver` `longtask`, so rAF deltas are the only
  JS-level proxy.
* **queue delay = handler `performance.now()` − `event.timeStamp`** — how long input sat before the
  page got to it. This is felt as lag *with every frame on time*, and nothing else in the repo
  measures it.
* **paint latency = frame `t` − newest move's `timeStamp`** — how stale the ink is when a frame
  runs.
* **moves per in-contact frame** — WebKit coalesces to ~1/frame; far below 1 means the moves never
  arrived (**input loss**, a different fix from **frame loss**). `getCoalescedEvents().length`
  separates "never delivered" from "delivered merged".
* **`engine.*` ms inside late frames** — the attribution question. Near-zero engine JS in a 25 ms
  frame says the cost is outside the drawing engine (rendering pipeline, or JS nobody marked).
* **stroke-end hitch** — the frame delta straddling each pointerup; the commit runs there.
* **long-stroke trend (first third vs last third of each long stroke)** — tests whether cost *grows*
  with stroke length, which is what the reporter describes.

## Phase sweep (A/B, CSS-only, no production changes)

`blank` → `page` → `page-no-nudge` → `page-no-blend` → `page-no-halos` → `page-bare`. Suppressions
are stylesheet rules with `!important`, which beat the app's inline styles:

* `nudge` pins `.paper-view`'s computed transform, so the per-event `translateZ` epsilon no longer
  changes a computed value — the style write still happens, the compositor damage does not. **Do not
  rotate the device during a pinned phase.**
* `blend` forces `mix-blend-mode: normal` on `.paper-view`.
* `halos` `display: none` on `.brush-ring, .eraser-bubble`.

A phase ends on banked **finger-down** time, so phases stay comparable under a human hand.

## Decisions made (and why)

* **Probe records, Node computes.** Percentiles/verdicts in Node are unit-testable; a browser
  snippet is not. Raw tables also mean a capture can be re-analyzed after a maths fix without
  re-drawing.
* **Tables read back in slices** (2000 rows). A single `Runtime.evaluate` carrying a few hundred KB
  of JSON over the USB relay is the one failure that would land *after* the drawing is done.
* **Suppressions via CSS, not a production flag.** Zero production surface; the trade is that
  `nudge` removes the compositor damage but not the style write. Documented at the call site.
* **Selectors are drift-guarded, not trusted.** The probe cannot import the app's constants, so it
  aborts loudly when `.paper-view` is missing, records whether halos were seen/hidden, and a
  scripts-test asserts each selector still exists in its component.
* **Strokes are segmented over the whole recording and claimed by the phase their pointerdown fell
  in.** A phase always ends mid-stroke, so windowing events first dropped the last stroke of every
  phase — and with it the end hitch, which is the rapid-repeated-strokes case.
* **Idle bail-out (60 s with ≥25% banked)** so an interrupted or unattended run still publishes.

## FINDINGS from the first hand-drawn capture (2026-07-29, iPad13,8, iPadOS 26.5)

Capture: 6 phases × 15 s of banked finger-down time, single finger, Apple Pencil/finger on the real
app. 10281 frames, 11725 pointer events, 11976 engine measures.

### 1. Safari gives web content 60 Hz on a 120 Hz ProMotion iPad Pro

Measured directly (`perf-profiles/refresh-ceiling.mjs`, throwaway): a bare rAF sampler reports
**16–17 ms both idle and while animating**. So `dt p50 = 17 ms` during drawing is **the ceiling, not
a failure**, and any 8.33 ms frame budget reports a perfectly-paced capture as 64% late — which is
exactly what the first version of the stats module did. Frame budgets are now derived per capture
(`observedFrameIntervalMs`, the p10 of observed deltas).

**This also bears on ADR-0066's 8.3 ms commit-hitch gate**: on Safari/iPad the presentable frame is
16.7 ms, so the gate is stricter than the platform.

### 2. The lag is rAF/render starvation, not slow JS and not lost input

The decisive measurement (`perf-profiles/burst-anatomy.mjs`, throwaway — fold into the stats
module): inside the worst frames, across every phase,

|                                                 | value                          | meaning                                                |
| ----------------------------------------------- | ------------------------------ | ------------------------------------------------------ |
| `mean handle gap`                               | **8.3 ms**, everywhere         | moves are handled at 120 Hz, evenly — no backlog flush |
| queue delay, first *and* last move in the frame | **5–7 ms**, constant           | input is not queuing up                                |
| `handled span` vs `dt`                          | ~equal (e.g. 1417 of 1422 ms)  | handlers ran throughout the stall                      |
| engine.* inside the frame                       | **0–5 ms** total               | marked engine work is absent from the stall            |
| worst `dt`                                      | 335 / 693 / 1164 / **1422** ms | frames simply stop being produced                      |

So: **`pointermove` arrives every 8.3 ms and is handled within 6 ms while `requestAnimationFrame`
does not fire for hundreds of milliseconds.** The main thread is keeping up; frame *production* is
not. That is precisely the reported symptom — "it freezes, then catches up in a jump": every stroke
point is drawn into the canvas on time, and none of it reaches the screen until the compositor
catches up.

Corollary: rAF deltas measure **render starvation** here, not JS blocking. Do not read them as "long
tasks".

### 3. What the reporter sees (their words, 2026-07-29)

* "It freezes, then catches up in a jump" → the stalls, not steady latency. Read `stall %`, `dt max`
  and `lost ms`; **paint p95 is a red herring** (and is confounded — see below).
* "Worse the more ink is already on the page" → something scaling with accumulated content.
* "Takes a long time from finger up for the halo to go away and the app to snap back" → the
  finger-lift path. The halo is removed by a Svelte state write on pointerup.
* Little multi-finger use — single-finger is the case to chase first.

### 4. The hand-drawn A/B cannot attribute anything — phases are not comparable

Stroke counts per phase ran 7 / 17 / 20 / 21 / 25 / 45 and moves-per-frame 1.9–4.2, because a human
draws differently each time. The suppression deltas come out non-monotonic (suppressing halos looked
*worse* than baseline), which is noise, not signal. The worst phase (`page-no-halos`, 1422 ms stall)
is also the one with 41 short strokes — i.e. it reproduces the *rapid short strokes* case rather
than telling us anything about halos.

**Attribution therefore requires the synthetic driver** (identical input per phase). The hand
capture's value is: it proves the harness, establishes the 60 Hz ceiling, and rules out JS and input
delivery.

### 5. Ruled out

* **Input loss / coalescing** — 0 adopted strokes, no within-stroke gaps beyond 9 ms p95,
  `getCoalescedEvents()` returns 0 on this device.
* **Input queue delay** — flat 6 ms p50/p95 in every phase, including inside 1.4 s stalls.
* **Marked engine work** — `engine.draw` mean ~0.06 ms, `commit max` 1–3 ms, `snapshot`/`fold` ≤ 1
  ms.
* **The encode tier** — `engine.encode` fires once per commit but its loop finds nothing cold (count
  24, total 0 ms), confirming #655's finding that the byte budget is never exceeded here. Not the
  cause, and #494's decode-stall concern is unreachable at this depth.

### 6. Leading hypothesis: GPU/compositor memory pressure from undo-history rasters

The canvas backing store is **2564 × 1830 = 4.7 Mpx (~19 MB)** at dpr 2. Every stroke pushes a
dirty-rect patch raster onto the undo stack (ADR-0069/0074), and a long sweeping stroke's dirty rect
approaches the whole paper. 20–45 strokes of that is hundreds of MB of canvas-backed textures, which
would starve the compositor and scales with accumulated ink — matching "worse the more ink".

**Next test:** sample `getUndoDebug()` (already an exported profiling seam in `engine.ts`) per
stroke on `/` and correlate `rasterBytes`/`snapshots` against stall onset. That needs the seam
exposed on the real route, which is the one dev seam worth adding.

## FINDINGS from the first synthetic sweep (identical input per phase)

7 phases × 20 s banked contact, one `pointermove` per frame, `--drive`. Same device, same build.

### 7. Synthetic input at one move per frame does not reproduce the lag at all

**Every phase came back clean**: `dt` p50/p95/p99 all 17 ms, max 17–25 ms, 0% late, 0 stalls, 0 lost
ms — including `page-again` after the whole run's ink had accumulated. Against a hand-drawn capture
with 335–1422 ms stalls, on the same build and device.

The difference is the **input rate**. A hand delivers 1.9–4.2 moves per *presentable* frame (a 120
Hz+ digitizer against Safari's 60 Hz frame); the synthetic hand delivered exactly 1. So the
hypothesis is now specific: **per-event work performed 2–4× per frame it can never be shown in** is
what turns into a stall. `--drive-hz=120` exists to test exactly that and is the experiment in
flight.

Corollary already banked: **accumulated ink alone does not cause stalls.** `rasterBytes` grew to
33.9 MB across 20 snapshots during a run that never dropped a frame, which weakens the
GPU-memory-pressure hypothesis (finding 6) as a *sufficient* cause.

### 8. Every finger-lift blocks frame production for ~100 ms, and the halo is why

With identical input, `hitch p95` was **104–107 ms in every phase except the two with halos
suppressed, where it was 17 ms** (one frame). `lift→halo-gone` agrees: p50 97 ms, p95 107 ms, max
125 ms — and that is the reporter's "long time from finger up for the halo to go away and the app to
snap back", measured.

The discriminator that makes this a finding rather than an artifact is the **frames-in-gap** count
across the ~100 ms pause between synthetic strokes:

| phase                                             | halos           | frames observed during the gap |
| ------------------------------------------------- | --------------- | ------------------------------ |
| `blank`, `page`, `page-no-nudge`, `page-no-blend` | visible         | **0–1**                        |
| `page-no-halos`, `page-bare`                      | `display: none` | **5–6**                        |

rAF is *not* idle-throttled on this device — the ceiling measurement fires at 17 ms on a completely
idle page with nothing animating. So an empty gap is blocked frame production, not absence of work.

The halo itself is a bordered circle with a 1 px box-shadow: too cheap to cost 100 ms in paint. What
it also does is **appear and vanish once per stroke inside a stacking context holding a 4.7 Mpx
canvas layer** (`.canvas-stack` is `isolation: isolate`, `.paper-view` is `will-change: transform`),
which points at compositing-tree churn rather than pixels. `page-halos-hidden` (`visibility: hidden`
— box kept, not painted) vs `page-halos-transparent` (`opacity: 0` — painted and composited, just
invisible) separate those two, and are in the run in flight.

### 9. The "goes black, then snaps back" symptom names the mechanism

Reported mid-session: on a coloring page the screen sometimes goes black with no visible strokes,
then the whole drawing snaps back. That is what an **unblended line-art plate** looks like: dark
mode inverts the art to white-on-black and `mix-blend-mode: screen` is what makes the black
disappear. If WebKit falls behind on that blend it shows the raw plate, then corrects — the same
compositor, the same stall, and a user-visible rendering defect in its own right. The probe now
records the theme and the computed `mix-blend-mode` so a capture says whether the symptom was even
reachable in it.

## Unverified assumptions

* Synthetic (rAF-paced `dispatchEvent`) input on `/` reproduces enough of the lag to be worth
  measuring unattended. **Test this first** against the hand-drawn baseline — if it doesn't, the
  overnight A/B is measuring the wrong thing.
* `event.timeStamp` on a physical iPad is the hardware sample time (making queue delay meaningful).
  Synthetic events set it at construction, so queue delay is ~0 by construction there.
* The 120 Hz assumption: ProMotion adapts refresh rate, so a phase could legitimately pace at 60 Hz.
  `dt p50` distinguishes them; do not read `late %` without it.

## Done & verified

* Probe validated end to end locally in headless Chromium against the real `/` (installs, phase
  machine advances, report + tables read back, stats compute, stroke segmentation and end-hitch
  land). Scratch driver: `perf-profiles/probe-smoke.mjs` (gitignored).
* `npm run perf:build` green; `perf:ipad:frames` reaches the device, navigates the tab, installs the
  probe and prints instructions.

## Risks & next 3 steps

1. **Hand-drawn baseline** (in flight) — the fidelity reference every synthetic number is judged
   against.
2. **Synthetic driver** — rAF-paced pointer dispatch on `/` (`--drive`), so the sweep runs
   unattended overnight. One `pointermove` per frame, long-stroke and rapid-short-stroke scenarios.
3. **Playwright replication** — same probe, same stats, against `/` in WebKit-on-Mac and throttled
   Chromium, to see how much of the device signal survives without hardware.

Then: attribute → ideate → try fixes with measured before/after.

## Reread first

* `scripts/perf/real-screen-probe.js` header — the metric definitions and row schemas.
* `.ruler/skills/profiling/ipad-device-profiling.md` — device setup, the manual Timeline path
  (A5–A6), and the runbook this work extends.
* `.ruler/skill-notes/profiling.md.template` — the five WebKit Inspector Protocol facts that dictate
  the client's shape; do not re-derive them.
* `web/src/lib/components/DrawingCanvas.svelte` (`nudgeBlendLayer`, `paperViewTransform`),
  `web/src/lib/components/PointerHalos.svelte`.
* Issue #659, and #655 for the gates-run automation this sits beside.
