# How it works

```
SVG ──svgelements──► filled elements (transforms resolved, one element = one job)
    ──resvg────────► binary mask, cropped to the element bbox, at `scale` px/unit
    ──medial_axis(return_distance=True)──► skeleton + Euclidean distance field
    ──Skan Skeleton/summarize────────────► nodes, branches, ordered coordinates
    ──smooth ▸ resample ▸ corner-detect ▸ RDP──► centerline graph + per-vertex radii
    ──width-aware pruning (λ selected automatically)──► the graph that survives
    ──fit-curve (Schneider)──────────────► cubic Béziers, C0 breaks at corners
    ──stroke emission────────────────────► <path fill=none stroke-linecap=round>
```

## Stage notes

**One filled element, one job.** Every filled element gets its own mask, so two
strokes that merely *touch* on screen can never fuse in the skeleton. Corpus case
17 — near-touching parallel lines, 2-unit gap, stroke radius 10 — survives intact
even at 1 px per SVG unit purely because of this. A colour-merged pipeline would
have fused them; "near-touching parallels fuse" is the classic raster/Voronoi
failure this design avoids by construction.

**Euclidean medial axis, not morphological thinning.** Same masks, same
rasterization, same downstream stages, only the skeletonizer differs.
`medial-axis` wins median centerline error on **18 of 20** ground-truth cases, and
the margin is largest exactly where theory says it should be: on *curved* geometry
it is 2–3× more accurate, because thinning follows the 8-connected pixel lattice
and staircases around a curve while the distance-transform ridge does not.
Hausdorff is where the gap is starkest — 0.14–0.40 against 0.62–1.63.

Thinning wins on butt caps, square caps and miter joins, where `medial_axis` fans
out into five branches and thinning produces one clean branch. That is not
thinning being more correct — the corner-bisector spurs are genuine medial-axis
structure — it is thinning being lossy in a convenient way.

Honest caveat: **on real artwork scored by pixels, plain thinning is as good or
marginally better**, produces a smaller graph, and runs ~15% faster
(`landscape-square` 0.09% vs 0.13%, `sun-square` 1.64% vs 1.73%). The case for the
Euclidean medial axis rests on ground-truth accuracy, which is what matters if the
centerline is the deliverable rather than the re-render, and on the distance
field below. `extract.skeletonize_mask(mask, "skeletonize")` is the head-to-head
harness if you want to re-check this.

**The distance field pays for itself twice.** It is the pruning signal, and it
also fixes the single largest reconstruction error at the *emission* stage. SVG
cannot vary `stroke-width` along one path, so a tapered pen stroke rendered at one
median width is too fat at the ends and too thin in the middle. Because the graph
carries a per-vertex radius, an edge is split into contiguous runs of
near-constant radius (±18%) and each run emitted as its own constant-width
sub-path:

| | constant width | piecewise width |
|---|---|---|
| corpus 19 variable-width, IoU | 0.748 | **0.954** |
| `sun-square`, pixel diff | 3.59% | **1.73%** |
| `landscape-square`, pixel diff | 0.44% | **0.13%** |
| `house-wide`, pixel diff | 0.09% | **0.03%** |

It improved *every* drawing, needed no new geometry and no tuning, and the cost is
file size and segment count (`sun-square` 7.2 KB → 17.1 KB before the emission
hygiene below). On a genuinely constant-width shape the splitter mostly no-ops.

**Skan is the graph layer, and it earns it.** `Skeleton` + `summarize()` give
branch decomposition, ordered per-branch coordinates, node degrees and branch
types with no hand-written pixel-neighbour traversal, and handle cycles and
multi-junction elements without special-casing. Mapping it into the graph model is
about 40 lines, against a ~600-line hand-rolled tracer in the tool this replaced.

One API note: `Skeleton(skel, source_image=dist)` + `path_means()` does *not*
return useful radii (all 1.0). Sample the distance field directly at
`path_coordinates(i)` — that is what `extract.py` does.

**Pruning is model selection, not a threshold.** Rather than hand-tuning one
cutoff, the graph is pruned at several strengths, each candidate is re-stroked and
scored, and the simplest candidate whose error is within tolerance of the best
achievable is chosen. The threshold λ is expressed in **local stroke widths**
(`normLength = L / 2·R_med`), which is what makes it scale-free: a spur 0.15
stroke widths long is a boundary artifact whether the drawing is 100 units wide or
10,000. See [tuning.md](tuning.md) for what to do when the choice is wrong.

**Emission hygiene is worth 35–40% of file size.** Grouping paths by colour so
`fill`/`stroke`/`linecap`/`linejoin` are written once per group rather than once
per path cut every output by 35–40% (`sun-square` 17.1 K → 9.8 K) with identical
geometry and unchanged IoU.

## File map

