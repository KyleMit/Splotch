# Benchmark evidence

This directory retains compact, reviewable evidence for the defaults in the production tracer.

| Path           | Purpose                                                             |
| -------------- | ------------------------------------------------------------------- |
| corpus/        | Twenty filled SVGs generated from known centerlines plus truth data |
| metrics.json   | Numeric records from the most recent accepted benchmark             |
| scale-sweep.md | Measured raster-scale evidence behind the production defaults       |

Run npm run perf:centerline-tracing to refresh the corpus benchmark. The long benchmark is excluded
from ordinary CI. Generated graphs, emitted SVG sweeps, promoted candidates, diffs, contact sheets,
and rendered images are review cache rather than durable source and remain uncommitted.

Compare a refresh by error, wobble, boundary P95, and synthetic centerline P95. A change above 10
percent on any axis requires human inspection of the affected emitted SVG before metrics.json is
updated. A lower error with materially worse wobble is a regression for Splotch's kid-drawn target.
