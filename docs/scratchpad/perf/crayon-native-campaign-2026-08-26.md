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
* Every number here is same-instrument comparative A/B, never a gate score — but **not** because
  native fidelity is uncalibrated. ADR-0144 retired `ios-capacitor-webview`'s last uncalibrated
  check, and these artifacts record `passed: true`, `uncalibrated: []`, coalescing not applicable.
  The limit is gate class: the matrix reserves the calibrated release gate for Safari.

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

| Rung                           | lost % samples         | median   | paint max |
| ------------------------------ | ---------------------- | -------- | --------- |
| baseline (planes, merged main) | 1.24 / 1.17 / 1.38     | 1.24     | 49–81     |
| pen floor control              | 0.01                   | 0.01     | 30        |
| a1 no splits/checkpoint        | 1.56 / 1.76 / 1.67     | 1.67     | 47–51     |
| a2 + single pass               | 1.80 / 1.59 / 1.85     | 1.80     | 52–74     |
| a3 + no mirror plane           | 1.49 / 1.49 / 1.57     | 1.49     | 48–54     |
| a4 + no planes (direct paint)  | **0.02 / 0.02 / 0.10** | **0.02** | 25–51     |
| a5 + flat colour               | 0.02 / 0.02 / 0.02     | 0.02     | 25–32     |

Attribution:

* **The plane architecture is the WKWebView's entire crayon cost too** — direct paint collapses
  1.24% to the 0.02% pen floor. Pattern rasterization free here as well (a4 ≈ a5).
* Checkpoints remain a mitigation (a1 worse), and unlike Safari, hiding the mirror is mildly HELPFUL
  (a3 1.49 vs a1/a2 1.67/1.80) — no uncovered-plane pathology on this compositor.
* Combined with the earlier restamp-on-native A/B (1.76–2.12%): the WKWebView's expensive primitive
  is the per-op canvas BLIT, not the planes as surfaces and not pattern strokes. Safari and the
  WKWebView share the disease (composited planes) but not the cure — restamp's per-op blits are
  Safari-cheap and WKWebView-fatal.

## Trials

