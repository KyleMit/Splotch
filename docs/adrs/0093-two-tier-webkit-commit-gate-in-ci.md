# ADR-0093: Run a Two-Tier WebKit Commit Gate in CI

**Status:** Active — amends [ADR-0032](0032-performance-profiling-harness.md) and
[ADR-0090](0090-tiered-real-ipad-performance-regression-gates.md). **Date:** 2026-08

## Context

`perf:undo:webkit` already distinguishes two commit-work shapes that Chromium cannot faithfully
measure: healthy dirty-region work has a 1–8 ms worst commit on the desktop WebKit harness, while
putting a full-raster encode back on the pointer-up path costs 47–56 ms. Its 25 ms gate is therefore
about catastrophic work shape, not fine timing drift or physical-iPad frame approval.

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
  the same fast command completes in roughly 24 seconds on macOS. Its set is defined once in
  `package.json`: `multi-finger`, the only scenario that currently exhausts the resident byte budget
  and exercises encoding, plus `crayon-scribbles`, which covers mid-stroke crayon pass splits.
* `v*` release tags run `npm run perf:undo:webkit`, retaining all seven scenarios at the point a
  release reaches users.
* Both tiers attempt to upload `undo-scenarios.json` and `undo-scenarios.md` after a failure. Gate
  breaches produce both artifacts; an earlier build, launch, or page failure may not. A missing
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
* − Shared-runner noise still limits the gate to catastrophic regressions; smaller but real timing
  regressions can pass and belong to deterministic counters or physical-device measurements.
* − The every-PR job consumes a macOS runner because the Ubuntu WebKit runtime does not fit the
  suite's wall-clock budget.
* − Fast-set coverage still depends on current scenario behavior. Registry drift and loss of the
  encode path fail closed, but a scenario can change internally without changing its key; path
  ownership remains a review concern.
