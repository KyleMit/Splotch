"""Synthetic ground-truth corpus, cases 1-20.

Every case is built by *stroking a known centerline* into a filled polygon with
Shapely, so the true answer is retained alongside the shape.  Shapely's
buffer() gives exact control of cap and join style, which is what cases 7-12
need.

Output:
    runs/corpus/<nn>-<name>.svg      filled shape, one <path> per element
    runs/corpus/corpus.json          ground truth
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from shapely import affinity
from shapely.geometry import LineString, MultiPolygon, Polygon
from shapely.ops import unary_union

REPO = Path(__file__).resolve().parent.parent.parent
OUT = REPO / "runs" / "corpus"

W, H = 300.0, 200.0
R = 10.0          # nominal stroke radius for most cases
FILL = "#333333"
RNG = np.random.default_rng(20260807)

CAP = {"round": 1, "flat": 2, "square": 3}
JOIN = {"round": 1, "mitre": 2, "bevel": 3}


def _poly_to_d(geom) -> str:
    polys = geom.geoms if isinstance(geom, MultiPolygon) else [geom]
    parts = []
    for poly in polys:
        for ring in [poly.exterior, *poly.interiors]:
            coords = list(ring.coords)
            parts.append("M " + " L ".join(f"{x:.4f},{y:.4f}" for x, y in coords[:-1]) + " Z")
    return " ".join(parts)


def _sample(fn, t0, t1, n=400):
    return [fn(t) for t in np.linspace(t0, t1, n)]


def _arc(cx, cy, r, a0, a1, n=400):
    return _sample(lambda t: (cx + r * math.cos(t), cy + r * math.sin(t)),
                   math.radians(a0), math.radians(a1), n)


def _bezier(p0, p1, p2, p3, n=400):
    def at(t):
        u = 1 - t
        return (u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
                u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1])
    return _sample(at, 0.0, 1.0, n)


def stroke(points, radius=R, cap="round", join="round", mitre_limit=8.0) -> Polygon:
    return LineString(points).buffer(
        radius, resolution=32, cap_style=CAP[cap], join_style=JOIN[join], mitre_limit=mitre_limit
    )


def variable_stroke(points, r0, r1) -> Polygon:
    pts = np.asarray(points, float)
    d = np.r_[0.0, np.cumsum(np.hypot(*np.diff(pts, axis=0).T))]
    t = d / d[-1]
    discs = [
        LineString([p, p]).buffer(r0 + (r1 - r0) * ti, resolution=32)
        for p, ti in zip(pts, t)
    ]
    # connect consecutive discs with their convex hulls so the shape is solid
    solids = [discs[i].union(discs[i + 1]).convex_hull for i in range(len(discs) - 1)]
    return unary_union(solids)


def noisy(poly: Polygon, amp=0.9) -> Polygon:
    """Perturb boundary vertices — mimics a shape that came from a vectorizer."""
    ring = np.asarray(poly.exterior.coords)[:-1]
    keep = ring[:: max(1, len(ring) // 260)]
    noise = RNG.normal(0.0, amp, size=keep.shape)
    out = Polygon(keep + noise)
    return out.buffer(0)


def build() -> list[dict]:
    cases: list[dict] = []

    def add(num, name, elements, truth, notes="", radius=R):
        cases.append({
            "num": num, "name": name, "id": f"{num:02d}-{name}",
            "elements": elements, "truth": truth, "notes": notes, "radius": radius,
        })

    line_h = [(50.0, 100.0), (250.0, 100.0)]
    add(1, "horizontal-line", [stroke(line_h)], [line_h], "capsule; MAT must be the segment")

    line_d = [(50.0, 50.0), (250.0, 150.0)]
    add(2, "diagonal-line", [stroke(line_d)], [line_d], "tests raster staircase bias")

    arc = _arc(150, 190, 110, 200, 340)
    add(3, "circular-arc", [stroke(arc)], [arc], "constant curvature")

    s_curve = _bezier((45, 150), (110, 20), (190, 180), (255, 50))
    add(4, "s-curve", [stroke(s_curve)], [s_curve], "inflection")

    u_curve = _arc(150, 80, 32, 180, 360)
    add(5, "tight-u", [stroke(u_curve)], [u_curve], "curvature radius ~3x stroke radius")

    loop = _arc(150, 100, 62, 0, 360)
    add(6, "closed-loop", [stroke(loop)], [loop], "no endpoints; cyclic branch")

    short = [(80.0, 100.0), (220.0, 100.0)]
    add(7, "round-cap", [stroke(short, cap="round")], [short], "MAT should reach the true ends")
    add(8, "butt-cap", [stroke(short, cap="flat")], [short], "expect MAT retraction by ~R")
    add(9, "square-cap", [stroke(short, cap="square")], [short], "expect corner spurs at both ends")

    corner = [(60.0, 60.0), (170.0, 60.0), (170.0, 160.0)]
    add(10, "round-join", [stroke(corner, join="round")], [corner])
    add(11, "bevel-join", [stroke(corner, join="bevel")], [corner])
    add(12, "miter-join", [stroke(corner, join="mitre")], [corner])

    x1 = [(60.0, 50.0), (240.0, 150.0)]
    x2 = [(60.0, 150.0), (240.0, 50.0)]
    add(13, "x-separate", [stroke(x1), stroke(x2)], [x1, x2], "two elements; each MAT is clean")
    add(14, "x-union", [unary_union([stroke(x1), stroke(x2)])], [x1, x2],
        "degree-4 node: crossing ambiguity")

    t_stem = [(150.0, 40.0), (150.0, 150.0)]
    t_bar = [(60.0, 150.0), (240.0, 150.0)]
    add(15, "t-junction", [unary_union([stroke(t_stem), stroke(t_bar)])], [t_stem, t_bar])

    y_c = (150.0, 120.0)
    y_legs = [[y_c, (60.0, 40.0)], [y_c, (240.0, 40.0)], [y_c, (150.0, 190.0)]]
    add(16, "y-junction", [unary_union([stroke(l) for l in y_legs])], y_legs)

    gap = 2.0
    p1 = [(50.0, 100.0 - R - gap / 2), (250.0, 100.0 - R - gap / 2)]
    p2 = [(50.0, 100.0 + R + gap / 2), (250.0, 100.0 + R + gap / 2)]
    add(17, "near-parallel", [stroke(p1), stroke(p2)], [p1, p2],
        f"{gap}-unit gap; low raster scale will fuse them")

    hook = _bezier((70, 150), (240, 150), (200, 40), (120, 105)) + _bezier(
        (120, 105), (100, 118), (95, 130), (105, 145))[1:]
    add(18, "self-overlap", [stroke(hook)], [hook], "path doubles back over itself")

    var_line = [(50.0, 100.0), (250.0, 100.0)]
    add(19, "variable-width", [variable_stroke(var_line, 6.0, 16.0)], [var_line],
        "radius 6 -> 16; tests width recovery", radius=11.0)

    add(20, "noisy-boundary", [noisy(stroke(line_h))], [line_h],
        "vectorizer-like boundary jitter; spawns spurious branches")

    return cases


def write(cases: list[dict]) -> dict:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {"viewBox": [0, 0, W, H], "fill": FILL, "cases": []}
    for case in cases:
        paths = "".join(
            f'<path d="{_poly_to_d(g)}" fill="{FILL}" fill-rule="evenodd"/>' for g in case["elements"]
        )
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
            f'viewBox="0 0 {W:g} {H:g}" width="{W:g}" height="{H:g}">{paths}</svg>\n'
        )
        (OUT / f"{case['id']}.svg").write_text(svg)
        manifest["cases"].append({
            "id": case["id"],
            "num": case["num"],
            "name": case["name"],
            "svg": f"runs/corpus/{case['id']}.svg",
            "notes": case["notes"],
            "radius": case["radius"],
            "n_elements": len(case["elements"]),
            "area": float(sum(g.area for g in case["elements"])),
            "truth": [[[round(float(x), 4), round(float(y), 4)] for x, y in line]
                      for line in case["truth"]],
        })
    (OUT / "corpus.json").write_text(json.dumps(manifest, indent=1))
    return manifest


if __name__ == "__main__":
    m = write(build())
    print(f"wrote {len(m['cases'])} cases to {OUT}")
