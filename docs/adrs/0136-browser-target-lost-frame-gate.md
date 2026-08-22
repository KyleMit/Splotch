# ADR-0136: Do Not Charge a Late Frame That the Next Frame Gives Back

**Status:** Proposed — amends [ADR-0090](0090-tiered-real-ipad-performance-regression-gates.md);
depends on [ADR-0134](0134-frame-beat-from-the-dominant-interval.md). **Date:** 2026-08

## Context

`lostFrameTimeShare` charges every in-contact frame interval longer than 1.5× the beat for its
excess over one beat. On a physical iPad that charge is mostly not measuring lost frames.

Look at what a "late" frame is on that device. These are real consecutive in-contact intervals from
a capture, in milliseconds:

```
17 | 17 | 29 |  4 | 17
16 | 17 | 28 |  5 | 17
17 | 16 | 29 |  5 | 16
```

Every late interval is immediately followed by a very short one, and the pair sums to about 33 ms —
two 60 Hz beats. The display was presenting steadily throughout; one `requestAnimationFrame`
callback arrived late and the next fired almost immediately to rejoin the vsync grid. The metric
charges the long half and gives no credit for the short half.

This is not a minority case. In a calibrated pen capture, **240 of 259 late frames (93%) are
followed by a short frame**, and the floor control — one canvas, one `stroke()` per pointermove, no
tiles, no blend planes, no framework — has **89 of 89 paired**.

The cleanest way to see the size of the error is to score the same captures by presentation deficit
instead: over each unbroken stretch of drawing, `elapsed − framesPresented × beat`, which asks how
much time was not accounted for by a frame. A late/early pair nets to zero there; a genuinely missed
slot still costs exactly one beat.

| Capture (median of 3)              | Charged | Deficit |
| ---------------------------------- | ------: | ------: |
| iPad floor control, pen            |   1.46% |   0.00% |
| iPad pen, calibrated transport     |   2.05% |   0.04% |
| iPad eraser, calibrated transport  |   1.68% |   0.59% |
| Android eraser, before candidate 1 |   1.36% |   1.73% |
| Android eraser, after candidate 1  |   0.36% |   0.77% |

The floor control scores 1.46% charged and **zero** deficit. A page containing nothing but a canvas
and a stroke call cannot be losing frames; the 1.46% is the metric pricing callback jitter.

Android behaves differently and correctly: **none** of its late frames are paired, both measures
agree there is real loss, and both agree candidate 1 roughly halves it. So the defect is specific to
displays where rAF delivery wobbles around a steady presentation cadence, which is what ProMotion
does to a 60 Hz web beat.

An earlier draft of this ADR proposed raising the browser-target gate to 2% on the grounds that
1.46% was Safari's achievable floor. That reasoning was wrong twice over: the number is an artifact
rather than a floor, and the control page it came from used a 2.98 Mpx single canvas — the very
architecture [ADR-0085](0085-tiled-live-canvas-for-ipad-webkit.md) rejected for causing WebKit
surface-flush starvation. Raising the bar would have hidden the defect instead of fixing it.

## Decision

Do not raise the gate. Stop charging for a late interval that the following interval gives back.

The gate value stays at 1% of in-contact frame time, and it stays the same for browser and native
targets.

Presentation deficit is the right shape for the charge, but it is **not** adopted as a drop-in
replacement, because it is far more sensitive to the beat estimate than the current charge is. It
compares `elapsed` against `frames × beat`, so an estimate that is low by even 0.2 ms accrues error
on every frame rather than only on late ones. That is visible in the table above: on Android, where
the estimated beat is 8.3 ms against a true 8.33 ms, every configuration lands between 0.76% and
0.97% deficit including the floor control, and the measure loses the ability to discriminate. On the
iPad, where the mean in-contact interval equals the 16.67 ms budget almost exactly, it is clean.

So the change to make is narrower and better conditioned: when an interval is charged, credit the
immediately following interval's shortfall against it, capped so the pair can never score below
zero. That leaves a genuinely missed slot costing one beat, makes a late/early pair cost only its
real overshoot — the measured pairs run about 2.2–2.3 beats rather than a clean 2.0, so a real
residual survives — and keeps the metric's existing insensitivity to small beat-estimate error.

This needs measuring before it ships. The saved captures from the issue-1196 campaign are enough to
score it offline against both the current charge and the deficit, and it should not be adopted until
that comparison exists.

## Consequences

* \+ The gate stops reporting callback jitter as lost frames, which is 93% of what a physical-iPad
  pen capture currently reports.
* \+ It stays a single value across targets, so a cell's number keeps meaning the same thing
  everywhere.
* \+ Android is unaffected: none of its late frames are paired, so nothing is credited.
* \+ What remains on the iPad is attributable. The eraser keeps a real residual (0.59% by deficit
  against pen's 0.04%), which is a lead rather than a mystery.
* − A third correction to the same metric in one campaign. The estimator (ADR-0134), the input
  cadence (ADR-0135) and now the charge were each independently wrong, and each one alone was enough
  to fail every physical-web cell. Any future number from this gate should be treated as provisional
  until a floor control is captured alongside it.
* − Crediting the next interval assumes a late frame is repaid within one frame. A callback that
  slips and repays over three frames is still charged in full. The pairing data shows one-frame
  repayment is the dominant pattern on this hardware; another device could differ.
