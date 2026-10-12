# Centerline graph — `centerline-graph/1`

The intermediate representation. Read this if you want the *geometry* rather than the SVG — to edit
strokes, re-emit at a different width, feed a drawing app, or score the result yourself.

`src/centerline_tracing/cli.py` writes one per drawing to
`explicit output directory/graphs/<image>.json`. Normative implementation:
`src/centerline_tracing/graph/schema.py`. **Status: frozen.** Breaking changes take a new version
string, never an edit to this one.

## Document

```jsonc
{
  "schema": "centerline-graph/1",
  "image":   "house-wide",
  "backend": "skimage-skan/medial-axis",
  "units":   "svg-user-units",
  "viewBox": [0, 0, 1662, 946],
  "radiusSource": "native",          // Euclidean distance transform, not derived
  "meta": { "scale": 8, "method": "medial-axis", "prunedLambda": 1.0, ... },
  "nodes": [ ... ],                  // REQUIRED
  "edges": [ ... ]                   // REQUIRED
}
```

**Coordinates are always in the original SVG user space.** Not raster pixels, not a normalized box.
Everything downstream — scoring against the source fill, re-emission, comparison — assumes it. A
graph whose coordinates are in raster space cannot be scored against the drawing it came from.

`radiusSource` is `"native"` when radius comes from the algorithm itself and `"derived"` when it was
recovered afterwards by sampling a distance transform. This engine emits `"native"`: `radii` is
`distance_transform / scale` read straight off the medial-axis distance field at each skeleton pixel
— the radius of the maximal inscribed disk. Verified exact on a synthetic capsule (true radius
10.000 → recovered 10.000 at scales 2, 4 and 8). `r_svg = dist_px / scale` is correct as written;
there is no half-pixel correction to apply.

## Node

```jsonc
{ "id": "e1n0", "x": 1385.0, "y": 106.7, "radius": 12.95, "degree": 1 }
```

| field    | required             | meaning                                                                     |
| -------- | -------------------- | --------------------------------------------------------------------------- |
| `id`     | yes                  | unique non-empty string                                                     |
| `x`, `y` | yes                  | finite, SVG user units                                                      |
| `radius` | strongly recommended | local stroke radius (half-width) here                                       |
| `degree` | no                   | skeleton degree; 1 = endpoint, ≥3 = junction. The graph layer recomputes it |

Without `radius`, width-aware pruning degrades to length-only pruning — which is exactly the thing
measured not to work.

## Edge

```jsonc
{
  "id": "e1b2", "from": "e1n0", "to": "e1n7",
  "geometry": [[x, y], ...],       // Point[] polyline, SVG user units
  "radii":    [r, ...],            // SAME LENGTH as geometry — per-vertex radius
  "length": 601.1,
  "medianRadius": 10.43,
  "sourceElementId": "e1",
  "meanRadius": 10.4, "minRadius": 9.8, "maxRadius": 12.9,
  "radiusCv": 0.031,               // std(R)/mean(R)     — width consistency
  "normLength": 28.8,              // length / (2*R_med) — scale-free length
  "branchType": 2,                 // Skan: 0 end-end, 1 junction-end, 2 junction-junction, 3 cycle
  "corners": [17, 43],             // indices into geometry kept as C0 breaks
  "beziers": [[[p0], [c1], [c2], [p3]], ...],
  "widthRuns": [ {"bezierStart": 0, "bezierCount": 3, "radius": 10.4}, ... ],
  "closed": false
}
```

| field                     | required             | meaning                                           |
| ------------------------- | -------------------- | ------------------------------------------------- |
| `id`                      | yes                  | unique non-empty string                           |
| `from`, `to`              | yes                  | node ids that must exist in `nodes`               |
| `geometry`                | yes                  | see encodings below                               |
| `length`                  | yes                  | arc length in user units                          |
| `medianRadius`            | strongly recommended | median local radius along the edge                |
| `radii` / `radiusProfile` | recommended          | per-vertex radius; the two names are aliases      |
| `sourceElementId`         | recommended          | the filled element this came from                 |
| `geometryType`            | no                   | `"polyline"` \| `"beziers"`; inferred when absent |
| `closed`                  | no                   | closed loop (`from == to`, non-zero length)       |

A strict consumer can read only `id/x/y/radius` and
`id/from/to/geometry/length/medianRadius/sourceElementId` and ignore the rest.

`normLength` and `radiusCv` are precomputed because they are the pruning features. `geometry` is
RDP-simplified at 0.15 user units with detected corners forced to survive, so `corners` indices are
valid in the simplified index space.

### Geometry encodings — all three are legal

| form               | example                                           |
| ------------------ | ------------------------------------------------- |
| `polyline-pairs`   | `[[x,y], [x,y], ...]` — what this engine emits    |
| `polyline-objects` | `[{"x":x,"y":y}, ...]`                            |
| `beziers`          | `[[[x,y],[x,y],[x,y],[x,y]], ...]` cubic segments |

The graph layer normalizes all three to a flattened polyline (tolerance 0.05 user units) and
*retains* the Bézier form when present, so control-point complexity is scored honestly rather than
being inflated by flattening.

### Dot edges

An edge with **exactly one** geometry point is a **dot** — an isolated mark with no extent. It must
satisfy `from == to` and `length == 0`, and needs `medianRadius` to be reconstructible. Dots are
real marks, not noise; deleting them silently loses artwork.

## What the validator checks

1. Node and edge ids are unique; `from`/`to` resolve to declared nodes.
2. `geometry` has ≥ 2 points, or exactly 1 as a dot.
3. `length` is within 5% of the polyline length of `geometry` (Béziers exempt).
4. Edge geometry endpoints sit on their referenced nodes (warn beyond 0.1% of the coordinate
   magnitude).
5. All numbers finite; radii ≥ 0.

Unknown keys are **preserved, never rejected** — they surface as notes.

## Using the library

```python
import sys; sys.path.insert(0, "src")
from clg import CenterlineGraph, metrics, prune, select, smoothness, svgio

src = svgio.load_source("tests/fixtures/filled/house-wide.svg")
g   = CenterlineGraph.load("explicit output directory/graphs/house-wide.json")

g.merge_chains()                        # splice degree-2 chains: canonical form
print(g.stats())                        # nodes, edges, strokes, terminals, junctions, length

m = metrics.score_graph(g, src)         # IoU, symmetric difference, boundary, width
s = smoothness.graph_smoothness(g)      # wobble, control points per stroke width
best, sweep = select.select(g, src)     # re-choose the pruning strength

for edge, tip, anchor in g.terminal_edges():
    ...                                 # every prunable branch, oriented tip -> anchor
```

## Rules for consumers

* **Canonicalize before you count or prune.** Whether a chain of degree-2 nodes is one branch or
  forty is a serialization choice, so raw branch counts are not comparable and a pruning threshold
  in stroke widths means different things until chains are spliced. `merge_chains()` does it and
  records provenance in `mergedFrom`.
* **Do not assume edge geometry meets exactly at a shared node.** It frequently does not. Anything
  that splices, walks or closes a path must tolerate a gap of several user units, or it will
  silently delete geometry.
* **Use `radii` when it is there.** Scoring `house-wide` with the per-vertex profile rather than a
  per-edge median improved reconstruction error from 0.0243 to 0.0152. A single median is wrong for
  any edge that spans a width change — and canonicalization creates such edges by construction.
* **`degree` tells you what a branch is.** Terminal branches are `deg(from) == 1 or deg(to) == 1`;
  crossing-ambiguity candidates are `degree ≥ 4`.
