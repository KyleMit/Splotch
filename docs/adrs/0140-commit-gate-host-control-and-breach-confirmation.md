# ADR-0140: Give the Commit Gate a Stable Host Control and Confirm Its Breaches

**Status:** Accepted — amends [ADR-0093](0093-two-tier-webkit-commit-gate-in-ci.md) and
[ADR-0100](0100-split-the-commit-gate-by-what-each-half-can-decide.md). **Date:** 2026-08

## Context

### 2026-09 amendment: a confirmed wait does not identify its origin

The [issue 1717 investigation](../investigations/webkit-commit-gate-1717.md) reproduced both
scenario breaches on a quiet local host and two fresh macOS runners. Local API probes attributed the
slow commits to undo-crop `drawImage` calls. Forcing snapshot materialization earlier made commit
P95 pass while moving the same work into drawing. Across runners, the same runtime charged
substantially different shares of crayon work to draw versus commit. Confirmation establishes a
repeated synchronous wait; it does not prove a new commit-only algorithm or rule out deferred
renderer work. The original "a stall does not reproduce" rationale below is qualified by that
evidence.

Keep the raw budget, workload, and confirmation policy. Profiling builds additionally record
snapshot capture/crop measures; scenario artifacts retain draw/undo distributions and
`harnessWallMs` for both passes. That interval includes Playwright round trips and driver-side
payload serialization/transfer as well as page work; it does not measure page-only or presentation
latency. Snapshot capture is not confined to `engine.draw`; progressive clear-capture callbacks and
repaint can copy outside a queue drain. Diagnose the nested costs without adding crop to its
enclosing commit/undo measure, discounting a measured wait, or moving the wait elsewhere to make the
gate pass. The investigation explains the existing breaches; optimizing the renderer still requires
combined latency and pixel/depth/memory evidence.

### 2026-09 amendment: the crayon breach and the multi-finger regime shift were bisected to the browser build

The [issue 1751 bisect](../investigations/webkit-commit-gate-1751-bisect.md) closed the question the
amendment above left open. Measured on the gate's own macOS runner, the product that first failed
(PR 1733) passes the unchanged gate on Playwright WebKit 26.5, and the product from before it fails
the gate on WebKit 26.6. The change between the last green gate and the first red one that moved the
P95 was the `@playwright/test` 1.62.1 → 1.63.0 bump, which switched the runner's cached WebKit from
r2336 to r2359. The attribution is scenario-specific: the `crayon-scribbles` breach and the shifted,
repeated `multi-finger` regime follow the browser build, while isolated multi-finger confirmations
driven by single outliers over a 0–1 ms distribution were already occurring on WebKit 26.5 and do
not. PR 1733's own regression was on the undo path (its motion cue replayed the undone ops through
the crayon pass buffer) and is fixed; it never touched the commit measure.

Two consequences for reading this ADR. A confirmed breach that appears on two fresh runners is
evidence of a repeated synchronous wait, and this record now shows that the wait can be introduced
by the measuring browser rather than by the product; a dependency bump that changes the WebKit build
is a change to the instrument and belongs in any future bisect window as its own arm. And "confirmed
wait of unknown origin" is not the end of the 2026-09 story: the origin was found, and what remains
is the gate-semantics decision (which WebKit build the gate should pin, or whether the physical iPad
should hold the contract) that the bisect document defers to its own stack.

`webkit-commit-gate-fast` runs two scenarios against a 25 ms P95 budget on every push to `main`, and
files a GitHub issue when it fails. Neither scenario was gating anything, for opposite reasons.

**The crayon half could not fail.** `evaluateCommitTiming` divided the raw P95 by

```
(draw.totalMs / draw.ops) / CRAYON_DRAW_REFERENCE_MS_PER_CALL
```

where the constant is 0.4 ms, described as the cost of "one crayon draw mark". It was written in
64db4a899f74 against marks that fired once per operation. 13ecc3a01b52 then moved `engine.draw` into
`drainQueues()` so one measure covers a whole drain of the raster queue — a deliberate fix, because
when only the rAF path was marked the pointer-up tail raster went unmeasured — and it silently
rescaled the divisor by three orders of magnitude.

Measured on a real run of the current suite: **22** `engine.draw` measures for `crayon-scribbles`,
where the unit test's hand-written fixture assumes 26,378. `totalMs / ops` is therefore ~370 ms
against a 0.4 ms reference, and the gate divides by **924**. Crayon needs a raw P95 above **23,111
ms** to breach 25 ms. The unit test could not catch it because `timingScenario()` builds a synthetic
object and never reads a capture, so the unit changing underneath it was invisible.

**The five-finger half could only fail on noise.** It is never normalized, so shared-runner slowness
hits its raw P95 directly. The gate failed on `main` at e4cb74512207 with a P95 of 133.0 ms and
passed on a re-run of the same job at 2.0 ms.

## What the measurements ruled out

The obvious symmetry — normalize five-finger too — does not survive the numbers. Across the failing
and passing runs at that same commit:

