"""Reconstruction metrics: score a centerline graph by re-stroking it.

Vector-space scoring is the primary measure. A color-independent resvg cross-check
guards vector-versus-raster agreement without importing the source repository's
comparison-only artifact generator.
"""

from __future__ import annotations

import json
import math
import subprocess
import tempfile
from dataclasses import asdict, dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import shapely
from shapely.geometry import MultiLineString

from . import geom, restroke, svgio

CAPABILITY_ROOT = Path(__file__).resolve().parents[3]

# Boundary sampling step, in units of the drawing's dominant stroke radius. 0.25
# gives a few thousand samples on a typical drawing: dense enough that the median
# is stable, cheap enough to run inside a pruning sweep.
BOUNDARY_STEP_FRAC = 0.25


@dataclass
class ReconMetrics:
    # fidelity
    iou: float = 0.0
    sym_diff_area: float = 0.0
    sym_diff_ratio: float = 0.0        # symmetric difference / original area
    missing_ratio: float = 0.0         # original \ reconstructed, over original area
    extra_ratio: float = 0.0           # reconstructed \ original, over original area
    boundary_median: float = 0.0
    boundary_p95: float = 0.0
    boundary_median_norm: float = 0.0  # in units of the dominant stroke radius
    boundary_p95_norm: float = 0.0
    # width
    width_error_median: float = 0.0    # |assigned r - true distance to boundary|
    width_error_norm: float = 0.0
    width_cv: float = 0.0              # length-weighted std(R)/mean(R)
    # complexity
    strokes: int = 0
    edges: int = 0
    nodes: int = 0
    terminals: int = 0
    junctions: int = 0
    control_points: int = 0
    bezier_segments: int = 0
    total_length: float = 0.0
    global_radius: float = 0.0
    # provenance
    source_area: float = 0.0
    recon_area: float = 0.0
    width_mode: str = "auto"
    seconds: float = 0.0
    extras: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        for k, v in d.items():
            if isinstance(v, float):
                d[k] = round(v, 6)
        return d


def _boundary_lines(geom_obj, step: float) -> list:
    """A geometry's boundary, segmentized, as a list of LineStrings."""
    if geom_obj is None or geom_obj.is_empty:
        return []
    boundary = geom_obj.boundary
    if boundary.is_empty:
        return []
    dense = shapely.segmentize(boundary, max_segment_length=max(step, 1e-6))
    return list(dense.geoms) if isinstance(dense, MultiLineString) else [dense]


def _boundary_points(geom_obj, step: float) -> np.ndarray:
    """Dense samples along a geometry's boundary."""
    chunks = [np.asarray(ln.coords) for ln in _boundary_lines(geom_obj, step)
              if len(ln.coords) > 0]
    if not chunks:
        return np.empty((0, 2))
    return np.vstack(chunks)


@lru_cache(maxsize=8)
def _boundary_index(geom_obj, step: float):
    """An STRtree over the boundary exploded into individual segments.

    `shapely.distance(points, one_big_boundary)` is a linear scan over every
    segment of that boundary for every point, so its cost is
    O(points x boundary segments). On polygon-voronoi/landscape-square — 28k
    control points re-stroked against a dense source outline — that is 30 s for a
    single call and ~97 s for one `score_graph`, which is what actually stopped
    that leaderboard cell from ever finishing. Indexing makes it O(points x log).

    Exploded to segments rather than whole rings so the bounding boxes are tight;
    a single ring's bbox covers the whole drawing and prunes nothing. Cached
    because a pruning sweep scores every candidate against the same source.
    """
    lines = _boundary_lines(geom_obj, step)
    segs: list[np.ndarray] = []
    for ln in lines:
        c = np.asarray(ln.coords)
        if len(c) < 2:
            continue
        segs.append(np.stack([c[:-1], c[1:]], axis=1))
    if not segs:
        return None, None
    arr = np.concatenate(segs, axis=0)
    idx = np.repeat(np.arange(len(arr)), 2)
    geoms = shapely.linestrings(arr.reshape(-1, 2), indices=idx)
    return shapely.STRtree(geoms), geoms


