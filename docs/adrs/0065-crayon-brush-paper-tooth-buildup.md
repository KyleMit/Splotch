# ADR-0065: Crayon Brush — Paper-Tooth Pattern with Per-Stroke-Phase Wax Buildup

**Status:** Active **Date:** 2026-07

## Context

Splotch is a drawing app for toddlers, and its default mark is a smooth solid pen. We wanted a
**crayon** that convincingly reads as wax on textured paper — a dense waxy body shot through with
fine paper-tooth speckle and a broken (but crisp) edge — and, more importantly, that **builds up**
the way real wax does: drawing a second same-colour stroke over the first should fill in the paper
grain in new places and get denser **without shifting or darkening the hue**, and it should do so
**live and gradually** while the stroke is drawn, not as a snap after commit.

The load-bearing constraint is the drawing engine's single-renderer model (ADR-0033): the undo
history is a log of replayable ops, and live drawing, undo, resize, remount, and PNG export all go
through the same `renderOp()`, so every surface is bit-identical. Therefore a crayon op must render
as a **pure function of its stored fields** — no `Math.random`/clock at render, nothing read back
from the target canvas — and it must survive commit-time simplification (ADR-0036) and keyframing
(ADR-0035). It must also stay on the tuned hot path (ADR-0032/0036) and use only canvas APIs within
the supported floor (`docs/COMPATIBILITY.md`: `createPattern`/`setTransform` + `source-over` are in;
`OffscreenCanvas`, `ctx.filter`, exotic blend modes, and per-frame `getImageData` are out).

## Decision

A crayon stroke is an **ordinary op in the existing command log**, flagged `crayon`, whose paint is
a **`CanvasPattern` of a paper-"tooth" tile tinted to the stroke colour** (`lib/drawing/crayon.ts`),
composited **`source-over`**. This mirrors the magic brush's pattern-fill approach (ADR-0043), so
undo, eraser, override ordering, and export all fall out of existing machinery. Three sub-decisions
make it read and behave like wax:

1. **Tooth = a deterministic fractal tile, tinted per colour.** A seeded 1/f value-noise field
   (`baseCells` … `octaves`) is baked once into a tile whose **alpha** is the per-pass wax deposit:
   solid on the tooth peaks, a small `floor` of translucent wax in the valleys so bare paper reads
   as faint wax rather than stark white. The grayscale tile is tinted to each palette colour
   (`destination-in`) and cached (small LRU). The tile is large enough (`tile × grain` ≈ 218 px)
   that its repeat period exceeds a fill, so no tiling shows.

