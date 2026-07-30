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
