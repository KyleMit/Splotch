# Live-surface budget campaign — issue 683

On 2026-08-01, twelve trusted XCUITest pen runs on the physical 12.9-inch iPad Pro (iPad13,8, iPadOS
26.5, MobileSafari) compared four full-resolution tile layouts. Every cohort used the same
instrumented production route, landscape viewport, ten-stroke gesture, and product commit
d838fc0ccc4fa462db0e1971f14bb0d6ce6f442a. All twelve captures passed every input-fidelity check.

[`data.json`](./data.json) preserves the normalized measurements. [`sources.json`](./sources.json)
identifies the corresponding gitignored `real-screen.json` captures, whose raw frame, event, and
measure tables remain the source of the normalized values.

## Results

The paint column is P95/P99/max milliseconds. Lost-frame share is cumulative in-contact lost frame
time. A starvation episode is an in-contact frame gap of at least 56 ms.

| Grid | Max surface | Run |    Paint | Lost-frame share | Starvation episodes |
| ---- | ----------: | --: | -------: | ---------------: | ------------------: |
| 2×1  |   2.346 Mpx |   1 | 25/41/59 |            8.31% |                   1 |
|      |             |   2 | 24/36/50 |            9.89% |                   2 |
|      |             |   3 | 25/41/50 |            8.83% |                   0 |
| 3×1  |   1.565 Mpx |   1 | 16/29/37 |            6.87% |                   0 |
|      |             |   2 | 17/32/47 |            8.26% |                   0 |
|      |             |   3 | 16/29/33 |            7.69% |                   0 |
| 2×2  |   1.173 Mpx |   1 | 16/26/37 |            6.44% |                   0 |
|      |             |   2 | 16/25/39 |            5.90% |                   0 |
|      |             |   3 | 16/31/39 |            5.42% |                   0 |
| 4×4  |   0.294 Mpx |   1 | 16/16/39 |            3.34% |                   0 |
|      |             |   2 | 16/23/39 |            3.08% |                   0 |
|      |             |   3 | 15/17/25 |            3.17% |                   0 |

## Conclusion

The affected device's starvation boundary is narrowed to the interval above 1.565 Mpx and at or
below 2.346 Mpx per actively mutated surface for this workload: the larger surface starved in two of
three repeats and failed paint-tail gates in all three, while every smaller surface cohort had zero
starvation episodes. This is a device-and-workload bound, not a universal WebKit constant.

The campaign reaffirms the production 4×4 grid. It has 5.3× surface-area headroom below the largest
repeatably starvation-free surface and roughly halves in-contact lost-frame share versus the 3×1 and
2×2 candidates. A barely passing three- or four-surface layout would trade away measured headroom
without improving memory: aggregate full-paper pixels are unchanged, and tiled undo's budget is also
based on aggregate paper bytes.

More tiles are not free. Each cell owns three live canvases, renderer work visits more targets, and
tile edges expand seam, clipping, transform, export, and replay risk. ADR-0085's earlier 32-tile
crayon-buffer trial regressed starvation and maximum paint latency, establishing that lower surface
area is not monotonic improvement.

The fixed grid is not a scale-independent cap. A larger future backing store can exceed this
campaign's interval, while smaller phones still pay the 48-canvas topology. Re-run this campaign on
any larger supported surface or after a renderer, WebKit, brush-buffer, or device-floor change
before changing the grid. These pen runs isolate the surface-flush decision; the 4×4 runs still
missed the runner's separate 1% cumulative lost-frame-share gate and therefore do not claim that the
whole interaction release gate passes.
