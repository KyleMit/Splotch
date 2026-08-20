"""Bézier fitting + stroked-SVG emission for this pipeline."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

import numpy as np

from .graphmodel import CenterlineGraph

HERE = Path(__file__).resolve().parent
CAPABILITY_ROOT = HERE.parents[2]
FIT_JS = CAPABILITY_ROOT / "fit-curve-bridge.mjs"


def width_runs(radii: np.ndarray, points: np.ndarray, tol: float,
               min_len: float) -> list[tuple[int, int]]:
    """Split an edge into contiguous runs of near-constant radius.

    SVG cannot vary `stroke-width` along one path, so a tapered stroke can only
    be reproduced by emitting several constant-width sub-paths.  The retained
    distance field is exactly what makes this possible — this is the payoff of
    `return_distance=True` at the *emission* stage rather than the pruning one.
    """
    n = len(radii)
    if n < 3:
        return [(0, n - 1)]
    seg = np.hypot(*np.diff(points, axis=0).T)
    s = np.r_[0.0, np.cumsum(seg)]
    runs: list[tuple[int, int]] = []
    start = 0
    lo = hi = float(radii[0])
    for i in range(1, n):
        r = float(radii[i])
        nlo, nhi = min(lo, r), max(hi, r)
        mid = 0.5 * (nlo + nhi)
        if mid > 0 and (nhi - nlo) / mid > tol and (s[i] - s[start]) >= min_len:
            runs.append((start, i))
            start = i
            lo = hi = r
        else:
            lo, hi = nlo, nhi
    if start < n - 1:
        if runs and (s[n - 1] - s[start]) < min_len:
            runs[-1] = (runs[-1][0], n - 1)     # absorb a too-short tail
        else:
            runs.append((start, n - 1))
    return runs or [(0, n - 1)]


def fit_beziers(graph: CenterlineGraph, error_frac: float = 0.06,
                error_floor: float = 0.25, error_ceiling: float = 3.0,
                width_mode: str = "constant", width_tol: float = 0.18) -> int:
    """Fit cubics to every edge in place.  Tolerance scales with local radius.

    A fat stroke tolerates more fitting error than a thin one for the same
    visual result, so the tolerance is a fraction of the median radius rather
    than an absolute number of user units.

    In `width_mode="piecewise"` each edge is first split into near-constant
    radius runs and each run is fitted (and later stroked) separately.
    """
    jobs = []
    for edge in graph.edges:
        if len(edge.geometry) < 2:
            continue
        r = edge.medianRadius or 1.0
        err = float(np.clip(error_frac * 2 * r, error_floor, error_ceiling))
        pts = list(edge.fitPoints or edge.geometry)
        corners = list(edge.fitCorners if edge.fitPoints else edge.corners)
        radii = list(edge.fitRadii if edge.fitPoints else edge.radii)
        if edge.closed and (pts[0] != pts[-1]):
            pts = pts + [pts[0]]
            radii = radii + radii[:1]
        edge.widthRuns = []
        if width_mode == "piecewise" and len(radii) == len(pts) and len(pts) >= 3:
            spans = width_runs(np.asarray(radii), np.asarray(pts), width_tol,
                               min_len=max(1.0, r))
        else:
            spans = [(0, len(pts) - 1)]
        for k, (a, b) in enumerate(spans):
            sub = pts[a:b + 1]
            if len(sub) < 2:
                continue
            sub_corners = [c - a for c in corners if a < c < b]
            jobs.append({"id": f"{edge.id}#{k}", "points": sub, "corners": sub_corners,
                         "error": err, "closed": edge.closed and len(spans) == 1,
                         "_edge": edge.id,
                         "_radius": float(np.median(radii[a:b + 1])) if radii else r})
    if not jobs:
        return 0
    payload = {"jobs": [{k: v for k, v in j.items() if not k.startswith("_")}
                        for j in jobs]}
    proc = subprocess.run(
        ["node", str(FIT_JS)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        cwd=CAPABILITY_ROOT,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"fit-curve failed: {proc.stderr[:2000]}")
    by_id = {r["id"]: r["beziers"] for r in json.loads(proc.stdout)["results"]}
    edges = {e.id: e for e in graph.edges}
    for e in graph.edges:
        e.beziers = []
    total = 0
    for job in jobs:
        edge = edges[job["_edge"]]
        beziers = by_id.get(job["id"], [])
        if not beziers:
            continue
        edge.widthRuns.append({
            "bezierStart": len(edge.beziers),
            "bezierCount": len(beziers),
            "radius": job["_radius"],
        })
        edge.beziers.extend(beziers)
        total += len(beziers)
    return total


def _fmt(v: float) -> str:
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return s if s not in ("", "-0") else "0"


def bezier_path_d(beziers: list[list[list[float]]], closed: bool) -> str:
    if not beziers:
        return ""
    parts = [f"M{_fmt(beziers[0][0][0])},{_fmt(beziers[0][0][1])}"]
    prev_end = beziers[0][0]
    for b in beziers:
        p0, c1, c2, p3 = b
        if abs(p0[0] - prev_end[0]) > 1e-6 or abs(p0[1] - prev_end[1]) > 1e-6:
            parts.append(f"M{_fmt(p0[0])},{_fmt(p0[1])}")
        parts.append(
            f"C{_fmt(c1[0])},{_fmt(c1[1])} {_fmt(c2[0])},{_fmt(c2[1])} "
            f"{_fmt(p3[0])},{_fmt(p3[1])}"
        )
        prev_end = p3
    if closed:
        parts.append("Z")
    return "".join(parts)


def polyline_path_d(points: list[list[float]], closed: bool) -> str:
    if len(points) < 2:
        return ""
    d = "M" + " L".join(f"{_fmt(x)},{_fmt(y)}" for x, y in points)
    return d + ("Z" if closed else "")


def stroked_svg(graph: CenterlineGraph, fills: dict[str, str],
                use_beziers: bool = True,
                min_width: float = 0.0, max_width: float = 1e9,
                width_scale: float = 1.0, piecewise: bool = False) -> str:
    x, y, w, h = graph.viewBox
    out = [
        '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
        f'viewBox="{_fmt(x)} {_fmt(y)} {_fmt(w)} {_fmt(h)}">',
    ]

    # Grouped by colour so fill/linecap/linejoin/stroke are written once per
    # group instead of once per path — pure file-size hygiene, no geometry
    # change, and it matters because piecewise width multiplies the path count.
    groups: dict[str, list[str]] = {}

    def add(d: str, radius: float, colour: str) -> None:
        width = float(np.clip(2.0 * radius * width_scale, min_width, max_width))
        groups.setdefault(colour, []).append(f'<path d="{d}" stroke-width="{_fmt(width)}"/>')

    for edge in graph.edges:
        colour = fills.get(edge.sourceElementId or "", "#000000")
        if piecewise and use_beziers and len(edge.widthRuns) > 1:
            for run in edge.widthRuns:
                start = int(run["bezierStart"])
                sub = edge.beziers[start:start + int(run["bezierCount"])]
                d = bezier_path_d(sub, False)
                if d:
                    add(d, float(run["radius"]), colour)
            continue
        d = (bezier_path_d(edge.beziers, edge.closed) if use_beziers
             else polyline_path_d(edge.geometry, edge.closed))
        if d:
            add(d, edge.medianRadius or 0.5, colour)

    for colour, paths in groups.items():
        out.append(f'<g fill="none" stroke="{colour}" stroke-linecap="round" '
                   f'stroke-linejoin="round">')
        out.extend(paths)
        out.append("</g>")
    out.append("</svg>")
    return "\n".join(out) + "\n"


def bezier_segment_count(graph: CenterlineGraph) -> int:
    return int(sum(len(e.beziers) for e in graph.edges))


def control_point_count(graph: CenterlineGraph) -> int:
    return int(sum(len(e.beziers) * 3 + 1 for e in graph.edges if e.beziers))
