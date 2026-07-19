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
* A small **tooth tile** whose alpha channel is that deposit, tinted per colour (assemble a wrapped,
  deterministically colour-phased copy of the tooth, then `source-in` the colour) and cached as a
  `repeat` pattern per target context. The same normalised colour shares a phase; different colours
  generally sample shifted peaks and valleys from the same paper field.

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
* **Colour interaction.** Colour-derived phase offsets make different crayons optically interleave
  at crossings: one colour's wax peaks can occupy another colour's tooth valleys under ordinary
  `source-over`, instead of every colour depositing on exactly the same pixels. Same-colour strokes
  remain in register, preserving constant-hue buildup. The phase is applied once when the cached
  tinted tile is built, so it adds no per-op hot-path work.

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

## Consequences

* **Accepted:** with per-op `source-over`, a single continuous stroke's overlapping per-frame stamps
  compound slightly, so a slow/heavy stroke lays down denser than a fast one. This is mild and reads
  as authentic pressure/speed sensitivity; the default variant is tuned so a normal-speed single
  stroke already reads as waxy crayon (not near-solid). Eliminating it entirely would require
  per-stroke isolation (above).
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