2. **Buildup via a per-stroke tooth *phase*, not a paper-anchored field.** Same-colour `source-over`
   can never darken or muddy the hue (that would take a multiply/darken blend, which we never use),
   but with a fixed paper-anchored tooth, repeated opaque passes are idempotent — the valleys never
   fill. So each **stroke** gets its own tooth **phase** (a stored 2-D offset, resolved once at
   stroke start like the magic brush's gradient pick, then stamped on every op). A later same-colour
   pass lands its peaks in the earlier pass's valleys, coating the bare-paper specks: the body fills
   in and gets denser while the already-solid peaks barely change — redrawing does little to the
   colour and much to the tooth. Because it's ordinary per-frame op rendering, buildup appears live
   while the second stroke is drawn. Within one stroke the phase is constant, so its own overlapping
   frames stay idempotent (no beading).

3. **Crayon ops skip commit-time simplification.** Partial-alpha deposits are order- and
   segmentation-sensitive: merging per-frame ops into fewer longer strokes (what RDP does) would
   change where coverage overlaps and make replay diverge from the live render. Crayon runs pass
   through `simplifyCommandOps` verbatim (`crayon` joins the per-run style key), and `crayon` +
   `depositLevel` + `toothPhaseX/Y` are stored on each op. ADR-0035 keyframing still bounds their
   replay cost, and a keyframe bakes identical pixels.

Determinism holds because `renderOp` reads only the op's stored fields and the fixed tooth tile: the
phase and deposit level are chosen at draw time (allowed, like the magic gradient) and replayed
verbatim, so undo/resize/remount/export reproduce the stroke exactly. The look was tuned over
several rounds against real-crayon reference photos with an automated vision judge as a regression
signal and the final call made by eye (see "How it was tuned").

The crayon **is the default pen**: `DrawingCanvas` turns it on whenever the tool is the pen (neither
eraser nor magic) via a `setCrayonMode` bridge alongside the existing `setEraserMode`/`setMagicMode`
ones, and the engine flags a stroke `crayon` only in that pen mode. There's no separate "plain pen"
tool — every ordinary mark is waxy crayon. The plain solid pen still exists as the engine's default
(`crayonActive` starts false), so the low-level `/dev/engine` rig and its `engine.spec` mechanics
keep testing it unchanged; production opts in through the bridge, and `crayon.spec` opts in
explicitly. The brush is also **dev-selectable / A/B-able the way the repo does render variants** —
`setCrayonMode` / `setCrayonRenderParams` on `window.__engine` at `/dev/engine` behind
`PUBLIC_ENABLE_DEV_HARNESS`, exactly like the `setSimplifyParams` seam (ADR-0036) — so the plain pen
and every look parameter can be toggled for comparison. The tuned parameter set ships as the
default.

## Consequences

* **Convincing wax + real buildup, cheaply.** One cached pattern per colour serves every stroke; the
  only per-op cost over a plain stroke is one `setTransform` (phase) and the pattern fill. Measured
  headless under a 4× CPU throttle: **~0.018 ms average per op** (max 0.9 ms) vs ~0.011 ms for a
  solid stroke — far under the ≲2 ms-average / 8 ms-frame budget.
* **Replay stays bit-identical.** A dedicated E2E spec (`web/tests/crayon.spec.ts`) drives the real
  engine and asserts: a second same-colour pass raises near-solid coverage (~+13–19%) and total wax
  at a constant hue; buildup is present mid-stroke (live, not a snap); grain is contained to the
  path; a stroke replays identically after a remount; and undo clears it. All existing engine and
  unit tests stay green (the pen is untouched).
* **GPU/compositing caveat.** The perf number is compute-only (headless, no GPU compositor). The
  brush uses only `source-over` + `createPattern`, the same primitives the shipping magic brush
  uses, so device risk is low, but a real-device pass (`perf:android`) is the right final check
  before a store release (per the profiling skill / ADR-0051).
* **The tooth isn't a globally fixed paper.** Because buildup uses a per-stroke phase, two different
  strokes crossing the same spot don't share tooth alignment. This is physically looser than a fixed
  sheet but visually indistinguishable, and it's what makes hole-filling buildup work without
  reading the canvas or keeping a coverage buffer.

## Alternatives considered

* **Paper-anchored fixed tooth (idea 11's literal "tooth(x,y) < level").** Physically faithful, but
  with opaque peaks it's idempotent under repeated passes — no visible buildup — and a rising global
  "level" can't respond to actual overlap without reading accumulated coverage. Rejected in favour
  of the per-stroke phase, which fills valleys with no canvas read-back.
* **A coverage buffer read at draw time to press wax into filled valleys.** The most physically
  accurate buildup, but it means threading a reconstructable paper-space coverage field through the
  op/keyframe pipeline (or a banned mid-stroke `getImageData`), a large change to load-bearing
  replay code. The phase trick gets the same visible behaviour far more cheaply.
* **Additive noise / scatter stamps for grain.** Sprays speckle past the stroke path (fails
  containment) and reads as gritty digital noise. The tooth pattern only ever samples inside the
  stroke shape.
* **Soft-band-only buildup (partial alpha, one fixed tile).** Gives same-hue buildup via `1-(1-a)²`
  accumulation but only in the mid-tooth band — a weak, subtle effect that also beads at per-frame
  op boundaries within a single stroke. The per-stroke phase gives a stronger, more intuitive
  "colour in the white specks" buildup and stays bead-free within a stroke.

## How it was tuned

Real-crayon reference images (single stroke; one-pass-vs-two-pass; scribble fill) were generated
with the repo's Gemini image seam, the crayon was rendered into the same scenes through the real
`crayon.ts`, and a Gemini-vision judge scored each round on waxiness, grain, containment, edge, and
buildup. The judge was treated as an adversarial regression signal, not an oracle (it scores harshly
against literal macro photos); the shipping parameters were chosen by eye against the references,
landing on a dense waxy body with fine high-frequency tooth and a strongly visible, constant-hue
second-pass buildup.
