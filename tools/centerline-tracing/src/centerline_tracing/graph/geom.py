"""Small geometry helpers: bezier flattening, resampling, tangents."""

from __future__ import annotations

import math

Point = tuple[float, float]


def cubic_point(seg, t: float) -> Point:
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = (
        (float(p[0]), float(p[1])) for p in seg[:4]
    )
    mt = 1.0 - t
    a, b, c, d = mt * mt * mt, 3 * mt * mt * t, 3 * mt * t * t, t * t * t
    return (a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3)


def flatten_cubic(seg, tol: float = 0.05, max_depth: int = 16) -> list[Point]:
    """Adaptive flattening of one cubic segment; returns points excluding the start."""
    pts: list[Point] = []

    def rec(t0: float, t1: float, p0: Point, p1: Point, depth: int) -> None:
        tm = 0.5 * (t0 + t1)
        pm = cubic_point(seg, tm)
        # distance from the true midpoint to the chord
        dx, dy = p1[0] - p0[0], p1[1] - p0[1]
        chord = math.hypot(dx, dy)
        if chord < 1e-12:
            dev = math.hypot(pm[0] - p0[0], pm[1] - p0[1])
        else:
            dev = abs(dx * (p0[1] - pm[1]) - dy * (p0[0] - pm[0])) / chord
        if depth >= max_depth or dev <= tol:
            pts.append(p1)
            return
        rec(t0, tm, p0, pm, depth + 1)
        rec(tm, t1, pm, p1, depth + 1)

    p0 = cubic_point(seg, 0.0)
    p1 = cubic_point(seg, 1.0)
    rec(0.0, 1.0, p0, p1, 0)
    return pts


def flatten_beziers(segments, tol: float = 0.05) -> list[Point]:
    """Flatten a list of cubic segments (each 4 control points) to a polyline."""
    out: list[Point] = []
    for seg in segments:
        if len(seg) < 4:
            # degenerate: treat as a polyline of whatever control points exist
            for p in seg:
                q = (float(p[0]), float(p[1]))
                if not out or _far(out[-1], q):
                    out.append(q)
            continue
        start = cubic_point(seg, 0.0)
        if not out or _far(out[-1], start):
            out.append(start)
        out.extend(flatten_cubic(seg, tol))
    return dedupe(out)


def _far(a: Point, b: Point, eps: float = 1e-9) -> bool:
    return abs(a[0] - b[0]) > eps or abs(a[1] - b[1]) > eps


def dedupe(pts: list[Point], eps: float = 1e-9) -> list[Point]:
    out: list[Point] = []
    for p in pts:
        if not out or _far(out[-1], p, eps):
            out.append(p)
    return out


def polyline_length(pts: list[Point]) -> float:
    return sum(
        math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
        for i in range(len(pts) - 1)
    )


def cumulative_lengths(pts: list[Point]) -> list[float]:
    acc = [0.0]
    for i in range(len(pts) - 1):
        acc.append(acc[-1] + math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]))
    return acc


def resample_profile(profile: list[float], n: int) -> list[float]:
    """Linearly resample a per-vertex scalar profile to n samples."""
    if not profile:
        return []
    if n <= 0:
        return []
    if len(profile) == 1:
        return [float(profile[0])] * n
    if n == 1:
        return [float(profile[len(profile) // 2])]
    out = []
    for i in range(n):
        t = i * (len(profile) - 1) / (n - 1)
        lo = int(math.floor(t))
        hi = min(lo + 1, len(profile) - 1)
        f = t - lo
        out.append(float(profile[lo]) * (1 - f) + float(profile[hi]) * f)
    return out


def tangent_at_start(pts: list[Point], span: float) -> Point | None:
    """Unit tangent leaving pts[0], averaged over roughly `span` arc length."""
    return _tangent(pts, span)


def tangent_at_end(pts: list[Point], span: float) -> Point | None:
    """Unit tangent leaving pts[-1] (i.e. pointing back along the branch)."""
    return _tangent(list(reversed(pts)), span)


def _tangent(pts: list[Point], span: float) -> Point | None:
    if len(pts) < 2:
        return None
    x0, y0 = pts[0]
    acc = 0.0
    tip = pts[-1]
    for i in range(len(pts) - 1):
        acc += math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
        if acc >= span:
            tip = pts[i + 1]
            break
    dx, dy = tip[0] - x0, tip[1] - y0
    n = math.hypot(dx, dy)
    if n < 1e-12:
        return None
    return (dx / n, dy / n)


def median(vals) -> float:
    v = sorted(float(x) for x in vals)
    if not v:
        return 0.0
    m = len(v) // 2
    return v[m] if len(v) % 2 else 0.5 * (v[m - 1] + v[m])


def percentile(vals, q: float) -> float:
    """q in [0, 100]; linear interpolation, numpy-compatible."""
    v = sorted(float(x) for x in vals)
    if not v:
        return 0.0
    if len(v) == 1:
        return v[0]
    pos = (q / 100.0) * (len(v) - 1)
    lo = int(math.floor(pos))
    hi = min(lo + 1, len(v) - 1)
    f = pos - lo
    return v[lo] * (1 - f) + v[hi] * f


def mean(vals) -> float:
    v = [float(x) for x in vals]
    return sum(v) / len(v) if v else 0.0


def stdev(vals) -> float:
    v = [float(x) for x in vals]
    if len(v) < 2:
        return 0.0
    m = sum(v) / len(v)
    return math.sqrt(sum((x - m) ** 2 for x in v) / len(v))
