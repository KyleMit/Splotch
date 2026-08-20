#!/usr/bin/env python3
"""Trace filled SVG artwork to centerline strokes. This is the entry point.

    python3 src/run.py                                  # all ten inputs -> outputs/skimage-skan/
    python3 src/run.py --images house-wide,sun-square   # a subset
    python3 src/run.py --images house-wide --scale 4    # override the raster scale
    python3 src/run.py --images house-wide --lam 1.5    # override the pruning strength
    python3 src/run.py --in-dir mydrawings --out-dir /tmp/trace

For each drawing it writes three things to the output directory:

    <image>.svg            the stroked centerline drawing — the deliverable
    graphs/<image>.json    the same drawing as a `centerline-graph/1` document
    manifest.json          one record per drawing: config used and what it scored

Defaults come from `runs/scale-sweep.md`: raster scale 8 everywhere except
`sun-square` and `landscape-square`, which are better at scale 2, plus automatic
width-aware pruning at whatever strength the selector picks. See docs/tuning.md
before changing either.

Two implementation notes that are easy to get wrong, both of them measured:

* The pruning is applied *inside the extractor's own graph model* rather than by
  re-rendering the pruned `clg` graph. `clg`'s writer collapses an edge to one
  median radius and emits dense polylines; the extractor's emitter keeps
  per-vertex width and the Bezier fit, which is the whole reason its output is
  34x lighter. Re-rendering through the generic writer shows a worse drawing
  than the pipeline actually produces.
* Surviving-edge bookkeeping needs the merge provenance. Canonicalization
  splices degree-2 chains, so a kept branch carries its neighbours' ids in
  `mergedFrom` rather than keeping them as separate edges. Matching on the
  spliced id alone drops most of the drawing.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "src"))
sys.path.insert(0, str(REPO / "src" / "skan"))

from clg import CenterlineGraph, select, smoothness, svgio  # noqa: E402

# The pruning sweep. Dense below 2 because that is where the spur/real-detail
# boundary lives; the long tail lets a heavily-noised graph still be cleaned.
LAMBDAS = (0.0, 0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0)

DEFAULT_IMAGES = [
    "house-wide", "butterfly-wide", "boat-tall", "island-tall", "balloon-tall",
    "home-wide", "house-tall", "dinosaur-wide", "landscape-square", "sun-square",
]

DEFAULT_SCALE = 8.0

# The two exceptions are the drawings with thin tapering detail, where a finer
# raster resolves taper tails into skeleton structure that pruning then has to
# guess about. runs/scale-sweep.md, and docs/tuning.md § raster scale.
SCALE_OVERRIDES = {"sun-square": 2.0, "landscape-square": 2.0}


def build(image: str, src_dir: Path, out_dir: Path,
          scale: float | None = None, lam: float | None = None) -> dict:
    import emit  # noqa: PLC0415
    import extract  # noqa: PLC0415
    import svgio as skan_svgio  # noqa: PLC0415

    if scale is None:
        scale = SCALE_OVERRIDES.get(image, DEFAULT_SCALE)
    src_svg = src_dir / f"{image}.svg"
    doc = skan_svgio.load(src_svg)

    t0 = time.time()
    cfg = extract.ExtractConfig(scale=scale, method="medial-axis", simplify_eps=0.15)
    graph, _ = extract.extract_document(doc, cfg)
    emit.fit_beziers(graph, width_mode="piecewise")
    seconds = time.time() - t0

    fills = {f"e{e.index}": e.fill for e in doc.elements}
    edges_before = len(graph.edges)

    # Score and choose the pruning strength in the common layer.
    graphs_dir = out_dir / "graphs"
    graph_path = graphs_dir / f"{image}.json"
    graph.save(graph_path)
    src = svgio.load_source(src_svg)
    lambdas = (0.0, lam) if lam is not None else LAMBDAS
    chosen, cands = select.select(CenterlineGraph.load(graph_path), src, lambdas=lambdas)
    if lam is not None:
        chosen = next(c for c in cands if c.lam == lam)
    raw = next((c for c in cands if c.lam == 0.0), None)

    kept: set[str] = set()
    for e in chosen.graph.edges.values():
        kept.add(e.id)
        kept.update(e.extra.get("mergedFrom", []))
    graph.edges = [e for e in graph.edges if e.id in kept]
    graph.meta["prunedLambda"] = chosen.lam
    graph.save(graph_path)

    svg_text = emit.stroked_svg(graph, fills, use_beziers=True, piecewise=True)
    out_svg = out_dir / f"{image}.svg"
    out_svg.parent.mkdir(parents=True, exist_ok=True)
    out_svg.write_text(svg_text)

    s = smoothness.graph_smoothness(chosen.graph)
    return {
        "image": image,
        "scale": scale,
        "lam": chosen.lam,
        "viewBox": graph.viewBox,
        "svg": str(out_svg.relative_to(REPO)) if out_svg.is_relative_to(REPO) else str(out_svg),
        "graph": str(graph_path.relative_to(REPO)) if graph_path.is_relative_to(REPO) else str(graph_path),
        "source": str(src_svg.relative_to(REPO)) if src_svg.is_relative_to(REPO) else str(src_svg),
        "seconds": round(seconds, 1),
        "edgesBeforePruning": edges_before,
        "edgesEmitted": len(graph.edges),
        "error": round(chosen.error, 4),
        "errorUnpruned": round(raw.error, 4) if raw else None,
        "iou": round(chosen.metrics.iou, 4),
        "controlPoints": chosen.metrics.control_points,
        "wobble": round(s.wiggle, 4),
        "pointsPerWidth": round(s.verts_per_width, 2),
        "grade": smoothness.naturalness_grade(s)[0],
        "bytes": len(svg_text),
        "sourceBytes": src_svg.stat().st_size,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--images", help="comma-separated stems; default all ten inputs")
    ap.add_argument("--in-dir", default="inputs", help="directory of source SVGs")
    ap.add_argument("--out-dir", default="outputs/skimage-skan", help="where to write")
    ap.add_argument("--scale", type=float, help="raster scale px per SVG unit; overrides the default")
    ap.add_argument("--lam", type=float, help="pruning strength in stroke widths; skips the sweep")
    args = ap.parse_args()

    src_dir = Path(args.in_dir)
    if not src_dir.is_absolute():
        src_dir = REPO / src_dir
    out_dir = Path(args.out_dir)
    if not out_dir.is_absolute():
        out_dir = REPO / out_dir

    if args.images:
        images = [s.strip() for s in args.images.split(",") if s.strip()]
    else:
        images = [i for i in DEFAULT_IMAGES if (src_dir / f"{i}.svg").exists()]
        images += sorted(p.stem for p in src_dir.glob("*.svg") if p.stem not in DEFAULT_IMAGES)
    if not images:
        sys.exit(f"no SVGs found in {src_dir}")

    records = []
    for image in images:
        rec = build(image, src_dir, out_dir, scale=args.scale, lam=args.lam)
        records.append(rec)
        print(f"  {rec['image']:18s} scale {rec['scale']:g}  lam {rec['lam']:4.2f}  "
              f"err {rec['error']:.4f}  wobble {rec['wobble']:.4f}  "
              f"{rec['edgesEmitted']:4d} strokes  {rec['bytes'] // 1024:3d} KB "
              f"({rec['seconds']}s)", flush=True)

    # A partial run must not silently truncate the manifest the contact sheet reads.
    manifest_path = out_dir / "manifest.json"
    by_image: dict[str, dict] = {}
    if manifest_path.exists():
        by_image = {r["image"]: r for r in json.loads(manifest_path.read_text())}
    by_image.update({r["image"]: r for r in records})
    order = DEFAULT_IMAGES + sorted(k for k in by_image if k not in DEFAULT_IMAGES)
    merged = [by_image[k] for k in order if k in by_image]
    manifest_path.write_text(json.dumps(merged, indent=1))
    print(f"\nwrote {len(records)} SVGs -> {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
