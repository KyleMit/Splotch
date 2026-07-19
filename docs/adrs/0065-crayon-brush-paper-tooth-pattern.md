# ADR-0065: Crayon Brush — Colour Stroked Through a Paper-Tooth Alpha Pattern

**Status:** Active **Date:** 2026-07

## Context

Splotch shipped one solid brush (the pen) plus the eraser and magic-brush modifiers. We wanted a
**crayon** that reads as real wax on textured paper — a dense waxy body with fine paper tooth, a
broken-but-crisp edge — and, above all, that **builds up like wax**: a second same-colour stroke
over the first should fill in the paper grain and get denser while the hue stays put (no
multiply-style darkening), and it must build up *live* while drawing, not snap in at commit.

The hard constraint is the single-renderer replay model (ADR-0033): every op renders through the one
`renderOp()` so live drawing, undo, resize, and PNG export are bit-identical, and rendering must be
deterministic (no `Math.random`/time at render — texture must derive from stored data). A
`perf:units` harness enforces 0-pixel replay drift.

Alternatives considered:

* **Per-pixel noise stamped over a solid stroke** ("marker with noise"). Rejected: reads as gritty
  digital noise, not paper tooth, and gives no buildup.
* **Punch-through self-clip** — paint solid, then `destination-out` a tooth pattern clipped to the
  stroke. Rejected: with a paper-anchored tooth, a second pass re-opens the exact same holes, so it
  never builds up.
* **`multiply` compositing of a semi-transparent wax** — darkens toward black where strokes cross,
  which is exactly the muddy darkening the brief forbids.
* **Group-layer compositing** (flatten each stroke-group through the tooth once) — correct, but
  needs group state threaded through the flat per-op `renderOp()` loops in `undoHistory.ts`;
  disproportionate complexity.

## Decision

A crayon op is stroked/filled exactly like a pen op, but its `paint` is a **`CanvasPattern` of the
op's colour at a per-pixel alpha taken from a fixed paper-tooth field** (`crayonTexture.ts`), the
same seam the magic brush already uses (`paintOpShape` in `strokeOps.ts` takes
`string | CanvasPattern`). `renderOp()` gains one branch: a `crayon` op composites `source-over`
with that pattern. `StrokeOp` carries an optional `crayon` flag; `engine.ts` stamps it on
normal-colour ops (`crayonActive && !erase && !magic`).

Buildup falls straight out of compositing the **same opaque hue** with `source-over`: overlapping
strokes accumulate alpha, so a grain valley at 0.3 coverage reaches `1−(1−0.3)²=0.51` on the second
pass, 0.66 on the third — the tooth fills and the stroke densifies while every covered pixel keeps
the crayon's exact RGB (compositing C over C is C at any alpha: no hue shift, no darkening). It is
live and gradual because each per-frame op composites as it is drawn. Containment is by construction
— the tooth only lands where the stroke geometry paints.

The tooth field (`crayonTexture.ts`) is a fixed, seamless **fBm height field with domain warp**
(three octaves + a warp pair, seeded `mulberry32`, no random at render), mapped to alpha in three
populations: deep **pits** (alpha 0 — permanent paper flecks that never fill and notch the edge),
fill-able **mid valleys** (the visible buildup), and a dense **body**. It's baked once into a 512²
tile, colourised per colour, and tiled with `'repeat'` **and no transform**, so it's anchored at the
paper origin and every target (visible / baseline / keyframe / export) samples the same tooth at a
given paper coordinate — which is what makes overlapping strokes catch the same tooth and makes
replay bit-identical.

Load-bearing invariants:

* **Crayon ops bypass simplification** (`commandSimplify.ts` returns crayon runs verbatim). The
  semi-transparent tooth composites per op, so a re-segmented run would deposit grain differently;
  keeping the exact live ops is what makes undo/resize/export bit-identical. Long crayon strokes are
  bounded on replay by the existing ADR-0035 keyframe safety net instead.
* **The tile is warmed at idle** (`warmCrayonTextureWhenIdle` in `initDrawingCanvas`, mirroring the
  paper-texture warm), and each colour's tile is pre-built when the crayon is picked / a colour is
  chosen — the ~100ms tile build must never land on a draw frame.
* Only Baseline-safe canvas APIs are used (`CanvasPattern`, `createImageData`,
  `globalCompositeOperation`), per `docs/COMPATIBILITY.md`; no `OffscreenCanvas`.

The crayon is a selectable base brush (`toolState.crayon`, `resumeBaseBrush()` so a colour pick
keeps it), and its render variant is A/B-able at runtime through the dev harness (`setCrayonParams`
on `/dev/engine`), the same way simplification variants are tuned (ADR-0036). The winning variant
(`waxy`) is the default.

## Consequences

\+ Convincing wax-on-paper look with correct, live buildup at constant hue — the headline behaviour
— with zero changes to the pen and its 0-drift replay guarantee (still green on `perf:units`).

\+ Determinism and bit-identical replay come for free: a fixed seeded tile stroked through the same
`renderOp()`, verified by a crayon E2E test (0 differing pixels after a resize rebuild).

\+ Cheap on the hot path: ~0.06ms average per op, worst op ~2.3ms under the 4× CPU-throttled harness
(budget: avg ≲ 2ms, no frame > ~8ms).

− Crayon strokes skip simplification, so they retain their per-frame ops and lean on the keyframe
safety net for long strokes, rather than the compact simplified op lists a pen stroke keeps.

− A one-off ~100ms tile build per variant/colour; mitigated by idle warming, but an adversarial "tap
crayon and instantly draw" before the idle callback fires still pays it once.

− The paper tooth is isotropic (paper-anchored), so it doesn't show the stroke-direction grain a
real crayon leaves; a deliberate trade for correct paper-anchored buildup and replay.
