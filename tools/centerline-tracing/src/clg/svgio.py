"""SVG <-> Shapely: read the source fill, write a stroked centerline SVG.

Vector-space scoring needs the ORIGINAL filled region as a polygon. That means
parsing the SVG, resolving transforms, flattening curves, and getting holes right.
Invalid polygons are the classic silent failure here, so everything is checked and
repaired, and the repairs are reported rather than hidden.
"""

from __future__ import annotations

import math
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path as FsPath
from typing import Any

import numpy as np
from shapely.geometry import LineString, MultiPolygon, Polygon
from shapely.geometry.polygon import orient
from shapely.ops import polygonize, unary_union

# Flattening tolerance for source curves, in user units. The strokes we score are
# 10-40 units wide, so 0.05 is far below anything visible.
FLATTEN_TOL = 0.05
_MIN_SAMPLES = 4
_MAX_SAMPLES = 400


@dataclass
class SourceElement:
    id: str
    polygon: Polygon | MultiPolygon
    fill: str | None = None


@dataclass
class SourceDrawing:
    path: str
    view_box: list[float]
    elements: list[SourceElement] = field(default_factory=list)
    skipped_stroked: int = 0
    repaired: int = 0
    meta: dict[str, Any] = field(default_factory=dict)

    @property
    def polygon(self):
        """Union of every filled element: the source ink to score against."""
        if not self.elements:
            return Polygon()
        return unary_union([e.polygon for e in self.elements])

    def by_element(self) -> dict[str, Polygon | MultiPolygon]:
        return {e.id: e.polygon for e in self.elements}


def _seg_samples(seg) -> int:
    try:
        n = int(math.ceil(seg.length(error=1e-3) / max(FLATTEN_TOL * 8, 1e-6)))
    except Exception:  # noqa: BLE001 - some segment types have no length()
        n = 32
    return max(_MIN_SAMPLES, min(_MAX_SAMPLES, n))


def _rings_from_path(path) -> list[list[tuple[float, float]]]:
    """Flatten an svgelements Path into closed rings (one per subpath)."""
    from svgelements import Close, Line, Move

    rings: list[list[tuple[float, float]]] = []
    cur: list[tuple[float, float]] = []
    for seg in path:
        if isinstance(seg, Move):
            if len(cur) >= 3:
                rings.append(cur)
            cur = []
            if seg.end is not None:
                cur.append((float(seg.end.x), float(seg.end.y)))
            continue
        if seg.start is None or seg.end is None:
            continue
        if not cur:
            cur.append((float(seg.start.x), float(seg.start.y)))
        if isinstance(seg, (Line, Close)):
            cur.append((float(seg.end.x), float(seg.end.y)))
        else:
            n = _seg_samples(seg)
            for i in range(1, n + 1):
                p = seg.point(i / n)
                cur.append((float(p.x), float(p.y)))
    if len(cur) >= 3:
        rings.append(cur)
    return rings


def _winding_numbers(pts: np.ndarray, rings: list[np.ndarray]) -> np.ndarray:
    """Signed winding number of each point with respect to all rings.

    Standard crossing-count winding algorithm, vectorized over the query points.
    """
    wn = np.zeros(len(pts), dtype=np.int64)
    px, py = pts[:, 0], pts[:, 1]
    for ring in rings:
        x0, y0 = ring[:-1, 0], ring[:-1, 1]
        x1, y1 = ring[1:, 0], ring[1:, 1]
        for i in range(len(x0)):
            ax, ay, bx, by = x0[i], y0[i], x1[i], y1[i]
            if ay == by:
                continue
            # side > 0 means the point is left of the directed edge a->b
            side = (bx - ax) * (py - ay) - (px - ax) * (by - ay)
            up = (ay <= py) & (by > py) & (side > 0)
            down = (ay > py) & (by <= py) & (side < 0)
            wn += up.astype(np.int64) - down.astype(np.int64)
    return wn


def _polygon_from_rings(
    rings: list[list[tuple[float, float]]], fill_rule: str = "nonzero"
) -> Polygon | MultiPolygon | None:
    """Assemble rings into a polygon honouring the SVG fill rule.

    Naive approaches get this wrong in ways that silently inflate the source area
    — measured at +25% on house-wide.svg, which would have made every backend look
    like it was under-covering. Two cases must both work:

      * nested subpaths (an inner ring is a hole);
      * a SINGLE self-intersecting ring (a scribble), where the enclosed lobes are
        holes under even-odd and filled under nonzero.

    The only correct general method is to node the rings, polygonize the
    arrangement, and classify each resulting face by winding number (nonzero) or
    crossing parity (even-odd) — exactly what a renderer does.
    """
    closed: list[np.ndarray] = []
    for r in rings:
        if len(r) < 3:
            continue
        arr = np.asarray(r, dtype=float)
        if not np.allclose(arr[0], arr[-1]):
            arr = np.vstack([arr, arr[0]])
        closed.append(arr)
    if not closed:
        return None

    simple = [Polygon(a) for a in closed]
    if len(closed) == 1 and simple[0].is_valid:
        body = simple[0]                      # fast path: one simple ring
    else:
        try:
            noded = unary_union([LineString(a) for a in closed])
            faces = list(polygonize(noded))
        except Exception:  # noqa: BLE001
            faces = []
        if not faces:
            body = unary_union([p if p.is_valid else p.buffer(0) for p in simple])
        else:
            reps = np.array([[f.representative_point().x, f.representative_point().y]
                             for f in faces])
            wn = _winding_numbers(reps, closed)
            keep = (wn % 2 != 0) if fill_rule == "evenodd" else (wn != 0)
            kept = [f for f, k in zip(faces, keep) if k]
            if not kept:
                return None
            body = unary_union(kept)

    if body.is_empty:
        return None
    if not body.is_valid:
        body = body.buffer(0)
    return body


