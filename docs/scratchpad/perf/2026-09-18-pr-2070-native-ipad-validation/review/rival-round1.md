# Rival review, round 1 (Codex, question mode)

The independent opposite-vendor reviewer ran through the repo's `run-rival-agent` workflow in a
sandboxed worktree pinned at 33a4d43b6ef8. It had read access to the review packet: the draft
`CONCLUSION.md` in [`draft-conclusion-reviewed.md`](draft-conclusion-reviewed.md), `ACCEPTANCE.md`,
the raw runs, and the scorers. Its findings list was empty in both rounds; the review is carried in
the summary below, reproduced verbatim except that packet paths are made relative. Line numbers cite
the packet's copies of `CONCLUSION.md`, `native-session-payload.js` and `native-run-session.mjs` at
review time.

## Question asked

Independent review of a physical-device validation, not a code change. PR 2070 (merged at
33a4d43b6ef8, this worktree's HEAD) added an iOS-only one-pixel readback ("settle") to the
crayon/magic undo ghost in `web/src/lib/drawing/inkMotion.ts`. It was measured only in iPad Safari.
This session validated it in the installed native iPad app (WKWebView, glaze-direct crayon
pipeline).

Everything to review is in : ACCEPTANCE.md (criteria fixed before results), CONCLUSION.md (the draft
verdict and numbers), native-session-payload.js and native-run-session.mjs (the harness), raw runs
(runs-perf/, runs-pixels/, runs-magic/, runs-smoke/; each JSON holds every rAF stamp, every engine.*
measure, and every undo row), analysis-perf.json, and series-perf.log. The original Safari harness
and analyzer are in docs/scratchpad/perf/2026-09-18-issue-1750-ipad-baseline/.

Please check adversarially:

1. Is the harness port faithful, and does it measure what the conclusion claims? That covers
   complete frame intervals, the interaction-to-presentation proxy, the undo-window overlap with the
   next undo's action frame, and the use of synthetic PointerEvents and in-page undo dispatch.
2. Recompute the headline numbers from the raw JSON (you can run python/node locally). Say where any
   figure in CONCLUSION.md is wrong.
3. Are the acceptance criteria appropriate and correctly applied? In particular, is the treatment's
   typical one-beat slip of the action frame (17 → 25 ms median at 60 Hz), with fewer >33.5 ms
   breaches (6/80 → 1/80, p≈0.06), correctly judged "neutral to beneficial with a residual", or is
   it a regression under this repo's gates and ADRs (ADR-0086, the action-frame gate in
   tools/perf/lib/action-stats.mjs)?
4. Are there confounders or provenance gaps (build identity, arm order, the lost run,
   first-after-install effects)?
5. Is the verdict supported, or should it be "inconclusive"? If inconclusive, what single experiment
   would decide it?

Do not run anything on devices. Report findings with file and line anchors where you can.

## Reviewer summary (verbatim)

Overall call: the narrow performance conclusion is supported, not inconclusive—the settle is not a
regression under ADR-0086 or the repository’s canonical action-frame rules, and it removes the
deferred post-action stalls on this workload. However, `CONCLUSION.md` overstates this as
“validation satisfied.” A more accurate verdict is: **native WKWebView diagnostic evidence is
neutral-to-beneficial for undo, with higher synchronous undo cost; formal acceptance criterion 4 and
authoritative action-gate validation remain incomplete.**

### Harness fidelity

The port preserves the important mechanics. It keeps a continuous sampler with a stamp before
measurement and one after the end (`native-session-payload.js:115-122, 206-208, 266-268`), and the
unchanged analyzer scores complete overlapping rAF intervals
(`docs/scratchpad/perf/2026-09-18-issue-1750-ipad-baseline/analyze.mjs:30-60`). It drives the actual
canvas listeners and native glaze-direct pipeline, selects and verifies the real brush, dispatches
through the real Undo button, and uses the shared undo measurement source
(`native-session-payload.js:67-79, 97-114, 176-200`; `native-run-session.mjs:112-120`;
`tools/perf/lib/undo-driver.mjs:22-56`). The synthetic drawing is suitable for constructing an
identical history and isolating the undo path, but it is not touch-fidelity evidence: repository
profiling guidance explicitly says device-side synthetic `PointerEvent`s can stay smooth when a
finger stalls badly (`docs/PROFILING-MECHANICS.md:141-143`). The in-page Undo dispatch is faithful
to ADR-0086’s existing screen harness, which uses the same shared source
(`tools/perf/ios/capture-xcuitest-screen.mjs:1172-1193`), but it is not the trusted native tap used
by the discrete-action suite.

The interaction-to-presentation row is reproducible: take the rAF recorded by `nextFrameMs`, then
the following stamp, and subtract the action time. That yields control 29/45/49 ms and treatment
20/33/34 ms. It should be labeled **call-to-following-rAF presentation proxy**, not literal
presentation: rAF clocks cannot see compositor/display presentation
(`docs/PROFILING-MECHANICS.md:103-115`).

The fixed 700 ms undo windows have an attribution flaw. Because the next undo starts immediately
after the previous window ends, the complete interval containing the next action overlaps the
previous window in 145 of 152 inter-undo boundaries. This does not alter the headline >33.5 ms
counts—none of the seven over-gate worst intervals was borrowed from the next undo—but it does
contaminate the >25 ms comparison: 13 of treatment’s 42 such windows use the next undo’s action
frame, versus none of control’s 20. Therefore the p≈0.0003 comparison is not a clean per-undo
statistic.

