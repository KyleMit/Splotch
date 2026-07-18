# ADR-0065: Crayon Brush — Opaque Wax-on-Tooth Coverage with Coherent-Jitter Buildup

**Status:** Active **Date:** 2026-07

## Context

Splotch is a drawing app for toddlers. We want a **crayon** brush that convincingly reads as wax on
textured paper — a dense body with visible fine paper-tooth grain, not a marker's flat fill and not
a pen with noise sprinkled on it. The behaviour that matters most is **wax buildup**: drawing a new
crayon stroke over existing crayon of the *same colour* should fill more of the paper grain and get
denser, while **staying the same hue** — pressing again fills the tooth, it does not darken or muddy
the colour.

Whatever we build has to live inside the engine's load-bearing invariants:

* **Single renderer, op-replay (ADR-0033).** Live drawing, undo, resize, and PNG export all replay
  the same stored ops through one `renderOp`, so a stroke must reproduce **bit-identically** across
  every surface. The engine spec enforces this (an undone stroke returns pixel-count-for-count).
* **Commit-time simplification (ADR-0036).** A committed stroke's per-frame ops are thinned and
  re-emitted, so the render must be **idempotent under overlap** — the many overlapping live ops and
  the few simplified ops have to land the same pixels, and a stroke crossing itself must not bead.
* **Deterministic (no `Math.random`/time at render).** Any texture variation must derive from data
  stored on the op.
* **Performance.** The drawing hot path is tuned (ADR-0032/0036); the brush must not regress per-op
  draw cost.
* **Browser floor.** No canvas APIs beyond the documented floor (`docs/COMPATIBILITY.md`).

## Decision

A crayon stroke is an **ordinary op in the command log**, flagged `crayon` (like the eraser and
magic modifiers), whose paint is a **`CanvasPattern` of the stroke colour modulated by a procedural
paper-tooth field** — slotting into the exact `paint: string | CanvasPattern` seam the magic brush
already uses in `strokeOps.paintOpShape`.

The model (`crayonBrush.ts`) is **opaque coverage gated by paper tooth**, not translucent layering:

1. **Tooth field `U(x,y)`** — mulberry32-seeded value noise (fBm), **histogram-equalised** to a
   uniform [0,1] so the covered fraction is a directly tunable knob (θ = 1 − coverage). Baked once
   at the app's paper resolution and tiled in **paper space**, so the same paper coordinate always
   samples the same tooth: the grain is pinned to the page like real paper, and it lines up across
   every replay surface (a `repeat` pattern in user space self-aligns to the paper origin on the
   visible canvas, the square undo baseline, keyframes, and export alike — no origin offset needed,
   unlike the magic sheet).
2. **Opaque colour where `U + Jₖ > θ`, transparent below it.** Every deposited texel is *fully
   opaque* with the stroke's own colour. Overlapping opaque-over-opaque is the same colour, so the
   stroke never darkens existing same-colour crayon, self-overlap can't bead, and the simplified
   rebuild lands the same pixels as the live stroke. Valleys stay transparent, so the warm paper
   shows through as fine tooth.
3. **Buildup via a small pool of coherent per-stroke jitter fields `Jₖ`.** θ is *constant* (every
   stroke covers the same fraction, so single strokes look consistent), but each stroke's `Jₖ`
   nudges which near-threshold valleys fall inside the mask. **Peaks (high `U`) are always covered →
   the colour is stable pass to pass; deep valleys stay open; the mid-band toggles per stroke**, so
   successive same-colour passes **union into progressively more coverage** — wax filling the grain,
   live and gradual as the second stroke is drawn, converging toward solid without shifting hue. The
   per-stroke grain index is stamped on the op at stroke start and read back verbatim on replay, so
   there is **no destination sampling** — the render is deterministic and bit-identical.

Because a crayon op lives in the same command log in draw order, undo/redo/resize/export and the
eraser all fall out of the existing machinery for free.

The brush is a selectable tool modifier (`toolState.crayon`, mutually exclusive with the
eraser/magic, wired through the `DrawingCanvas` `$effect` bridge to `engine.setCrayonMode`). Its
tooth/coverage/buildup tunables are A/B-able at runtime through `setCrayonParams` on the
`/dev/engine` harness (the same dev seam pattern as `setSimplifyParams`); the shipped defaults were
tuned through a render-and-judge loop against generated real-crayon references.

## Alternatives considered

* **Translucent wax layers (normal or multiply alpha).** The intuitive "each pass adds a semi-
  transparent coat." Rejected: multiply darkens on overlap (muddies the hue — the one thing
  criterion 4 forbids), normal-alpha stacking is order- and overlap-count-dependent, so the live
  stroke (many overlapping ops) and the simplified rebuild (few) diverge — breaking bit-identical
  replay — and self-crossing scribbles bead.
* **Sprayed grain particles / scattered dabs.** Rejected: grain escapes the drawn path (fails
  containment) and is hard to keep deterministic.
* **A single fixed tooth thresholded per stroke (no jitter).** Coherent and pinned, but the union of
  nested thresholds is just `max` coverage — buildup is weak and tapers immediately.
* **Per-pixel white-noise dither for buildup.** Unions cleanly toward solid, but per-pixel noise
  reads as gritty digital speckle, not paper tooth.

The chosen **opaque coverage + coherent-jitter** model is the only one that satisfies buildup
(criterion 4/5), containment, hue-stability, grittiness/softness, *and* the determinism / bit-
identical / simplification invariants at once.

## Consequences

* **Perf:** one pattern stroke per op — the same shape as a magic op, which already meets the brush
  perf budget. Tooth/jitter fields are baked once; colour tiles are cached per (colour × jitter
  index) and wrapped in a per-target-context `CanvasPattern` cache (mirroring the magic sheet).
* **Determinism:** the only per-stroke variation is the stored grain index; grain cycles through the
  jitter buckets so a same-place second pass is guaranteed a different field and therefore visible
  buildup (pinned by a unit test), while replay stays exact.
* **Tests:** an E2E buildup test (a second same-colour pass raises coverage, red stays dominant, no
  darkening) plus replay/export tests in the engine spec, and a canvas-free unit test for the grain
  cycling and dev-param seam.
* **Simplification:** the `crayon`/`grain` fields join the path-op style key and are copied onto the
  reduced ops, so a simplified crayon run stays a crayon run and replays identically.
* **Follow-ups:** the crayon is selectable at the engine/tool-state layer and dev-A/B-able; wiring a
  child-facing brush picker button in the Actions Panel is left as a separate UI change.
