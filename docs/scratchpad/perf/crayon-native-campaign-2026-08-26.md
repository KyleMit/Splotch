# Crayon native (WKWebView) cost campaign — 2026-08-26

Sequel to the web campaign (`crayon-elimination-campaign-2026-08-26.md`, shipped as PR 1389 /
ADR-0147). Goal: locate where the Capacitor WKWebView's crayon cost lives — 1.19–1.40% lost frame
time against native pen's 0.00–0.13%, a gap the web campaign proved is NOT closable by the restamp
renderer (1.76–2.12% there) — then eliminate it.

## Ground truth going in

* Target: iPad WKWebView only. Physical-Android native crayon is 0.00–0.01% — clean.
* Native runs the plane pipeline + per-frame merged ops (cap 8) via ADR-0146/0147's forks.
* Same-day cost curve already measured: per-move ops 4.4–5.5% (per-op pricing is steep), restamp
  merged 1.76–2.12%, planes 1.19–1.40%. Blend mode and GPU load previously exonerated (ADR-0137's N6
  and xctrace parity — both measured ON native).
* Native fidelity is uncalibrated (ADR-0139): every number here is comparative A/B on one
  instrument, never a gate score.

## Method

Baseline (merged main e6429a7a6) + 5-rung cumulative ablation, branches `exp/crayon-native-a1..a5`
off the new main, `perf:build:cap` + `cap run` per rung, 3 native crayon captures each
(portrait-light, 10 repeats), pen floor control in the baseline rung.

| Rung | strips                                   | isolates                                        |
| ---- | ---------------------------------------- | ----------------------------------------------- |
| a1   | pass tracker + 64-move checkpoint        | tracker geometry, mid-stroke stamps, seed churn |
| a2   | second density pass                      | 2nd pattern stroke per op                       |
| a3   | top mirror plane                         | per-op mirror blit + one compositing plane      |
| a4   | planes entirely (zero mix, direct paint) | plane architecture + glaze stamps               |
| a5   | wax pattern (flat colour)                | pattern paint vs solid                          |

## Ablation results (3 samples each, all fidelity-passing, comparative A/B)

| Rung | lost % samples | median | paint max |
| --- | --- | --- | --- |
| baseline (planes, merged main) | 1.24 / 1.17 / 1.38 | 1.24 | 49–81 |
| pen floor control | 0.01 | 0.01 | 30 |
| a1 no splits/checkpoint | 1.56 / 1.76 / 1.67 | 1.67 | 47–51 |
| a2 + single pass | 1.80 / 1.59 / 1.85 | 1.80 | 52–74 |
| a3 + no mirror plane | 1.49 / 1.49 / 1.57 | 1.49 | 48–54 |
| a4 + no planes (direct paint) | **0.02 / 0.02 / 0.10** | **0.02** | 25–51 |
| a5 + flat colour | 0.02 / 0.02 / 0.02 | 0.02 | 25–32 |

Attribution:

* **The plane architecture is the WKWebView's entire crayon cost too** — direct paint collapses
  1.24% to the 0.02% pen floor. Pattern rasterization free here as well (a4 ≈ a5).
* Checkpoints remain a mitigation (a1 worse), and unlike Safari, hiding the mirror is mildly
  HELPFUL (a3 1.49 vs a1/a2 1.67/1.80) — no uncovered-plane pathology on this compositor.
* Combined with the earlier restamp-on-native A/B (1.76–2.12%): the WKWebView's expensive
  primitive is the per-op canvas BLIT, not the planes as surfaces and not pattern strokes. Safari
  and the WKWebView share the disease (composited planes) but not the cure — restamp's per-op
  blits are Safari-cheap and WKWebView-fatal.

## Trials

* **T1 deferred-glaze** (`exp/crayon-native-t1-deferred-glaze`): zero planes, zero per-op blits —
  live preview is opaque wax painted directly (a4's shape), the buffer accumulates in parallel,
  and the exact glaze lands once per pass close (restore pass bounds from a pass-open under
  snapshot + two-blit stamp). Virgin passes are byte-exact with no snapshot and no close stamp.
  Known concession to eyeball later: over existing ink the mix appears at pass close instead of
  live (the plane preview showed it live).
* **T1's first capture round (0.00/0.00/0.01%) was INVALID and is discarded.** The scripted edit's
  string replacement hit every `planes` branch, splicing the flush body into `renderCrayonOp` (and
  into `clearCrayonBounds`, where it recursed) as an early return — the trial build never painted
  crayon at all, and the capture measured a blank renderer with passing fidelity. The unit tests
  caught it (stack overflow + blit-count contracts), not the capture: a capture asserts the brush
  committed, never that pixels appeared. Module repaired, deferred contracts pinned by unit tests
  (per-op zero blits; close-time 3-blit corner-union stamp; virgin closes stampless), recapture
  below.

## Trial results

| Trial | lost % samples | median | paint max | verdict |
| --- | --- | --- | --- | --- |
| T1 first round | 0.00 / 0.00 / 0.01 | — | 26–28 | **DISCARDED** — build painted nothing (see above) |
| T1B repaired deferred-glaze | 2.75 / 2.87 / 2.81 | 2.81 | 58–81 | REJECT — worse than planes; pen control 0.05% |

T1B attribution question: the delta over a4's 0.02% comes from (a) the pass-open composited-tile
read, (b) the close-time pass-bounds restore+stamp blits, or (c) per-op pattern painting into a
DETACHED buffer canvas. Prior evidence de-weights (a): the undo machinery reads the tile once per
command for every brush and native pen still measures 0.01–0.05%. Prime suspect: (c) — a detached
canvas plausibly gets an unaccelerated backing on the WKWebView, making its per-op pattern strokes
CPU work, where the same strokes into the tile (a4) and into the ATTACHED plane elements (planes
pipeline) ride the GPU.

* **T4** (`exp/crayon-native-t4-buffer-write`): a4 + per-op buffer painting only — 0.02 / 0.14%.
  Detached-buffer writes are FREE; hypothesis (c) refuted.
* **T2** (`exp/crayon-native-t2-no-read`): deferred with close-stamps kept, read removed —
  1.44 / 1.56%. Completed arithmetic: close-stamps ≈ 1.4 points, the pass-open read ≈ 1.3 more,
  and they add to T1B's 2.8.
* **Retro-revelation:** T2's 1.50 ≈ a3's 1.49 ≈ planes' 1.24 — on the WKWebView the plane
  pipeline's cost was never the composited planes; it was the SAME pass-cadence flush stamps.
  The runtime's poison, precisely: canvas blits involving the composited tile at pass cadence, in
  either direction — while pattern strokes and detached-canvas work are free, and pen's undo
  machinery proves whole-tile reads at COMMAND cadence cost ~nothing (native pen 0.01–0.05%
  includes one per command per tile).
* **T7** (`exp/crayon-native-t7-stroke-cadence`): the cadence fix — read once and stamp once per
  STROKE (mid-stroke checkpoints/splits neutralized for the trial; productization would keep seed
  re-phasing while dropping only the mid-stroke stamp, making the glaze once-per-stroke — a
  semantic simplification, since same-colour buildup is min-idempotent and colour can't change
  mid-stroke). Pending.