def _parse_view_box(svg_path: str) -> list[float]:
    root = ET.parse(svg_path).getroot()
    vb = root.get("viewBox")
    if vb:
        parts = [float(v) for v in re.split(r"[,\s]+", vb.strip()) if v]
        if len(parts) == 4:
            return parts
    w = root.get("width")
    h = root.get("height")

    def num(v):
        m = re.match(r"[-+]?[0-9]*\.?[0-9]+", v or "")
        return float(m.group()) if m else 0.0

    return [0.0, 0.0, num(w), num(h)]


def load_source(svg_path: str | FsPath) -> SourceDrawing:
    """Parse an SVG into filled Shapely polygons, one per filled element."""
    from svgelements import SVG, Path, Shape

    svg_path = str(svg_path)
    vb = _parse_view_box(svg_path)
    # width/height forced to the viewBox so user coordinates are preserved exactly:
    # every track serializes graphs in source user units, and a viewport scale here
    # would silently offset every score.
    svg = SVG.parse(svg_path, width=vb[2] or None, height=vb[3] or None, ppi=96.0)

    drawing = SourceDrawing(path=svg_path, view_box=vb)
    auto = 0
    for el in svg.elements():
        if not isinstance(el, Shape):
            continue
        fill = getattr(el, "fill", None)
        fill_str = None
        if fill is not None and getattr(fill, "value", None) is not None:
            fill_str = str(fill)
        if fill_str is None or fill_str == "none":
            # stroked-only element: contributes pixels to a raster compare but has
            # no filled region to recover a centerline from
            if getattr(el, "stroke", None) is not None and getattr(
                getattr(el, "stroke", None), "value", None
            ) is not None:
                drawing.skipped_stroked += 1
            continue
        try:
            path = abs(Path(el))
        except Exception:  # noqa: BLE001
            continue
        rings = _rings_from_path(path)
        rule = str(getattr(el, "values", {}).get("fill-rule", "nonzero")).lower()
        if rule not in ("nonzero", "evenodd"):
            rule = "nonzero"
        poly = _polygon_from_rings(rings, rule)
        if poly is None or poly.is_empty:
            continue
        if not poly.is_valid:
            poly = poly.buffer(0)
            drawing.repaired += 1
        eid = getattr(el, "id", None)
        if not eid:
            auto += 1
            eid = f"el{auto}"
        drawing.elements.append(SourceElement(id=str(eid), polygon=poly, fill=fill_str))
    return drawing


# ------------------------------------------------------------------ writing


def polygon_to_path_d(geom, decimals: int = 3) -> str:
    """Serialize a (Multi)Polygon to SVG path data with even-odd-safe subpaths."""
    parts: list[str] = []
    polys = geom.geoms if isinstance(geom, MultiPolygon) else [geom]
    for poly in polys:
        if poly.is_empty:
            continue
        poly = orient(poly, 1.0)
        for ring in [poly.exterior, *poly.interiors]:
            coords = list(ring.coords)
            if len(coords) < 3:
                continue
            d = " ".join(
                f"{'M' if i == 0 else 'L'} {x:.{decimals}f} {y:.{decimals}f}"
                for i, (x, y) in enumerate(coords[:-1])
            )
            parts.append(d + " Z")
    return " ".join(parts)


def graph_to_svg(
    graph,
    *,
    view_box: list[float] | None = None,
    stroke: str = "#000000",
    background: str | None = None,
    per_edge_color: dict[str, str] | None = None,
    hairline: float | None = None,
) -> str:
    """Render a centerline graph as stroked paths — the deliverable output form.

    `hairline` overrides the stroke width with a fixed thin value, which is what an
    overlay needs: at true stroke width the reconstruction covers the drawing and
    you cannot see where the centerline actually runs.
    """
    vb = view_box or graph.view_box or [0, 0, 1000, 1000]
    out = [
        '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
        f'viewBox="{vb[0]:.2f} {vb[1]:.2f} {vb[2]:.2f} {vb[3]:.2f}">',
    ]
    if background:
        out.append(
            f'<rect x="{vb[0]}" y="{vb[1]}" width="{vb[2]}" height="{vb[3]}" '
            f'fill="{background}"/>'
        )
    for e in graph.edges.values():
        r = e.median_radius or 0.0
        if r <= 0:
            continue
        width = hairline if hairline else 2 * r
        color = (per_edge_color or {}).get(e.id, stroke)
        if e.is_dot():
            x, y = e.points[0]
            out.append(
                f'<circle cx="{x:.3f}" cy="{y:.3f}" r="{width / 2:.3f}" fill="{color}"/>'
            )
            continue
        d = " ".join(
            f"{'M' if i == 0 else 'L'} {x:.3f} {y:.3f}" for i, (x, y) in enumerate(e.points)
        )
        out.append(
            f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width:.3f}" '
            f'stroke-linecap="round" stroke-linejoin="round"/>'
        )
    out.append("</svg>")
    return "\n".join(out)


