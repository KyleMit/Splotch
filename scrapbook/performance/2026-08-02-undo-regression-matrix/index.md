# Physical iPad undo regression matrix — 2026-08-02

This focused physical-device recapture covers the final undo regression checks requested for
`dce45b894af978eb2b0c997641a30c6408b1bb9a`. The accepted brush captures came from the same iPad
running iPadOS 26.5 and MobileSafari. Each started with 20 committed commands and no pending
commands, then performed 10 serial undos. A fifth accepted capture drew in portrait, manually
rotated the physical iPad to landscape, waited for the measured viewport change and visual settle,
then performed the same 10-undo sweep.

[`data.json`](./data.json) contains the normalized measurements and [`sources.json`](./sources.json)
records accepted and rejected capture provenance. Raw event tables remain ephemeral and are not
committed to the scrapbook.

## Status

The four-brush physical undo sweep and rotation-and-undo scenario are complete. All five captures
passed input fidelity and all 50 serial undos passed the undo timing gates. The accepted rotation
capture measured a portrait-to-landscape viewport change from 1024 × 888 to 1366 × 866 and a 17 ms
two-frame visual settle before undo.

The drawing re-check found no regression against the retained
[physical iPad web baseline](../2026-07-31-deployment-target-matrix/index.md). Every brush passed
the paint-tail gates and recorded zero in-contact starvation episodes. The separate cumulative
lost-frame-time-share gate remains above its strict 1% threshold, so these captures are not claimed
as full drawing release-gate passes; every share improved from the retained baseline.

## Accepted capture results

Paint and undo values are milliseconds. Lost share is cumulative lost frame time divided by
in-contact time. The baseline column comes from physical iPad web at 09c4efac27ca.

| Brush          | Fidelity | Commands / undos | Undo engine P95 | Next frame P95 / max | Paint P95 / P99 / max | Lost share now / baseline | In-contact starvation | Result                                                   |
| -------------- | -------- | ---------------- | --------------- | -------------------- | --------------------- | ------------------------- | --------------------- | -------------------------------------------------------- |
| Pen            | Pass     | 20 / 10          | 1               | 11 / 11              | 15 / 18 / 29          | 1.34% / 2.89%             | 0 episodes · 0 ms     | Undo + paint tails pass; share gate still fails          |
| Crayon         | Pass     | 20 / 10          | 1               | 9 / 9                | 16 / 24 / 39          | 2.60% / 5.21%             | 0 episodes · 0 ms     | Undo + paint tails pass; share gate still fails          |
| Magic          | Pass     | 20 / 10          | 1               | 9 / 9                | 15 / 17 / 24          | 2.41% / 2.52%             | 0 episodes · 0 ms     | Undo + paint tails pass; share gate still fails          |
| Eraser         | Pass     | 20 / 10          | 1               | 10 / 10              | 16 / 17 / 26          | 1.13% / 4.61%             | 0 episodes · 0 ms     | Undo + paint tails pass; share gate still fails          |
| Pen + rotation | Pass     | 20 / 10          | 1               | 10 / 10              | 16 / 17 / 24          | 1.24% / 2.89%             | 0 episodes · 0 ms     | Rotation undo + paint tails pass; share gate still fails |

The four landscape brush captures reported 16 live surfaces at 641 × 433 backing pixels each, with a
0.278-megapixel largest surface. The rotation capture reported 16 live surfaces at 470 × 444 after
settling in landscape, with a 0.209-megapixel largest surface. Patch storage immediately before undo
ranged from 13,158,540 bytes in the rotation capture to 23,860,136 bytes for the eraser.

## Matrix disposition

1. Physical undo with pen, crayon, Magic, and eraser: **pass**. Each capture had 20 history
   snapshots and completed 10 serial undos within the engine and next-frame budgets.
2. Draw, rotate, visually settle, then run at least 10 undos: **pass**. Manual physical rotation
   produced the measured viewport change, the harness observed two settled visual frames, and all 10
   undos passed.
3. Live drawing metrics in every physical capture: **re-checked with no regression**. Fidelity,
   paint tails, and the zero-starvation-episode requirement pass. The independent 1% cumulative
   lost-frame-time-share requirement still fails, while improving in every accepted capture versus
   the retained baseline.

## Rejected attempts

An earlier pen capture at `7b035f7627e2f3efc42e97654df867cd99e6d2c5` was excluded because it did not
measure the final review-followup HEAD. It also recorded a 2.03% lost-frame-time share, above the 1%
gate. Two rotation attempts never reached drawing because the profiling server was stale or absent,
so neither produced an artifact. A clean automated attempt reached the rotation step and
WebDriverAgent returned success, but the physical device and viewport remained landscape until the
settle timeout. The accepted capture instead used a manually timed physical rotation; only that run
produced the measured viewport transition and complete post-rotation undo evidence.