|            | crayon `draw.totalMs` | five-finger raw P95 |
| ---------- | --------------------: | ------------------: |
| Failed run |                75,524 |        **133.0 ms** |
| Passed run |                60,808 |              2.0 ms |

The host-slowdown signal moved **1.24x**; the five-finger P95 moved **66x**. Dividing 133 by any
honest host proxy leaves it far over 25, so normalization would have failed that run too. Whatever
produced 133 ms is not proportional host slowdown, and no divisor addresses it.

What it is instead follows from the statistic. `percentile` takes `ceil(0.95 * n) - 1`, and a
scenario yields 21–22 `engine.commit` samples, so the gate's "P95" resolves to the **second-highest
sample**. Two adjacent slow commits set it outright, which is exactly what a scheduling stall on a
shared macOS runner produces. On a healthy host — measured locally and matching the passing CI run —
the whole distribution is 0–2 ms with at most one small outlier, against a 25 ms budget.

Note also that `Math.max(1, …)` means normalization can only ever *lower* a score. It is a
false-negative risk by construction, which is an argument against reaching for more of it.

## Decision

**Do not normalize at all.** An earlier revision of this ADR re-expressed the control as
`draw.totalMs / CRAYON_DRAW_REFERENCE_TOTAL_MS` and capped it at 4x. Re-expressing the unit was
right — `draw.ops` is gone from the formula, so marking granularity can never rescale a divisor
again — but review was right that fixing the unit does not fix the calibration. `60_800` came from a
single passing rerun quoted in issue 1247, nothing measured supported the cap, and three runs of the
same suite reported **8,135 / 9,685 / 13,843 ms** — host dependence far larger than the evidence the
constants rested on.

A divisor derived from one number can divide a real commit breach down to a pass, and
`Math.max(1,
…)` means it can only ever move a score in that direction. So the host control is
**measured and reported and not applied**: every run records how slow its host was on the scenario
the reference describes, which is how the multi-run `macos-latest` distribution gets collected from
ordinary runs rather than from a special one. Every scenario timing in the artifact carries its
measured slowdown, which is where that distribution comes from; `NORMALIZATION_ENABLED` turns it on
once they have.

That leaves the gate scoring the raw P95 — which is what it always did for five-finger, and which on
a healthy runner sits at 1–2 ms against a 25 ms budget on both scenarios.

**Confirm a breach before failing on it.** A scenario whose first pass breached is re-measured once,
through the same `runUndoScenario` on the same page and build, and fails only if it breaches again.
A stall does not reproduce; expensive stroke-end work does. This is the only mechanism the evidence
supports, it now carries the whole gate, and it costs one extra scenario per breach and nothing at
all on a green run.

**A confirmation that could not be scored acquits nothing.** `confirmedBreach` returns one of three
values rather than a boolean. An earlier revision filtered to evaluable timings first, so an
unevaluable second measurement left a single timing in the list, fell under the confirmation count,
and the scenario was reported as "breached once and not again" — a real first-pass breach acquitted
by a measurement that produced nothing. `unconfirmed` now keeps the breach and says so.

**Exercise the gate against a captured fixture.**
`tools/perf/tests/fixtures/undo-scenarios-webkit-fast.json` is the `draw` block of a real run. The
test asserts the current regime reports fewer than 100 draw measures, that the *old* per-call
formula would divide by more than 500 against it, and that the new formula does not — so the unit
drift is pinned by the thing that actually changed rather than by a number someone remembered to
update.

## Consequences

* \+ Crayon can fail again, and by the simplest possible route: nothing divides its score.
* \+ A single shared-runner stall no longer turns `main` red or files an issue, without weakening
  what the gate measures — the budget, the percentile and the scenarios are unchanged.
* \+ A stalled runner is now distinguishable in the output from a fast one that passed, instead of
  both reading as green.
* − **A genuinely slow runner is now scored at face value.** That is the trade for removing an
  uncalibrated divisor: a host slow enough to raise commit P95 above 25 ms fails the gate, and the
  confirmation re-run is what stops a transient one doing it. If that turns out to flap, the fix is
  the calibration this ADR declined to guess at, not a divisor chosen to make it stop.
* − The reference constant survives as provenance for a number nothing currently divides by. It is
  dead weight until someone collects the distribution, and it is kept because deleting it would
  throw away the one data point that exists.
* − A confirmation re-run roughly doubles the job's time on the failing path. That is the path that
  was already going to file an issue and cost someone an investigation.
* − **The unconfirmed-breach path is verified by unit test and by construction, not end to end.**
  Forcing a first-pass breach that does not reproduce means inducing a stall on demand, which
  nothing here can do. What was verified on a real run: with the budget forced to 0, both scenarios
  breached, both were re-measured, and the gate failed on the confirmed breaches.
* \+ Both scenarios are now treated identically, which is simpler than the asymmetry an earlier
  revision proposed. The measurements that would have justified treating them differently — a 1.24x
  host signal against a 66x P95 move — are the same measurements that say a divisor was never the
  right instrument for either.
