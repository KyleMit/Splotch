# ADR-0065: Crayon Brush — Deterministic Waxy Tooth with Same-Colour Buildup

**Status:** Active\
**Date:** 2026-07

## Context

The pen shipped as a flat, solid stroke — a marker, not a crayon. We wanted a brush that reads as a
real wax crayon on textured paper for a toddler drawing app: a dense waxy body with visible fine
paper-tooth, a broken-but-crisp edge, and — the behaviour that actually sells "crayon" —
**buildup**: drawing a second same-colour stroke over the first should fill in the paper grain and
get denser *without* shifting or darkening the hue (no multiply-style muddying), and it must happen
live and gradually while the stroke is drawn.

Three hard constraints came from the existing engine, and they shaped the design more than the look
did:

* **Single-renderer replay (ADR-0033).** Every surface — live draw, undo, resize, and PNG export —
  paints through the one `renderOp()` and must be bit-identical across replays. So the texture
  cannot be a post-process or a live-only effect.
* **Determinism.** The same drawing must always produce the same pixels: no `Math.random`/time at
  render. Any variation has to derive from stored stroke data.
* **No hue darkening on overlap.** A translucent stroke composited over the same colour
  (source-over) *darkens* toward the colour over paper — the exact "multiply-style darkening" the
  crayon must avoid on a repeated pass.

## Decision

Add a **crayon brush** rendered by `lib/drawing/crayonBrush.ts`, selected per-op via a `brush` field
on the stroke op (alongside a per-stroke `seed`), branched in `renderOp()` the same way `magic` is.
The texture is a **two-octave paper tooth** built from two mechanisms, both pure functions of stored
op data:

1. **Deposit** — a `CanvasPattern` tile whose RGB is the flat crayon colour *everywhere*; all
   texture lives in the **alpha** channel (a fine + micro value-noise grain over a small coarse
   density octave, with a valley *floor* so tooth valleys keep thin wax rather than punching stark
   white pinholes). Because the deposit is the pure colour, **C-over-C = C at any alpha** — painting
   it over the same colour never shifts the hue; overlap only raises coverage. The tile is offset by
   a **per-stroke phase** derived from the op's `seed`: every op of one stroke shares the phase (no
   seams within a stroke), but a *different* stroke lands a different phase, so its grain fills the
   first stroke's tooth gaps → live, gradual buildup at constant hue.

2. **Weave carve** — a low-frequency, colour-independent tile carved back out with `destination-out`
   at **phase 0** (paper-anchored: the tooth is a fixed property of the sheet, identical for every
   stroke and colour). Its deepest valleys stay open no matter how many passes build up — so heavy
   scribble never flattens into a solid fill — and the coarse notches fray the stroke silhouette
   into a broken-but-crisp edge. On the transparent canvas it reveals the paper layer beneath,
   exactly what real tooth does.

The per-stroke `seed` is a hash of the (rounded) start point, so it is deterministic — the same
stroke always seeds the same grain — yet two strokes that begin at different spots decorrelate,
which is what makes an overlapping second pass fill the first's tooth. Cell sizes scale with
`renderScale` so the physical tooth size is identical at 1× and 2× backing stores, and every noise
tile wraps seamlessly so the per-stroke phase offset can never expose a seam.

**Selection & default.** The pen's texture is a `brushState` (`'crayon' | 'marker'`), pushed into
the engine via `setBrush()` from `DrawingCanvas` exactly like colour/width. Crayon is the shipped
default; the flat `marker` is retained as an A/B comparison variant. The **engine's own** built-in
default stays `marker` (undefined stamp), so the `/dev/engine` harness and its pixel-exact specs are
unaffected unless a test opts in via the `setBrush` dev seam — the same dev-selectable-variant
pattern as `setSimplifyParams`.

## Consequences

* **Replay stays bit-identical.** Texture is a pure function of `color` + `seed` (both stored on the
  op) and `renderScale`; the `destination-out` weave depends only on the deterministically-rebuilt
  surface, so every rebuild reproduces the same pixels. Two E2E specs enforce it: a
  buildup/constant-hue test and a replay-vs-replay determinism test (`engine.spec.ts`). The commit-
  time simplification (ADR-0036) carries the `brush`/`seed` through as part of the path style.
* **Performance.** Two stroke passes per op plus a paper-anchored weave. Under the brush perf
  harness (headless, 4× CPU throttle, phone) `engine.draw` averages ~0.7 ms with a ~6.6 ms max and
  no dropped draw frames. The tooth tiles are built once per colour and cached process-wide; the
  palette tiles are warmed at idle from `DrawingCanvas` so the first stroke of a colour doesn't pay
  the tile's pixel loop mid-draw.
* **The weave reveals underlying pixels** at its fixed valley positions (real tooth behaviour). This
  is deterministic and confined to the stroke's own footprint, and reads as consistent paper tooth
  across every crayon mark.
* **`ctx.filter` was avoided** (not at the Safari 16.4 floor — see `docs/COMPATIBILITY.md`); the
  texture uses only `createPattern` + `CanvasPattern.setTransform` (both in-floor, already used by
  the magic brush) and `destination-out`.
* The look was tuned by rendering the brush into the same scenes as real-crayon reference photos and
  scoring each round with an automated vision critic, used as a regression signal (it is harsh and
  sometimes wrong) rather than an oracle — the final call was by eye against the references.
