# Lessons — things that bit, and will bite again

Every entry here cost real time. Several of them produced confident, wrong, *published* numbers
before they were caught. They are kept because the failure modes are structural, not incidental to
who hit them.

---

## <a id="medial_axis-is-non-deterministic-by-default"></a>`medial_axis` is non-deterministic by default

`skimage.morphology.medial_axis(image, ..., rng=None)` randomises the pixel ordering used to break
thinning ties. With the default `rng=None`, **two calls on the same mask return different
skeletons.** Verified on scikit-image 0.26:

```
identical across 4 calls: False     # rng=None  (default)
identical across 4 calls: True      # rng=0
```

The pixel *count* is stable, so this hides easily: it shows up as scores that wobble by ~±0.01 IoU
between otherwise identical runs — more than enough to make a real regression invisible or to invent
one. Fixed here by `ExtractConfig.rng_seed = 0`, passed on every call. `skeletonize()` has no such
parameter and is deterministic.

## Feeding fit-curve an RDP-simplified polyline produces garbage

A near-collinear 3-point run makes Schneider's tangent/α solve ill-conditioned, and it returns
control points flung across the canvas — a visible loop that still passes the algorithm's own error
test. Corpus case 02 scored IoU 0.771 for exactly this reason while its *centerline* error was
0.065: the geometry was fine and the fit was not.

Fix, and both halves are needed: fit on a **uniformly arc-length resampled** chain
(`extract.resample_uniform`, step `R_med/8`), and keep a sanity check that rejects control points
outside the run's bbox + 35% of its diagonal and subdivides instead
(`fit-curve-bridge.mjs: sane()`). Anyone else using fit-curve should copy both.

## IoU is a weak discriminator for centerline quality, and can be anti-correlated with it

Same case as above: IoU ranked `skeletonize` (0.858) above `medial-axis` (0.771) while ground truth
said medial-axis was 2.7× more accurate. If you have ground truth, score against it. IoU is for the
real inputs where you do not — and the pruning selector optimizes symmetric difference rather than
IoU precisely because IoU is forgiving of small missing marks, which is the over-pruning failure
mode.

## Canonicalize before pruning, and after every pass

Backends disagree about what an edge *is* — for one noisy capsule, 426 edges from one extractor and
61 from another. Pruning an un-canonicalized graph at λ=1.0 destroyed it: 426 edges → 11, IoU 0.77 →
0.28. `CenterlineGraph.merge_chains()` is not an optimization, it is a precondition. It splices
degree-2 chains, records provenance in the surviving edge's `mergedFrom`, and is
geometry-preserving.

## Surviving-edge bookkeeping needs the merge provenance, not the edge ids

Because canonicalization splices chains, a branch that survives pruning carries its neighbours' ids
in `mergedFrom` rather than leaving them as separate edges. Filtering the extractor's edge list on
the surviving *ids alone* drops most of the drawing. The kept set is the union of each surviving
edge's own id and its `mergedFrom` list. `src/centerline_tracing/cli.py` does this; anything else
that maps a pruned graph back onto extractor edges must too.

## Do not re-render a pruned graph through the generic writer

`clg`'s SVG writer collapses an edge to a single median radius and emits dense polylines. That is
correct for an overlay or a diff and wrong for anything a person looks at: per-vertex width and the
Bézier fit are exactly what make this output 34× lighter than the tool it replaced, and the generic
writer throws both away. Pruning has to be applied *inside the extractor's model* and emitted by the
extractor's emitter.

## Never let a harness write into the directory it reads from

A scoring harness promoted each winner into the same directory its *inputs* lived in, so every run
scored the previous run's pruned output as "what was published". Four of ten cells had drifted
before it was caught — always in the flattering direction. Know whether a directory is an input, an
output, or both, and never let it be both. In this repo:

* Explicit production outputs are written only by `src/centerline_tracing/cli.py` after the whole
  batch succeeds.
* `benchmark/out/`, `benchmark/graphs/`, `benchmark/promoted/` are the bench's regenerable cache.
  `bench.py --promote` writes to `benchmark/promoted/`, never to a production caller's explicit
  output path, so a sweep cannot replace an accepted drawing.

## <a id="a-comparison-render-must-differ-by-one-thing-only"></a>A comparison render must differ by one thing only

Both sides of every contact-sheet pair go through the same rasterizer at the same pixel size on the
same white ground. Get any of those wrong and the mismatch shows up as a seam at the wipe line,
where it reads as a flaw in the *output* rather than in the render. For the same reason the
difference view is deliberately not contrast-boosted: the error really is a sub-pixel halo, and
making it visible would be making it up.

## Profile before believing a written-down diagnosis

A previous handoff stated that a drawing never finished because `merge_chains` is O(V²). It is not:
on that graph `merge_chains` takes 0.0 s and makes zero merges. The real cost was unindexed
point-to-boundary distance in `metrics.boundary_distances` — a linear scan over every boundary
segment for every sample point, 97 s per `score_graph`. An STRtree over the exploded boundary made
it 13× faster with distances identical to 1e-13 over 268k samples. A confident diagnosis nobody
profiled had become the next session's task list.

## Source polygons need real fill-rule handling

Ring-parity nesting inflated `house-wide`'s area by 25% and made the output look like it was missing
a fifth of the drawing. `clg/svgio.py` nodes the rings, polygonizes, and classifies faces by winding
number. **If a new metric says everything is failing, suspect the metric.**

## Chain merging must not assume edges meet at their shared node

Extractor geometry drifts from node coordinates — up to 13.7 user units in graphs seen here, which
is larger than a stroke radius in places. Dropping the shared vertex unconditionally deleted 997
units² across 51 fragments. Anything that splices, walks, or closes a path must tolerate a gap of
several user units.

## Use `radiusProfile`, not a per-edge median

Scoring `house-wide` with the per-vertex radius profile rather than a per-edge median improved
reconstruction error from 0.0243 to 0.0152 — a 37% reduction. A single median radius is wrong for
any edge that spans a width change, and canonicalization creates such edges by construction.

## Compare ink, not color

A color diff over the whole canvas and symmetric difference over ink answer different questions. A
re-emitted black SVG can score poorly against a colored input for no geometric reason. The retained
raster agreement test renders both source and reconstruction as black silhouettes, so it guards the
same ink geometry as the vector metric.

## Marching outward from a skeleton end: check the degree first

The first cap-extension implementation extended *both* ends of every branch, including ends sitting
at a junction. Marching outward from a junction runs down the middle of the crossing stroke and hits
the far boundary, pushing branches across junctions. The same bug in a cap-artifact *detector*
reported every junction as a cap artifact — 73 of 90 edges, versus 22 after the fix. Restrict to
degree-1 ends.

## "One variant published" is not "not tunable"

It is *unknown*. On the leading configuration, sweeping a parameter nobody had swept was worth 8%
error and 17% wobble. If a setting has only ever been run at one value, that is a gap in the
measurement, not evidence it is optimal.

## Dropping sub-pixel fragments is load-bearing, and must not be reported as a failure

Several source files contain sub-pixel path fragments (0.4–0.9 user units across). They are
correctly dropped and counted as `subpixelElementsDropped`. Conflating them with lost strokes
inflates the `missing narrow segment` tag and hides real regressions.

## Long jobs in a hosted agent session

The container suspends between turns, so background jobs barely advance while you wait on them. Run
benches in the foreground. `bench.py` writes after every cell, so a partial run survives.
