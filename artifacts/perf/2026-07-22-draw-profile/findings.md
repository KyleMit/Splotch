# Draw-performance profile — high-DPI / high-refresh emulation (2026-07-22)

Two harness runs (ADR-0032), both against the production preview bundle with `PERF_MARKS=true`,
headless Chromium, 4× CPU throttle:

| Run                  | Command                               | Emulation                                                                                                      | What it exercised                                                                                                                   |
| -------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `web-tablet-4x/`     | `npm run perf:web -- --device=tablet` | 1024×1366 @ dsf 2 (2048×2732 backing store)                                                                    | Full toddler session: single strokes, five-finger multi-gesture, 6 color changes, stroke sizes, erase, undo-to-empty, drag-to-clear |
| `undo-scenarios-4x/` | `npm run perf:undo`                   | iPad Pro 12.9 (dsf 2) + **120 Hz input volume** (~1200 ops per 10 s stroke, ~2400 ops per five-finger command) | 7 shaped sessions × 22 strokes each, incl. five-finger drags and crayon reversal scribbles, each followed by undo-to-empty          |

> **Fidelity caveat:** headless Chromium rasters through SwiftShader (software), which heavily
> exaggerates full-canvas blits and compositor commits, and the 4× throttle models a slow CPU.
> Absolute ms are pessimistic; ranking and scaling behavior are the signal. Anything acted on here
> should be re-measured on-device (`perf:android`, or the iPad console driver).

## What's healthy

* **Live drawing fits a 120 Hz frame budget.** `engine.draw` averaged 0.3 ms (max 6.3 ms) in the
  toddler session and ~0.05 ms/call across 26k-op squiggle scenarios — even ÷4 for the throttle,
  live stroking is far inside the 8.3 ms ProMotion budget. 0 forced reflows.
* **Undo memory is bounded as designed** (ADR-0066/0069): 20 snapshots → 2 live patch rasters +
  KB–single-digit-MB of encoded blobs; worst case (five-finger drags) 55 MB total history.
* **Shallow undo is cheap in the engine**: 2–6 ms per step across all seven scenarios.

## Where the time actually goes (ranked)

### 1. Stroke-end snapshot capture scales with the stroke's bounding box — worst case ~full-paper

`engine.snapshot` (the pre-stroke patch capture inside commit, ADR-0069) is patch-sized, but the
patch is **one union rect** over everything the command folds:

* **Five-finger drag (fingers spread across the canvas): commit max 1108 ms, of which 1068 ms is the
  patch copy** — the union bbox of five bands ≈ the whole 2732² paper.
* **Drag-to-clear: 575–589 ms hitch on pointerup** (the clear op's fold region is always the full
  paper). Visible in the session trace as a 678 ms `pointerup` task.
* Single long strokes: 90–190 ms commit max (throttled) — the canvas-spanning-squiggle case ADR-0069
  already accepts.

### 2. Every undo tap repaints and re-commits the full canvas

`engine.undo` restores a *patch*, but then calls `repaintAll` — clear + full-paper `drawImage` +
full-canvas compositor damage. In the session run the undo phase produced 12 long tasks (~60–90 ms
throttled per tap) of which only ~8 ms was `engine.undo` JS; the rest is event dispatch + the
full-canvas repaint/commit that follows. At dsf 2 on a 13″ tablet that's a 5.6 M-pixel damage rect
per tap where a stroke-sized one would do.

### 3. Deep undo decode spikes when taps outrun re-inflation

Rapid undo-to-empty on the five-finger scenario hit **159.5 ms max per step** (decode of a ~5 MB
lossless blob + restore + repaint). `reinflateHotSnapshots` (K_LIVE = 2) re-inflates asynchronously,
but a fast tap sequence reaches below the window before decodes land.

### 4. Compositor commit of the 2×-DPR canvas dominates drawing phases (known — ADR-0015)

`Commit` totals under SwiftShader: 40.6 s during the change-colors phase, 13.3 s during draw-single,
6.6 s stroke-size, 4.3 s erase — 64–177 ms per commit at the worst. This is the deliberate
crispness-vs-raster-cost tradeoff (`MAX_RENDER_SCALE = 2`); real GPUs handle it far better and it
should not be re-litigated from headless numbers. One *incidental* cost rides along: the two
full-size crayon overlay canvases are always in the DOM and full-size even in pen-only sessions,
adding two more 2×-DPR layers to composite.

### 5. Crayon live path renders every op three times

A crayon op pattern-paints the bottom overlay, the top overlay mirror, and the paper-space
accumulation buffer — three pattern fills for identical pixels (identity view). Crayon scenarios'
draw totals: 6.6 s vs 1.3 s for the same op volume in pen (≈5×), and 32.4 s for reversal scribbles
whose pass splits add mid-stroke flush stamps (≈25×). Still ~1.2 ms/call throttled (≈0.3 ms real),
so it fits the frame budget today — this is headroom, not a fire.

### 6. Minor / already-known

* `engine.scanEmpty` 8.3 ms once per eraser stroke end — known, low impact.
* `setupDragListeners`, `querySelector`, `addEventListener` in the self-time table are
  Playwright/app-driver harness plumbing, not app hot paths.

## Recommendations

1. **Swap-don't-copy for the clear snapshot.** A clear's fold region is always the full paper —
   instead of `drawImage`-copying 2732² pixels into a patch, adopt the existing paper canvas *as*
   the snapshot raster and allocate a fresh (already-blank) paper. Turns the worst fixed hitch (~575
   ms throttled; ~10 ms-scale real Android per prior baselines) into O(1) pointer swap + allocation.
   Small blast radius (`undoHistory.pushCommand` clear path).
2. **Multi-rect patch capture for multi-finger commits.** Capture one patch per disjoint stroke
   cluster (e.g. per finger) instead of one union bbox; a `Snapshot` holds a list of rect+canvas
   pairs and undo blits each back. Spread five-finger gestures currently degrade to a ~full-paper
   copy (1068 ms throttled); disjoint bands are a fraction of that area. Alternative with broader
   payoff: defer the copy+fold off the `pointerup` task (the `pendingCommands` machinery already
   keeps repaints correct for unfolded commands), so the lift never hitches regardless of rect size.
3. **Rect-limited undo repaint.** On undo, instead of `repaintAll`, clear+blit only the restored
   patch rect (`blitPaperRect` already exists) and replay only pending/active ops that intersect it.
   Cuts both the JS blit and — more importantly on device — the compositor damage from full-canvas
   to stroke-sized, which matters at 120 Hz where there are half as many ms per frame.
4. **Hide the crayon overlays when crayon mode is inactive** (zero-size or `display:none`), so
   pen/magic/eraser sessions composite one 2×-DPR canvas instead of three. Must be verified on a
   real Android device — canvas/compositing changes have burned headless validation before
   (ADR-0051).
5. **Prefetch the next deep-undo decode.** On each undo tap (or button press-down), start decoding
   the entry that will enter the K_LIVE window next, so rapid undo-to-empty never blocks 160 ms on a
   blob decode. Alternatively raise K_LIVE now that live entries are stroke-sized patches (ADR-0069)
   rather than 30 MB full-paper rasters.
6. **Leave `MAX_RENDER_SCALE` and `engine.scanEmpty` alone** — the former is a deliberate product
   tradeoff (ADR-0015) that headless numbers overstate; the latter is once-per-erase-stroke and
   already downscaled.

Items 1–3 attack the only >1-frame hitches the profile found in the interaction path; 4–5 are
device-verifiable wins; none change rendered output except 4 (compositing only, needs on-device
proof).
