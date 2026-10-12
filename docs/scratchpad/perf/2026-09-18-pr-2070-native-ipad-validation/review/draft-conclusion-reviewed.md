> **Superseded draft, kept as the review record.** This is the conclusion text that both rival
> rounds reviewed: the original draft plus the revision appended after round 1. It contains
> exploratory statistics (pooled Fisher tests, a ">25 ms" comparison over overlapping windows) that
> the review withdrew. The package README is the result; read this only to follow the review.

# Draft conclusion: PR 2070's iOS undo-ghost settle in the installed native iPad app

Tested revisions: control 7a2365631aba6078f94038235d661add6e2e42cb (PR 2070's parent) and treatment
33a4d43b6ef8b43ca77c5d77578630220c37a4d9 (the merge). The product diff between them is
`web/src/lib/drawing/inkMotion.ts` only (plus its test). Harness revision: the tools come from
33a4d43b6ef8. The payload and driver in this directory are ports of
`docs/scratchpad/perf/2026-09-18-issue-1750-ipad-baseline/` to the app. Scoring is that directory's
unchanged `analyze.mjs`.

Builds: `npm run perf:build:cap` in a clean detached worktree per arm, then `xcodebuild` Debug for
the device into a separate derived-data path per arm, then `devicectl` install over the same bundle
id. Each bundle was inspected before install. Its `capacitor.config.json` has no `server.url`,
`public/` equals the synced bundle, and the settle call (`getImageData(0,0,1,1)`) appears only in
the treatment. Every run proves in-page which entry chunk loaded: control `start.C4bxo72t.js`,
treatment `start.Coc95Aql.js`. Every run is a fresh app process on `capacitor://localhost`.

Runtime: iPad Pro 12.9-inch, iPadOS 26.5, WKWebView (desktop-class Mac UA, `maxTouchPoints` 5, so
`isIosDevice()` holds). Landscape, 1366×1004 at DPR 2. rAF runs at 60 Hz in the app (median 17 ms);
iPad Safari ran at 120 Hz. The crayon pipeline is the build's own glaze-direct.

Workload: 30 paced crayon scribbles, the same geometry as #2070, dispatched as touch PointerEvents
on `#drawingCanvas` at 2 moves per frame, 300 ms apart. Then settle and a 4 s wait, 20 undos through
the repo's shared `undoActionFunctionSource`, spaced 700 ms from call start, and a 4 s tail. One
continuous rAF sampler covers everything.

Perf series, interleaved T C C T T C C T plus one replacement C: run 3 (control) lost its inspector
connection and produced no artifact, so a control was appended. That gives 4 valid runs per arm.
There is also one earlier control smoke run, kept separately in `runs-smoke`.

| Metric (80 undos per arm)                                                              | Control           | Treatment                                           |
| -------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------- |
| Undo windows with a frame > 33.5 ms, per run                                           | 2, 0, 2, 2 (6/80) | 1, 0, 0, 0 (1/80)                                   |
| Worst undo-window frame                                                                | 42 ms             | 42 ms (run 1, which contains a 23 ms `engine.undo`) |
| Frame containing the undo call, p50/p95/max                                            | 17/20/22 ms       | 25/29/42 ms                                         |
| Action to presentation (call to end of the frame after the post-undo rAF), p50/p95/max | 29/45/49 ms       | 20/33/34 ms                                         |
| `engine.undo` per run, P95 / max                                                       | 2–4 / 2–8 ms      | 8–12 / 12–23 ms                                     |
| Late time over 17 ms in the action frames, per run                                     | 35–144 ms         | 83–171 ms                                           |

Fisher one-sided tests: treatment has fewer over-gate undos (p ≈ 0.058), so the reduction is **not
significant at 0.05**. Treatment also has more undos whose worst window frame exceeds 25 ms (42 vs
20 of 80, p ≈ 0.0003). The ghost-fade frames run at 16–17 ms in both arms. The difference sits in
the action frame, where the treatment pays the settle synchronously.

Draw, present, fold, and tail are unchanged: 0 over-gate frames in every run except treatment run
1's draw phase, which has one 48 ms frame. The product change cannot touch drawing, and it was the
first launch after a fresh install. Commit P95 is ≤ 1 ms in both arms, and fold totals are 31–38 ms
against 33–40 ms. Memory is identical in every run: 20 snapshots and 29,705,848 raster bytes before
undo, base rasters at 19,937,664 bytes, live backing at 19,937,664 bytes, and no ghost element left
after the tail. Depth goes 20 → 0 in every run, every undo shows a ghost, and ink after undo is
1,116,310 px everywhere.

Pixels (separate verification runs, C T T C): all four start undo from the same tile hash. Every
pair (control–control, treatment–treatment, cross-arm) matches on all 20 ghost hashes and all 20
tile-state hashes. Magic check (one run per arm): 20/20 ghosts, depth 20 → 0, identical coverage,
and no leak. Magic's gradient is `Math.random`-picked, so pixel identity is not testable there.

Proposed verdict: **native validation satisfied, neutral to beneficial, with a residual trade-off**.
The acceptance criteria were fixed beforehand in `ACCEPTANCE.md`. Over-gate undos went from 6/80 to
1/80 (not statistically significant), worst frames are equal, the ADR-0086 gates pass on the
treatment (engine P95 ≤ 12 ≤ 20, next-frame P95 ≤ 16 ≤ 33, max 25 ≤ 50), action-to-presentation
improved, pixels are identical, and memory is identical. The residual is that the frame containing
the undo call typically slips one 60 Hz beat (17 → 25 ms median) because the settle's readback is
now synchronous. That is a sub-gate trade that no criterion forbids, and it is reported. The worst
native frame of 42 ms is the pre-existing breach on both arms.

Known limitations: synthetic (untrusted) PointerEvents rather than trusted touch; in-page undo
dispatch rather than a tapped button; the Debug native shell; one device and orientation; a 4-run
arm size.

## Revision after rival round 1 (`rival-round1-findings.json`)

Accepted corrections to the draft above:

* The Fisher p-values are descriptive only. Undos are clustered within runs, so the replicated unit
  is the run.
* The ">25 ms" comparison was contaminated by windows overlapping the next undo. It is withdrawn and
  replaced by non-overlapping per-undo windows running from one undo call to the next
  (`score-confirm.py`).
* The "late time" row summed the call interval and the following interval; it is relabelled that
  way. The presentation row is a rAF proxy (call → following rAF), not display presentation.
* Treatment's worst per-run next-frame P95 is 17 ms, not 16.
* The treatment's 42 ms frame in the first series contains its 23 ms synchronous undo, so only its
  magnitude is pre-existing.
* Criterion 4 was **not** met as written in the first series: treatment run 1 had a 48 ms draw
  frame, a 21 ms tail, and a 5 ms commit max.

To settle criterion 4 and the cold-install imbalance, a confirmation series was pre-registered in
`ACCEPTANCE.md` before running. Its blocks ran C, T, T, C; each forced a reinstall, then one
unscored warmup and 2 scored runs. The app-tree and `public/` digests are in every artifact. It is
scored by `score-confirm.py`, with output in `score-confirm.txt`; `score-first-series.txt` scores
the first series with the same rescoring.

Confirmation result (4 scored runs per arm):

* Criterion 4: no exception. Draw max is 20–22 against control 20–23, settle 19–33 against 19–23,
  tail 17–19 against 17–19, commit max 1–3 against 0–5, and commit P95 1 against 0–1. The fold total
  is 35–41 ms in three treatment runs and 61 ms in one, against control's 31–41. That is a single
  run, reported, and below the pre-registered two-run rule.
* Criterion 2: over-gate undos per run were 0, 1, 1, 0 for control and 0, 0, 0, 0 for treatment. The
  worst non-overlapping undo window was 36 ms for control and 29 ms for treatment. Across both
  series (8 runs per arm), 5 of 8 control runs have at least one breach against 1 of 8 treatment
  runs; that one was the first-series cold run.
* Criterion 3 (treatment): engine P95 ≤ 12, next-frame P95 ≤ 16, next-frame max 22.
* Residual: the median frame containing the undo call is 17, 27, 17 and 25 ms per treatment run, and
  17 ms in every control run. The settle is paid synchronously, and in half the runs it costs one 60
  Hz beat. After the action, the frame P95 is lower on treatment: 18–22 against 26–33 ms.
* Criteria 1 and 5 hold in every run.

Revised verdict: native validation is satisfied for the undo path under the repo's gates and the
pre-registered criteria. It is neutral to beneficial: the >33.5 ms undo breaches and post-action
frames drop, correctness and memory are unchanged, and the residual is a sub-gate one-beat slip in
the call frame. The limits remain: synthetic drawing input (not a touch-fidelity result), in-page
undo dispatch (the ADR-0086 screen-harness method, not a trusted native tap), the Debug shell, one
device and orientation, and 8 runs per arm.
