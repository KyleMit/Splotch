# Handoff — real-screen lag on iPad (issue #659)

> 2026-07-29 · branch `capture-real-screen-perf` · PR
> [#660](https://github.com/KyleMit/Splotch/pull/660) · Instrument, capture and attribute the
> visible drawing lag on `/` on a physical iPad, where the ADR-0066 engine gates pass but the screen
> does not keep up. Instruments done; attribution needs a hand on the device — see START HERE.

## START HERE — the three things worth doing next, in order

The instruments are built and every hypothesis a machine can test is eliminated. What is left needs
a hand on the device, and each of these is minutes of work.

1. **Turn iPadOS Scribble off and hand-draw once.** Settings → Apple Pencil → Scribble = OFF, then
   `npm run perf:ipad:frames -- --phases=page --contact-seconds=20` and draw the way that lags. If
   the stalls vanish, that is the cause and everything below is moot. It is the only remaining
   candidate that is invisible to every instrument here *and* present only under real input.
2. **Hand-draw a paired A/B.**
   `npm run perf:ipad:frames -- --phases=page,page-no-halos,page,page-no-halos --contact-seconds=20`.
   Repeated phases are how a hand-drawn comparison survives an operator who cannot repeat themselves
   (repeats are labelled `page#2`), and the per-bucket table shows onset within each phase. A single
   unpaired sweep already produced and then withdrew one false finding — do not trust an unpaired
   one.
3. **Record a Web Inspector Timeline on `/` by hand** and run `npm run perf:ios:analyze` on it. It
   is the only instrument that shows **paint** and **composite** records, which is where the
   evidence says the time goes. The recipe is in the runbook's "Timeline on `/`" section.

Also open from this work: **issue #663** — on a coloring page the screen sometimes goes black
mid-stroke and then snaps back, which is the same blend layer compositing *unblended*. It may be the
visible face of the same compositor event.

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

Branch `capture-real-screen-perf` → **PR #660** (the instruments, pushed). Branch
`coalesce-per-frame-work` → **PR #662** (fix candidate, stacked on #660). Also filed: **#663** (the
black-flash rendering bug).

Commits on #660, oldest first:

| sha      | what                                                                                          |
| -------- | --------------------------------------------------------------------------------------------- |
| 925bc111 | the probe, the stats module, `perf:ipad:frames`, `ipad-session.mjs` extracted from `ipad.mjs` |
| cec796b8 | contact derived from the move stream, not just `pointerdown`                                  |
| 3810a8f6 | derive the frame budget; add worst-frame forensics; `perf:frames:analyze`                     |
| f95045b9 | the synthetic hand, the undo-history seam, finger-up→halo-gone                                |
| 2c7c6581 | tests over the metrics + the selector drift guard; split the halo's two costs                 |
| 061323b0 | the pump that holds a digitizer's rate without starving the loop; hitch as a rate             |
| 91616a1f | runbook: the real-screen section, the 60 Hz ceiling, what the marks can't see                 |
| d3b7fbdf | the soak result; fix candidates ranked by evidence                                            |
| 81e3fa0b | `perf:frames:local` registered; "start here" for the next session                             |
| d0960c9d | the ipad URL test, for the shared session module                                              |
| 82ef6396 | ADR-0081 + the ADR-0066 frame-budget amendment                                                |
| (merge)  | main's `devHarnessSeam.ts` absorbs the profiling seam; ADR renumbered 0080→0081               |

Files added:

* `scripts/perf/real-screen-probe.js` — browser probe injected into `/`. Records numeric tables
  (`frames`, `events`, `measures`, plus `history` and `liftLatencies`) and **computes nothing**.
* `scripts/perf/real-screen-stats.mjs` — all the maths: percentiles, per-phase summaries, the
  input-vs-frame verdict, worst-frame forensics, per-bucket pacing, the long-stroke trend.
* `scripts/perf/ipad-frames.mjs` — `npm run perf:ipad:frames` (device).
* `scripts/perf/frames-local.mjs` — `npm run perf:frames:local` (no iPad).
* `scripts/perf/frames-analyze.mjs` — `npm run perf:frames:analyze` (re-read a saved capture).
* `scripts/perf/ipad-session.mjs` — device-session plumbing extracted from `ipad.mjs`.
* `scripts/tests/perf-real-screen.test.mjs` — 36 tests over the metrics + the selector drift guard.
* `docs/adrs/0081-real-screen-capture-on-device.md`.

Files changed: `scripts/perf/ipad.mjs` (uses the shared module), `scripts/tests/perf-ipad.test.mjs`,
`web/src/lib/boot/devHarnessSeam.ts` (+ its test) — the profiling seam lives there rather than in a
module of its own, because main landed the same pattern independently, `web/src/app.d.ts`,
`web/src/routes/+page.svelte`, `package.json`, and the profiling skill + notes.

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

## FINDINGS from the input-rate experiments — the rate hypothesis is DEAD

