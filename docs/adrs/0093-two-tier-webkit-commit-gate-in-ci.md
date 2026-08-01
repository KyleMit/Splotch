# ADR-0093: Run a Two-Tier WebKit Commit Gate in CI

**Status:** Active — amends [ADR-0032](0032-performance-profiling-harness.md) and
[ADR-0090](0090-tiered-real-ipad-performance-regression-gates.md). **Date:** 2026-08

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
  the same fast command completes in roughly 24 seconds on macOS. Its set is defined once by
  `FAST_UNDO_SCENARIO_KEYS`: `multi-finger`, the only scenario that currently exhausts the resident
  byte budget and exercises encoding, plus `crayon-scribbles`, which covers mid-stroke crayon pass
  splits. The npm script selects `--suite=fast`; neither it nor the workflow repeats the keys.
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

Every completed release-tag full run computes each scenario's headroom ratio as
`engine.commit P95 / COMMIT_GATE_MS` and appends it to a schema-validated rolling history. Ideal
membership uses the latest three full runs in priority order:

1. scenarios that solely exercise a declared path are mandatory;
2. remaining slots take the lowest measured-to-budget ratio;
3. a non-mandatory member that has not been near the budget in the window yields to a non-member
   that has, with an actual breach winning a tie.

The full run fails when ideal and committed membership differ. For every full-run breach the same
record says whether any committed fast scenario also breached. A breach confined to non-members is a
fast-set miss; two consecutive misses fail even if the membership calculation has no legal swap.

The release job restores the newest unexpired `webkit-undo-full-history` Actions artifact through
the repository API, passes its path to the full command, and uploads the updated record after
success or failure with 90-day retention. A committed seed from the first compatible seven-scenario
P95 run starts the chain when no artifact exists or restored history fails schema validation. A full
run enters history only when every scenario produced at least one valid commit sample. The seed
deliberately excludes older full runs that stored only commit maxima: mixing max and P95 would
manufacture a trend from two measurement definitions.

The gate evaluates each scenario's `engine.commit` P95 and retains its maximum plus every raw sample
in `undo-scenarios.json`. At the scenarios' sample size, P95 excludes one isolated maximum. GitHub's
shared macOS runner produced isolated 53 ms and 70 ms crayon-fold maxima on the same source tree
that passed at 18 ms on another run, while local runs remained below the threshold. A scheduler
interruption inside a synchronous measure is indistinguishable from engine work, but it does not
reproduce the gate's target defect: restoring the synchronous cold encode runs the full-raster work
on multiple commits as patches cross the resident budget. Requiring the expensive shape to recur
keeps that regression detectable without treating one host interruption as product behavior. The
real-device maximum gates in ADR-0090 remain responsible for isolated user-visible hitches.

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
* − Shared-runner noise still limits the gate to recurrent catastrophic regressions; isolated and
  smaller real timing regressions can pass and belong to deterministic counters or physical-device
  measurements.
* − The every-PR job consumes a macOS runner because the Ubuntu WebKit runtime does not fit the
  suite's wall-clock budget.
* − The rolling history has 90-day artifact retention. A longer release gap restarts from the
  compatible committed seed, so the first post-gap run has less historical depth.
* − Declared paths can still diverge from scenario behavior. The encode path has a runtime proof,
  but the other declarations remain reviewable code rather than dynamic instrumentation.
