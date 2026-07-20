# ADR-0065: Crayon Free-Draw via a Colour-Tinted Paper-Tooth Pattern

**Status:** Active\
**Date:** 2026-07-18

## Context

Splotch is a drawing app for toddlers, and free-draw shipped as a flat, fully-opaque marker. A real
wax crayon on paper looks and behaves nothing like that: dense pigment catches on the raised
**tooth** of the paper and skips the low valleys, so a single pass is broken and textured, and a
second pass of the **same colour** fills the valleys the first one missed — the mark gets denser and
more solid **without changing hue**. We wanted free-draw to read and behave like that crayon.

The constraints that shaped the design are the same load-bearing invariants the rest of the engine
already obeys:

* **Bit-identical replay (ADR-0033).** Live drawing and undo/resize/export replay both run every op
  through the one `renderOp()`, and an E2E test enforces 0-pixel drift. A crayon op must render
  identically live and on every rebuild surface (visible canvas, undo baseline, keyframes, export
  snapshot).
* **Determinism (ADR-0007).** The same drawing must always produce the same pixels — no
  `Math.random` or time on the render path. Any texture must derive from stored stroke data (and
  fixed, positional paper properties), not per-frame randomness.
* **Performance (ADR-0032).** The drawing hot path is tuned; the brush must not regress per-move
  draw cost (target: avg `engine.draw` ≲ 2 ms, no draw frame > ~8 ms under the 4× throttle harness).
* **Correct interaction ordering.** The eraser must remove crayon pixels, and undo/simplification/
  keyframing must keep working — the same draw-order semantics every other tool obeys.

The **wax buildup** was the hard requirement: overdrawing the same colour must fill the tooth and
densify at constant hue, live and gradually *while* the second stroke is drawn — and explicitly
**not** darken/muddy the overlap the way a `multiply` blend would.

## Decision

**Render each crayon op by stroking its ordinary shape with a paper-anchored, colour-tinted *tooth
pattern* whose per-pixel alpha is the wax deposit, composited `source-over`.** This mirrors the
magic brush (ADR-0043), which also renders an op by stroking its shape with a `CanvasPattern`; only
the pattern differs. `brush: 'crayon'` on the op is the single signal, stamped at stroke start like
`magic`/`erase`, and free-draw defaults to it (a dev A/B can turn it off for the flat marker).

The mechanism (`crayonBrush.ts`):

* A **deterministic tooth field** — periodic value-noise fbm generated once from a fixed seed,
  mapped through a contrast curve and a wax-deposit curve `deposit = floor + (ceil − floor)·toothᵞ`.
  The field is **positional** (a property of the paper, tiled from paper `(0,0)`), not per-stroke
  random.
* A small **tooth tile** whose alpha channel is that deposit, tinted per colour (fill the colour,
  then `destination-in` the tooth so only its alpha survives) and cached as a `repeat` pattern per
  target context.

Two properties fall out of this one primitive:

* **Look.** Peaks are near-opaque, valleys faint, so a single pass reads as broken waxy grain — not
  a flat fill — and the grain is contained to the stroke shape (only the shape is painted; the tooth
  just modulates its alpha).
* **Buildup.** Because the deposit is semi-transparent and the tooth is positional, painting the
  same colour again composites `source-over` onto the earlier pass **in register**: shared pixels
  climb toward the solid crayon colour (`1 − (1 − a)ⁿ`), so valleys fill and the body densifies
  while the hue is invariant. It converges to the solid colour and stops — the opposite of
  `multiply`. And it is live/gradual: every per-frame op composites as the finger moves, so fill-in
  happens during the second stroke, never as a post-stroke snap.

Replay stays bit-identical because every surface renders ops in the same paper-pixel space, so a
pattern tiled from paper `(0,0)` samples the identical tooth phase everywhere — the same property
the magic sheet relies on. The field is synchronous and seedless-at-runtime (fixed seed), so there
is no async readiness gate to defer folding on (unlike the magic sheet), and the tile is warmed at
idle on init so its one-time fbm build never lands on the first draw frame.

Looks are exposed as named **variants** (`wax` default, `coarse`, `fine`, `flat`) plus a live
`setCrayonParams` tuning seam, mirroring the `setSimplifyParams` dev-variant pattern, so the render
can be A/B'd and tuned from the `/dev/engine` harness without a rebuild.

## Alternatives considered

* **Per-op offscreen scratch mask** (stroke solid colour into a scratch, `destination-in` the tooth,
  blit). Colour-agnostic and tiny-memory, but adds per-op allocations/composites on the hot path for
  no visual gain over the pattern.
* **Per-colour full paper-sized tooth sheets** (like the magic sheet, but tinted). Clean and
  one-call, but a drawing with many colours would cost tens of MB of paper-sized RGBA buffers. The
  small tiled `repeat` tile gets the same one-call render at ~KB per colour.
* **Per-stroke isolation via a wet layer** (accumulate the stroke's union coverage, tooth-mask and
  flatten once) — the "correct" way to stop a single continuous drag's overlapping per-frame ops
  from compounding on themselves. Rejected as a large, risky rearchitecture of the single-renderer /
  per-op / bit-identical model. See the tradeoff below.