| run                             | moves/frame | pointer    | stalls          | late %   |
| ------------------------------- | ----------- | ---------- | --------------- | -------- |
| hand-drawn                      | 1.9–4.2     | pen/finger | **335–1422 ms** | 0.7–9.5% |
| synthetic, 1 per frame          | 1.00        | touch      | none            | 0        |
| synthetic, "120 Hz" (really 83) | 1.39        | touch      | none            | 0        |
| **synthetic, 240 Hz**           | **4.03**    | **pen**    | **none**        | **0**    |

At and above the hand's own rate, with `pointerType: 'pen'`, on a coloring page, with all the
per-event work live: `dt` p50/p95 = 17 ms, zero late frames, zero lost ms. **Per-event work volume
is not the cause.** The app absorbs 4× the work per presentable frame without dropping anything.

Also withdrawn: **the halo lift finding (8) does not hold.** Reported as a p95 over 19–27 strokes it
looked like a clean 104 ms-vs-17 ms split; as a rate it is an occasional ~120 ms outlier present in
*every* configuration. The metric now reports `stalled lifts` out of measured lifts for that reason.

### What is left

Only things a synthetic `dispatchEvent` cannot fake — the **real iOS touch pipeline**:

1. **iPadOS Scribble / handwriting recognition.** ADR-0038 and `scribbleGuard` exist because a
   stylus tap can arm Scribble. If recognition runs over the canvas during drawing it is main-thread
   work in the *browser*, invisible to every instrument here, present only under a real Pencil. It
   fits every observation: handlers dispatched on time at 8.3 ms while frame production starves.
   **Cheapest possible test, and the top next step:** iPadOS Settings → Apple Pencil → Scribble OFF,
   then one hand-drawn run. If the stalls vanish, that is the cause.
2. **Gesture/hit-test machinery on real touch** — WebKit deciding scrollability, tap candidates, and
   touch-region work per contact on a 4.7 Mpx canvas page.
3. **The render server's touch prioritisation** on iOS.
4. **A confound I introduced:** hand runs had the on-device HUD (two repaints/second), synthetic
   runs did not. `--hud` now forces it on for a driven run so this is ruled out rather than assumed
   harmless. Result pending.

## FINDING 10 — everything reproducible is eliminated

A **4-minute continuous soak** on device (240 Hz pen input, coloring page loaded, 14,575 in-contact
frames): `dt` p50/p95 **17 ms**, max **23 ms**, **zero** late frames, **zero** stalls, **zero** lost
ms. So accumulation is out too — the app is perfectly smooth under four minutes of sustained drawing
while a human stalls it for 1.4 s in fifteen seconds.

The full elimination list, all measured on the device, all clean:

| hypothesis                                 | how it was killed                                   |
| ------------------------------------------ | --------------------------------------------------- |
| per-event work volume                      | 4.03 moves/frame, `pointerType: pen` — 0 stalls     |
| accumulated ink / undo rasters             | 4-minute soak, 33.9 MB of rasters — 0 stalls        |
| the blend nudge / `mix-blend-mode` / halos | every CSS suppression, no effect                    |
| the probe's own HUD                        | `--hud` on a driven run — 0 stalls                  |
| marked engine work                         | 0–5 ms inside a 1422 ms stall                       |
| input delivery, queueing, coalescing       | 8.3 ms cadence, 6 ms queue delay, 0 adopted strokes |
| the encode tier                            | fires per commit, finds nothing cold, 0 ms          |

**The lag requires real touch input, and nothing synthetic reproduces it.** That is a real result,
and it is also where unattended work runs out: what is left is the part of the input path a
`dispatchEvent` cannot enter.

## FINDING 11 — the compositor side IS reachable unattended, as counts

`Timeline.enable` + `Timeline.start` work over the WebKit Inspector Protocol and stream the full
record tree: `RenderingFrame`, `Composite`, `Paint`, `RecalculateStyles`, `Layout`, `EventDispatch`,
`FireAnimationFrame`. **But every record arrives with `startTime: 0` and `endTime: 0`**,
mid-recording ones included, so there are counts and structure and never durations — and no record
can be placed in time or attributed to a phase. (`Timeline.setInstruments` with an explicit list,
and `setAutoCaptureEnabled: false`, were tried: the rendering records stop arriving altogether.)

That is the specific reason the Web Inspector *export* is still the only source of paint/composite
**durations** — the skill notes previously said only that the stream "is not the shape the analyzer
parses". Counts are exposed as `--timeline` on `perf:ipad:frames`, single-phase only.

### What the counts immediately overturned

`page` vs `page-no-nudge`, identical synthetic input, 10 s each:

| record            | `page` /frame | `page-no-nudge` /frame |
| ----------------- | ------------- | ---------------------- |
| Composite         | 1.29          | 1.29                   |
| Paint             | 1.44          | 1.47                   |
| RecalculateStyles | 3.43          | 3.42                   |

**The per-event blend nudge never cost extra composites.** WebKit composites once per frame no
matter how many times the layer is damaged within it — which is obvious in hindsight and was still
the premise of the first version of PR #662's rationale ("three or four full-paper recomposites per
frame"). Withdrawn.

