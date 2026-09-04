# ADR-0093: Run a Two-Tier WebKit Commit Gate in CI

**Status:** Active — amends [ADR-0032](0032-performance-profiling-harness.md) and
[ADR-0090](0090-tiered-real-ipad-performance-regression-gates.md); amended by
[ADR-0100](0100-split-the-commit-gate-by-what-each-half-can-decide.md), which moved this tier off
the pull-request path. ADR-0100's 2026-08-11 amendment retired the structural half when tiled
history removed the blob-encoding path it guarded. **Date:** 2026-08

## Amendment — 2026-08-11: tiled-history coverage

PR #941 made the tiled renderer (ADR-0085/0086) the sole drawing renderer. Its history has no cold
blob encoding, so the original encode-path runtime proof and ADR-0100's pre-merge structural guard
retired with the legacy implementation. The WebKit timing gate remains active. Its fast set still
contains `multi-finger` and `crayon-scribbles`, now because they solely exercise the multi-pointer
and mid-stroke crayon pass-split paths. The original decision below records the earlier history
implementation and should be read with this amendment and ADR-0100.

## Context

`perf:undo:webkit` already distinguishes two commit-work shapes that Chromium cannot faithfully
measure: healthy dirty-region work has a 1–8 ms worst commit on an otherwise idle desktop WebKit
harness, while putting a full-raster encode back on the pointer-up path makes multiple commits run
that work and produces 47–56 ms maxima. Its 25 ms gate is therefore about catastrophic work shape,
not fine timing drift or physical-iPad frame approval.

ADR-0032 rejected a general shared-runner performance gate because host load, GPU path, and timer
variance make absolute budgets flaky. ADR-0090 likewise keeps device-calibrated frame gates on real
hardware. Skipping CI entirely, however, leaves a known WebKit-only defect class unguarded despite a
threshold with roughly 3× headroom over the healthy worst case. Gating Chromium would not close that
gap, and running all seven WebKit scenarios on every pull request would spend more CI time than the
coverage floor requires.

## Decision

GitHub Actions runs the WebKit commit gate in two tiers from `.github/workflows/test.yml`:

* Pull requests run `npm run perf:undo:webkit:fast` on `macos-latest` in a job parallel to the
  ordinary Tests job. The first Ubuntu Actions measurement exceeded the 184-second Tests job, while
  the same fast command was measured at roughly 24 seconds on macOS when this tier was chosen. That
  figure no longer describes the job — `docs/scratchpad/webkit-commit-gate-cost-2026-08.md`
  decomposes the current cost — but the Ubuntu-versus-macOS ordering it rested on is unchanged. Its
  set is defined once by `FAST_UNDO_SCENARIO_KEYS`: `multi-finger`, the only scenario that currently
  exhausts the resident byte budget and exercises encoding, plus `crayon-scribbles`, which covers
  mid-stroke crayon pass splits. The npm script selects `--suite=fast`; neither it nor the workflow
  repeats the keys.
* `v*` release tags run `npm run perf:undo:webkit`, retaining all seven scenarios at the point a
  release reaches users.
* The fast tier attempts to upload `undo-scenarios.json` and `undo-scenarios.md` after a failure.
  The full tier uploads those diagnostics after every run because they also carry the data-derived
  membership verdict. An earlier build, launch, or page failure may not produce them; a missing
  artifact warns without masking the original failure.
* A run with no `engine.commit` samples exits nonzero, so a stale or uninstrumented bundle cannot
  pass as a zero-millisecond result. Any requested scenario that fails to complete, any unknown
  requested key, and any run where no scenario exercises encoding also fail; partial or vacuous
  coverage cannot pass. The fast script's keys are checked against the scenario registry in the
  repo-script suite, and the runtime independently rejects unknown keys.

The 25 ms threshold stays a wide catastrophic-regression threshold. It does not replace the
physical-device gates in ADR-0090, and it must not be tightened from shared-runner observations.
Fast-set membership follows path coverage first, then measured headroom and breach history; a sole
path exerciser remains mandatory regardless of recent timing.

Every scenario declares the distinguishing commit paths it exercises. The repo-script suite derives
paths with one exerciser and fails if that scenario is absent from `FAST_UNDO_SCENARIO_KEYS`. The
runtime continues to prove the encode path actually ran; the declaration guards membership while the
runtime guard catches behavior diverging from the declaration.