def nearest_boundary_distance(points: np.ndarray, geom_obj, step: float) -> np.ndarray:
    """Distance from each point to the nearest point on `geom_obj`'s boundary."""
    out = np.full(len(points), np.inf)
    if len(points) == 0:
        return out
    tree, _ = _boundary_index(geom_obj, step)
    if tree is None:
        return out
    pts = shapely.points(points)
    hits, dist = tree.query_nearest(pts, all_matches=False, return_distance=True)
    # scatter rather than assume every input got a hit: an empty tree branch or a
    # degenerate point would silently shift the whole array otherwise.
    out[hits[0]] = dist
    return out


def boundary_distances(a, b, step: float) -> tuple[float, float]:
    """Symmetric nearest-distance error between two region boundaries.

    Median and P95 over the union of both directions. Never max: max is
    explicit that one pathological point dominates a maximum.
    """
    pa = _boundary_points(a, step)
    pb = _boundary_points(b, step)
    if len(pa) == 0 or len(pb) == 0:
        return (float("inf"), float("inf"))
    da = nearest_boundary_distance(pa, b, step)
    db = nearest_boundary_distance(pb, a, step)
    allv = np.concatenate([da, db])
    return (float(np.median(allv)), float(np.percentile(allv, 95)))


def width_error(graph, source_poly, *, sample_step: float) -> tuple[float, float]:
    """How well the assigned radius matches the source's true local half-width.

    For every centerline vertex inside the source region, the true half-width is
    the distance from that point to the source boundary. Compared against the
    radius the backend assigned there. Returns (median abs error, length-weighted CV).
    """
    pts: list[tuple[float, float]] = []
    assigned: list[float] = []
    for e in graph.edges.values():
        radii = e.radii()
        if not radii:
            continue
        acc = 0.0
        cum = geom.cumulative_lengths(e.points)
        for i, p in enumerate(e.points):
            if i > 0 and cum[i] - acc < sample_step:
                continue
            acc = cum[i]
            pts.append(p)
            assigned.append(radii[min(i, len(radii) - 1)])
    if not pts:
        return (0.0, 0.0)
    arr = np.asarray(pts)
    sp = shapely.points(arr)
    inside = shapely.contains(source_poly, sp)
    dist = nearest_boundary_distance(arr, source_poly, sample_step)
    a = np.asarray(assigned)
    if inside.any():
        err = np.abs(a[inside] - dist[inside])
        med = float(np.median(err))
    else:
        med = float("inf")

    # length-weighted coefficient of variation of radius across the graph
    tot = sum(e.length for e in graph.edges.values()) or 1.0
    mean_r = sum((e.median_radius or 0.0) * e.length for e in graph.edges.values()) / tot
    if mean_r <= 0:
        return (med, 0.0)
    var = sum(
        ((e.median_radius or 0.0) - mean_r) ** 2 * e.length for e in graph.edges.values()
    ) / tot
    return (med, float(math.sqrt(var) / mean_r))


def _densify(lines, sample: float) -> np.ndarray:
    """Uniformly resample a set of polylines so nearest-point stats are unbiased."""
    out = []
    for line in lines:
        arr = np.asarray(line, dtype=float)
        if len(arr) < 2:
            if len(arr):
                out.append(arr.reshape(-1, 2))
            continue
        seg = np.hypot(*np.diff(arr, axis=0).T)
        s = np.r_[0.0, np.cumsum(seg)]
        if s[-1] <= 0:
            continue
        n = max(2, int(s[-1] / max(sample, 1e-9)))
        t = np.linspace(0.0, s[-1], n)
        out.append(np.column_stack([np.interp(t, s, arr[:, 0]),
                                    np.interp(t, s, arr[:, 1])]))
    return np.vstack(out) if out else np.zeros((0, 2))


