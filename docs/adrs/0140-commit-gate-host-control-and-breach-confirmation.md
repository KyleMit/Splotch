# ADR-0140: Give the Commit Gate a Stable Host Control and Confirm Its Breaches

**Status:** Accepted — amends [ADR-0093](0093-two-tier-webkit-commit-gate-in-ci.md) and
[ADR-0100](0100-split-the-commit-gate-by-what-each-half-can-decide.md). **Date:** 2026-08

## Context

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

**Express the host control in a unit that marking granularity cannot rescale.** The divisor becomes
`draw.totalMs / CRAYON_DRAW_REFERENCE_TOTAL_MS`. The scenario replays a fixed recorded input, so
total drawing time is a proxy for host speed; `draw.ops` is deliberately absent from the formula. A
change to `engine.draw` granularity changes `ops` and cannot change `totalMs`, so the specific
defect above cannot recur. The reference is 60,800 ms, from the healthy run in the evidence.

**Cap the control.** Past `HOST_SLOWDOWN_CAP` (4x) the run is not a slower host to compensate for,
it is a host that stalled, and its numbers are not comparable to anything. Such a run is reported
NOT EVALUATED rather than discounted into a guaranteed pass — the issue's "reject a run whose
control shows the host was too degraded" option, applied where a control can actually see it.

**Confirm a breach before failing on it.** A scenario whose first pass breached is re-measured once,
through the same `runUndoScenario` on the same page and build, and fails only if it breaches again.
A stall does not reproduce; expensive stroke-end work does. A breach seen once is logged with both
numbers and does not fail the job. This is the only mechanism the evidence supports for the
five-finger half, and it protects the crayon half too. It costs one extra scenario per breach and
nothing at all on a green run.

**Exercise the gate against a captured fixture.**
`tools/perf/tests/fixtures/undo-scenarios-webkit-fast.json` is the `draw` block of a real run. The
test asserts the current regime reports fewer than 100 draw measures, that the *old* per-call
formula would divide by more than 500 against it, and that the new formula does not — so the unit
drift is pinned by the thing that actually changed rather than by a number someone remembered to
update.

## Consequences

* \+ Crayon can fail again. Against the real capture the divisor is 1 rather than 924, so the gate
  scores the raw P95 on a healthy host and discounts only a genuinely slower one.
* \+ A single shared-runner stall no longer turns `main` red or files an issue, without weakening
  what the gate measures — the budget, the percentile and the scenarios are unchanged.
* \+ A stalled runner is now distinguishable in the output from a fast one that passed, instead of
  both reading as green.
* − **The reference is still a constant tied to CI hardware.** It cannot drift by marking changes
  any more, but it will drift if the scenario's recorded input changes or the runner image gets
  materially faster. The fixture test pins the mark regime; nothing pins the input, and that is the
  remaining soft spot.
* − A confirmation re-run roughly doubles the job's time on the failing path. That is the path that
  was already going to file an issue and cost someone an investigation.
* − **The unconfirmed-breach path is verified by unit test and by construction, not end to end.**
  Forcing a first-pass breach that does not reproduce means inducing a stall on demand, which
  nothing here can do. What was verified on a real run: with the budget forced to 0, both scenarios
  breached, both were re-measured, and the gate failed on the confirmed breaches.
* − Two scenarios in one gate are now treated differently — crayon normalized, five-finger not. That
  asymmetry is deliberate and argued from the table above: they fail differently, so they are
  protected differently. It is a thing a future reader will want this ADR for.
