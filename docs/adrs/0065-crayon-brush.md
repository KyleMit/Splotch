# ADR-0065: Crayon Brush — Screened Wax on Paper Tooth

**Status:** Active **Date:** 2026-07

## Context

Splotch's default pen laid down a flat, solid-colour stroke — it read like a marker, not the waxy
crayon a toddler drawing app wants. We wanted a brush that convincingly reads as **wax on textured
paper**: a dense body broken by fine paper tooth, with a crisp-but-broken edge, and — the behaviour
that actually sells "crayon" — **wax buildup**: drawing a second same-colour stroke over an existing
one should fill more of the paper grain and get denser *without shifting the hue* (real wax layers,
it does not multiply-darken like ink).

The hard constraint is Splotch's single-renderer op model (ADR-0033): live drawing and every replay
(undo, resize, PNG export, keyframe fold) paint the *same* recorded ops through the *same*
`renderOp`, and a 0-pixel-drift test enforces that they match. So the brush has to be
**deterministic at render time** (no `Math.random`/time in `renderOp`) and survive commit-time
simplification (ADR-0036) with no visible change.

Alternatives considered and rejected:

* **Partial-alpha per-op deposit** (soft stamps/texture composited per op). Within one stroke the
  per-frame path ops overlap at their round-cap joints; source-over of a *translucent* colour onto
  itself is not idempotent, so joints would bead, and re-segmenting at commit would shift the beads
  — a visible "snap" and a replay-drift failure. Rejected.
* **Multiply/darken blend for buildup.** Trivially darkens and muddies the hue on overlap — the
  opposite of wax. Rejected.
* **Paper-locked grain with a fixed threshold.** A second same-colour pass would deposit on the
  exact same texels and never fill the pits, so nothing builds up. Rejected.

## Decision

A crayon stroke is painted by **stroking the ordinary path/dot ops with a `CanvasPattern`** whose
tile is the stroke colour punched through a fixed **paper-tooth mask**
(`web/src/lib/drawing/crayonTexture.ts`, dispatched from `renderOp` in `strokeOps.ts`). Two
properties make it correct:

* **Opaque, overlap-idempotent.** The tooth mask is binary (a texel is fully opaque wax or fully
  bare paper — no partial alpha) and all ops of one stroke share one tooth phase, so overlapping ops
  of the same stroke deposit the identical opaque texels. Source-over of an opaque colour onto
  itself is a no-op, so joints never bead and commit-time re-simplification re-strokes to the same
  pixels — the same reason a solid pen survives replay. This is what keeps buildup **live and
  gradual** (it happens as the second stroke is drawn) with **no commit snap**.
* **Buildup by complementary coverage.** Each stroke stores an integer `seed` (`StrokeOp.seed`,
  captured once per stroke — capture-time randomness is allowed, only render-time is not) that
  phase-offsets the tooth tile. A second same-colour stroke gets a different seed, so it fills the
  paper pits the first pass missed. Because both deposit the *identical opaque colour*, the overlap
  never shifts hue or darkens — it only covers more grain and reads denser. Measured coverage climbs
  ~0.82 → 0.97 → 0.999 over one/two/three passes.

Determinism: the tooth mask is generated once from a **fixed internal seed** (multi-octave tileable
value noise, thresholded at a quantile for exact coverage), so it is identical on every device and
every replay; the only per-stroke variation is the stored `seed`'s integer phase offset. The pattern
is anchored in paper coordinates via `pattern.setTransform` (the same mechanism the magic brush
already ships, ADR-0043), so it lands identically on the visible canvas, the square baseline,
keyframes and exports.

Crayon is a **pen-mode brush variant**, orthogonal to the eraser/magic modifiers. The engine's own
default stays `'pen'` so the low-level `/dev/engine` harness specs are unaffected; the app opts into
`'crayon'` as its product default through the `DrawingCanvas` bridge (`toolState.style`), and the
`/dev/engine` harness exposes `setBrushStyle` to A/B pen vs crayon — the same dev-selectable-variant
pattern as `SimplifyMode` (ADR-0036). The tooth mask is warmed at idle on engine init so its
one-time generation never lands on the child's first stroke.

Colour tiles (mask tinted per stroke colour) are cached with a bounded LRU (16 colours); the tooth
mask and pattern are memoized per stroke so replay is one `createPattern` per stroke, not per op.

## Consequences

\+ Reads as waxy crayon on paper: dense body, fine contained tooth, broken-but-crisp edge — clearly
not a marker (verified against generated real-crayon references and the brush perf harness).

\+ Wax buildup at constant hue falls out of ordinary source-over compositing — no special blend, no
extra op state beyond one stored integer, and it works live/gradually with no commit snap.

\+ Zero change to the op/undo/replay/export model: crayon ops are ordinary path/dot ops with two new
optional fields, so undo, resize, keyframe fold and PNG export reproduce them exactly, and the
0-pixel-drift test stays green. Rendering stays deterministic (stored seed, fixed mask).

\+ On the drawing hot path under the 4× CPU-throttled phone harness: avg per-op draw ~0.3 ms, max
~3.2 ms, no long tasks — well inside budget.

− The tooth is a repeating tile (512 px in paper space); on a very large single-colour fill the
repeat is technically periodic, though the fine grain keeps it visually invisible at app scale.

− Buildup comes from per-stroke *phase-shifted* grain rather than grain that is strictly locked to
the paper across strokes, so the union of many passes is not a single fixed paper texture. The end
result (denser, constant hue) reads correctly, but it is a faithful approximation, not a physical
paper simulation.

− A new colour builds (and caches) a tinted 512² tile on first use; a session that rapidly cycles
many distinct colours pays a few ms per new colour off the draw hot path.
