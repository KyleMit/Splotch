# ADR-0134: Derive the Frame Beat from the Dominant Interval, Not a Percentile

**Status:** Active — amends [ADR-0083](0083-real-screen-capture-on-device.md) and the acceptance
gates in [ADR-0090](0090-tiered-real-ipad-performance-regression-gates.md). **Date:** 2026-08

## Context

`lostFrameTimeShare` is the drawing gate that every physical-web cell in the deployment-target
matrix failed (issue 1196): 32 of 32, on render starvation alone, with every paint gate passing. It
is computed in `tools/perf/lib/real-screen-stats.mjs` from rAF deltas:

```
budgetMs      = min(observedFrameIntervalMs, 16.67)
lateThreshold = budgetMs * 1.5
lostMs        = sum over deltas > lateThreshold of (delta - budgetMs)
share         = lostMs / sum(in-contact deltas)
```

`observedFrameIntervalMs` took the 10th percentile of the capture's deltas. The reasoning was sound
for the case it was written against — a fixed 8.33 ms budget had reported 64% of a perfectly paced
60 Hz capture as late, so the budget had to come from the capture — and the 10th percentile was
chosen over the minimum because "a tenth of all frames landing at one interval is the beat."

That premise does not hold on a variable-refresh display, and both physical browsers in the
deployment matrix have one.

**Chrome on a 120 Hz Android phone** raises the presentation rate while a touch gesture is in
progress and lets it fall back to 60 Hz. A crayon capture on a Galaxy S21 FE produced a perfectly
bimodal distribution — 3 494 frames at 8.5 ms and 2 466 at 16.5 ms, with nothing in between and one
gap over four budgets in the whole run. A starved renderer produces a continuous tail; this is
vsync-locked presentation alternating between the two rates the panel supports. Two controls confirm
the mechanism: a page containing nothing but a rAF loop runs at a flat 60 Hz in that browser whether
or not it paints a canvas every frame, and under a real OS touch stream at a fidelity-passing
cadence Splotch holds 99.4–99.6% of its in-contact frames at 120 Hz.

**Safari on a ProMotion iPad** gives web content a 60 Hz beat but emits an occasional short frame. A
physical-iPad pen capture put about 2.6% of its frames at or under 12 ms on an otherwise 16–17 ms
beat, which was enough to drag the 10th percentile to 14 ms.

In both cases the derived budget lands below the rate the display actually held, the late threshold
follows it down, and the metric charges the app for frames that arrived on the beat.

## Decision

`observedFrameIntervalMs` returns the **dominant interval**: bucket the deltas to half a
millisecond, take the largest bucket, and report that bucket's own median so the returned value
stays a delta the capture contained. A capture whose largest bucket holds under a quarter of its
frames has no dominant interval — it is genuinely erratic rather than multi-rate — and there the
10th percentile remains the better answer and is retained as the fallback.

The 1% gate value is unchanged. This is a correction to what the gate is measured against, not a
re-baseline of the bar.

## Consequences

* \+ On the physical iPad the estimator roughly halves every drawing cell, re-scoring the same
  captures. Median of three samples per brush:

  | Brush  | Scored on the 10th percentile | Scored on the dominant interval |
  | ------ | ----------------------------: | ------------------------------: |
  | pen    |                         3.35% |                           1.85% |
  | magic  |                         3.76% |                           1.51% |
  | eraser |                         2.30% |                           0.87% |
  | crayon |                         1.52% |                           0.13% |

  Eraser and crayon move from failing to passing; pen and magic still fail, and what they fail
  against is [ADR-0136](0136-browser-target-lost-frame-gate.md)'s separate problem.
* \+ Android is essentially unmoved (1.36% → 1.33% on the eraser), which is the point: the estimator
  changes verdicts only where it was wrong.
* \+ What remains failing is a real, attributable cost rather than a metric artifact.
* − A capture is still scored against the rate its own display chose, so two runs on the same device
  at different refresh rates are not directly comparable. Compare captures that report the same
  beat.
* − The estimator cannot tell a display that dropped to 60 Hz because the content did not need 120
  from one that dropped because the app could not keep up. The input-fidelity gate is what separates
  them, and a capture that fails it must not be read as a product result.
