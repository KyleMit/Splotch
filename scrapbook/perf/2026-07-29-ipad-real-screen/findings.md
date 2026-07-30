# Real-screen performance on a physical iPad (2026-07-29)

The first captures from `npm run perf:ipad:frames` (ADR-0083) — the instrument that measures the app
users actually touch (`/`) rather than the `/dev/engine` harness. Twelve runs on one device in one
session, chasing a reported "the drawing freezes and then catches up in a jump" that the ADR-0066
gates cannot see.

**Device:** iPad Pro 12.9″ 5th gen (`iPad13,8`), iPadOS 26.5, Safari. Canvas backing store 2564 ×
1830 = **4.7 Mpx** at dpr 2. Build: production preview, `PERF_MARKS=true`, served on the LAN.

**Headline:** the lag is **render starvation**. Input keeps arriving and being handled on time while
frame production stops for hundreds of milliseconds, with almost no marked engine work inside the
stall. It reproduces **only under a real hand** — no synthetic input path reproduces it at all.

---

## 1. Safari gives web content 60 Hz, even on a 120 Hz ProMotion display

A bare `requestAnimationFrame` sampler on this device, with nothing else running:

| condition                         | min | p50 | p90 | max | implied |
| --------------------------------- | --- | --- | --- | --- | ------- |
| idle                              | 16  | 17  | 17  | 17  | ~59 Hz  |
| animating a transform every frame | 11  | 17  | 17  | 17  | ~59 Hz  |

So a drawing loop pacing at 17 ms is **at the ceiling, not failing**. Two consequences:

* A fixed 8.33 ms frame budget reports a perfectly-paced capture as **64% late frames** — which the
  first version of these metrics did. Budgets are now derived per capture from observed deltas.
* **ADR-0066's "commit hitch ≈ one 120 Hz frame" gate is stricter than the platform** on
  Safari/iPad, where the presentable frame is 16.7 ms. The gate is deliberately left as the tighter
  of the two (the native WKWebView target is unmeasured); ADR-0066 carries the amendment.
* The digitizer runs **ahead** of the frame: a hand delivered a steady **115–134 `pointermove` per
  second** against a ~59 Hz presentable frame, so per-event work runs about twice per frame it can
  possibly be shown in — and more than that whenever a frame runs late.

## 2. Hand-drawn capture — the lag, measured

6 phases × 15 s of banked finger-down time. 10,281 frames, 11,725 pointer events, 11,976 engine
measures. Frame beat observed: 16 ms. The input kind was not recorded by this build (see §7) — the
sustained ~120 moves/second is consistent with a finger.

| phase           | dt p50 |     p95 |      max | late % | stall % | lost ms | moves/frame |
| --------------- | -----: | ------: | -------: | -----: | ------: | ------: | ----------: |
| `blank`         |     17 |      17 |  **335** |    1.1 |     1.0 |    1662 |        2.30 |
| `page`          |     17 |      17 |       82 |    0.7 |     0.4 |     287 |        1.93 |
| `page-no-nudge` |     17 |      17 |      169 |    2.2 |     2.1 |    2191 |        2.57 |
| `page-no-blend` |     17 | **168** |      693 |    9.5 |     9.3 |    8176 |        4.24 |
| `page-no-halos` |     17 |      18 | **1422** |    3.4 |     3.4 |    5886 |        3.60 |
| `page-bare`     |     17 |      17 |       21 |    0.0 |     0.0 |       0 |        2.05 |

The `moves/frame` column is included because it is what the verdict logic reads, but **read it with
care**: it is moves ÷ in-contact frames, so a stall inflates it by removing frames from the
denominator. `movesPerSec` was flat at 115–134 across every phase.

`lost ms` is time a child waited through: the sum of each late frame's overshoot.

> **These phases are not comparable to each other.** A human drew 7–45 strokes per phase, so the
> suppression columns describe the operator, not the app. That is what the synthetic runs below
> exist for. The hand data's value is everything in §3.

## 3. What the stalls actually contain

The forensic view of the worst frames, and the measurement that reframed the whole investigation.
Inside stalls of 335 / 693 / 1164 / **1422 ms**, across every phase:

