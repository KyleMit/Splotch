# ADR-0065: Crayon Brush — Swept Deposition Passes over a Paper-Anchored Tooth Pattern

**Status:** Active **Date:** 2026-07

## Context

Splotch wanted a wax-crayon pen tip: a dense wax body broken by fine organic paper tooth, a crisp
but ragged deposit contained inside the swept stroke, and — the behavior 33 prior experiments kept
failing — **visible buildup wherever the crayon genuinely covers the same paper again**, including
backtracking and self-crossing inside one continuous gesture, while the hue stays exactly the
selected color.

A review of all 33 experimental implementations (PRs #353–#417) distilled two hard constraints:

1. **Translucent ink breaks the engine's per-frame op model.** The pen records one round-capped path
   op per pointer frame; adjacent ops overlap at their caps. Opaque ink hides that; a translucent
   crayon deposits again at every overlap, printing periodic dark circles at frame boundaries and a
   double-deposited start dot. Every texture family tried — hash tiles, blue noise, fBm height
   fields, carved masks — was defeated by this geometry, not by its noise.
2. **A non-idempotent brush cannot pass through generic simplification.** Commit-time simplification
   (ADR-0036) legally rewrites geometry only because re-stroking an opaque line a little differently
   is invisible. Replaying a translucent stroke with fewer/merged deposits visibly fades or shifts
   it — the two undo failure classes (dropped brush metadata, changed deposit topology) that sank
   otherwise-liked candidates.

The liked experiments agreed on the texture family: exact crayon RGB with a deterministic,
paper-anchored, multi-scale height field mapped **continuously to alpha only** — a small nonzero
valley (tooth that can still color in) under a near-opaque peak, with headroom for a second pass to
read denser. Binary masks, permanent zero-alpha pits, global pass counters, bounding-box overlap
heuristics, multiply darkening, and distance-driven density were all rejected on evidence.

## Decision

### Deposition: one union-stroke per pass

A crayon gesture is recorded as a sequence of **passes**. Each pass is a raw polyline stored in a
new `crayon` op, rendered by **a single Canvas `stroke()` call** (midpoint-quadratic smoothed, round
caps/joins, the tooth pattern as `strokeStyle`). Canvas path-tracing semantics make one stroke call
deposit its paint **exactly once over the union of the swept area** — overlapping segments inside
one call cannot darken. That single primitive eliminates the frame-boundary problem by construction:
pointer-frame batching, event rate, and coalescing cannot change the deposit, there are no per-frame
caps to stack, and the only caps are the gesture's real start and end. A single-point pass renders
as the bare tip disk (a tap).

**Buildup is the pass boundary.** `CrayonPassTracker` (pure, unit-tested) splits the gesture where
the physical crayon re-covers its own paper: a sharp reversal (direction anchors ≥ ~⅓ stroke-width
apart turning > ~100°) or re-entry (the tip landing within ~0.45 × width of trail laid more than
~2.5 × width of arc ago). Consecutive passes composite source-over, so a scribble's return sweep, a
loop's crossing, and a separate second stroke all deepen coverage — live, under the finger, at the
same hue: `accumulated = 1 − (1 − a)ⁿ` for n real traversals.

### Texture: deterministic paper tooth in alpha only

One seamless height tile (256 CSS px period, generated at `renderScale` so tooth size is DPR-
stable) from periodic value-noise fBm — fine-to-medium octaves dominant, a subtle coarse density
drift, a light domain warp — hashed from constants: no RNG, no per-stroke state. A continuous
transfer (contrast stretch → smoothstep polarization → gamma) maps height to alpha between a nonzero
valley (≈0.05 — white flecks on the first pass that still color in under enough overdraw; no
permanent pits) and a ≈0.96 peak. Tiles are tinted per color (exact RGB everywhere) and served as
origin-anchored repeating `CanvasPattern`s cached per color and per target context — fixed paper
phase, so grain can never move between surfaces or sessions. Tile generation is warmed off the hot
path when the crayon or its color is selected (`scheduleIdle`).

### Edges: concentric deposition layers, solved to a fixed composite

A single full-width pattern stroke gives the tip a solid round outline — but a real crayon presses
hardest mid-strip, and toward the rim the wax only catches the tallest tooth, so the edge breaks
into scattered flecks. Each pass is therefore stroked as **concentric layers** of the same polyline
(the nested-density-passes idea from the #415 experiment, adapted to swept passes): a full-width
**fringe** layer whose transfer deposits sparse near-opaque flecks only above a high tooth-coverage
threshold, a mid ring at 0.84× width, and a dense **core** at 0.64× width. All layers read the same
paper-anchored height field, so fringe flecks land exactly on the texels the body reads as raised
tooth, and every surface (live, replay, export) tiles them identically.

The core layer's transfer is not tuned independently — it is **solved per-texel** so the layers'
source-over composite reproduces the single-tile transfer exactly:
`1 − Π(1 − layerᵢ(h)) =
deposit(h)` (unit-tested; byte-identical within 1/255). The stroke interior,
exact-hue behavior, and buildup headroom are therefore unchanged by the edge treatment; only the rim
annuli — which receive just the fringe layers — break up. Fringe peaks are capped so the solve never
clamps. Because each layer is still one union-stroke through `renderOp`, all replay/undo invariants
hold per layer exactly as they do for one; the E2E hash-equality pins stayed green unchanged, and a
new pin asserts the rim rows read far lighter than the core.

### Live rendering: a presentation-only overlay

An open pass grows every frame, so it cannot be painted incrementally onto the main canvas. The
engine mounts a pointer-events-none **overlay canvas** directly above the drawing canvas and
re-strokes the open pass(es) there each pointer frame (clear + one stroke per active pointer). A
pass is stamped onto the main canvas through the shared `renderOp` **exactly once, at close**
(split, resume, or lift), and recorded at the same moment. Replay therefore performs the identical
stamps in the identical order — **live pixels and undo/resize/keyframe/export rebuilds agree by
construction**, which the E2E suite pins with full-canvas hash equality.

### Replay contract

* `crayon` ops carry everything needed to reproduce the deposit (points, color, lineWidth) and
  **bypass commit-time simplification entirely** (they are not `path` ops, so ADR-0036 passes them
  through untouched).
* Replay cost is bounded by ADR-0035 instead: `commandSegmentCount` counts raw pass points, so a
  long crayon scribble collapses into a keyframe at commit.
* The crayon is a **latched pen-tip style**, not a third modifier: `toolState.crayon` survives color
  picks and eraser/magic detours (those win while selected; the engine gates the tip per stroke
  start). The tip draws 1.5× the pen's width (`CRAYON_SIZE_MULTIPLIER`, following the
  eraser-multiplier precedent) — a kid's crayon is chunky, and the wider strip gives the tooth room
  to read.

## Consequences

* **No seams, no start-dot bulb, event-rate invariance** — pixel-tested: a straight path sampled at
  40 points and at 2 points hashes identically, and no pixel of a single pass can exceed the tile's
  peak alpha.
* **Mid-gesture buildup with zero extra state.** No pass counters, group masks, or full-canvas
  scratch surfaces; the command log is the only record. Undo, eraser, export, rotation-lock, and
  keyframes all work unchanged because a crayon pass is an ordinary op (the ADR-0043 pattern-paint
  precedent, extended with its own geometry).
* **A stroke that straddles a clear keeps its whole open pass.** Passes stamp at close, after the
  clear op, so live and replay agree — the continuing stroke survives the wipe entirely rather than
  losing its pre-clear half (slightly different from the pen, accepted for consistency).
* **Dwelling with a wiggling finger slowly darkens the tip area** (accumulated jitter arc eventually
  re-enters the trail) — physically plausible, bounded per split.
* **Each pass strokes once per layer** (currently 3×), tripling the per-pass draw and tile-memory
  cost — measured far under budget (single-stroke draw was ~0.014 ms avg at 4× throttle), accepted
  for the edge fidelity.
* **Simplification is off for crayon ops**, so retained crayon commands replay their raw points; the
  keyframe safety net (which now counts crayon points) bounds the worst case. A brush-aware
  simplifier would need to prove 0-pixel drift first.
* **A hairpin gentler than the split thresholds deposits once** (union semantics) — the tooth still
  shows, and sharp reversals/crossings (the toddler cases) split correctly.
* The overlay canvas is engine-owned DOM (inserted after the canvas, z-index 1): components don't
  manage it, but it must keep matching the canvas box and paper-view transform on resize —
  `resizeCanvas`/`applyPaperView` own that.

## Alternatives considered

* **Per-frame translucent ops (the pen's model)** — the proven failure mode: cap circles at every
  frame boundary. Rejected on 33 experiments' evidence.
* **One union-stroke per whole gesture** — no frame artifacts, but self-overlap becomes idempotent
  (no mid-gesture buildup); the same flaw that rejected single-mask designs (#353, #392).
* **Explicit buildup state** (global per-color counters, bounding-box overlap layers, distance-
  driven density) — counts the wrong thing; rejected variants #391, #397, #416.
* **Custom swept-strip tessellation** (butt-joined quads + join wedges) — the fully general
  geometry; deferred because abutting-polygon antialiasing seams reintroduce per-boundary artifacts
  the union-stroke primitive avoids for free, at the cost of the gentle-hairpin corner above.
* **Post-stroke settle/snap, multiply darkening, paper-image overlays** — explicitly rejected by
  review feedback (hue shifts, pointer-up pops, "wearing a paper costume").