### Independent recomputation

Re-running the committed analyzer over `runs-perf/` reproduced `analysis-perf.json` byte-for-byte.
The main figures in `CONCLUSION.md:30-42` are numerically reproducible:

* Over-gate windows: control 2,0,2,2 = 6/80; treatment 1,0,0,0 = 1/80.
* Worst window: 42 ms in both arms.
* Complete interval containing the action: control 17/20/22 ms; treatment 25/29/42 ms.
* Following-rAF proxy: control 29/45/49 ms; treatment 20/33/34 ms.
* Per-run engine P95/max ranges: control 2–4/2–8 ms; treatment 8–12/12–23 ms.
* Fisher values are arithmetically correct: 0.058373 for 1/80 versus 6/80 and 0.0003002 for 42/80
  versus 20/80.
* Pixel runs have identical starting hashes and all 20 ghost/tile hashes across every pairing.
  Depth, ghost presence, leak checks, ink coverage, and reported memory also match the draft.

Those Fisher tests should be treated only as descriptive. Twenty sequential undos from one run are
clustered by session and history depth, not 80 independent trials, and the windows themselves
overlap as described above. The effective replicated sample is four runs per arm.

Corrections needed in the draft:

* `CONCLUSION.md:37` calls 35–144 and 83–171 ms “late time … in the action frames.” Those ranges sum
  excess from both the interval containing the action and the following presentation-proxy interval.
  The values are correct under that derivation, but the label is not.
* `CONCLUSION.md:59` reports treatment next-frame P95 ≤16 ms by pooling all 80 undos. The worst
  per-run P95 is 17 ms in run 1. It still passes easily.
* `CONCLUSION.md:44-48` does not establish acceptance criterion 4 as written. Treatment run 1 has a
  48 ms draw frame versus a control maximum of 22 ms; its analyzer `settle` phase also contains one
  42 ms interval, although that is the first undo’s boundary-straddling frame rather than fold work.
  Treatment tail max reaches 21 ms versus 17 ms in every control, and treatment commit max reaches 5
  ms versus 2 ms in control. These are small or causally unrelated to the undo-only change, but the
  preregistered criterion explicitly required worst frames and commit max not to exceed control
  spread (`ACCEPTANCE.md:21-23`). The draft cannot say every criterion passed without recording
  these as exceptions.
* `CONCLUSION.md:63` calls the treatment’s 42 ms frame “pre-existing.” The control also reaches 42
  ms, but through deferred post-action rendering; treatment’s 42 ms interval contains its 23 ms
  synchronous undo. The magnitude is pre-existing, not the mechanism.

### Gates and the 17→25 ms residual

This is not a regression under the repository gates. ADR-0086 requires engine P95 ≤20 ms,
action-to-next-frame P95 ≤33 ms, and max ≤50 ms
(`docs/adrs/0086-tiled-dirty-region-snapshots-for-frame-bounded-undo.md:25-35`). Treatment’s worst
per-run values are 12, 17, and 25 ms respectively.

The generic action scorer also does not apply its 20 ms P95 gate to the complete interval that began
before input. It gates first-frame remainder and intervals whose starts are at or after the action
(`tools/perf/probes/action-probe.js:389-420`; `tools/perf/lib/action-stats.mjs:361-400`).
Reconstructed that way, treatment has first-frame P95/max 16/25 ms pooled and fully post-action
frame P95/max 17/22 ms, with zero >33.5 ms post-action breaches. Control has post-action P95/max
17/42 ms with six breaching actions. Thus the 25 ms median containing interval is a real
synchronous-cost residual, but it is deliberately not the generic 20 ms post-action-frame statistic.
Calling the outcome neutral-to-beneficial with a disclosed residual is technically defensible.

### Confounders and provenance

The entry-chunk assertion strongly distinguishes the arms (`native-run-session.mjs:23-31, 107-110`),
and every artifact records the expected entry and harness HEAD. However, the recorded product commit
is copied from the driver’s hard-coded arm map; the supplied evidence contains no bundle digest, app
digest, detached-worktree build log, or output of the claimed bundle inspection. Build provenance is
therefore credible but not independently closed.

The valid order is T C T T C C T C after the lost control. The lost run failed before an inspector
target appeared, so it was not discarded after seeing performance and replacement is reasonable.
Installation exposure is broadly balanced—three scored runs per arm follow an install—but the
earlier smoke run warmed control before the series, while treatment run 1 was its first observed
treatment launch and owns the 48 ms draw frame, 23 ms undo, and sole treatment breach. That biases
against treatment rather than manufacturing its apparent benefit, but it prevents treating that
outlier as a clean product comparison. Debug shell, one device/orientation, and four runs per arm
remain generalization limits.

I would not call the mechanics result inconclusive. I would change the verdict to “diagnostic native
validation supports neutral-to-beneficial undo behavior; formal criterion 4 and canonical action
validation are outstanding.” If one decisive experiment is desired, run a preregistered randomized
AB/BA crossover after one unscored warmup per installation, build the same deterministic 30-stroke
history, activate Undo through the native XCUITest tap and canonical action probe, leave a
frame-aligned quiet gap before the next undo, and record bundle/app hashes. That single experiment
would remove the cold-install imbalance, window overlap, clustered pseudo-replication, and
action-gate ambiguity together.
