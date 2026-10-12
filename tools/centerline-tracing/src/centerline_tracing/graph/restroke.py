"""Re-stroke reconstruction: stroke_to_fill(C, w) in vector space.

Given a centerline graph, rebuild the filled region a pen would have produced by
drawing it, so it can be compared against the original fill. Round caps and round
joins are assumed — that is the pen model the whole project targets.
"""

from __future__ import annotations

from shapely.geometry import LineString, MultiPolygon, Point, Polygon
from shapely.ops import unary_union

from . import geom

# Shapely buffer quadrant segments. 16 keeps a round cap smooth enough that cap
# geometry is not itself a measurable source of error at these stroke widths.
QUAD_SEGS = 16

WIDTH_MODES = ("auto", "median", "variable")


def edge_to_fill(edge, *, width_mode: str = "auto", quad_segs: int = QUAD_SEGS):
    """Buffer one edge into a filled region.

    width_mode "auto" uses the per-vertex radius profile when the backend supplied
    one and it actually varies, else a constant median radius. This is the default
    because a single median is wrong for any edge that spans a width change — and
    canonicalization CREATES such edges by splicing chains, so scoring a merged
    graph at constant width penalizes the merge rather than the geometry.
    """
    r = edge.median_radius
    if edge.is_dot():
        if not r or r <= 0:
            return None
        return Point(edge.points[0]).buffer(r, quad_segs=quad_segs)
    if width_mode in ("variable", "auto"):
        radii = edge.radii()
        if radii and len(radii) == len(edge.points) and len(set(radii)) > 1:
            pieces = []
            for i in range(len(edge.points) - 1):
                a, b = edge.points[i], edge.points[i + 1]
                if a == b:
                    continue
                rr = 0.5 * (radii[i] + radii[i + 1])
                if rr <= 0:
                    continue
                pieces.append(
                    LineString([a, b]).buffer(rr, quad_segs=quad_segs, cap_style=1)
                )
            if pieces:
                return unary_union(pieces)
    if not r or r <= 0:
        return None
    pts = geom.dedupe(edge.points)
    if len(pts) < 2:
        return Point(pts[0]).buffer(r, quad_segs=quad_segs) if pts else None
    return LineString(pts).buffer(r, quad_segs=quad_segs, cap_style=1, join_style=1)


def graph_to_fill(graph, *, width_mode: str = "auto", quad_segs: int = QUAD_SEGS):
    """S_reconstructed for the whole graph."""
    parts = []
    for e in graph.edges.values():
        f = edge_to_fill(e, width_mode=width_mode, quad_segs=quad_segs)
        if f is not None and not f.is_empty:
            parts.append(f)
    if not parts:
        return Polygon()
    out = unary_union(parts)
    if not out.is_valid:
        out = out.buffer(0)
    return out


def fill_by_element(graph, *, width_mode: str = "auto"):
    """S_reconstructed grouped by sourceElementId, for per-element scoring."""
    groups: dict[str, list] = {}
    for e in graph.edges.values():
        f = edge_to_fill(e, width_mode=width_mode)
        if f is None or f.is_empty:
            continue
        groups.setdefault(e.source_element_id or "", []).append(f)
    return {k: unary_union(v) for k, v in groups.items()}


def area_of(geom_obj) -> float:
    if geom_obj is None or geom_obj.is_empty:
        return 0.0
    if isinstance(geom_obj, (Polygon, MultiPolygon)):
        return float(geom_obj.area)
    return float(getattr(geom_obj, "area", 0.0))