* **T1 deferred-glaze** (`exp/crayon-native-t1-deferred-glaze`): zero planes, zero per-op blits —
  live preview is opaque wax painted directly (a4's shape), the buffer accumulates in parallel, and
  the exact glaze lands once per pass close (restore pass bounds from a pass-open under snapshot +
  two-blit stamp). Virgin passes are byte-exact with no snapshot and no close stamp. Known
  concession to eyeball later: over existing ink the mix appears at pass close instead of live (the
  plane preview showed it live).
* **T1's first capture round (0.00/0.00/0.01%) was INVALID and is discarded.** The scripted edit's
  string replacement hit every `planes` branch, splicing the flush body into `renderCrayonOp` (and
  into `clearCrayonBounds`, where it recursed) as an early return — the trial build never painted
  crayon at all, and the capture measured a blank renderer with passing fidelity. The unit tests
  caught it (stack overflow + blit-count contracts), not the capture: a capture asserts the brush
  committed, never that pixels appeared. Module repaired, deferred contracts pinned by unit tests
  (per-op zero blits; close-time 3-blit corner-union stamp; virgin closes stampless), recapture
  below.

## Trial results

| Trial                       | lost % samples     | median | paint max | verdict                                           |
| --------------------------- | ------------------ | ------ | --------- | ------------------------------------------------- |
| T1 first round              | 0.00 / 0.00 / 0.01 | —      | 26–28     | **DISCARDED** — build painted nothing (see above) |
| T1B repaired deferred-glaze | 2.75 / 2.87 / 2.81 | 2.81   | 58–81     | REJECT — worse than planes; pen control 0.05%     |

T1B attribution question: the delta over a4's 0.02% comes from (a) the pass-open composited-tile
read, (b) the close-time pass-bounds restore+stamp blits, or (c) per-op pattern painting into a
DETACHED buffer canvas. Prior evidence de-weights (a): the undo machinery reads the tile once per
command for every brush and native pen still measures 0.01–0.05%. Prime suspect: (c) — a detached
canvas plausibly gets an unaccelerated backing on the WKWebView, making its per-op pattern strokes
CPU work, where the same strokes into the tile (a4) and into the ATTACHED plane elements (planes
pipeline) ride the GPU.

* **T4** (`exp/crayon-native-t4-buffer-write`): a4 + per-op buffer painting only — 0.02 / 0.14%.
  Detached-buffer writes are FREE; hypothesis (c) refuted.
* **T2** (`exp/crayon-native-t2-no-read`): deferred with close-stamps kept, read removed — 1.44 /
  1.56%. Completed arithmetic: close-stamps ≈ 1.4 points, the pass-open read ≈ 1.3 more, and they
  add to T1B's 2.8.
* **Retro-revelation:** T2's 1.50 ≈ a3's 1.49 ≈ planes' 1.24 — on the WKWebView the plane pipeline's
  cost was never the composited planes; it was the SAME pass-cadence flush stamps. The runtime's
  poison, precisely: canvas blits involving the composited tile at pass cadence, in either direction
  — while pattern strokes and detached-canvas work are free, and pen's undo machinery proves
  whole-tile reads at COMMAND cadence cost ~nothing (native pen 0.01–0.05% includes one per command
  per tile).
* **T7** (`exp/crayon-native-t7-stroke-cadence`): the cadence fix — read once and stamp once per
  STROKE (mid-stroke checkpoints/splits neutralized for the trial; productization would keep seed
  re-phasing while dropping only the mid-stroke stamp, making the glaze once-per-stroke — a semantic
  simplification, since same-colour buildup is min-idempotent and colour can't change mid-stroke).
  Pending.

* **T8** (`exp/crayon-native-t8-postlift-stamp`): stamp moved past the lift — 3.48/3.50/3.55, WORST
  yet, though the stamps themselves ran free between strokes (betweenStrokes lost ≈0). The poison
  relocated: the cost reappeared on the NEXT stroke's undo capture, in-contact. The hypothesis that
  fits — WebKit's canvas command buffer not flushing until a read forces it — is stated here as a
  hypothesis, not a finding: nothing in this campaign traced it.
* **T9** (`exp/crayon-native-t9-patch-under`): under seeded from the undo system's own pre-command
  snapshot (crayon adds zero tile reads; blank commands capture nothing and are exactly the virgin
  passes) — 1.74/1.75/1.81. Better, still above planes: the unflushed stamp still taxed the undo
  capture.
* **T10** (`exp/crayon-native-t10-postflush`): + a 1-px getImageData after the post-lift stamp,
  forcing the flush while still between strokes — **0.30/0.36/0.46**. The A/B is decisive about the
  EFFECT; it does not confirm the mechanism, and a later 75-second Time Profiler capture over a
  19-stroke native session (PR 1414 review) found no readback stack tying the 1-px call to a
  command-buffer flush.

## Production result (`perf/crayon-native-deferred-stamp`)

Deferred pipeline productized: crayonFlush ops carry a `final` flag (checkpoints/splits = seed
boundaries, no stamp; only the close stamps, post-lift + forced flush; direct flush calls stay
synchronous for export/foreign-op ordering). Final confirmation, all fidelity-passing:

| Cell                                  | lost %                    | paint p95/p99/max |
| ------------------------------------- | ------------------------- | ----------------- |
| native crayon portrait                | 0.35 / 0.32 / 0.32        | 15/16/33–52       |
| native crayon landscape               | 0.20 / 0.22 / 0.28 / 0.33 | 15/16/34–44       |
| native pen control                    | 0.04                      | 16/16/38          |
| web crayon sanity (restamp untouched) | 0.97                      | 16/21/61          |

The landscape cell originally had two samples, below this runbook's own three-sample minimum, and
its 0.22% minimum was being quoted as the candidate's endpoint. Two further samples (2026-08-27,
same build, deferred temporarily re-activated for the capture) came back 0.20% and 0.28%: the cell
holds at **0.20–0.33%**, so quote that range rather than its floor. Unlike the Safari landscape arm,
the extra samples confirmed this cell instead of overturning it — which is the point of taking them,
not a reason to have skipped them.

## What was measured (WKWebView) — and what is only inferred

Measured, by controlled A/B on this device:

1. Pattern strokes and detached-canvas work are free; EVERY canvas blit involving the composited
   tile at pass cadence costs ~1.4 points, direction and area barely mattering.
2. Moving the closing stamp past the lift does not by itself help — it relocates the cost onto the
   next stroke's undo capture (T8: 3.5%).
3. Adding a 1-px readback right after that post-lift stamp, between strokes, is worth 1.7% → 0.37%.
4. The undo system's pre-command snapshot works as an under source at no measured cost — its read is
   already paid by every brush, and commands that skip it (blank paper) are exactly the passes
   needing no under.

Inferred, and deliberately not promoted to a rule: that a composited-tile read is priced by the
unflushed work preceding it, that idle never flushes the canvas command buffer, and that the read is
what forces the flush. That story fits every measurement above and nothing here tests it; a
75-second Time Profiler capture over a 19-stroke native session (PR 1414 review) found no readback
stack tying the 1-px call to a flush. Anyone porting this workaround should re-measure rather than
rely on the mechanism.

Visual concessions for the human eyeball (issue-1372 style): over existing ink the live preview is
unmixed opaque wax, with the exact glaze appearing at the post-lift stamp (~2 frames after the
finger lifts); mid-stroke checkpoints no longer mix incrementally. Over blank paper — the dominant
toddler case — pixels are byte-exact throughout.

## Outcome: rejected on appearance (2026-08-27)

The deferred pipeline was installed on the physical iPad with Safari serving the restamp pipeline as
a live control, and a human drew on both. Verdict: **the colour visibly shifts when the stroke lands
— bright wax darkening toward the background** — which reads as a glitch rather than as ink drying.
Disqualifying for a drawing app aimed at two-year-olds, whatever the frame numbers say.

Native therefore keeps ADR-0085's plane pipeline at 1.19–1.40%, and the measured 4× (0.20–0.46%
against a 0.01–0.05% pen floor) is **declined, not unavailable**.

The campaign's own framing is what went wrong, and it is worth stating for the next attempt: it
treated the frame budget as the target and the appearance as a concession to be checked at the end.
The constraint is the reverse. **The live preview must show the mixed appearance while the finger is
down**; anything that defers mixing past the lift is disqualified before it is measured.

Note also what the ablation says about *where* the plane cost lives, because it was never exploited:
T2 isolated it as the pass-cadence stamps that bake the pass into the tile (~1.4 points), not the
plane surfaces themselves (a3, which removed a plane, was WORSE at 1.49%). Planes already display
the final glazed pixels — that is their design purpose (ADR-0085's "no visible snap") — so deferring
only the BAKE while keeping the planes up is visually free by construction, and was never measured.
Every native trial here (T1–T10) deferred the bake on a direct-paint preview instead.
