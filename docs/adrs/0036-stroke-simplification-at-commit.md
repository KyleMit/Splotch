# ADR-0036: Simplify Stroke Ops at Commit So Undo Replays Few Segments

**Status:** Active — **enabled by default**, since 2026-07 with the **'samples'
reconstruction** (see "Revision"), which halved the worst-case rebuild shift the
first shipped ('spline') reconstruction left. (An earlier revision disabled
simplification entirely, having concluded it couldn't be made imperceptible;
that conclusion was wrong — it rested on a strict 0px bar and a reconstruction
*bug*, not a real floor. See "Outcome".) ADR-0035 keyframing remains as a
bounded safety net.
**Date:** 2026-06 (revised 2026-07)

## Revision (2026-07): rebuild in the live curve family ('samples' mode)

The spline reconstruction below shipped and passed the ≤2px gate on average,
but its worst strokes (fat-brush fast scribbles) still shifted 2.5 CSS px on
their first rebuild — users noticed surviving strokes "jump" at the moment of
undo. The root cause was structural: fitting a *different* curve family
(corner-aware Catmull-Rom through derived on-curve points) to a curve the live
draw produced with midpoint-smoothed quadratics, then patching the mismatches
(corner splits, apex splicing) heuristically.

The revision drops the family mismatch. `sampleReducedOps` rebuilds each run
with the **exact construction the live draw used**, over a thinned subset of the
**original finger samples** (fully recoverable from the stored ops — each
segment's control IS a raw sample; the final sample is the last control
reflected through the last anchor):

- **RDP thins the raw samples** (epsilon `0.03×lineWidth`, clamped [1, 6]
  device px — tuned down from 0.05 by the perf:units sweep).
- **Pinning makes the noticeable places exact.** A sharp-turn sample is kept
  with its two immediate neighbours (the live bulge toward an apex is a function
  of exactly those three positions, so the rebuilt tip IS the live tip); the
  last sample's predecessor is kept so the stroke ends on the live end anchor;
  and a **bulge-refinement** pass re-inserts neighbours wherever the live
  curve's deepest reach toward a kept sample (its quadratic vertex) would sit
  more than epsilon from the rebuilt curve — catching moderate turns the 40°
  corner test misses. (The distance test must project onto the quadratic —
  bracket + ternary refine — not sample it coarsely: with a coarse min-of-9
  metric even a point ON a long span reads as tens of px away, and the pass
  cascades into keeping everything.)
- **Consecutive duplicate samples** (a finger holding still) are where midpoint
  smoothing genuinely breaks tangent continuity and passes THROUGH the sample:
  they collapse to one pinned point and the emitted op **splits there** (each
  side landing exactly on the point via a doubled tail sample), so two round
  caps reproduce the live corner disc. Everywhere else midpoint smoothing is
  C1-continuous — the merged op needs no corner splitting at all, which is what
  frees this mode from the spline mode's split-at-every-corner machinery.
- Re-applying midpoint smoothing over the kept samples then yields quadratics
  in the same family the live render drew; where samples were kept densely
  (turns, tips, corners) the rebuilt segments are numerically identical to the
  live ones.

Measured on the same 64-unit battery (`perf:units`): **0 / 64 over the 2px
gate, worst shift 1.5 CSS px** (spline mode: 4 over, worst 2.5 px — including
the reported scribble, which drops from 2.5 px at 40.9× to 1.0 px at 14.7×), at
a mean **~2.7×** point reduction (spline: ~4.3×). Real-session replays: still
**0 keyframes**, undo unchanged at ~0.1 ms, commands collapse to ≤7 merged ops.
The trade is deliberate: ~1.6× more retained segments than spline in exchange
for structurally exact tips/corners — memory is the least-binding constraint
and the ADR-0035 keyframe net still bounds the pathological case. Commit-time
`engine.simplify` grows from ~1 ms/session to ~2 ms avg / ~14 ms worst per
commit at 4× CPU throttle (the bulge refinement's curve-projection test
dominates) — still at pointerup, off the draw frame, well under the ~25 ms
keyframe build the same phase already tolerates. 'spline' stays available
behind `setSimplifyParams({ mode })` for comparison sweeps; the mechanism it
uses is documented below as originally shipped.

