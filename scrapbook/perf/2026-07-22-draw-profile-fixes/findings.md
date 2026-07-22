# Draw-performance fixes — after-run vs the 2026-07-22 baseline

Re-runs of the two baseline captures (`scrapbook/perf/2026-07-22-draw-profile/`, same commands, same
emulation: 4× CPU throttle, headless SwiftShader — absolute ms are pessimistic, ratios are the
signal) after implementing the baseline findings' recommendations 1–3 (ADR-0074):

1. **Clear captures by paper swap, not copy** (+ a `paperPristine` guard so neither the clear fold
   nor the first post-clear stroke pays the fresh paper's ~30 MB backing-store allocation — the
   first attempt moved the hitch from `engine.snapshot` into `engine.fold`, caught by rerunning).
2. **Multi-finger commits capture disjoint per-cluster patches** instead of one union bbox.
3. **Undo repaints only the restored patch rects** when every command is folded (identity view).

## Toddler session, tablet emulation (`perf:web -- --device=tablet`)

| Metric                              | Baseline                   | After                    |
| ----------------------------------- | -------------------------- | ------------------------ |
| `engine.snapshot` max (the clear)   | 575.7 ms                   | **27.2 ms**              |
| `engine.snapshot` total (13 caps)   | 684.6 ms                   | **161.7 ms**             |
| Clear-phase worst long task         | 678.4 ms (pointerup 588.8) | none in top-12 (<113 ms) |
| Undo phase: long tasks              | 12                         | **2**                    |
| Undo phase: worst compositor commit | 55.7–66.6 ms               | **26.7 ms**              |

## Undo scenarios (`perf:undo`, iPad Pro 12.9 @ 120 Hz op volume)

| Metric                                     | Baseline     | After           |
| ------------------------------------------ | ------------ | --------------- |
| Five-finger drag: snapshot copy max        | 1068.6 ms    | **203.2 ms**    |
| Five-finger drag: commit max               | 1108.4 ms    | **237.9 ms**    |
| Five-finger drag: deep-undo max step       | 159.5 ms     | **23.1 ms**     |
| Five-finger drag: blob bytes (20 entries)  | 5148 KB      | 3681 KB         |
| Undo-phase busy (typical stroke scenarios) | 1722–1981 ms | **907–1128 ms** |
| Undo-phase long tasks (typical scenarios)  | 16–19        | **1**           |
| Crayon undo worst commit                   | 274.8 ms     | 254.0 ms        |

The crayon undo commits barely move because those strokes span the canvas — their patch rect ≈ the
full paper, the bound ADR-0069 accepts. Everything stroke-sized now damages stroke-sized.

Remaining from the baseline findings: rec 4 (hide crayon overlays when inactive — needs on-device
verification, ADR-0051) and rec 5 (prefetch the next deep-undo decode / raise K_LIVE — the
five-finger deep-undo drop to 23 ms may have mooted it; re-measure on device).