## Crayon strokes skip simplification (amended 2026-07-19)

Commit-time simplification (ADR-0036) rewrites a command's per-frame ops into a smaller set that
rebuilds visually identical ink **for an opaque brush** — overlapping opaque stamps are idempotent,
so op count doesn't change the result. The crayon is **semi-transparent and composites
`source-over`**, so a single stroke's overlapping per-frame stamps compound into its wax density:
change the op decomposition and the composited density changes. Simplifying a crayon command
therefore made the grain visibly **shift lighter on the first undo/resize/export**, when the visible
canvas repainted from the (differently-chunked) stored ops. A second bug compounded it —
simplification's rebuilt path ops dropped the `brush` flag, so a rebuilt crayon path rendered as a
flat, fully-opaque marker line.

**A crayon command keeps its raw per-frame ops** (`commandSimplify.isUnsimplifiableCrayon`): live
drawing and every replay surface then run the identical op stream through the one `renderOp`, so the
rebuild is bit-identical to the live render — no density shift, no flat-fill. Reduction stays on for
the opaque eraser/flat marker, where it's lossless. The `brush` flag is also carried through the
reducer, so a (rare) mixed command stays crayon.

* **Consequence — replay cost.** Un-simplified crayon commands re-stroke more ops on undo/resize
  than a reduced command would (measured: still low-single-digit ms per rebuild). Cost is bounded by
  the ADR-0035 keyframe safety net exactly as before — a pathologically long crayon stroke collapses
  to a cumulative raster, which captures the same per-op wax and so stays consistent. The trade vs.
  the reduced brush is undo depth past such a keyframe, not correctness.
* **Rejected — per-stroke union-once isolation** (accumulate the stroke's union coverage,
  tooth-mask, flatten once): the "principled" way to make density op-count-independent, which would
  let crayon keep simplification. Prototyped and measured a **6× worse `engine.draw` and ~100× worse
  `engine.undo`** (a per-command offscreen rasterise + mask + composite, plus a per-frame
  recomposite on the live hot path) against the tuned budget — far outside ADR-0032. Not worth it
  when keeping raw ops is one predicate and a keyframe bound.

## Stroke weight is speed-independent (amended 2026-07-20)

As shipped, crayon ops stroked with the engine's global **round caps**, so every per-frame op
re-deposited a full line-width disc at the joint it shares with the previous op. A slow steady drag
(joints every px or two) compounded `1 − (1 − a)ⁿ` toward solid; a long quick drag (joints every ~30
px) stayed near the single-pass deposit — stroke weight tracked finger speed far beyond "authentic
pressure feel". Two changes make a single pass deposit once, whatever the speed:

* **Crayon path ops stroke with butt caps** (`strokeOps.renderOp`). Consecutive ops of one stroke
  share a tangent at their joint (the midpoint-smoothing construction), so butt ends tile
  seamlessly: no re-deposit, just an antialiased seam pixel. Stroke ends stay round via **anchor
  dots** — the existing start dot, plus one the engine records at lift (and at a WebKit resume-gap
  restart) — so the silhouette is unchanged.
* **Minimum-advance chunking** (`engine.strokeSmoothSegments`). A butt-capped op only a fraction of
  a pixel long lays down partial *coverage*, and compositing several partial covers undershoots the
  deposit (`1 − ∏(1 − a·cᵢ) < a`) — an op per pointermove would have flipped the bias, leaving slow
  drags *lighter*. Crayon points buffer until the pointer advances ≥ 3 CSS px, so each op lays full
  coverage; the ink trails the fingertip imperceptibly and the tail flushes on lift.

Accepted residue: seam pixels at op joints and the doubled half-disc under each anchor dot deviate
slightly from the ideal single deposit — localized, hidden by the grain, and it reads as a crayon's
pressed stroke ends. Deliberately kept: a stroke that genuinely crosses **itself** still builds up
(the crossing ops overlap), so scribbling back and forth densifies live without lifting — matching
real wax. Replay is untouched: the recorded ops are exactly what rendered live, so every rebuild
surface stays bit-identical.

## Consequences

* Stroke density is a property of where the crayon travelled, not how fast: a single pass lays the
  same deposit at any drag speed (see the speed-independence amendment above), while self-crossings
  and repeated passes still build up. The stored raw ops reproduce it identically on every rebuild.
* The crayon is semi-transparent, so its tooth valleys reveal whatever is beneath — the real paper
  texture on a blank canvas (visual coherence for free), or a coloring page's line art — which is
  desirable. The eraser (`destination-out`) removes crayon pixels normally, and the empty-scan's
  downscale averages the tooth well above its alpha threshold, so a crayon stroke is never misread
  as a blank canvas.
* The design was tuned with a repeatable render-and-judge loop: render the three canonical scenes
  (single stroke, same-colour double pass, scribble fill) through the real engine, compare against
  Gemini-generated real-crayon references, and score with a Gemini-vision critic. The critic proved
  unreliable as an oracle (it scored a correctly-textured render near-zero when the export was
  downsampled and the fine grain washed out — a framing artifact) and was used as a regression
  signal only; the final variant was chosen by eye against the references.
