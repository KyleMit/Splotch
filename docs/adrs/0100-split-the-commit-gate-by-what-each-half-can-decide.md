# ADR-0100: Split the Commit Gate by What Each Half Can Decide — Structural Pre-Merge, Timing Post-Merge

**Status:** Active (amends [0093](0093-two-tier-webkit-commit-gate-in-ci.md)) **Date:** 2026-08

## Amendment — 2026-08-11: retire the legacy structural half

PR #941 made the tiled renderer (ADR-0085/0086) the sole drawing renderer and removed the legacy
snapshot/blob history implementation. That renderer retains tile-local before-images, folds old
commands into base tiles, and has no cold blob-encoding path or `engine.encode` measure. The
pre-merge `commit-path-guard` and `perf:undo:encode-path` command therefore cannot exercise the
invariant this ADR assigned them; requiring a blob would fail every run, while removing only the
coverage check would make the job permanently vacuous.

The structural half is retired with the implementation it guarded. The post-merge WebKit timing half
remains active: `perf:undo:webkit:fast` continues to gate recurring `engine.commit` P95 over
`multi-finger` and `crayon-scribbles`, which remain mandatory as the sole exercisers of the
multi-pointer and mid-stroke crayon pass-split paths. Release tags continue to run all seven
scenarios. The original decision below records the contract before tiled history became the sole
implementation.

## Context

ADR-0093 put `npm run perf:undo:webkit:fast` on every pull request. After the CI split in #761 that
job became the wall-clock floor of a pull-request run — measured at 148–155 s against 82–118 s for
the slowest e2e shard. `docs/scratchpad/webkit-commit-gate-cost-2026-08.md` decomposes it: one
scenario, `crayon-scribbles`, is 68–72% of the command, and 83% of that is its synchronous draw
phase rendering six pattern-filled surfaces per crayon op on a runner with no GPU-accelerated
canvas. Splitting the fast set across parallel jobs was measured as worth 5–10 s, because the two
fast-set scenarios differ in cost by roughly 10×. Nothing in the workflow, the caching, or the
harness moves the remainder.

Against that cost, the tier's record on the pull-request path is poor. PR #729 produced two failures
that ADR-0093 already documents as host noise, and quarantined valid issue #709 until it was
replayed through PR #739. Every subsequent change to this gate has hardened the gate itself. No
recorded pull-request failure caught a regression.

The two things the gate asserts, however, are not equally expensive to decide. The defect class it
exists to close — #635, a full-raster encode returning to the pointerup path — is **structural**: an
`engine.encode` measure inside the commit window instead of the settle window. That is a count, and
a count needs neither WebKit nor a quiet host. ADR-0093's own revert experiment shows Chromium
recording that encode inside the commit (11.4 ms commit, 2.5 ms encode) even though its in-parallel
`toBlob` makes the *duration* meaningless. The harness has always measured this as
`encodeInCommitMs` and printed "**encode in commit** should be 0" in two report formats — and never
gated on it.

The 25 ms P95 is the other assertion, and it genuinely needs a faithful engine and absolute
milliseconds. It catches what a count cannot: a fold regression, or full-raster work on the commit
path that is not an encode.

## Decision

The gate is split by what each half can decide, not by which scenarios it runs.

* **Pre-merge, on every pull request and every push to `main`:** `commit-path-guard` runs `npm run
  perf:undo:encode-path` on `ubuntu-latest` in headless Chromium. It fails when any measured
  scenario recorded an `engine.encode` inside the commit window. This is a count, never a threshold:
  one such measure is the defect, no host slowness can manufacture it, and no engine's timing
  fidelity is required to read it. The job runs parallel to the e2e shards.
* **Post-merge, on pushes to `main`:** the existing `webkit-commit-gate-fast` job keeps the
  `COMMIT_GATE_MS` P95 verdict, the shared-runner crayon normalization, and the fast set defined by
  `FAST_UNDO_SCENARIO_KEYS`. It is no longer on the pull-request path.
* **Release tags:** unchanged — the full seven-scenario run with fast-set history.

`ENCODE_PATH_UNDO_SCENARIO_KEYS` is derived from `UNDO_SCENARIO_PATHS`, not hand-listed: it is every
scenario declaring `COLD_ENCODE_PATH`. A second hand-kept constant could drift out of step with the
declarations the full run verifies; a derived one cannot. Today it resolves to `multi-finger` alone,
and every member is also in the fast set, so the post-merge timing tier measures the same scenarios
the pre-merge guard cleared.

The structural check is **engine-independent and always evaluated**, including on advisory Chromium
runs of `perf:undo`. It reports and then lets the run continue to its timing checks rather than
returning early, so a gated engine prints the millisecond evidence beside the structural finding
instead of trading one diagnosis for the other. For the same reason the "no `engine.commit` samples"
guard is now unconditional: a marks-less bundle would satisfy a count-based check vacuously, and
that hole did not exist while only WebKit asserted anything.

Coverage guards follow the assertion rather than the engine. A run that enforces either verdict
fails on a skipped scenario, on a set that never demoted a patch to a blob, and on absent commit
samples — so the pre-merge guard cannot pass over a set that never reached the encode path. A
diagnostic `--scenarios` subset on an ungated engine asserts neither and keeps its current freedom.

Two consequences of landing a gate after the merge are handled in the workflow rather than left to
habit:

* The workflow's concurrency group folds `github.sha` in for `push` events. Pull requests still
  collapse per ref so a new push cancels the run it supersedes, but back-to-back merges no longer
  cancel each other — which would drop a commit's only coverage exactly when merge traffic is
  highest.
* A failure opens a GitHub issue with the run link and the diagnostics artifact, commenting on the
  existing open one rather than filing per red commit. A post-merge gate nobody is watching is not a
  gate.

## Consequences

* \+ A pull-request run loses its wall-clock floor: the macOS job is gone from that path, and the
  structural guard runs parallel to the e2e shards.
* \+ The invariant that actually closes #635's defect class is now *enforced* rather than printed,
  and it is enforced pre-merge, deterministically, where the millisecond gate never could be.
* \+ The pre-merge verdict cannot produce a PR #729-class false positive. There is no threshold to
  cross and no normalization to get wrong.
* \+ `perf:undo` on Chromium now catches a #635-class regression locally, which it never did.
* − A timing regression that the count cannot see — a fold blowup, or full-raster commit work that
  is not an encode — now lands on `main` before it is caught. That is the trade this ADR makes: the
  signal is fast rather than immediate, and recovering means a revert or a fix-forward on a red
  `main` rather than a red PR.
* − `crayon-scribbles`' unique `crayon-pass-split` coverage moves post-merge with the timing tier.
  The pre-merge guard covers the encode path only.
* − If `WebKit commit gate (fast)` is a required status check on pull requests, it must be removed
  from branch protection: a job that no longer runs on pull requests never reports, and every PR
  would block forever. `Commit path guard` is the check that replaces it.
* − Post-merge attribution is coarser than a PR's. When several merges land close together, the
  failing commit has to be identified from the run rather than read off the pull request.
