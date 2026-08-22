# ADR-0136: Set the Browser-Target Lost-Frame Gate from a Measured Floor

**Status:** Proposed — amends [ADR-0090](0090-tiered-real-ipad-performance-regression-gates.md);
depends on [ADR-0134](0134-frame-beat-from-the-dominant-interval.md) and
[ADR-0135](0135-split-device-capture-input-and-measurement.md). **Date:** 2026-08

## Context

`LOST_FRAME_TIME_SHARE_GATE` is 1% of in-contact frame time, and issue 1196 asked whether that is
the right bar for a browser or "simply the wrong bar", since the value came from native-quality
capture.

Two of the campaign's findings had to land first. ADR-0134 corrected the beat estimator, which was
inflating every physical-browser cell. ADR-0135 corrected the Android input cadence, which was
inflating the Android cells by an order of magnitude. What remained was a physical-iPad Safari
result that no product change moved: pen at 1.85% and magic at 1.51%, medians of three samples.

Six product changes were measured against that residual — rasterizing once per frame, dropping the
live paper view's permanent compositor promotion, suppressing the brush ring on touch, coarsening
the tile grid, skipping a redundant crayon preview plane, and deferring the eraser's empty scan. On
the iPad every one of them landed between 1.17% and 2.00% on pen and magic. Nothing shifted the
residual, which is the shape of a floor rather than a cost.

So the floor was measured directly. A control page — one full-size canvas, one `stroke()` per
pointermove, no tiles, no blend planes, no halos, no framework — was served to the same devices,
driven by the same trusted gesture plan, and recorded by the same probe and the same maths:

| Target                 | Floor (median of 3) | Samples          |
| ---------------------- | ------------------: | ---------------- |
| iPad Pro 12.9 · Safari |               1.46% | 1.52, 1.46, 1.36 |
| Galaxy S21 FE · Chrome |               0.54% | 0.57, 0.54, 0.49 |

**On this iPad the cheapest drawing app that can exist loses 1.46% of in-contact frame time.** The
1% gate is below that, so no implementation can pass it. Splotch's own cells sit at or near the
floor: eraser 0.87% and crayon 0.13% are *below* it, magic 1.51% is at it, and pen 1.85% is 0.39
above it.

The frame histograms say why. In-contact deltas for Splotch's pen, Splotch's crayon and the control
page are the same shape — about 87% at 16–17 ms, a few percent of short frames, and a ~3% tail. What
separates a pass from a fail is only whether that tail lands just above or just below 1.5× the beat:
crayon's tail stops at 24 ms and scores 0.13%, while pen's and the control page's reach 28–30 ms and
score 1.85% and 1.46%. That is Safari's jitter, and it is present with none of Splotch's
architecture on the page.

## Decision

Gate a browser target against its own measured floor rather than against a native-derived constant.

* Keep 1% for native targets, where it was calibrated and where the app meets it — physical Android
  native measures 0.0% on every brush.
* For a browser target, the gate is **the floor plus a headroom allowance**. On the evidence above
  that is 2% for physical iPad Safari and 1% for physical Android Chrome, whose floor is already
  well inside the existing bar.
* A floor is a property of a browser, a device and a workload, not a universal constant. Re-measure
  it with the control page whenever the device floor, the OS, or the gesture plan changes, and
  record the samples beside the campaign that used them.
* A capture that fails the input-fidelity gate is not evidence about either the floor or the
  product.

Under this gate the physical-iPad web cells pass on pen, crayon, magic and eraser, and physical
Android web passes on pen, crayon and magic, with the eraser passing once ADR-0134's estimator and
the rasterization change in this stack are both applied.

## Consequences

* \+ The release gate becomes achievable, so a red physical-web cell means something again.
* \+ The floor is measured rather than asserted, and the control page is cheap to re-run.
* \+ It separates two questions the single constant conflated: how much frame time the browser loses
  on its own, and how much this app adds.
* − Two gate values to keep straight, and the browser one is per-target. A cell must name the floor
  it was scored against.
* − A regression that pushes the app up to the floor from below is no longer caught by this gate.
  Paint P95/P99/max and the between-strokes and whole-window columns remain the guards there.
* − The 2% iPad figure is calibrated on one device, one OS version and one gesture plan, and through
  a transport whose input cadence (about 60 moves/s) is below a real finger's. A cadence closer to a
  digitizer's could move the floor in either direction, and the value should be re-derived if the
  transport's cadence improves.
