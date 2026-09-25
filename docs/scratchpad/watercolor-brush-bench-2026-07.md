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

## What has changed since

The constraint that shaped all of this was replay determinism: undo rebuilt the page by re-running
every op, so a translucent stroke rendered as many translucent sub-segments double-darkened at each
join, and a per-stroke accumulation buffer was ruled out because it broke bit-identical replay.
ADR-0066 reinstated snapshot undo and ADR-0086 moved it to tiled patches, which lifts that
constraint. A future watercolor brush can therefore composite a whole stroke through its own buffer
for true uniform translucency, and should re-bench from there rather than from v3.
