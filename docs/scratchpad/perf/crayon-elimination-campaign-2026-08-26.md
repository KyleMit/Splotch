# Crayon stroke cost elimination campaign — 2026-08-26

Goal: locate exactly where crayon's per-stroke cost over pen lives on the physical iPad, then find a
single change (not an accumulation of small ones) that brings crayon to pen parity, retiring the
ADR-0137 `ipad-device-web:crayon` 1.5% gate exception.

## Starting evidence

Published matrix (2026-07-31 deployment-target matrix, campaign-1322 captures):

| Target                       | pen lost % | crayon lost % | crayon paint p99/max |
| ---------------------------- | ---------- | ------------- | -------------------- |
| ipad-device-web (4 modes)    | 0.60–0.69  | 1.12–1.35     | 22–24 / 43–68 ms     |
| ipad-device-native (4 modes) | 0.01–0.13  | 2.00–2.14     | 24–27 / 62–87 ms     |

Native cells predate the ADR-0146 per-frame merge fix (post-fix median 1.11%) and are
fidelity-uncalibrated (advisory).

Prior art: issue-1196 campaign (13 implementations, ADR-0137 table, branches `exp/1196-*` all on
origin), issue-1236 op-granularity A/B (ADR-0146). Known: blend *mode* is not the cost (N6), GPU is
not the bottleneck (xctrace parity), single-pass got 1.89% (pre-mirror-by-blit baseline), the
never-implemented candidate is #1206 single crayon plane. ADR-0137 explicitly notes the exception
"records a cost that thirteen implementations failed to reduce, not a proof that no implementation
can."

## Method

* Device: iPad UDID 00008103-0006202E3CF1001E, Safari (ipad-device-web), portrait-light.
* Calibration note (corrected 2026-08-27 after review): native captures are **not**
  fidelity-uncalibrated — ADR-0144 retired `ios-capacitor-webview`'s last uncalibrated check, and
  these artifacts record `passed: true`, `uncalibrated: []`. Native is same-instrument comparative
  evidence because the matrix reserves the calibrated release gate for Safari — a gate-class limit,
  not a calibration gap.
* Rig: preflight green 2026-08-26 (Android input 122 moves/s, iOS WDA launch + rotation verified).
  Preview 4173 (this checkout), probe 4215, Appium 4723 reused, WDA 8100.
* Capture:
  `perf:ios:xcuitest:screen --brush=<b> --gesture-repeats=10 --orientation=portrait
  --theme=light`,
  3 samples per cell, fidelity verdict checked before scoring, brush committed asserted by the tool.
  Build per variant via `perf:serve` restart; manifest verified per capture.
* Score: lostFrameTimeShare (in-contact), paint p95/p99/max. Compare against same-session pen and
  crayon baselines, never the published matrix.

## Ablation ladder (cumulative, crayon → pen)

Each rung stacks on the previous; the delta between adjacent rungs attributes that feature's cost.
Branches `exp/crayon-ablate-*`, all from main 0e309138a.

| Rung | Branch                          | Strips                                 | Isolates                                                |
| ---- | ------------------------------- | -------------------------------------- | ------------------------------------------------------- |
| A0   | main                            | —                                      | baseline                                                |
| A1   | exp/crayon-ablate-1-no-split    | pass tracker + 64-op checkpoint        | tracker geometry, mid-stroke 16-tile stamps, seed churn |
| A2   | exp/crayon-ablate-2-single-pass | second density pass                    | 2nd pattern stroke per op                               |
| A3   | exp/crayon-ablate-3-no-mirror   | top plane + mirror blit                | per-op blit + 16 top compositing planes                 |
| A4   | exp/crayon-ablate-4-no-planes   | pass buffer (colorMix 0, direct paint) | glaze stamps + 16 darken planes                         |
| A5   | exp/crayon-ablate-5-solid       | wax pattern (flat colour)              | pattern paint vs solid                                  |

Residual A5 − pen = per-move op granularity + crayon routing overhead.

