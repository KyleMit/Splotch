# ADR-0036: Simplify Stroke Ops at Commit So Undo Replays Few Segments

**Status:** Active
**Date:** 2026-06

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
  stroke's shape. A forced rebuild-from-stored-ops, pixel-diffed against the
  unsimplified engine on a thick-brush session, differed in **2.2%** of pixels
  (mean 3.8/255), all on stroke boundaries — visually indistinguishable.
- "Bit-identical replay" was never user-visible: stored ops only matter *after*
  an undo/resize rebuild, when the simplified strokes are what gets re-drawn.
- Real strokes thin a lot: **3.0×** fewer points on a tap-heavy session, **4.6×**
  on a deliberate-drawing session, at a quality-safe tolerance — enough that
  neither real session triggered a keyframe at all.

## Decision

**Simplify each command's stored ops once, at commit (off the draw frame), with
Ramer–Douglas–Peucker — and keep ADR-0035 keyframing only as a bounded safety
net.** Live rendering is untouched (the user still sees every sample); only the
replay copy is thinned. In `web/src/lib/drawing/engine.ts`:

- `simplifyCommand(cmd)` runs in `pushCommand`, *before* `maybeKeyframe`. It
  regroups the command's interleaved per-frame path ops **by pointer id** (a
  multi-touch command's fingers interleave in the op list), then splits each
  finger's ops into spatially-continuous, same-style sub-runs — a pointer-resume
  jump (ADR's `pointerWasResumed`) or a mid-stroke color/eraser change breaks
  continuity, so no stray line bridges a gap — and reduces each sub-run to one
  path op. Dots and clears pass through in place; each finger's reduced ops are
  emitted at the position of its first op, so the single-finger common case keeps
  exact compositing order.
- `rawPointsOf` recovers the polyline the run actually rendered (each segment's
  control point *is* the raw sample at its chord's start; the run closes at the
  last segment's anchor — the midpoint the live curve drew to — not the final raw
  sample, so the simplified stroke spans exactly what was on screen). `rdpSimplify`
  thins it (iterative, stack-based — a long monotonic stroke can't blow the call
  stack).
- `smoothToSegs` re-renders the kept points with a **centripetal Catmull-Rom
  spline** (emitted as cubic Bézier segments — the path op's `segs` gained
  optional `c2x`/`c2y`, and `renderOp` calls `bezierCurveTo` when present). This
  is the one subtle part: the live draw smooths with *midpoint quadratics* that
  use each raw point only as a control the curve bulges toward, never reaching it.
  That undershoot is sub-pixel when points are dense, but after RDP the survivors
  are far apart, so re-using midpoint smoothing made the curve fall ~25% short of
  every turning point — a back-and-forth scribble visibly shrank at its tips on
  replay. An *interpolating* spline passes through every kept point, so tips land
  exactly; centripetal parameterization (α = 0.5) avoids the loops/overshoot
  uniform Catmull-Rom produces on RDP's uneven spacing. Guarded by an engine-spec
  test that asserts a scribble's horizontal extent survives a rebuild.
- Tolerance `simplifyEpsilonFor(lineWidth)` scales with stroke width
  (`0.2×width`, clamped `[2, 16]` device px): a wiggle far below the round brush's
  radius is invisible, so a thick stroke tolerates a coarser polyline than a thin
  one.
- `maybeKeyframe`'s trigger moved from "raw op count > 48" to **simplified
  segment count > `KEYFRAME_SEGMENT_THRESHOLD` (384)**. Simplification collapses
  a normal long scribble well under that, so keyframes now fire only for a
  genuinely all-corners pathological gesture (every frame a real direction
  change, which RDP can't thin) — bounding worst-case undo at one `drawImage`
  blit. Peak segment count in the profiled real sessions was ~140, so the net
  stays dormant in practice.
- New `engine.simplify` user-timing mark; `getUndoDebug()` gains `maxSegments`
  (heaviest retained command's replay cost) and lifetime `rawPoints`/`keptPoints`
  counters for the harness and the engine spec.

## Consequences

- **+** Undo/resize replay drops to the kept-point count (3–4.6× fewer segments
  on real input); on the profiled sessions no keyframe fires, so the engine
  carries **kilobytes** of point arrays instead of tens of MB of keyframe rasters.
- **+** `commit` raster work falls (the keyframe build is skipped in the common
  case); `simplify` is ~1 ms total across a session, off the draw frame.
- **+** ADR-0035's keyframe machinery still guarantees O(1) worst-case undo for a
  pathological stroke — best of both, rather than a replacement.
- **−** Stored ops are no longer a bit-identical record of what was drawn: a
  rebuilt stroke's antialiased edges can shift ≤1px (measured 2.2% of pixels). For
  a toddler finger-paint app this is below the perceptual floor; an app needing
  exact replay could not make this trade.
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
