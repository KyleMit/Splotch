# ADR-0158: A Retry Confirms Only the *Same* Failure

**Status:** Active — amends [ADR-0140](0140-commit-gate-host-control-and-breach-confirmation.md)
**Date:** 2026-09

## Context

[ADR-0140](0140-commit-gate-host-control-and-breach-confirmation.md) made the post-merge WebKit
commit gate confirm a breach before failing on it, and the workflow added a fresh-runner retry that
owns the filing decision: `webkit-commit-gate-fast` measures, and when it fails
`webkit-commit-gate-fast-retry` re-measures on a new VM and files a GitHub issue only if it fails
too. A stall does not reproduce; expensive stroke-end work does.

The 2026-09-02 post-merge run on main
([run 33617792785](https://github.com/KyleMit/Splotch/actions/runs/33617792785)) filed
[issue 1555](https://github.com/KyleMit/Splotch/issues/1555) against a commit where nothing
reproduced. Both runners' artifacts are the evidence:

| Runner       | `crayon-scribbles`                  | `multi-finger`                      |
| ------------ | ----------------------------------- | ----------------------------------- |
| First        | **skipped** — history never settled | measured clean, **7 ms** p95        |
| Fresh-runner | completed, 17 ms p95                | **breached**, 200 ms then 48 ms p95 |

Each runner failed. They failed at different things, with no scenario failing on both. The pipeline
compared job *outcomes* — `failure` and `failure` — and read that as a reproduced breach.

Two separate defects produced those two failures.

**The retry could not tell a reproduction from a coincidence.** `gate-outcome` is one bit. Two runs
that fail for unrelated reasons carry the same bit as two runs that fail identically, and only the
second is evidence about `main`. This is not a corner case on a gate with two scenarios and two
independent ways for each to fail (breach, no measurement) on a shared macOS runner.

**The settle timeout expired on a history that had, on the evidence, settled.** `settleHistory`
polls `getUndoDebug()` and needs four consecutive identical readings inside a 10 s budget. The
budget is wall clock, but on a saturated main thread the polls *are* what spends it: each
`page.evaluate` round trip queues behind the work being waited on. The crayon draw phase measured
**58,317 ms** on that host, and every counter the "never settled" text reported — `undoEntries=20
livePatchEntries=20 patchBytes=29341600 baseTiles=20 historyCommands=21`, plus `baseRasterBytes` —
matches the completed `crayon-scribbles` reading the *other* runner reported for the same commit.
The harness got two or three looks where four are needed to see quiescence at all, and reported the
shortfall as missing coverage, which the gate correctly refuses to certify.

Be precise about how far that evidence reaches, because the diagnostic that would settle it is the
thing this ADR is adding. The timeout text carried **six** of the seven fields `sameHistory`
compares — `pendingCommands` was not among them — and the artifact preserves only the final
timed-out reading, not the sequence that preceded it. So the artifacts show the *reported counters*
agreeing across the two runners, which is consistent with undersampling and not with a history still
moving through those counters; they cannot prove the full readings were identical, nor that history
was quiescent for the whole wait. The change below makes the next occurrence decidable from its own
error message instead of from a second runner.

### What this does not decide

The `multi-finger` breach itself is host noise by the same distribution ADR-0140 described, now with
the raw samples to show it. Its 22 commit durations on the retry runner were
`[0,0,0,12,1,0,0,0,1,0,927,0,16,0,1,0,20,1,0,1,1,200]` — twenty samples at 0–20 ms and two isolated
spikes, not adjacent. `percentile` takes `ceil(0.95 * n) - 1`, so over 22 samples the gate's "P95"
is the **second-highest sample**: the 200 ms one. The first runner's samples for the same commit,
`[0,1,0,0,0,1,0,0,1,1,702,1,0,0,1,0,1,0,0,7,0]`, have one spike instead of two and score 7 ms. Work
that costs 0 ms twenty times does not cost 927 ms once for algorithmic reasons.

That is an argument for a statistic a pair of preemptions cannot set, and ADR-0140 already declined
to guess at the calibration that would justify one. This ADR does not guess either. It fixes the two
places the pipeline reported something it had not observed, and it records the confirmation passes'
raw distributions in the artifact so the calibration can be collected from ordinary runs — the same
route ADR-0140 left open for `hostSlowdownAgainst`.

## Decision

**A failure is fingerprinted by what failed, not by that something did.**
`tools/perf/lib/undo-gate-failures.mjs` derives a sorted list of `<scope>:<cause>` entries from the
run's own `undo-scenarios.json`: `multi-finger:breach` for a scenario the gate scored over budget,
`crayon-scribbles:incomplete` for one that never produced a measurement, and `run:no-commit-samples`
for a gate that refused to certify with no scenario to blame. It is derived from the artifact rather
than the exit code because the exit code is the one thing both runners always agree on.

**The retry files only what reproduced.** `tools/perf/report-undo-gate-failures.mjs` prints this
run's fingerprint, or — given `--first=<fingerprint>` — the subset it reproduced from the first
runner's. `webkit-commit-gate-fast` publishes its fingerprint as the `gate-failures` job output; the
retry intersects, and both `File the failure` and `Fail on a reproduced breach` now require a
non-empty intersection alongside the retry's own gate-step failure. An empty intersection records a
non-reproduction in the step summary, naming both sides.

**An uncomparable pair files.** When either fingerprint is missing — a build that died before
writing an artifact, an unreadable JSON — the comparison reports the `unknown:not-comparable`
sentinel rather than an empty list, which is non-empty and therefore files. The distinction is
load-bearing: "compared, and nothing reproduced" and "could not compare" are the same empty list
otherwise, and only the first is an acquittal.

**The settle timeout cannot fire before quiescence was observable.** `settleHistory` counts its
readings, and the wall-clock expiry is guarded by `samples >= SETTLE_STABLE_SAMPLES`. Until that
many readings exist there is nothing a timeout could have been long enough *for*. A history that is
genuinely still moving still fails — on a fast host at the same 10 s it always did, on a slow host
after four reads — so this buys liveness on a slow host without weakening the check. The error
message now also carries `pendingCommands` and the sample count and elapsed time, so the next reader
can tell an unsettled history from an unsampled one without a second runner to compare against.

**Confirmation passes are recorded whole.** `undo-scenarios.json` gains a `confirmations` array
holding each re-measured scenario's full result, not just the timing the gate scored.
`confirmationTimings` carries the verdict; this carries what the verdict was reached from. The
investigation above needed the first runner's distribution and could not read the confirmation's,
because only its summary was persisted.

## Consequences

* \+ An issue is filed against `main` only when two runners failed at the same thing, which is the
  claim the issue's title makes.
* \+ A slow host no longer converts a quiescent history into missing coverage, and a settle timeout
  that does fire now says how many samples it took to get there.
* \+ The confirmation distribution is in the artifact, so the next investigation of a confirmed
  breach reads the samples instead of inferring from two numbers — and the multi-run `macos-latest`
  distribution ADR-0140 wants can be collected from ordinary red runs.
* − **A real regression that presents differently on two runners no longer files.** If a change
  makes `multi-finger` breach on one host and `crayon-scribbles` skip on another, both runs go red
  and nothing is filed. The first job stays red on `main` as telemetry, which is where that case
  surfaces; the alternative is the false positive this replaces, and a regression bad enough to
  matter fails the same scenario twice.
* − **The narrower version of that gap is same-scenario, different-cause, and it is the likelier
  one.** Matching is exact on `scope:cause`, so `crayon-scribbles:breach` on one runner and
  `crayon-scribbles:incomplete` on the other reproduce nothing — even though both implicate the same
  scenario, and even though one plausible common cause (stroke-end work expensive enough to blow the
  budget on a fast host and to keep history from settling on a slow one) would produce exactly that
  pair. Matching on scope alone is not the fix: `incomplete` currently collapses a settle timeout, a
  navigation failure, and every other scenario exception into one token, so scope-only agreement
  would pair a real breach with an unrelated harness fault. The honest resolution is to split
  `incomplete` into subcauses and declare which are compatible with a breach — which needs evidence
  about which subcauses actually occur, and is left for the same calibration pass that owns the
  statistic. Until then the gap is documented rather than closed, and the first job's red run is
  what surfaces it.
* − The comparison depends on the artifact being written. A gate that dies before writing one falls
  back to outcome-only filing, which is the old behaviour — correct, but it means the fingerprint is
  not available on exactly the paths where the run broke earliest.
* − **The noisy statistic is untouched.** The gate's P95 over ~22 samples is still the
  second-highest sample, and two preemptions in one scenario still set it. What changes is that one
  runner's pair of preemptions no longer files an issue on its own. If the same scenario keeps
  breaching on both runners without a code change, the fix is the calibration ADR-0140 named — a
  multi-run distribution, now collectable — not a wider tolerance.