## Log

* 2026-08-26: preflight green; rig taken over. Baseline captures started (crayon/pen ×3 interleaved,
  portrait-light, 10 repeats). Ablation branches created while device captured.
* Baseline complete, all six fidelity PASS (portrait-light, 10 repeats, ~60 s contact each):
  * crayon lost 1.11 / 1.23 / 1.30% (median 1.23), frame p95/p99/max 20/27/48-49
  * pen lost 0.75 / 0.76 / 0.80% (median 0.76), frame p95/p99/max 19/31-32/41-42
  * Gap ≈ 0.47 points, spreads tight enough to resolve ~0.1-point deltas at n=3.
* Forensics on crayon-1: zero starvation episodes — the excess is a broad tail of unpaired 2–3-beat
  frames (40–48 ms) mid-contact with ≤2 ms engine JS inside. Pen has MORE late frames by count
  (lateShare 2.4% vs 1.5%) and more engine.draw JS, but its late frames pair-and-credit
  (slip/rejoin); crayon's don't. The cost is rendering/compositor-side, not script.
* Ablation ladder launched: 5 rungs × 3 crayon samples, rebuild+serve per rung.

## Ablation results (3 samples each, all fidelity PASS)

| Rung                          | lost % samples     | median   | frame p99 | frame max |
| ----------------------------- | ------------------ | -------- | --------- | --------- |
| A0 baseline                   | 1.11 / 1.23 / 1.30 | 1.23     | 27–28     | 47–49     |
| A1 no-split/checkpoint        | 1.73 / 1.78 / 1.80 | **1.78** | 30–32     | 48–54     |
| A2 + single pass              | 1.56 / 1.64 / 1.80 | 1.64     | 30        | 48–51     |
| A3 + no mirror plane          | 2.38 / 2.39 / 2.53 | **2.39** | 34–36     | 63–65     |
| A4 + no planes (direct paint) | 0.57 / 0.64 / 0.68 | **0.64** | 30–32     | 36–44     |
| A5 + flat colour              | 0.61 / 0.69 / 0.71 | 0.69     | 30–32     | 38–40     |
| pen baseline                  | 0.75 / 0.76 / 0.80 | 0.76     | 31–32     | 41–42     |

Attribution:

* **The composited preview-plane architecture is the whole excess.** Direct-painting wax pattern
  strokes into the normal ink tiles (A4) lands BELOW pen. Non-overlapping ranges vs baseline.
* **Pattern rasterization is free.** A4 ≈ A5 (pattern vs flat colour indistinguishable), so the
  texture itself — the thing ADR-0137 called "inherently more expensive than a solid stroke" — is
  not where the cost lives on this device.
* **Checkpoints/pass splits are a mitigation, not a cost.** Removing them (A1) worsened lost share
  by 0.55: an unbounded open pass grows the blended planes' dirty region (ADR-0085 trial 23's
  mechanism, still alive at today's op rate).