|                                                                                 | measured                 | meaning                                 |
| ------------------------------------------------------------------------------- | ------------------------ | --------------------------------------- |
| interval between *handled* moves                                                | **8.3 ms**, evenly       | no backlog, no flush burst              |
| queue delay (`event.timeStamp` → handler), first **and** last move in the frame | **5–7 ms**, flat         | input is not waiting on the main thread |
| span of handling vs the frame's duration                                        | ~equal (1417 of 1422 ms) | handlers ran *throughout* the stall     |
| `engine.*` total inside the 1422 ms frame                                       | **5 ms**                 | the drawing engine is not in it         |
| `engine.draw` mean / max                                                        | 0.06 / 1 ms              | —                                       |
| `engine.commit` max                                                             | 1–3 ms                   | the finger-lift path is cheap           |

`pointermove` arrives every 8.3 ms and is handled within 6 ms **while rAF does not fire for over a
second**. Every stroke point is drawn into the canvas on time; none of it reaches the screen until
the compositor catches up. That is the reported symptom exactly.

Per-5-second buckets show onset rather than a steady state — `blank` was clean for its first 20 s
and 11% stalled in its last 5.

## 4. Nothing synthetic reproduces it

Every run below is on the same device and build, with a coloring page loaded, driven by `--drive`
(one `pointermove` per frame, or timer-paced at a chosen rate).

| run                                         | moves/frame | pointer | dt p50 / p95 |    max |   stalls |
| ------------------------------------------- | ----------: | ------- | -----------: | -----: | -------: |
| one move per frame, 7 phases × 20 s         |        1.00 | touch   |      17 / 17 |  17–25 | **none** |
| timer at "120 Hz" (delivered 83)            |        1.39 | touch   |      17 / 17 |  18–22 | **none** |
| timer at 240 Hz                             |    **4.03** | **pen** |      17 / 17 |  18–20 | **none** |
| 240 Hz with the probe's own HUD on          |        4.04 | pen     |      17 / 17 |     33 | **none** |
| **4-minute soak**, 14,575 in-contact frames |        4.03 | pen     |      17 / 17 | **23** | **none** |

The soak accumulated 20 undo snapshots / **33.9 MB** of patch rasters without dropping a frame.

### The elimination list

| hypothesis                                        | how it was killed                                   |
| ------------------------------------------------- | --------------------------------------------------- |
| per-event work volume                             | 4.03 moves/frame at `pointerType: pen` — 0 stalls   |
| accumulated ink / undo rasters                    | 4-minute soak, 33.9 MB — 0 stalls, 0 lost ms        |
| the blend nudge, `mix-blend-mode`, `PointerHalos` | every CSS suppression, individually and together    |
| the probe's own on-device HUD                     | `--hud` on a driven run — 0 stalls                  |
| marked engine work                                | 0–5 ms inside a 1422 ms stall                       |
| input delivery, queueing, coalescing              | 8.3 ms cadence, 6 ms queue delay, 0 adopted strokes |
| the encode tier                                   | fires once per commit, finds nothing cold, **0 ms** |

The encode result confirms the #655 finding independently and is evidence toward closing #494: at
this depth nothing is ever demoted to a blob, so no decode can stall.

## 5. Rendering-work counts, off the protocol

`Timeline.enable` + `Timeline.start` work over the WebKit Inspector Protocol and stream the full
record tree — but **every record arrives with `startTime: 0` and `endTime: 0`**, so this yields
counts and structure, never durations. (A hand-driven Web Inspector *export* remains the only source
of paint/composite durations.)

Counts still compare across conditions. Identical synthetic input, 10 s each:

| record               | `page` /frame | `page-no-nudge` /frame | coalesced (PR #662) /frame |
| -------------------- | ------------: | ---------------------: | -------------------------: |
| `RenderingFrame`     |          1.29 |                   1.29 |                       1.29 |
| `Composite`          |          1.29 |                   1.29 |                       1.29 |
| `Paint`              |          1.44 |                   1.47 |                       1.46 |
| `RecalculateStyles`  |      **3.43** |                   3.42 |                   **1.32** |
| `Layout`             |          0.10 |                   0.10 |                       0.10 |
| `FireAnimationFrame` |          1.29 |                   1.28 |                   **3.34** |

Two things fall out:

1. **The per-event blend nudge never cost extra recomposites.** `Composite` is 1.29 per frame
   whether the nudge fires per input event or is suppressed entirely — WebKit composites once per
   frame no matter how many times the layer is damaged inside it. The real per-event cost is the
   **style recalculation**, at 3.43 per frame, tracking the input rate exactly.
2. Coalescing that work to once per frame takes `RecalculateStyles` to 1.32 and adds ~2 rAF
   callbacks per frame, with `Composite`/`Paint` unchanged and pacing unchanged.

## 6. Fidelity caveats

* **rAF deltas measure when rAF ran**, not when a pixel reached the glass. Safari exposes no
  `longtask` entry type and no frame-timing API, so this is the only JS-level proxy — and these
  stalls contain almost no JS, so do not read them as long tasks.
* **`performance.now()` is clamped to ~1 ms** in WebKit; sub-ms numbers are at the clock floor.
* **Synthetic input cannot reproduce** touch coalescing, ProMotion input pacing, or queue delay (a
  constructed event's `timeStamp` is set when the probe builds it). Read those columns from
  hand-drawn runs only.
* A hand-drawn phase can only fairly be compared **to itself earlier** (the per-bucket table), or to
  a repeated phase in a paired A/B/A/B plan.

## 7. What is left, and what it needs

Attribution to a named subsystem is still open, and it is blocked on real touch input rather than on
tooling. The remaining candidates are the parts of the input path a `dispatchEvent` cannot enter:

1. **Gesture/hit-test machinery on real touch** — WebKit deciding scrollability, tap candidates and
   touch-region work per contact, over a 4.7 Mpx canvas page. Applies to a finger as much as a
   stylus.
2. **iOS's render server prioritising differently during touch.**
3. **iPadOS Scribble / handwriting recognition** — *only if the lag reproduces with a Pencil.*
   `scribbleGuard` and ADR-0038 exist because a stylus tap can arm it, and recognition would be
   main-thread work *inside the browser*, invisible to every instrument here. It fits the shape of
   the observations, but it is **Pencil-only**.

> **On input kind, which decides that ordering.** Every phase of the hand capture sustained
> **115-134 moves per second** — a steady ~120 Hz, consistent with a finger on a 120 Hz digitizer,
> and the reporter described single-finger drawing. That capture predates the probe recording
> pointer type, so this is inference rather than measurement; the first thing worth doing is one
> hand-drawn run that says `kind: touch` or `kind: pen` outright. If it is a finger, Scribble cannot
> be the cause.
>
> The same read-back confirms that **~120 moves/second was sustained *through* the stalls** — real
> input never faltered while frames stopped.

> **One correlation not to trust.** Across the hand phases, moves-per-frame tracks stall share
> (Spearman 0.943) and lost ms (Pearson 0.996) almost perfectly. It is an artifact: `moves/frame` is
> moves ÷ in-contact frames, and a stall removes frames from the denominator, so the two are one
> fact counted twice. `movesPerSec` is the honest rate, and it is flat.

Also opened from this session: **#663** — on a coloring page the screen sometimes goes black
mid-stroke and then snaps back, which is this same blend layer compositing *unblended* (dark mode
inverts the art to white-on-black; `screen` is what hides the black plate). Possibly the visible
face of the same compositor event.

---

## Reproducing

```sh
npm run perf:ipad:frames                                    # hand-drawn sweep
npm run perf:ipad:frames -- --drive --drive-hz=240 --pointer-type=pen   # unattended
npm run perf:ipad:frames -- --drive --timeline --phases=page            # rendering counts
npm run perf:frames:analyze -- perf-profiles/<dir>/real-screen.json     # re-read a capture
npm run perf:frames:local                                   # same probe, no iPad
```

Raw captures stay in the gitignored `perf-profiles/`; the probe records raw tables and computes
nothing, so any capture can be re-analyzed after a metric definition changes — which happened six
times in this session. Device setup and the full runbook: the `profiling` skill's
`ipad-device-profiling.md`.