## Outcome (the floor was a bug, not a representation limit)

An earlier revision disabled this ADR, reporting that *no* geometry replay could
match the live render — even all-points-kept rebuilds shifted ~half a brush width
at sharp corners — and shipped exact per-frame op replay instead. That was a
misdiagnosis. Two things were wrong:

1. **The bar was artificial.** It gated on *exact* 0px pixel identity. The real
   requirement is *imperceptibility*: a shift under ~1–2 CSS px is invisible. RDP
   thins a stroke enormously inside that budget.
2. **The "half-brush corner shift" was a reconstruction bug**, mistaken for an
   inherent floor. `rawPointsOf` recovered each segment's **off-curve control
   point** (the raw sample the midpoint quadratic only bulges *toward*) and then
   re-smoothed it, **applying the midpoint halving a second time** — so every
   rebuilt stroke rendered at roughly half length, saturating the diff. The "merged
   round-join vs. per-frame round-cap" difference is real but is a property of
   *merging*, not of simplification, and is fixed by not merging (below).

Reworking the reconstruction (same `perf:units` harness, now gated at the
perceptual **≤2 px** instead of 0px) closed it:

- Recover the **on-curve anchor points** the live curve actually passed through
  (run start + each segment anchor), not the control points.
- Re-interpolate **through** them with the corner-aware centripetal Catmull-Rom,
  and at a sharp reversal **splice the raw apex back in** so a fast back-and-forth
  tip reaches as far as the live bulge did (it would otherwise sit just inside).
- **Split the reduced run into one sub-stroke per span between corners**, so each
  kept corner is a stroke boundary that renders a round **cap** — the same full
  disc the live per-frame draw leaves at every frame — instead of a merged round
  **join**. This removes the corner shift the earlier rebuild was blamed for.

Result on the 64-unit battery (synthetic primitives + every stroke extracted from
the real sessions): **worst-case shift 2.5 CSS px, the bulk far under 1px**, at a
mean **~4.3× point reduction** (a 441-point, 32px-brush zigzag rebuilds from **10**
segments, visually identical). The 2.5px cases are single worst-pixels of edge
antialiasing on otherwise dead-on curves. Real sessions: undo ~0.1 ms, **no
keyframes fired**, longest command collapses to ≤28 replay ops. The
`setSimplifyParams` dev seam and the `perf:units` / `perf:sweep` harnesses stay
for re-tuning. The rest of this ADR documents the mechanism as shipped.

## Context

ADR-0033 made undo a command-replay over a log of stroke ops; ADR-0035 added
raster keyframes so a long command doesn't re-stroke thousands of segments on
every undo/resize. Keyframes work, but they spend a full `max(w,h)×renderScale`
square raster (tens of MB across the retained log) and put a one-time replay onto
a square at finger-lift. The keyframe was a *workaround* for the real
inefficiency: `draw()` records **one path op per pointermove frame**, so a single
finger stroke stores hundreds of near-collinear samples that undo then
re-strokes one quadratic at a time.

ADR-0033 had explicitly rejected "cap ops per command by coalescing/decimating
points," on two grounds: it would change rendered pixels (ADR-0033 recorded ops
at exact `stroke()` granularity for bit-identical replay), and a decimated long
stroke would still replay many ops. Both objections turned out to be weaker than
assumed, and measurement (the `perf:replay` harness, ADR-0032, on two real
finger recordings) showed why:

- The rendered curve already **approximates** rather than interpolates its
  samples (midpoint-smoothed quadratics — see `strokeSmoothSegments`), so dropping
  a near-collinear sample shifts only antialiased stroke *edges*, not the
  stroke's shape. A forced rebuild-from-stored-ops, diffed against the live render
  (corner-aware spline, below), moves **< 1%** of a stroke's ink beyond ~1px on
  real recordings — visually indistinguishable (see the sweep, below).
- "Bit-identical replay" was never user-visible: stored ops only matter *after*
  an undo/resize rebuild, when the simplified strokes are what gets re-drawn.
