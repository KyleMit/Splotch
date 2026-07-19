# ADR-0065: crayon brush — a paper-tooth grain pattern with commit-history wax buildup

**Status:** Active\
**Date:** 2026-07-19

## Context

Splotch had one solid ink brush (plus the eraser and the magic brush). We wanted a **crayon** that
convincingly reads as wax on textured paper — a dense but toothy body, fine grain contained to the
stroke, a broken-but-crisp edge — and, above all, that **builds up** the way real crayon does:
drawing a second same-colour pass over an existing one fills in more of the paper tooth and gets
denser **without shifting the hue** (no marker-style multiply darkening).

The engine's load-bearing invariants (ADR-0033/0035/0036) constrain how any brush can be built:

* **One renderer.** Live drawing, undo/redo, resize, and PNG export all replay the same recorded ops
  through the single `renderOp()`. A brush is defined entirely by what it stores on its op and how
  `renderOp` paints it.
* **Deterministic replay.** No `Math.random`/time at render — the same drawing must always produce
  the same pixels. Any texture variation has to derive from stored stroke data.
* **Bit-identical rebuild.** A per-stroke fidelity harness (`scripts/perf/stroke-units.mjs`)
  enforces ≤ 2 px live-vs-rebuilt drift.
* **Hot-path budget.** Under the 4× CPU-throttle perf harness, average per-op draw must stay ≲ 2 ms
  with no single op > ~8 ms.

The naïve "read the existing pixels under the new stroke and add wax where the paper still shows"
approach is out: a render-time pixel read is neither replay-safe nor deterministic.

## Decision

**Grain = a stroke painted with a paper-tooth *pattern* instead of a flat colour.** A crayon op is
stroked/filled exactly like a solid op, but its paint is a tileable `CanvasPattern` whose waxy
tooth-peak pixels carry the crayon colour (fully **opaque**) and whose tooth-valley pixels are
transparent (`lib/drawing/crayonBrush.ts`). Consequences that fall out for free:

* The grain is **contained to the stroke** — it's only painted where the stroke geometry is; nothing
  sprays past the path.
* The tooth field is generated **once at module load from a fixed integer seed** (multi-octave value
  noise, tileable), and per-`(colour, layer)` tiles derive purely from it — so replay/resize/export
  reproduce identical pixels with no render-time randomness.
* The pattern **repeats from the context origin**, and ops always render in paper coordinates
  (identity in normal use; the export/keyframe/baseline surfaces also render ops at the paper
  origin). So the same paper region always samples the same tile pixels — the grain is locked to the
  paper and lines up cell-for-cell across live draw, rebuild, and export.

**Buildup = a per-op `layer` ordinal that lowers the tooth threshold.** The paper tooth is fixed in
space, so a second pass can't just repaint the same peaks — it must fill the *valleys*. Each op
stores a wax-buildup `layer`: how many prior **committed same-colour crayon strokes** its bounding
box overlaps (`undoHistory.crayonLayerAt`, counted against a small `crayonCover` footprint recorded
per command). A higher layer thresholds the **same** field lower, so layer *N*'s covered cells are a
strict **superset** of layer *N−1*'s. Because the wax is the identical opaque colour, the overlap is
a no-op (it can't multiply or shift hue) and only the newly-exposed valley cells fill in — coverage
climbs toward solid while the hue stays put.

The ordinal is computed **live**, as each per-frame segment op is created, against already-committed
history (the in-flight stroke isn't in the log yet). So the fill-in appears **gradually under the
moving finger**, not as a post-commit snap — and because the layer is **stored on the op**, replay
reproduces the exact grain the child saw. Simplification (ADR-0036) preserves the `crayon`/`layer`
fields and splits runs at layer changes, so a rebuilt crayon stroke stays grain, not a flat fill.

**Selection + dev A/B.** The crayon is a first-class, parent-toggleable Actions Panel tool (mutually
exclusive with the eraser/magic brush; picking a colour keeps the crayon selected, since it draws in
that colour). Grain parameters are a named-variant dev seam (`setCrayonVariant`, mirrors
`setSimplifyParams`) with `waxy` (shipped default), `fine`, and `coarse`; the iteration loop that
tuned `waxy` against real-crayon references lives in `scripts/crayon/`.

Two supporting mechanics keep the invariants green:

* **No soft alpha.** The wax is opaque (with per-pixel same-hue lightness *mottle* for waxiness, a
  deterministic function of the tooth field so overlaps stay idempotent). Soft-alpha grain would
  darken on the massive segment-to-segment self-overlap of a single wide stroke — the exact multiply
  the buildup criterion forbids — so it's rejected.
* **Idle tile warm.** The one-time per-`(colour, layer)` `ImageData` tile build is warmed off the
  draw hot path (`scheduleIdle`) when the crayon is selected or its colour changes, so the first
  stroke in a fresh colour never builds a tile mid-frame.

## Consequences

* **+** Convincing wax-on-paper look (fine tooth, contained grain, crisp broken edge) and true
  buildup — denser at constant hue, live and gradual — through the existing single-renderer op
  model, with **zero render-time pixel reads**.
* **+** Replay-safe and deterministic: undo/redo/resize/export reproduce the stroke exactly; the
  bit-identical fidelity harness stays green (the crayon isn't in its pen corpus, and the non-crayon
  simplification path is unchanged). A dedicated E2E test asserts the buildup (coverage rises, hue
  constant, no darkening) and its deterministic rebuild.
* **+** Cheap on the hot path: the buildup scan is `O(commands)` bbox tests over a bounded log, and
  stroking with a cached pattern costs about the same as a solid stroke — steady-state ~0.04 ms avg,
  well under one frame at 4× throttle.
* **−** Buildup overlap is judged by **command bounding box**, a deliberately coarse proxy: two
  same-colour strokes whose boxes overlap without their ink touching still bump the layer. For a
  toddler scribble the visual effect is subtle and acceptable; a precise coverage grid would cost
  per-stroke state and undo bookkeeping we chose not to add.
* **−** A crayon command that folds into the baseline or keyframes past the retained-history bound
  loses its `crayonCover`, so a much later overlapping pass can under-count its layer. This only
  bites past the ADR-0035 history limits (tens of strokes) and degrades gracefully (a lower layer,
  never a wrong hue).
* **−** Grain is locked to paper coordinates, so under a rotation-lock view (ADR-0050) the tile grid
  rotates with the paper — correct within that view, but the grain isn't invariant across a
  rotate-and-back. Not covered by the bit-identical harness, and imperceptible in practice.
* **−** An automated vision judge (`scripts/crayon/judge.mjs`) was used as a regression signal but
  proved unreliable on the texture axes (it contradicted itself and reported an impossible "darker
  hue" on the provably-opaque buildup), so the final look was called by eye against the references —
  as the task intended.