def centerline_error(graph, truth, *, sample: float = 0.5) -> dict:
    """Two-way nearest-distance error against KNOWN centerlines. Synthetic only.

    This is the measurement that distinguishes centerline error from
    reconstruction error:
    everything else in this layer is *reconstruction* error, which cannot tell a
    smooth path in the wrong place from a smooth path in the right one. It needs
    ground truth, so it only applies to a corpus that was generated from known
    centerlines — never to the ten real drawings.

    The two directions answer different questions and must not be averaged away:
    `recoveredToTruth` is invented geometry (spurious branches), `truthToRecovered`
    is missed geometry (over-pruning). A pruning sweep trades one for the other,
    so a single blended number would hide exactly what is being decided.

    Both directions have a noise floor of roughly `sample / 2`: the two point sets
    are densified independently and need not land on each other, so a perfectly
    recovered centerline reads as ~0.25 units at the default step, not 0.
    """
    got = _densify([e.points for e in graph.edges.values() if len(e.points) >= 2], sample)
    want = _densify(truth, sample)
    if len(got) == 0 or len(want) == 0:
        return {"centerlineMedian": None, "centerlineP95": None,
                "centerlineHausdorff": None, "recoveredToTruthP95": None,
                "truthToRecoveredP95": None}
    got_pts, want_pts = shapely.points(got), shapely.points(want)
    _, d1 = shapely.STRtree(want_pts).query_nearest(
        got_pts, all_matches=False, return_distance=True)
    _, d2 = shapely.STRtree(got_pts).query_nearest(
        want_pts, all_matches=False, return_distance=True)
    both = np.concatenate([d1, d2])
    return {
        "centerlineMedian": float(np.median(both)),
        "centerlineP95": float(np.percentile(both, 95)),
        "centerlineHausdorff": float(max(d1.max(), d2.max())),
        "recoveredToTruthP95": float(np.percentile(d1, 95)),
        "truthToRecoveredP95": float(np.percentile(d2, 95)),
    }


def score_graph(
    graph,
    source,
    *,
    width_mode: str = "auto",
    recon=None,
) -> ReconMetrics:
    """Full vector-space reconstruction score for one graph against one drawing."""
    import time

    t0 = time.time()
    src_poly = source.polygon if hasattr(source, "polygon") else source
    if recon is None:
        recon = restroke.graph_to_fill(graph, width_mode=width_mode)

    m = ReconMetrics(width_mode=width_mode)
    stats = graph.stats()
    m.strokes = stats["strokes"]
    m.edges = stats["edges"]
    m.nodes = stats["nodes"]
    m.terminals = stats["terminals"]
    m.junctions = stats["junctions"]
    m.control_points = stats["controlPoints"]
    m.bezier_segments = stats["bezierSegments"]
    m.total_length = stats["totalLength"]
    m.global_radius = stats["globalRadius"]

    src_area = restroke.area_of(src_poly)
    rec_area = restroke.area_of(recon)
    m.source_area = src_area
    m.recon_area = rec_area
    if src_area <= 0:
        return m
    if rec_area <= 0:
        m.sym_diff_ratio = 1.0
        m.missing_ratio = 1.0
        m.boundary_median = m.boundary_p95 = float("inf")
        m.seconds = time.time() - t0
        return m

    inter = src_poly.intersection(recon)
    union = src_poly.union(recon)
    m.iou = restroke.area_of(inter) / max(restroke.area_of(union), 1e-12)
    missing = restroke.area_of(src_poly.difference(recon))
    extra = restroke.area_of(recon.difference(src_poly))
    m.sym_diff_area = missing + extra
    m.sym_diff_ratio = m.sym_diff_area / src_area
    m.missing_ratio = missing / src_area
    m.extra_ratio = extra / src_area

    r_glob = m.global_radius or _source_scale(src_poly)
    step = max(r_glob * BOUNDARY_STEP_FRAC, 0.25)
    m.boundary_median, m.boundary_p95 = boundary_distances(src_poly, recon, step)
    if r_glob > 0:
        m.boundary_median_norm = m.boundary_median / r_glob
        m.boundary_p95_norm = m.boundary_p95 / r_glob

    m.width_error_median, m.width_cv = width_error(graph, src_poly, sample_step=step * 2)
    if r_glob > 0 and math.isfinite(m.width_error_median):
        m.width_error_norm = m.width_error_median / r_glob
    m.seconds = time.time() - t0
    return m