What *is* real is `RecalculateStyles` at **3.43 per frame**, tracking the move rate exactly.

### And what they measured about the fix

PR #662's build, same input:

| record                    | before | after    |                   |
| ------------------------- | ------ | -------- | ----------------- |
| RecalculateStyles /frame  | 3.43   | **1.32** | −61%, as designed |
| Composite /frame          | 1.29   | 1.29     | unchanged         |
| Paint /frame              | 1.44   | 1.46     | unchanged         |
| FireAnimationFrame /frame | 1.29   | **3.34** | the cost it adds  |

So #662 trades ~2 style recalculations per frame for ~2 rAF callbacks per frame. Pacing is unchanged
(17 ms, zero stalls) because synthetic input never stalls in the first place. Defensible as "stop
doing work no frame can show", now with numbers on both sides of the ledger — still **not**
demonstrated to help the felt lag.

## Fix candidates, ranked by what the evidence actually supports

Nothing here is validated against the felt lag, because **no synthetic input reproduces it** — so
every candidate's "how to validate" is a hand-drawn run, and the honest status of all of them is
*unvalidated*. Ranked by strength of evidence, not by appeal.

### 1. Coalesce per-event work to once per frame (evidence: measured, mechanism: certain)

Measured: 1.9–4.2 `pointermove` per presentable frame, every one of which does a full
`nudgeBlendLayer` `$state` toggle (compositor damage on a full-paper blend layer) and a
`PointerHalos` `$state` write (a DOM transform). **The app cannot show more than one frame per
frame**, so 3 of every 4 of those are provably wasted — that part needs no further measurement.

* `DrawingCanvas.nudgeBlendLayer` → toggle at most once per `requestAnimationFrame`. One damage per
  frame is exactly what issue #307 needs (the blend must be current *per frame*), so this should not
  regress it.
* `PointerHalos` → write the ring position at most once per frame; the intermediate positions are
  never seen.

Low risk, and correct on first principles regardless of whether it moves the felt lag. **Validate:**
hand-drawn A/B of this build vs `main`, plus confirm #307's dark-mode staleness has not returned.

### 2. Turn off iPadOS Scribble and re-measure (evidence: elimination, cost: a settings toggle)

Everything reproducible has been eliminated (see finding 10). Scribble is main-thread work inside
the browser, invisible to every instrument here, and present only under a real Pencil — which is the
only condition that reproduces. If it is the cause, the "fix" is not ours to write, but knowing it
changes what we tell users and whether ADR-0038's guard needs widening.

### 3. Reduce the canvas backing store on huge screens (evidence: circumstantial)

The backing store is 2564 × 1830 = **4.7 Mpx (~19 MB)** at `renderScale = min(dpr, 2)`. Every
compositor operation that touches it — a blend recomposite reading it as backdrop, a texture
re-upload — scales with that area. Dropping to `renderScale = 1.5` on very large surfaces would cut
it ~44% at some cost in line crispness. **Only worth trying if a Timeline shows large
paint/composite records**; nothing measured so far points here directly.

### 4. Don't nudge the blend layer at all — invalidate the canvas instead (evidence: none yet)

The nudge exists because painting into the 2D canvas does not invalidate the `mix-blend-mode` layer
above it (#307). A cheaper trigger for the same invalidation, if one exists, removes a full-paper
recomposite per event rather than per frame. Related: the reported "goes black, then snaps back" is
this layer failing to blend at all (finding 9), so this area has a correctness bug in it too and is
worth understanding regardless.

### Explicitly not worth pursuing on current evidence

* **The undo/history tier.** `engine.encode` fires per commit and its loop finds nothing cold (0
  ms); rasters grew to 33.9 MB across 20 snapshots during a run that never dropped a frame. #494's
  decode-stall concern is unreachable at this depth.
* **Anything inside `engine.*`.** 0–5 ms of marked work inside a 1422 ms stall. Optimizing the
  drawing engine cannot fix this.

## Unverified assumptions

* Synthetic (rAF-paced `dispatchEvent`) input on `/` reproduces enough of the lag to be worth
  measuring unattended. **Test this first** against the hand-drawn baseline — if it doesn't, the
  overnight A/B is measuring the wrong thing.
* `event.timeStamp` on a physical iPad is the hardware sample time (making queue delay meaningful).
  Synthetic events set it at construction, so queue delay is ~0 by construction there.
* The 120 Hz assumption: ProMotion adapts refresh rate, so a phase could legitimately pace at 60 Hz.
  `dt p50` distinguishes them; do not read `late %` without it.

## Known-flaky spec, already flaky on main

`tests/parent-zoom.spec.ts` → "navigating to another section resets the zoom" fails ~2 of 3 repeats
**under concurrent load on `main` as well as on this branch** — verified by running the identical
4-spec × `--repeat-each=3` grep on both. It passes 3/3 run alone. Not caused by this work; don't
chase it here.

Method note worth keeping: the first comparison ran 12 tests on the branch against 3 on main and
therefore "proved" the branch broke it. A flake comparison has to hold the worker load equal.

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