| file | stage |
|---|---|
| `src/run.py` | **the entry point.** Ties extraction, pruning selection and emission together, writes `outputs/` |
| `src/skan/svgio.py` | SVG → filled elements; svgelements, transforms and groups resolved |
| `src/skan/raster.py` + `resvg_render.js` | deterministic resvg rasterization; the one place the pixel↔SVG coordinate mapping is written down |
| `src/skan/extract.py` | medial axis + Skan → the centerline graph, with radii |
| `src/skan/emit.py` + `fit_curve.js` | Bézier fitting, width runs, stroked-SVG emission |
| `src/skan/graphmodel.py` | the extractor's graph model and its `centerline-graph/1` writer |
| `src/skan/metrics.py` | re-stroke scoring, centerline error, failure-tag detectors |
| `src/skan/corpus.py` | the 20-case synthetic ground-truth corpus, Shapely-buffered from known centerlines |
| `src/skan/bench.py` | the re-runnable bench (`corpus`/`inputs`/`sweep`/`all`/`report`) |
| `src/skan/sheets.py` | comparison and progress contact sheets (PNG + HTML) |
| `src/skan/runbench.sh` | the whole matrix in one command |
| `src/clg/graph.py` | the shared graph model: load, save, canonicalize (`merge_chains`), stats |
| `src/clg/schema.py` | `centerline-graph/1` validator — see [graph-schema.md](graph-schema.md) |
| `src/clg/prune.py` | width-aware pruning; every threshold scale-free |
| `src/clg/select.py` | pruning as model selection: sweep λ, score, choose |
| `src/clg/metrics.py` | vector scoring: IoU, symmetric difference, boundary distance, centerline error |
| `src/clg/restroke.py` | graph → filled polygon, for scoring against the source |
| `src/clg/smoothness.py` | wobble and control points per stroke width — the product-goal axis |
| `src/clg/svgio.py` | source SVG → polygon with real fill-rule handling |
| `src/render_pairs.mjs`, `src/build_contact_sheet.py`, `src/contact-sheet.template.html` | the contact sheet |
| `src/render.mjs`, `src/compare.js` | deterministic SVG→PNG; raster diff |
| `src/test_clg.py` | invariants for the graph, pruning and metric layers |

## What this cannot do

- **Butt and square caps cannot be reconstructed** with `stroke-linecap="round"`.
  This is a *stroke-model* mismatch, not an extraction failure, and the numbers
  separate the two cleanly: corpus case 08, same geometry, only the linecap
  attribute changed — `round` IoU 0.812 → `butt` IoU **0.915**. The centerline was
  fine all along. The raw material for recovering cap style is in the graph: a
  butt cap leaves a characteristic 5-branch fan whose spur lengths are ≈R and
  ≈R·√2 (measured Hausdorff 9.88 ≈ R and 13.97 ≈ R·√2 at radius 10). Nothing
  implemented.
- **Variable-width strokes** are approximated by piecewise-constant runs. A real
  answer needs a variable-width stroke representation, which SVG 1.1 does not have
  short of emitting an outline — which defeats the purpose.
- **Crossings stay ambiguous by design.** A degree-4 node is left as a node.
- **Miter joins leave a spur** along the miter spike (corpus case 12, Hausdorff
  14.14). Genuine medial-axis structure; a pruning candidate, not a bug.
- **T-junction blobs are the main visible defect.** At a T the medial axis forks
  into a Y before the stem reaches the bar; the two short Y arms get round caps
  and render as a blob past the bar's edge. Detected mechanically as a
  non-terminal edge with `normLength < 1.0`.
- **Round-cap terminals sit ~0.3–0.4 units inside the true endpoint** at scale 4
  (3–4% of R). `--cap-extend` removes most of it and is off by default; see
  [tuning.md](tuning.md#cap-extend).

### Failure tags

`runs/metrics.json` carries a per-run `tags` count from mechanical detectors (in
`skan/metrics.failure_tags` and `extract._cap_deltas`), so they are comparable
across configurations rather than hand-curated. `bench.py report` prints them
restricted to the image set common to every row, because a config that ran on
three images otherwise looks "cleaner" than one that ran on ten.

| tag | meaning | seen |
|---|---|---|
| `join artifact` | non-terminal edge with `normLength < 1.0` — the T-junction blob | the main visible defect |
| `cap artifact` | a degree-1 end whose reach to the outline disagrees with the local radius | 16 of 45 stroke ends on `house-wide` genuinely taper |
| `outline noise branch` | terminal branch, `0.2 ≤ normLength < 0.6` | mostly the outside of pen corners |
| `raster quantization` | branch with `normLength < 0.2` | grows with raster scale |
| `crossing ambiguity` | degree-4 node | 9 across the ten drawings; left undecided by design |
| `excessive curve complexity` | > 1.5 Béziers per stroke-width of arc length | 0 constant-width, 10 piecewise — the measured cost of the taper fix |
| `disconnected skeleton` | skeleton components exceed mask components | **not observed** on any real input at any scale |
| `missing narrow segment` | an element with a real mask produced no skeleton | **not observed** |
| `wrong endpoint` | terminal sits inside the true endpoint | minor, fixable with `--cap-extend` |