Every completed release-tag full run computes each scenario's headroom ratio as `engine.commit P95 /
COMMIT_GATE_MS` and appends it to a schema-validated rolling history. Ideal membership uses the
latest three full runs in priority order:

1. scenarios that solely exercise a declared path are mandatory;
2. remaining slots take the highest measured-to-budget ratio, prioritizing scenarios closest to or
   beyond the budget;
3. a non-mandatory member that has not been near the budget in the window yields to a non-member
   that has, with an actual breach winning a tie.

The current two mandatory sole exercisers fill both fast-set slots, so measured membership ranking
is dormant until the coverage declarations or fast-set size change. The rolling history's
consecutive-miss gate remains active independently of membership ranking.

The full run fails when ideal and committed membership differ. For every full-run breach the same
record says whether any committed fast scenario also breached. A breach confined to non-members is a
fast-set miss; two consecutive misses fail even if the membership calculation has no legal swap.

The release job restores the newest unexpired `webkit-undo-full-history` Actions artifact through
the repository API, passes its path to the full command, and uploads the record after success or
failure with 90-day retention. A committed seed from the first compatible seven-scenario P95 run
starts the chain when no artifact exists. The runner validates a restored candidate after download;
if validation fails, it leaves that durable input untouched and writes the seed-derived current run
only to the diagnostics directory rather than erasing the accumulated record. A full run enters
history only when every scenario produced at least one valid commit sample. The seed deliberately
excludes older full runs that stored only commit maxima: mixing max and P95 would manufacture a
trend from two measurement definitions.

The gate evaluates each scenario's `engine.commit` P95 and retains its maximum plus every raw sample
in `undo-scenarios.json`. At the scenarios' sample size, P95 excludes one isolated maximum. GitHub's
shared macOS runner produced isolated 53 ms and 70 ms crayon-fold maxima on the same source tree
that passed at 18 ms on another run, while local runs remained below the threshold. A scheduler
interruption inside a synchronous measure is indistinguishable from engine work, but it does not
reproduce the gate's target defect: restoring the synchronous cold encode runs the full-raster work
on multiple commits as patches cross the resident budget. Requiring the expensive shape to recur
keeps that regression detectable without treating one host interruption as product behavior. The
real-device maximum gates in ADR-0090 remain responsible for isolated user-visible hitches.

The fast pull-request tier also normalizes `crayon-scribbles` against a same-run renderer control.
Its gate value is raw commit P95 divided by the slowdown in `engine.draw total / calls` relative to
the controlled healthy reference of 0.4 ms per crayon draw call. The factor never goes below one, so
a fast host cannot make a regression look worse. The 25 ms threshold is unchanged and still means
new stroke-end work relative to healthy renderer throughput. A commit-only full-raster regression
with normal live-draw throughput therefore still fails. `multi-finger`, the deterministic negative
control for a cold encode returning to the commit path, always gates raw P95. Release-tag and
on-demand full runs also gate every scenario on raw P95 and keep feeding raw values to fast-set
history.

This exception is specific to the shared-runner fast crayon scenario. PR #729 supplied the evidence:
two attempts reported crayon commit P95 of 60 ms and 43 ms while the same scenario's complete draw
phase slowed to roughly 100 and 86 seconds; its sibling multi-finger scenario remained within the
raw gate, the changed audio code could not execute in `/dev/engine`, and controlled head/base runs
were indistinguishable. Treating those failures as product evidence quarantined valid issue #709
until it was replayed through PR #739. The gate repair retains the failing raw values in both report
formats and has unit controls for the noisy healthy measurements, the known-bad commit-only shape,
and the unnormalized release path.

The harness captures `drawEnd` inside the same browser evaluation that dispatches the final
synchronous stroke. Capturing it in a later Playwright round trip left a scheduling gap where
Safari's 200 ms `scheduleIdle` fallback could begin a healthy deferred encode, causing the report to
misclassify that encode as synchronous commit work. The phase helper returns the in-page boundary;
its later user-timing bookkeeping is outside the attribution window.

A third full-suite tier on every `main` push or a nightly schedule was considered and rejected. It
would spend an additional macOS runner after the pull-request gate has already exercised the two
distinct load-bearing paths. The other five scenarios broaden shape coverage but do not guard a
separate known WebKit-only defect class, so their full run remains release-tag and on-demand
coverage. If one becomes the sole exerciser for a distinct failure mode, it belongs in the fast set
rather than in a delayed middle tier.

## Consequences

* \+ Pull requests catch a WebKit-only full-raster commit regression before merge without serially
  extending the ordinary test suite.
* \+ The fast job still covers encoding and crayon pass splitting, while release tags retain broad
  scenario coverage.
* \+ Failure artifacts preserve the scenario table and gate evidence without requiring a local
  WebKit reproduction.
* \+ Sole-exerciser coverage fails in the ordinary repo-script suite, while release data catches
  headroom and miss-rate drift that static declarations cannot.
* \+ The rolling artifact makes the current miss streak and the full-run inputs to membership
  selection inspectable without granting the workflow repository write access.
* \+ The noisy fast crayon scenario remains blocking without confusing renderer-wide shared-host
  slowdown with a new commit-only work shape; raw release evidence remains unchanged.
* − Shared-runner noise still limits the gate to recurrent catastrophic regressions; isolated and
  smaller real timing regressions can pass and belong to deterministic counters or physical-device
  measurements.
* − The every-PR job consumes a macOS runner because the Ubuntu WebKit runtime does not fit the
  suite's wall-clock budget.
* − The job was the wall-clock floor of a pull-request run until
  [ADR-0100](0100-split-the-commit-gate-by-what-each-half-can-decide.md) moved it post-merge, and
  `crayon-scribbles` is most of its cost: its synchronous draw phase renders six pattern-filled
  surfaces per crayon op on a runner with no GPU-accelerated canvas. Splitting the fast set into
  parallel one-scenario jobs was measured as worth 5–10 seconds, because the two scenarios differ in
  cost by roughly 10×. Reducing the cost further means changing the scenario's op count, which is
  the shape the 25 ms threshold and the fast-set history were calibrated against. See
  `docs/scratchpad/webkit-commit-gate-cost-2026-08.md`.
* − The rolling history has 90-day artifact retention. A longer release gap restarts from the
  compatible committed seed, so the first post-gap run has less historical depth.
* − Declared paths can still diverge from scenario behavior. The encode path has a runtime proof,
  but the other declarations remain reviewable code rather than dynamic instrumentation.