- Real strokes thin a lot: **3.0×** fewer points on a tap-heavy session, **4.6×**
  on a deliberate-drawing session, at a quality-safe tolerance — enough that
  neither real session triggered a keyframe at all.

## Decision

**Simplify each command's stored ops once, at commit (off the draw frame), with
Ramer–Douglas–Peucker — and keep ADR-0035 keyframing only as a bounded safety
net.** Live rendering is untouched (the user still sees every sample); only the
replay copy is thinned. In `web/src/lib/drawing/commandSimplify.ts` (the
command-level orchestration, extracted from `engine.ts`; the per-run geometry
stays in `strokeSimplify.ts`):

- `simplifyCommandOps(ops)` runs in `undoHistory.pushCommand`, *before*
  `maybeKeyframe`. It
  regroups the command's interleaved per-frame path ops **by pointer id** (a
  multi-touch command's fingers interleave in the op list), then splits each
  finger's ops into spatially-continuous, same-style sub-runs — a pointer-resume
  jump (ADR's `pointerWasResumed`) or a mid-stroke color/eraser change breaks
  continuity, so no stray line bridges a gap — and reduces each sub-run to one
  path op. Dots and clears pass through in place; each finger's reduced ops are
  emitted at the position of its first op, so the single-finger common case keeps
  exact compositing order.
- `rawPointsOf` recovers the **on-curve** polyline the run actually rendered: the
  run's start point plus each segment's **anchor** (`s.x`,`s.y`) — the points the
  live midpoint quadratics passed *through*. It deliberately does **not** use the
  segments' control points (`s.cx`,`s.cy`), which are the off-curve raw samples the
  curve only bulges toward; feeding those back through smoothing double-applies the
  midpoint halving and renders the stroke at half length (the original
  shrink-on-undo bug, see "Outcome"). One refinement: where a control forms a sharp
  apex between its bracketing anchors (a fast reversal), the apex is **spliced back
  in**, because there the anchors sit just inside the tip the live bulge reached.
  `rdpSimplify` then thins this polyline (iterative, stack-based — a long monotonic
  stroke can't blow the call stack).
- `smoothToSegs` re-renders the kept on-curve points with a **corner-aware
  centripetal Catmull-Rom spline** (emitted as cubic Bézier segments — the path
  op's `segs` gained optional `c2x`/`c2y`, and `renderOp` calls `bezierCurveTo`
  when present); a two-point span is a straight chord to the real endpoint (a
  midpoint-style segment would stop halfway and shrink the span). Because the kept
  points are *on* the live curve, an interpolating spline through them tracks it
  directly. A point whose chord turn is sharper than `cornerAngleDeg` (40°) is a
  **corner**: its tangents are forced along the adjoining chords so the turn stays
  sharp and in place (a plain smooth spline would round a hook into a displaced
  bend) while smooth spans stay smooth.
- `reducePathRun` then **splits the kept polyline at each corner into separate
  path ops** (`simplifySplit = 'corner'`), each sharing the corner point with its
  neighbour. Rendered as separate `stroke()`s, the two round **caps** meeting at
  the corner reproduce the full disc the live per-frame draw leaves there — where a
  single merged op would round-**join** and shift the corner by up to half the
  brush width. Smooth spans (no corner) stay one op. This is what removed the
  corner error the disabled revision had blamed on simplification itself.
  Guarded by engine-spec tests asserting a scribble keeps its extent and a hook
  keeps its corner after a rebuild.
- Tolerance `simplifyEpsilonFor(lineWidth)` scales with stroke width
  (`0.05×width`, clamped `[1, 6]` device px): a wiggle far below the round brush's
  radius is invisible, so a thick stroke tolerates a coarser polyline than a thin
  one. Tuned down from an initial `0.2× / [2,16]` once the reconstruction was
  fixed — at the looser tolerance a few sparse real strokes shifted 3–8 px; the
  `perf:units` sweep settled the whole battery under the perceptual bar here while
  still averaging ~4.3× reduction.
- `maybeKeyframe`'s trigger moved from "raw op count > 48" to **simplified
  segment count > `KEYFRAME_SEGMENT_THRESHOLD` (384)**. Simplification collapses
  a normal long scribble well under that, so keyframes now fire only for a
  genuinely all-corners pathological gesture (every frame a real direction
  change, which RDP can't thin) — bounding worst-case undo at one `drawImage`
  blit. Peak segment count in the profiled real sessions was ~140, so the net
  stays dormant in practice.
- New `engine.simplify` user-timing mark; `getUndoDebug()` gains `maxSegments`,
  `totalSegments`, and lifetime `rawPoints`/`keptPoints` counters for the harness
  and the engine spec.

## Empirical tuning (`npm run perf:units`, `npm run perf:sweep`)

The algorithm and its constants were chosen empirically, not guessed, through a
dev-gated `setSimplifyParams()` seam (wired onto `window.__engine` only on
`/dev/engine`) so a single build can sweep every setting (`fraction`/`min`/`max`,
`cornerAngleDeg`, `mode`, `split`, `enabled`).

`perf:units` (`scripts/perf/stroke-units.mjs`) is the deciding harness: a battery
of **64 individual strokes** — synthetic primitives from a dot to a tight zigzag,
**plus every stroke extracted from the real recordings** — each drawn live, then
force-rebuilt from its stored ops and diffed at the worst-pixel level (nearest-ink
ring search), gated at the perceptual **≤2 CSS px**. Treating each stroke as a
unit test was what surfaced the half-length reconstruction bug (a straight line
with *zero* points dropped still "shifted" 8.5px → the rebuild was drawing half
the line) that a whole-canvas, AA-tolerant *moved-ink* metric had hidden. Walking
the fixes through it — on-curve points, then the 2-point-span straight fix, then
apex re-insertion, then the epsilon tune — drove the worst case from 8.5px to
**2.5px** across all 64 units at ~4.3× reduction.

`perf:sweep` (`scripts/perf/simplify-sweep.mjs`) complements it for whole-canvas
realism: a grid of **non-overlapping** synthetic strokes, **one** forced rebuild
(a single undo rebuilds *every* retained command since the last baseline, so one
rebuild exposes all strokes at once; the grid keeps per-stroke attribution
unambiguous), diffed against *total segments replayed* as the iPad-cost proxy.

## Consequences

- **+** Undo/resize replay drops to the kept-point count (3–4.6× fewer segments
  on real input); on the profiled sessions no keyframe fires, so the engine
  carries **kilobytes** of point arrays instead of tens of MB of keyframe rasters.
- **+** `commit` raster work falls (the keyframe build is skipped in the common
  case); `simplify` is ~1 ms total across a session, off the draw frame.
- **+** ADR-0035's keyframe machinery still guarantees O(1) worst-case undo for a
  pathological stroke — best of both, rather than a replacement.
- **−** Stored ops are no longer a bit-identical record of what was drawn: a
  rebuilt stroke can shift up to ~2.5 CSS px at a worst pixel (the bulk far under
  1px) — verified imperceptible on the `perf:units` battery, but an app needing
  exact replay could not make this trade.
- **−** Corner-splitting emits one `stroke()` per span between corners instead of
  one per command, so a very wiggly stroke replays as several sub-strokes. Still
  far fewer ops than the per-frame original (session2's longest command: 28 vs.
  hundreds), and each is a cheap short stroke.
- **−** A multi-touch command's *interleaved* per-finger ops are reordered into
  per-finger runs, so two simultaneous overlapping strokes of different colors
  could composite in a different top-to-bottom order than drawn. Rare in practice
  (toddler multi-touch rarely overlaps with distinct colors mid-gesture) and never
  affects the single-finger case.
- **−** One tunable lever (`SIMPLIFY_EPSILON_*`) trades fidelity for reduction; set
  conservatively, revisit if corner-cutting is ever visible on thick strokes.

Builds on the command-replay log of **ADR-0033** (and supersedes its
"decimate points" rejected alternative with measured fidelity data) and the
keyframe/rebuild machinery of **ADR-0035** (whose trigger this re-bases onto
simplified segment count); adds the `engine.simplify` mark to the **ADR-0032**
profiling set.
