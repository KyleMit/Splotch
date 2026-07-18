# ADR-0065: Crayon Brush — Paper-Tooth Pattern with Phase-Offset Buildup

**Status:** Active **Date:** 2026-07

## Context

Splotch shipped one drawing look: a flat, solid-colour pen. We wanted a **crayon** brush that reads
like real wax on textured paper — a dense but broken body with fine paper-tooth grain — and, above
all, that **builds up** the way wax does: drawing a second stroke over existing crayon of the same
colour should fill in more of the paper grain and get denser **without shifting the hue** (no
multiply-style darkening), and it should build up *live* as the finger moves, not snap after the
stroke ends.

The brush has to live inside the existing single-renderer drawing model (ADR-0033/0036), which
imposes three hard constraints that most textured-brush techniques quietly violate:

1. **Bit-identical replay.** Every op is drawn once live and re-drawn on undo/resize/export through
   the same `renderOp()`. `perf:units` enforces ≤2px drift between live and rebuilt.
2. **Deterministic render.** No `Math.random`/time at render — the same drawing must always produce
   the same pixels. Any texture variation must derive from stored stroke data.
3. **Commit-time simplification (ADR-0036).** The op log is thinned 3–5× at commit, so a brush whose
   look depends on *how many per-frame ops* a stroke was chopped into will look different after
   undo.

The starting point was the magic brush (ADR-0043): a per-op `CanvasPattern` threaded through the
shared `renderOp()`. One `stroke()` per op = plain-pen cost.

## Decision

Add a **crayon** brush as a selectable tool (a mutually-exclusive modifier over the pen, like the
eraser and magic brush). A crayon op is an ordinary member of the command log flagged `crayon` with
a stored `seed`; `renderOp()` paints its shape with a **paper-tooth alpha pattern tinted the crayon
colour** instead of a solid fill (`crayonTexture.ts`).

The design that satisfies all three constraints at once:

* **Near-binary, opaque coverage anchored in paper space.** The tooth is a fine value-noise field
  (three octaves + a low-frequency clump field, tuned against real-crayon reference photos), thresh­
  olded to near-binary flecks with soft anti-aliased edges. Where wax lands the paint is **opaque**
  crayon colour; the tooth valleys are transparent. Because the drawing canvas is transparent over
  the real paper texture, the valleys reveal actual paper — the white flecks *are* the paper.
* **Constant hue for free.** Opaque same-colour source-over can never darken or muddy — a second
  pass can only add coverage, never shift the hue. This is what makes buildup safe (no multiply).
* **Input-sampling invariance ⇒ bit-identical + simplification-proof.** Coverage is the tooth ∩ the
  stroke shape, independent of op subdivision: a slow stroke isn't denser than a fast one, and
  thinning the op log at commit preserves the covered pixel set to within the pen's own ≤2px edge
  tolerance. No alpha-accumulation drift.
* **Buildup via a per-stroke-group phase offset.** Within one stroke group every op shares one
  paper-anchored tooth phase, so overlapping per-frame ops paint the *same* tooth pixels —
  idempotent, no frame-joint beading. Each stroke *group* gets a deterministic phase offset derived
  from a stored monotonic `seed`, so a separate later stroke's tooth peaks land in the earlier
  stroke's valleys and fill the gaps — coverage climbs toward solid at constant hue, live and
  gradual as the finger moves. The seed is stored on the op and replayed verbatim, so it's fully
  deterministic.

Integration points: `crayon`/`seed` added to the `StrokeOp` path/dot variants, to the simplify
`sameStyle` key, and carried through `reducePathRun`; `setCrayonMode` (tool) and `setCrayonForced`
(the dev/perf A/B seam, mirroring `setSimplifyParams`, wired onto `window.__engine` on
`/dev/engine`); an Actions Panel crayon button; and `exitToDrawing()` so recolouring keeps the
crayon selected. The tuned texture is the brush's default — there is no second user-facing variant.

## Alternatives rejected

* **Partial-alpha tooth (deposit ∝ tooth every op).** The physically-truest buildup, but each
  per-frame op alpha-accumulates: a slow stroke deposits many layers and turns solid, and
  commit-time simplification changes the number of overlapping joints, so the rebuilt stroke's
  density differs from live — a bit-identical-in-spirit failure. Rejected for input-sampling
  dependence.
* **Per-stroke offscreen layer composited at the tooth (the ADR-0043 mask approach).** Gives perfect
  self-overlap control but costs a full-canvas composite per move (~24 ms/move measured in ADR-0043)
  and makes live buildup a post-stroke snap. Rejected on perf and criterion-5 grounds.
* **A `'multiply'`/darkening blend for overlap.** Directly violates constant-hue — muddies and
  darkens the twice-covered area. Rejected outright.
* **Stroke-aligned (directional) grain.** Real crayon shows faint streaks along the drag direction.
  A stroke-space texture can't be paper-anchored, so it breaks buildup registration and per-op
  idempotency. Deferred: paper-tooth is the dominant, must-have feature; directional streak is a
  secondary polish that fights the model.

## Consequences

* **+** Convincing wax-on-paper look with true same-hue buildup, verified against real-crayon
  reference photos and an automated Gemini vision judge (`.crayon-scratch/` during development).
* **+** Plain-pen performance: one pattern `stroke()` per op. Under `perf:web --crayon` (4× CPU
  throttle) `engine.draw` averaged 0.4 ms/op, max 4.0 ms/frame (vs 0.3 ms / 3.1 ms for the pen) —
  within the ≤2 ms-avg / <8 ms-frame budget. Undo/replay is bounded by keyframing (ADR-0035).
* **+** Bit-identical: `perf:units --crayon` passes 0/10 fail, worst shift 2.0 px — the pen's own
  tolerance. Undo/redo/resize/export reproduce the stroke, tooth and buildup exactly.
* **+** Deterministic: texture variation is the stored `seed`; no render-time randomness.
* **−** A single continuous self-crossing scribble (one group, one phase) densifies less at its own
  crossings than a multi-pass scribble would — buildup is per-stroke-group, not per-overlap. The
  explicit product need is separate-stroke buildup, which this nails; watch the scribble render if
  this ever matters.
* **−** No stroke-direction grain (see rejected alternatives).

Builds on ADR-0043 (per-op `CanvasPattern` in `renderOp`), ADR-0033/0035/0036 (replay/keyframe/
simplify invariants), and respects the Safari 16.4 canvas floor (`createPattern` +
`CanvasPattern.setTransform` behind the `DOMMatrix` guard; no `ctx.filter`, no `OffscreenCanvas`).