* **The mirror paradox:** hiding the top plane while the darken-blended bottom plane keeps mutating
  (A3) is the WORST measured config (2.39%, max 63–65 ms). The top normal-blend plane is somehow
  shielding the darken compositing cost. Mechanism unexplained; observation is 3 samples,
  non-overlapping ranges. Do not ship any "just drop the mirror" variant (also matches the old
  \#1208/N5 no-gain result).
* The caveats: A2–A5 stack single-pass, so the two-pass direct-paint cell still needs its own
  measurement (idea 7), and A4/A5 change the live look (no glaze mixing preview) so they are
  attribution evidence, not shippable candidates.

## Idea results

| Idea                     | lost % samples     | median   | paint max | notes                                                                                                                                                           |
| ------------------------ | ------------------ | -------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| i1 restamp (zero planes) | 0.90 / 0.72 / 0.74 | **0.74** | 49/51/45  | pen parity, full visual contract, all 5 crayon E2E specs green; one sample tripped the 50 ms paint-max gate — under-snapshot at pass open is the suspected tail |

i1 design: offscreen wax buffer + pass-open under snapshot per tile; each op restores its rect from
the snapshot and re-applies the two-blit glaze onto the normal ink tile. Planes never registered.
Live pixels = pass-close pixels by construction (a pixel's last restamp is the same pure function of
final buffer + under that the old flush applied once — later ops can only repaint pixels inside
their own padded rect, which is exactly the region they restamp).

## Idea catalog (draft — ranked after ablation attribution)

Candidate mechanisms, to be pruned/ordered by the ladder's deltas:

1. Zero-plane live glaze: keep the pass buffer offscreen and un-composited; per frame restore the
   pass-bounds region of the normal tile from a pass-open snapshot and re-stamp the glaze. Only the
   normal tiles stay composited, like pen. Kills all 32 plane canvases.
2. Single-plane preview (the never-implemented \#1206): drop the top mirror plane and its per-op
   blit; accept a slightly darker live preview (bottom darken plane only), exact pixels restored at
   flush.
3. Persistent planes: never toggle `hidden` on crayon planes (transparent instead); removes
   compositor layer create/destroy at pass boundaries and the per-op redundant writes.
4. Hot-path hygiene: one bounds computation per op (currently three), reuse scratch DOMMatrix/
   transform objects, skip LRU delete/set churn on cache hits.
5. Dirty-tile-set flush: recordCrayonFlush loops only inked tiles, not all 16.
6. Deferred lift flush: move the finger-up glaze stamp off the lift frame to the next rAF — planes
   already show identical pixels by construction, so no visual change.
7. Sprite stamping: pre-rendered paper-anchored stamps drawImage'd along segments instead of
   pattern-filled strokes.
8. ImageBitmap-backed patterns: immutable bitmap source may fast-path WebKit pattern rasterization
   vs canvas-backed sources.
9. Pattern tile size sweep (128/512): pattern repeat count vs cache locality in the fill.
10. Merged op with per-segment strokes: one op per frame (fewer dispatches/undo captures/bounds) but
    stroke each segment separately, testing whether the ADR-0146 Safari merge regression was
    pattern-fill bbox area rather than op merging itself.
11. Live single-pass, full wax at flush: deposit only the core pass per move; add the rim pass into
    the buffer at checkpoint time (halves per-move pattern strokes; preview slightly sparser
    mid-pass).
12. Checkpoint cadence tuning: time/idle-based checkpoints or round-robin per-tile stamps instead of
    a 64-move all-tile stamp.
13. Context attribute tuning on the plane canvases (`desynchronized`, alpha hints) — ADR-0085 trials
    tuned the big single canvas, never the small planes.
14. Compositing hints on the plane stack: scope/remove `isolation`, `will-change`, `contain` so the
    darken blend's readback area shrinks to touched tiles.
15. WebGL wax renderer: one WebGL canvas renders all wax quads sampling the tooth texture;
    eliminates 2D pattern rasterization and the plane topology entirely (big swing, last resort).

## Idea sweep 1 results (3 samples each, all fidelity PASS, portrait-light, 10 repeats)

| Branch                                                        | lost % samples | median   | paint max | verdict                                                                                        |
| ------------------------------------------------------------- | -------------- | -------- | --------- | ---------------------------------------------------------------------------------------------- |
| exp/crayon-i1-restamp (uninstrumented build — see trap below) | 0.90/0.72/0.74 | 0.74     | 49/51/45  | remeasured below                                                                               |
| exp/crayon-i1-restamp (PERF_MARKS build)                      | 0.84/0.81/—    | ~0.82    | 79/50/—   | pen-parity lost share; under-snapshot tail is real                                             |
| exp/crayon-i2-frame-restamp                                   | 2.75/2.62/2.59 | 2.62     | 51/51/54  | REJECT — frame-union rects are far worse than per-op rects                                     |
| exp/crayon-i3-mix-at-close                                    | 2.25/1.99/2.18 | 2.18     | 56/55/60  | REJECT                                                                                         |
| exp/crayon-i4-single-plane                                    | 1.45/1.47/1.43 | 1.45     | 54/46/47  | REJECT — worse than baseline                                                                   |
| exp/crayon-i5-two-pass-direct                                 | 0.67/0.65/0.60 | **0.65** | 42/35/39  | best number; not shippable (no glaze); proves full 2-pass wax texture direct-painted beats pen |
| exp/crayon-i7-defer-lift-flush                                | 1.36/1.19/1.41 | 1.36     | 48/48/76  | REJECT                                                                                         |
| exp/crayon-i8-dirty-tile-flush                                | 1.33/1.16/1.27 | 1.27     | 45/49/47  | no gain (noise)                                                                                |
| exp/crayon-i9-hygiene                                         | 1.25/1.17/1.28 | 1.25     | 67/43/45  | no gain (noise)                                                                                |
| exp/crayon-i10-checkpoint-32                                  | 1.42/1.07/1.18 | 1.18     | 74/43/68  | marginal/noise, worse tails                                                                    |

**Capture trap earned this session:** running any Playwright E2E spec rebuilds `web/build` WITHOUT
`PERF_MARKS`, silently replacing the instrumented bundle a `perf:serve --ignore-scripts` then
serves. The i1 captures' artifacts came back with `meta.counts.measures = 0` — that field is the
tell. Verify `measures > 0` (or `measureNames` non-empty) before scoring any capture, and re-run
`perf:build` after any E2E invocation.

## Idea sweep 2 results (3 samples each, all fidelity PASS, instrumented builds verified via meta.counts.measures)

| Branch                               | lost % samples | median   | paint max    | verdict                                                                                                                    |
| ------------------------------------ | -------------- | -------- | ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| exp/crayon-i1-restamp (marked rerun) | 0.84/0.81/0.87 | 0.84     | 79/50/57     | passes lost gate at ~pen parity; paint-max tail from whole-tile under snapshot                                             |
| exp/crayon-i16-virgin-fast-path      | 0.77/0.82/0.92 | 0.82     | 51/53/53     | ≈ i1 lost; tail improved but ~51–53                                                                                        |
| exp/crayon-i12-merged-direct         | 0.61/0.67/0.54 | **0.61** | **35/35/35** | best cell of the campaign; direct paint + per-frame merged ops + per-segment strokes                                       |
| exp/crayon-i6-persistent-planes      | 1.20/1.20/1.14 | 1.20     | 45–52        | noise vs baseline                                                                                                          |
| exp/crayon-i11-normal-blend-probe    | 2.35/2.10/2.18 | 2.18     | 39–45        | mechanism probe: single UNCOVERED mutating plane is catastrophic at normal blend too — topology, not `darken`, explains A3 |
| exp/crayon-i13-desync-planes         | 1.22/1.10/1.10 | 1.10     | 44–52        | marginal, within spread                                                                                                    |
| exp/crayon-i14-will-change           | 1.10/1.15/1.22 | 1.15     | 43–46        | noise                                                                                                                      |

i15 (WebGL wax renderer) deliberately not implemented: the plane-free 2D family already reaches
below pen, so a renderer rewrite has nothing left to eliminate.

Compositor-topology summary (all with the same wax texture): one uncovered mutating composited plane
≈ 2.2–2.4%; two stacked planes (shipping) ≈ 1.2%; zero planes ≈ 0.6–0.85%. Also refuted for the
no-plane world: "Safari crayon cannot merge ops" (ADR-0146) — merged-per-frame with per-segment
strokes is the best measured cell.

## i18 hybrid — catastrophic failure that located the final mechanism

exp/crayon-i18-hybrid (virgin fast path + INCREMENTAL under capture reading the live tile per op)
measured **96.7–97.4% lost frame time with multi-second paint latencies** — the page effectively
froze during crayon contact — while the same build's pen controls sat at 0.77/0.83%. Every E2E pixel
contract passed; only the device showed it. The one hot-path element i18 added over i1 was
`drawImage` READS from the composited live tile per op. Combined with the rest of the campaign:

* per-op small-rect WRITES onto a composited tile: fine (i1: 0.84%)
* larger-area restamps per frame: bad (i2: 2.62%, i3: 2.18%)
* per-op READS from a composited tile: fatal (i18: ~97%)
* once-per-pass whole-tile reads: the 50–79 ms paint-max tail (i1/i16)

**Rule earned: never read a composited live canvas on the pointer hot path.** The i18 A/B
establishes the rule — adding per-op live-tile reads, and nothing else, took the same build to ~97%
lost frame time. The *mechanism* is inference, not measurement: "each read forces a GPU pipeline
sync, and at digitizer rate the syncs compound" fits the timings, but no trace here attributes it (a
later 75-second Time Profiler capture on the native side found no readback stack either). Stated as
fact it would be exactly the observation→mechanism jump this runbook warns against. (Compare
ADR-0068's warning about reading freshly-painted canvases — the same rule in its
accelerated-compositor form.)

## Final iterations (3+ samples portrait, 2 landscape — see the correction below, fidelity PASS, instrumented)

| Branch                                 | portrait lost      | landscape lost | paint max | notes                                                                                                             |
| -------------------------------------- | ------------------ | -------------- | --------- | ----------------------------------------------------------------------------------------------------------------- |
| exp/crayon-i19-shadow-under            | 2.70/2.80/3.11     | 3.34/3.33      | 59–74     | REJECT — folding glaze INTO the under canvas (blend ops on it) makes it a slow blit source                        |
| exp/crayon-i19b-no-virgin (diagnostic) | 2.82/2.80          | —              | 59/59     | proves the fold, not the virgin mixing, is i19's cost                                                             |
| exp/crayon-i20-idle-shadow             | 1.05/0.67/0.75     | 0.85/0.84      | 50–67     | shadow refreshed by plain reads only; Safari's scheduleIdle (300 ms quiet) never fired under back-to-back strokes |
| **exp/crayon-i20b (winner)**           | **0.79/0.90/0.78** | **0.97/0.77**  | 46–63     | double-rAF post-lift refresh; same-session pen 0.75 / paint max 36                                                |

Winner verdict: **crayon at pen parity in portrait, near the gate in landscape, full visual
contract** (all 5 crayon pixel-contract E2E specs + rotation + undo suites green; 4 of 2094 unit
tests fail, all four asserting the retired plane/flush internals; 3 work-counter E2E assertions
expect the old `realizedCrayonBackings === 2` topology).

**Corrected 2026-08-27 after review.** The line above originally read "pen parity on the lost-frame
gate, both orientations" and claimed the ADR-0137 1.5% exception would retire. That rested on a
**two-sample** landscape arm (0.97 / 0.77) — below this runbook's own three-sample minimum, and the
review said so. Taking the third sample did two things:

* It exposed a **regression already merged to `main`** (PR 1423): the shadow drain stopped re-arming
  when it yielded mid-stroke, taking crayon to 1.15–1.64% with pen unchanged. Fixed there.
* With the fix and three samples per cell, landscape settles at **0.97 / 0.98 / 1.06** against
  portrait's **0.83 / 0.88 / 0.77** and a same-session pen control of 0.76–0.81. So portrait is at
  parity; landscape is restored but sits *at* the 1% gate rather than under it, and modestly above
  pen. The ADR-0137 exception (1.5% for this cell) still covers it and should **not** be retired on
  this evidence.

The general lesson is the one the runbook already carried and this campaign still tripped over: a
two-sample cell is not a result, and the sample that would have caught it was one capture away.

Open item for productization: paint max 46–63 vs pen's 36 and the ≤50 soft gate (never reached the
67 hard-fail). Forensics on the worst sample: the tall frames sit MID-contact with 6–9 moves and ≤1
ms engine JS — the same compositor-side shape as baseline's 43–48 tail, raised ~10–15 ms by the
non-virgin path's per-op offscreen-buffer blits (pure direct paint i5/i12 hold max 35–42). Leads:
adopt i12's merged-op+segmented-stroke shape for the web too (fewer restamps per frame; best
measured cell at 0.61% / max 35), or accept and re-litigate the paint-max budget for crayon.