def write_graph_svg(graph, path: str | FsPath, **kwargs) -> str:
    p = FsPath(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    svg = graph_to_svg(graph, **kwargs)
    p.write_text(svg)
    return str(p)


# ------------------------------------------------- stroked SVG -> graph model


def graph_from_stroked_svg(
    svg_path: str | FsPath,
    *,
    image: str | None = None,
    backend: str | None = None,
    snap: float = 0.75,
):
    """Read an SVG of `fill=none stroke=...` paths back into a centerline graph.

    This is how a finished result gets into the common model — it is what lets the
    incumbent Python pipeline (which only ever emitted an SVG) be scored by exactly
    the same code as every extraction backend, and it works for any track's
    promoted output too.

    Endpoints within `snap` user units of each other become the same node, so
    strokes that meet actually share topology instead of being disconnected.
    """
    from svgelements import SVG, Path, Shape

    from .graph import CenterlineGraph, Edge, Node

    svg_path = str(svg_path)
    vb = _parse_view_box(svg_path)
    svg = SVG.parse(svg_path, width=vb[2] or None, height=vb[3] or None, ppi=96.0)

    g = CenterlineGraph(
        image=image or FsPath(svg_path).stem,
        backend=backend or "incumbent",
        source=svg_path,
        view_box=vb,
        radius_source="declared-stroke-width",
    )

    buckets: dict[tuple[int, int], list[str]] = {}
    counter = {"n": 0, "e": 0}

    def node_for(pt: tuple[float, float]) -> str:
        key = (int(round(pt[0] / snap)), int(round(pt[1] / snap)))
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for nid in buckets.get((key[0] + dx, key[1] + dy), ()):
                    n = g.nodes[nid]
                    if math.hypot(n.x - pt[0], n.y - pt[1]) <= snap:
                        return nid
        counter["n"] += 1
        nid = f"n{counter['n']}"
        g.nodes[nid] = Node(id=nid, x=pt[0], y=pt[1])
        buckets.setdefault(key, []).append(nid)
        return nid

    for el in svg.elements():
        if not isinstance(el, Shape):
            continue
        stroke = getattr(el, "stroke", None)
        if stroke is None or getattr(stroke, "value", None) is None:
            continue
        width = getattr(el, "stroke_width", None)
        try:
            r = float(width) / 2.0
        except (TypeError, ValueError):
            continue
        if r <= 0:
            continue
        try:
            path = abs(Path(el))
        except Exception:  # noqa: BLE001
            continue
        for sub in _polylines_from_path(path):
            pts = _dedupe(sub)
            if len(pts) < 2:
                continue
            counter["e"] += 1
            a, b = node_for(pts[0]), node_for(pts[-1])
            length = sum(
                math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
                for i in range(len(pts) - 1)
            )
            g.edges[f"e{counter['e']}"] = Edge(
                id=f"e{counter['e']}",
                frm=a,
                to=b,
                points=pts,
                length=length,
                median_radius=r,
                radius_profile=[r] * len(pts),
                source_element_id=str(getattr(el, "id", "") or f"stroke{counter['e']}"),
                closed=(a == b and length > 0),
            )
    for nid, node in g.nodes.items():
        rs = [e.median_radius for e in g.incident(nid) if e.median_radius]
        if rs:
            node.radius = sum(rs) / len(rs)
    return g


def _polylines_from_path(path) -> list[list[tuple[float, float]]]:
    """Flatten an svgelements Path into open polylines, split at Move commands."""
    from svgelements import Close, Line, Move

    out: list[list[tuple[float, float]]] = []
    cur: list[tuple[float, float]] = []
    for seg in path:
        if isinstance(seg, Move):
            if len(cur) >= 2:
                out.append(cur)
            cur = []
            if seg.end is not None:
                cur.append((float(seg.end.x), float(seg.end.y)))
            continue
        if seg.start is None or seg.end is None:
            continue
        if not cur:
            cur.append((float(seg.start.x), float(seg.start.y)))
        if isinstance(seg, (Line, Close)):
            cur.append((float(seg.end.x), float(seg.end.y)))
        else:
            n = _seg_samples(seg)
            for i in range(1, n + 1):
                p = seg.point(i / n)
                cur.append((float(p.x), float(p.y)))
    if len(cur) >= 2:
        out.append(cur)
    return out


def _dedupe(pts, eps: float = 1e-9):
    out = []
    for p in pts:
        if not out or abs(out[-1][0] - p[0]) > eps or abs(out[-1][1] - p[1]) > eps:
            out.append(p)
    return out
