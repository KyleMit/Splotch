# Watercolor brush bench (2026-07)

A watercolor brush was prototyped alongside the first crayon on 2026-07-18 and never shipped. The
crayon went a different way (ADR-0065), the Brush Menu landed as ADR-0067, and issue \#253 closed
with "if you meant watercolor, reopen as a fresh issue". These are the only measurements of it; the
branch that held them, `feature/brush-modes-selector`, was deleted in the 2026-09-24 workspace
cleanup.

## Setup

Each variant rendered one op at a time through the shared `renderOp()` dispatch, as the replay-era
engine required, so a stroke's ops overlap at their shared endpoints. `perf:brush` drove
`/dev/engine` through a fixed battery (long squiggles, an overlapping cluster, short dashes) at a 4×
CPU throttle and reported draw cost, one undo rebuild, and a screenshot.

## Results

| Variant                 | Technique                                                            | Draw (avg / max) | Undo    | Verdict                                                                      |
| ----------------------- | -------------------------------------------------------------------- | ---------------- | ------- | ---------------------------------------------------------------------------- |
| v2 "multiply wash"      | Two `multiply` passes                                                | —                | —       | Rejected: multiplying against itself pulled a single blue stroke toward navy |
| v3 "feathered wet edge" | Concentric translucent bands from a wide faint halo to a narrow core | 0.06 / 1.0 ms    | ~27 ms  | Picked: cheapest, keeps the chosen colour, soft edge, gentle pooling         |
| v4 "blurred soft stamp" | Offscreen `shadowBlur` stamp per op                                  | 3.4 ms avg       | ~330 ms | Rejected: 30–40× slower, one 84 ms jank frame                                |

v4 used `shadowBlur` rather than `ctx.filter` because the iOS 16.4 floor lacks `ctx.filter` until
Safari 17.

## Why a per-stroke buffer was not used, and what still stands

Every op was painted on its own, so a translucent stroke drawn as many translucent sub-segments
double-darkened at each join; that is why all three variants approximate translucency per op. The
alternative the draft ADR weighed, a per-stroke offscreen buffer composited once at the stroke's
alpha, was not ruled out on determinism: replay could group each command's ops per stroke and render
them through a matching scratch buffer. It was held in reserve because it breaks "one op, one
immediate paint", needs that grouping pass on every replay path, and must make the live incremental
path produce identical pixels to the buffered replay. (The option that did break bit-identity by
design was a commit-time bake of the whole stroke into a raster.)

Snapshot undo (ADR-0066, tiled by ADR-0086) removed the ordinary undo replay, but not every replay:
a full repaint still re-renders each command op by op (`renderCommandAcrossTiles` in
`web/src/lib/drawing/tiledRenderer.ts`). So a buffered watercolor still needs a repaint path that
groups by stroke and reproduces the live pixels. Weigh that cost before re-benching from v3.