def _source_scale(poly) -> float:
    """Fallback dominant-radius estimate when the graph carries no radii at all."""
    if poly.is_empty:
        return 1.0
    return max(poly.area / max(poly.length, 1e-9), 1e-6) * 2.0


# ---------------------------------------------------------------- raster arm


def load_metrics(path: str | Path) -> dict:
    return json.loads(Path(path).read_text())


def _write_silhouette_svg(geom_obj, view_box, path) -> str:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    d = svgio.polygon_to_path_d(geom_obj)
    vb = view_box
    p.write_text(
        '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
        f'viewBox="{vb[0]:.2f} {vb[1]:.2f} {vb[2]:.2f} {vb[3]:.2f}">'
        f'<path d="{d}" fill="#000000" fill-rule="evenodd"/></svg>'
    )
    return str(p)


def raster_ink_diff(
    graph,
    source,
    *,
    size: int | None = None,
    scale: float = 1.0,
    workdir: str | Path | None = None,
) -> dict | None:
    """Colour-independent raster cross-check of the vector score.

    This renders both the source fill and the re-stroked reconstruction as black
    silhouettes at the drawing's own resolution and reports the differing-ink
    fraction of source ink — the direct raster analogue of `sym_diff_ratio`.

    Any gap between the two is rasterization: quantization plus antialiasing at
    the boundary. That gap is the number to quote when vector and raster scoring
    are said to agree or disagree.
    """
    import numpy as np
    from PIL import Image

    vb = source.view_box
    if size is None:
        size = int(round(max(vb[2], vb[3]) * scale))
    size = max(64, min(size, 4096))

    tmpdir = Path(workdir) if workdir else Path(tempfile.mkdtemp(prefix="clg-raster-"))
    tmpdir.mkdir(parents=True, exist_ok=True)
    src_svg = _write_silhouette_svg(source.polygon, vb, tmpdir / "source.svg")
    rec = restroke.graph_to_fill(graph)
    if rec.is_empty:
        return None
    rec_svg = _write_silhouette_svg(rec, vb, tmpdir / "recon.svg")

    jobs = [
        {"svg": src_svg, "png": str(tmpdir / "source.png"), "width": size},
        {"svg": rec_svg, "png": str(tmpdir / "recon.png"), "width": size},
    ]
    spec = tmpdir / "jobs.json"
    spec.write_text(json.dumps(jobs))
    out = subprocess.run(
        ["node", str(CAPABILITY_ROOT / "raster-agreement-render-bridge.mjs"), str(spec)],
        capture_output=True, text=True, cwd=CAPABILITY_ROOT, timeout=600,
    )
    if out.returncode != 0:
        raise RuntimeError(f"raster-agreement render failed: {out.stderr[:2000]}")
    try:
        a = np.asarray(Image.open(tmpdir / "source.png").convert("L")) < 128
        b = np.asarray(Image.open(tmpdir / "recon.png").convert("L")) < 128
    except Exception as error:
        raise RuntimeError(f"raster-agreement output decode failed: {error}") from error
    if a.shape != b.shape:
        raise RuntimeError(f"raster-agreement shape mismatch: {a.shape} != {b.shape}")
    src_ink = int(a.sum())
    if src_ink == 0:
        return None
    missing = int((a & ~b).sum())
    extra = int((b & ~a).sum())
    inter = int((a & b).sum())
    union = int((a | b).sum())
    return {
        "size": size,
        "sourceInkPx": src_ink,
        "symDiffRatio": (missing + extra) / src_ink,
        "missingRatio": missing / src_ink,
        "extraRatio": extra / src_ink,
        "iou": inter / max(union, 1),
    }