## Rules earned (device-verified, this campaign)

1. Never READ a composited live canvas on the pointer hot path (mechanism inferred, effect measured)
   — per-op reads froze the page (97% lost). Once-per-invalidation reads cost a 50–79 ms frame when
   they land in-contact.
2. Restamp cost scales with AREA per frame, not blit count: per-op small rects fine (0.8%),
   frame-union rects bad (2.6%), pass-bounds rects terrible (2.2%).
3. Never apply blend operations INTO a canvas that hot-path blits read from (i19: 2.8%).
4. A single uncovered mutating composited plane is catastrophic regardless of blend mode (A3 darken
   2.39%, i11 normal 2.18%); two stacked planes 1.2%; zero planes 0.6–0.9%.
5. Pattern rasterization is free on this device (A4≈A5, i5 max 35–42) — ADR-0137's "a patterned
   stroke is inherently more expensive than a solid one" does not hold on iPad Safari 26.5.
6. Safari's scheduleIdle fallback (300 ms input-quiet) never fires under continuous scribbling —
   post-lift work that must actually run needs a double-rAF, not idle scheduling.

## Productization sketch for the winner family

i1's residual tail (paint max 79 once) is the pass-open whole-tile under snapshot. Two fixes:

* i16 virgin fast path (measuring): blank-at-pass-open tiles skip the snapshot and restamp with
  clearRect + one blit — byte-exact because the glaze over blank collapses to the wax.
