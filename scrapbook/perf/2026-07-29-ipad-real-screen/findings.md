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
Manual Timeline captures make long composites after stroke commits the strongest current
correlation; snapshot capture and backing-store area are the leading candidates, not a final
root-cause finding. See §7.

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

## 7. Strongest current attribution — compositing after the stroke commit

> **Updated 2026-07-30.** This section previously said attribution was open and ranked **iPadOS
> Scribble** first among the candidates. That is retired: the probe now records pointer kind and the
> hand runs come back `touch`, not `pen`, and Scribble is Pencil-only. The candidate list it
> replaced (gesture/hit-test machinery, render-server prioritization, Scribble) is preserved in the
> profiling skill notes, since the reasoning that produced it was sound and is worth not
> re-deriving.

A hand-drawn Web Inspector Timeline export on `/` — 9.3 s, ending in the burst of short strokes that
provokes the worst of it:

| eventType          |   n |       total |          max |
| ------------------ | --: | ----------: | -----------: |
| **composite**      | 293 | **5047 ms** | **255.9 ms** |
| recalculate-styles | 572 |      195 ms |       1.7 ms |
| layout             |  52 |        8 ms |       0.5 ms |
| paint              | 251 |    **3 ms** |       0.5 ms |

**15 stroke commits, 15 long composites**, each starting 2–192 ms after its `engine.commit` mark
closed, while every `engine.*` operation stayed under 1.2 ms. The measured cost lands in the
compositor *after* the marked work returns, where no `engine.*` measure can reach it. This explains
why the ADR-0066 gates can stay green during a bad Timeline run, but does not prove that every felt
stall has this mechanism.

**Bisecting the per-commit cost**, hand-drawn Timeline against each build:

| build                    |                                              long composites / commit |
| ------------------------ | --------------------------------------------------------------------: |
| baseline                 |                                                                   1.0 |
| pooled patch canvases    |                                  0.9 — **allocation is not the cost** |
| no undo-snapshot capture | **0.2** — removing the readback path cuts the normalized rate by ~80% |

The strongest per-commit candidate is `capturePatchesUnder` reading a rectangle back off the paper
canvas ([`undoHistory.ts`](../../../web/src/lib/drawing/undoHistory.ts)). Reusing the destination
canvases does not help, arguing against allocation. Because these are separate hand-drawn runs, the
rate change is evidence for the readback path, not a causal percentage.

**What remained after that** was a separate, continuous cost: 3608 ms of compositing across 9.1 s,
~375 records averaging 9.6 ms — about one per frame, consuming 60% of a 16.7 ms budget before the
app runs at all. Two final hand-drawn rungs separated the always-mounted optional layers from canvas
pixel area:

| build                                            | long composites / commit | composite ms / drawing second | operator read |
| ------------------------------------------------ | -----------------------: | ----------------------------: | ------------- |
| 2× baseline                                      |                     1.00 |                         543.7 | visible lag   |
| 2×, no snapshot capture                          |                     0.15 |                         395.9 | —             |
| 2×, no snapshot capture, optional layers hidden  |                     0.17 |                         464.1 | worst run     |
| 1× diagnostic (quarter the baseline pixel count) |                     0.02 |                         171.4 | “not too bad” |
| 1.5× production candidate                        |                     0.13 |                         422.6 | —             |

The layer-strip rung hid both `.crayon-overlay` canvases, the coloring-page wrapper, paper texture,
and pointer halos without reloading. It did not lower the continuous composite cost and felt worse.
The 1× rung nearly eliminated long composites and cut normalized composite time by roughly
two-thirds. Backing-store area is therefore the strongest measured continuous-cost signal; the
optional layers alone are not sufficient to explain this result.

ADR-0015 records the production mitigation: cap the render scale at 1.5×. That retains supersampling
while reducing DPR-2 backing stores from 4 to 2.25 pixels per CSS pixel, 43.75% fewer pixels. The 1×
diagnostic remains the measured floor, not the shipped setting. The final candidate, with production
snapshot capture restored, recorded 2 long composites across 16 commits versus 15 across 15 commits
for the 2× baseline.

**Caveat on inference and magnitude.** Web Inspector's composite durations are likely generous. The
probe independently measured 250–764 ms lift stalls with no inspector attached, but the two
instruments do not prove they observed the same event, and hand-drawn input differs between runs.
The evidence justifies the mitigation; it does not close the root-cause investigation. A 245 ms
Timeline record should not be quoted as the true cost of one composite.

> **On input kind.** Every phase of the hand capture sustained **115-134 moves per second** — a
> steady ~120 Hz, consistent with a finger on a 120 Hz digitizer, and the reporter described
> single-finger drawing. That capture predates the probe recording pointer type, so it was inference
> — since confirmed by a later run that reports `kind: touch` outright, which is what retired
> Scribble as a candidate.
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
face of the same compositor event, but the layer-strip result shows those layers are not the only
requirement for the measured continuous cost.

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
