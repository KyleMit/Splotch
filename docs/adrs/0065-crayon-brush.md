# ADR-0065: Waxy crayon brush — paper-anchored tooth tiles with hard-alpha build-up

**Status:** Active\
**Date:** 2026-07-18

## Context

The pen drew a solid, flat stroke — a marker, not the wax crayon a toddler-drawing app wants. We
wanted a brush that reads as **wax on textured paper**: a dense body broken by fine paper tooth,
ragged-but-crisp edges, and — the behaviour we cared about most — **build-up**: colouring over an
existing same-colour stroke should fill in the tooth and get denser *without shifting or darkening
the hue*, the way a real crayon layers wax.

The hard constraints come from the existing engine, and they are load-bearing:

* **One renderer, bit-identical everywhere (ADR-0033).** Live drawing, undo, resize, and PNG export
  all replay the same `StrokeOp`s through the one `renderOp()`. A brush that looked right live but
  drifted on replay would fail the engine spec and `perf:units` (0-pixel drift).
* **Deterministic (no `Math.random`/time at render, ADR-0033).** Any texture must derive from stored
  stroke data.
* **Commit-time simplification (ADR-0036)** rewrites a stroke's per-frame ops into fewer ops,
  shifting a curve's path by up to ~1px.
* **The supported floor (Chrome 111 / Safari 16.4, `docs/COMPATIBILITY.md`)** — no exotic canvas
  APIs.

## Decision

Render the crayon as a **repeating paper-tooth alpha pattern**, following the magic brush's
precedent (ADR-0043: a flag on the existing ops + a paper-anchored `CanvasPattern`), not a new op
kind or a parallel render path.

**Grain.** At first use we build a small set of grayscale "tooth" tiles (`crayonBrush.ts`):
fixed-seed value noise (mulberry32), three octaves — fine micro-grain, mid-scale clumping, and a
low-frequency density field that modulates the local threshold so the wax has denser/sparser zones
and, where it dips at a stroke edge, a ragged feathered boundary. A crayon op paints its colour
through a tooth tile used as a **`repeat` `CanvasPattern` anchored to the user-space (paper)
origin** — the same space every op is recorded in — so live drawing and every replay surface tile
identically. Each op is two passes: a wider **sparse edge halo** (broken flecks that feather the
boundary) then the dense **body**. It reuses the round `lineCap`/`lineJoin` every target already
sets, so caps/joins match a plain stroke on every surface.

**Hard alpha.** The tooth alpha is a **0/1 step**, never partial. This is the keystone: depositing
the same tile at the same paper position any number of times is idempotent, so (a) a live stroke's
many per-frame ops and the few ops it simplifies into composite to the same pixels, and (b)
overlapping the **same** colour can only add covered area, never darken (`source-over` of an opaque
colour over itself is that colour — no multiply). Correlated value-noise keeps the hard edges
reading as crisp paper tooth, not gritty static.

**Build-up.** Each stroke stamps a **different** tooth tile, chosen by a per-stroke `seed` stored on
every op (a monotonic counter claimed at pointer-down, constant across the stroke's ops). A new
same-colour stroke over an old one fills tooth valleys the first pass missed — coverage grows toward
solid at constant hue, live and gradual as the second stroke is drawn (it renders op-by-op through
`renderOp`, never as a post-commit snap). A single continuous stroke shares one tile, so it never
builds up on itself: one pass is one pass.

**Crayon strokes are NOT simplified (the one real trade-off).** Reduction's ~1px path shift is
invisible on a solid stroke but decorrelates the paper-anchored high-frequency grain, so a rebuilt
stroke would differ from the live one by several pixels at the edge — breaking exact replay
(`perf:units` measured 2.5–5px on curves). `commandSimplify` therefore passes crayon runs through
verbatim; their unbounded op count is instead capped by keyframing (ADR-0035), exactly as the engine
behaved before ADR-0036 added simplification. Straight strokes were already 0px either way; curves
now replay at a strict **0.00px / 0.00% xor** across the whole `perf:units` battery.

**Selectable / default.** The pen renders `'crayon'` by default. A dev seam
`setBrushVariant('crayon'
| 'flat')` — mirroring `setSimplifyParams`, wired onto `window.__engine`
only on `/dev/engine` — A/Bs it against the old solid stroke from a single build. The eraser
(destination-out) and the magic brush keep their own render paths and are never crayon.

## Consequences

* **+** Reads as waxy crayon: dense tooth body, ragged-crisp edges, grain contained to the path
  (it's a stroke, nothing sprays past it). Build-up fills the tooth and holds the hue, verified by
  eye against real-crayon reference photos and asserted in `tests/crayon.spec.ts` (a second pass
  raises coverage while the mean colour is unchanged; the flat variant is the negative control).
* **+** Bit-identical replay holds at 0px (undo/resize/export), so the ADR-0033 invariant and
  `perf:units` stay green. Hot-path draw stays cheap: `engine.draw` avg 0.2ms / max 2.5ms under the
  4× throttle (target ≲2ms / <8ms).
* **+** Deterministic and floor-safe: fixed-seed tiles + a plain `repeat` pattern anchored to the
  origin (no `setTransform`, no modern API), so nothing to guard.
* **−** Skipping simplification for crayon means longer command logs and therefore **more frequent
  keyframes** (ADR-0035), which raises commit/undo cost versus a simplified solid stroke (measured
  keyframe ~47ms and commit up to ~52ms under the 4× throttle, at stroke end, not while drawing).
  Acceptable, and bounded by keyframing; revisit only if undo/replay on huge drawings regresses.
* **−** Colour × tile-phase produces a bounded set of cached coloured tiles; fine for the finite
  palette, but a brush that took arbitrary continuous colours would want a different cache strategy.