* i17 (if non-virgin tail needs killing): capture the under snapshot INCREMENTALLY — extend the
  captured region by the new op rect's uncovered remainder (≤4 rect pieces per op) instead of
  copying the whole tile at pass open. Exact: pixels outside the current bounds union are
  un-restamped target pixels, safe to copy any time before their first restamp.
* Productization must also fix i1's two known gaps: mid-stroke repaint (resize/undo-beneath) must
  reset open buffers before replay, and export-time flush semantics (checkpoint-equivalent close is
  acceptable and matches a checkpoint's behaviour).

## Native WKWebView chapters (post-PR follow-through, same day)

ADR-0146's both-runtimes rule was enforced and earned its keep. The restamp renderer REGRESSES the
Capacitor WKWebView at every op shape tried (all fidelity-passing, same instrument, same day):

| WKWebView crayon (portrait-light) | lost % samples     | median |
| --------------------------------- | ------------------ | ------ |
| plane pipeline (main)             | 1.19 / 1.24 / 1.39 | 1.24   |
| restamp, merged cap 8             | 1.76 / 1.92 / 2.08 | 1.92   |
| restamp, merged cap 3             | 1.88 / 2.10 / 2.12 | 2.10   |
| restamp, per-move                 | 4.40 / 4.53 / 5.50 | 4.53   |

Safari's optimum is the WKWebView's pessimum and vice versa — the same shape ADR-0146 found for op
granularity, resolved the same way: deposition became a per-runtime decision
(`configureCrayonDeposition`, ADR-0147 as landed on PR 1389). Per-move on the WKWebView is
catastrophic under either pipeline, so the granularity fork also stands.

Fork verification (per-runtime build of the PR branch): native 1.38/1.40% (its own band), web
0.77/0.81%. Final-commit sanity after the line-budget refactor: web 0.85%, native 1.24%.

Additional rule earned: the WKWebView charges per op far more steeply than Safari — a change that
merely alters how many ops a frame emits swings the native cell 2.5x while Safari barely moves.

## Landscape attribution — four hypotheses refuted, effect unexplained (2026-08-27)

Once the corrected landscape number (0.97 / 0.98 / 1.06 against portrait's 0.83 / 0.88 / 0.77) made
landscape the binding cell, it got the ablation it never had: **every one of the campaign's 21 web
experiments was portrait-only**, so nothing explained the gap.

Free diagnostics first, from artifacts already on disk:

* **Not script.** `engine.draw` is identical across orientations — 0.09–0.11 ms/frame, overlapping
  totals.
* **Not more late frames.** `lateShare` is ~0.010 in both. The whole gap is a handful of *longer*
  tails: max 56–66 ms landscape against 52–57 portrait.
* **Not canvas size.** Landscape's canvas is 2.6% *smaller* in total pixels (1282×934 against
  1024×1201).

Then instrumentation (`exp/crayon-landscape-attribution`, marks on the existing `engine.*` channel
the probe already collects), two samples per orientation:

|           | shadow reads | restamps    | restamp JS |
| --------- | ------------ | ----------- | ---------- |
| portrait  | 629 / 629    | 7886 / 7901 | 64 / 66 ms |
| landscape | 624 / 623    | 7883 / 7839 | 72 / 75 ms |

* **Not more whole-tile shadow reads** — identical counts, and 1–4 ms total across a 60-second
  capture, so that path is not the cost in *either* orientation.
* **Not more restamps** — identical counts.
* **Restamp area: measured as nearly equal, but NOT refuted as the cause.** Restamp geometry was
  measured in a desktop browser at both viewport shapes with identical normalized strokes: 116
  restamps each, mean rect 1072 px portrait against 1111 px landscape, **+3.6%**. What that
  establishes is the geometry, on a different browser and GPU. Concluding "+3.6% area cannot produce
  +12–18% cost" assumes the cost is roughly linear in area, and this campaign's own i2 result —
  frame-union rects at 2.62% — is direct evidence that restamp area can behave **non-linearly** on
  the device. Lost-frame share is a thresholded tail statistic, which is exactly where a
  non-linearity would hide. Settling this needs a same-device A/B holding everything but rect size
  constant; until then area is *not excluded*.
* **Not the paper-view transform** — both orientations composite at `matrix(1,0,0,1,0,0)`.

**The residual is unresolved, and naming a cause for it would repeat the mistake this campaign keeps
catching.** Tile aspect (256×300 portrait against 320×233 landscape at equal total area) is a
candidate, not a conclusion — none of these diagnostics isolates it, and an earlier draft of this
section asserted it as "what remains", which is a mechanism fitted to a residual.

It is also wrong that only a WebKit trace could test it: **varying the live-tile grid on the same
device, holding paper and strokes fixed, is the direct A/B** — and ADR-0085's grid sweep has never
been re-run for this renderer, which ADR-0147 already records as an unmet condition. That sweep
would test tile aspect and restamp area together, since both change with the grid.

**Stopped deliberately, and recorded as unresolved rather than explained.** The effect is ~0.15
points on a cell whose gate exception is 1.5%, and it sits close to the run-to-run spread (portrait
0.77–0.88 over five samples, landscape 0.82–1.06 over five). Stopping is a resourcing judgement, not
a finding: the honest state is *cause unknown, two candidates untested (restamp area on-device, tile
aspect), one defined experiment available (ADR-0085's grid sweep)*.

An independent re-review on 2026-08-27 measured the same restored build at landscape 0.84 / 0.79 /
0.90 against portrait 0.85 / 0.93 / 0.72 — a smaller gap than this session's, and further reason to
treat the residual as unresolved rather than characterised.

**One earlier recommendation is withdrawn by this.** i12's merged-op + per-segment-stroke shape was
recorded as the lead for the paint-max tail and looked like the lever for landscape too. It is not,
for the restamp pipeline: merging ops there *is* i2 (frame-union restamp rects), measured at 2.62%
and already rejected. i12's number came from the zero-mix direct-paint variant, where there are no
restamp rects to enlarge. The lead applies only if deposition ever returns to direct paint.
