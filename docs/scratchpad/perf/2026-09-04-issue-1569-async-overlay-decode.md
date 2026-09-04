# Issue 1569 async overlay decode A/B

Date: 2026-09-04 America/New_York\
Target: physical iPad Safari (`ipad-device-web`)\
PR: #1640

This note preserves the bounded control/treatment result behind the performance catalog. The
gitignored raw action artifacts remain unchanged in the capture worktrees. They are not committed
here because the direct XCUITest action runner records the physical hardware identifier in
`device.id`; rig policy forbids committing or posting that identifier. Final matrix evidence must be
promoted only after the evidence path redacts host-specific device identity without changing any
measurement.

## Build identity and method

* Control product commit: fa65fc66c1f73f690a792668176fb5da729e9399
* Treatment product commit: 593736be67709c85087d8195066d1ae01c5aaceb
* Treatment: add `decoding="async"` to the displayed coloring-paper image. The existing off-DOM
  `Image.decode()` readiness gate is unchanged.
* Each run used four captures: one warm-up and three scored repeats. All activations were valid.
* Per-repeat maxima below come from `scoredActionFrameGaps()` in `tools/perf/lib/action-stats.mjs`,
  not pooled P95/P99/max values treated as repeats.
* Control and treatment used isolated preview servers and the same session-owned Appium service. The
  treatment build was unchanged for all treatment runs.

## Select-coloring-page result

| Arm                  | Mode            | Scored-repeat maxima (ms) | P95/max (ms) | Ready P50/P95 (ms) | First-frame P95 (ms) | Verdict |
| -------------------- | --------------- | ------------------------- | ------------ | ------------------ | -------------------- | ------- |
| Control, focused     | landscape-light | 31, 25, 30                | 25/31        | 132/136            | 3                    | Fail    |
| Control, focused     | landscape-dark  | 29, 29, 30                | 29/30        | 128/131            | 2                    | Fail    |
| Treatment, focused   | landscape-light | 21, 21, 20                | 20/21        | 134/226            | 3                    | Pass    |
| Treatment, focused   | landscape-dark  | 28, 22, 31                | 22/31        | 133/133            | 2                    | Fail    |
| Treatment, canonical | landscape-light | 20, 18, 19                | 19/20        | 129/134            | 3                    | Pass    |
| Treatment, canonical | landscape-dark  | 19, 21, 17                | 19/21        | 139/164            | 3                    | Pass    |

Both canonical treatment sweeps ran the complete 49-action sequence and every action passed. The
focused dark treatment remains part of the result: async decoding improved its P95 from 29 to 22 ms
but did not clear the 20 ms P95 gate. The later canonical dark run cleared the gate at 19/21 ms.

Readiness did not move consistently on the unchanged treatment build. The focused and canonical
light runs reported P95 226 and 134 ms; the matching dark runs reported 133 and 164 ms. The frame
benefit repeated while the readiness outlier changed modes, which is consistent with the remote
ready-predicate polling resolution rather than deferred product work. The final single-product-
commit physical matrix recapture remains the release-gate decision.

## Regression proof

The existing Chromium coloring-book flow now asserts `decoding="async"` on the mounted canvas
overlay. It passed with the treatment and failed at that assertion when the product line was
temporarily removed. `npm run check`, `npm run lint`, and `npm run format:check` also passed.
