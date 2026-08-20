"""How natural does the line look? — scale-free measures of micro-detail.

The reconstruction metrics in `metrics.py` answer "does the re-stroked artwork
cover the original?". They are blind to a specific and important failure: a path
can hit that target by **wiggling along the outline**, chasing every boundary
irregularity with dozens of tiny course corrections. It scores well and looks
nothing like a stroke a person drew.

Everything here is normalized by the local stroke width, for the same reason the
pruning threshold is: a wobble of 2 user units is invisible on a 40-unit-wide
stroke and glaring on a 4-unit one.

The four measures, from cheapest to most meaningful:

    vertsPerWidth       vertices per stroke width of arc length
    turningPerWidth     radians of |direction change| per stroke width
    reversalsPerWidth   direction-reversals per stroke width — the zig-zag rate
    wiggle              RMS distance from the path's own low-pass version,
                        in stroke radii, with the cutoff set at one stroke width

`wiggle` is the one to trust. The low-pass cutoff is deliberately tied to stroke
width, which encodes the actual claim: **detail finer than the pen is not
drawing, it is noise.** A wide smooth curve keeps all its shape and scores near
zero; a jittery line does not.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Any

# Resampling step for the low-pass, in stroke radii. Fine enough to see the
# wiggle, coarse enough that a dense polyline does not dominate the runtime.
RESAMPLE_R = 0.35

# Low-pass cutoff, in stroke WIDTHS (2R). Detail below this is treated as noise.
SMOOTH_WIDTHS = 1.0

# Turning below this is measurement noise, not a real course correction.
TURN_EPS_RAD = math.radians(4.0)

# Branches shorter than this many stroke widths are too short to characterize.
MIN_BRANCH_WIDTHS = 1.5


@dataclass
class Smoothness:
    verts_per_width: float = 0.0
    turning_per_width: float = 0.0
    reversals_per_width: float = 0.0
    wiggle: float = 0.0
    measured_length: float = 0.0     # arc length actually characterized
    coverage: float = 0.0            # fraction of total length that was long enough
    branches: int = 0

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        return {k: (round(v, 5) if isinstance(v, float) else v) for k, v in d.items()}


def _resample(pts: list[tuple[float, float]], step: float) -> list[tuple[float, float]]:
    """Exactly even arc-length resampling, endpoints preserved.

    Evenness is not cosmetic here: the low-pass below is a fixed-width kernel over
    the sample index, so uneven spacing would make it a variable-width filter.
    """
    if len(pts) < 2 or step <= 0:
        return list(pts)
    cum = [0.0]
    for i in range(len(pts) - 1):
        cum.append(cum[-1] + math.hypot(pts[i + 1][0] - pts[i][0],
                                        pts[i + 1][1] - pts[i][1]))
    total = cum[-1]
    if total <= 1e-12:
        return [pts[0], pts[-1]]
    n = max(2, int(round(total / step)) + 1)
    out = []
    j = 0
    for k in range(n):
        d = total * k / (n - 1)
        while j < len(cum) - 2 and cum[j + 1] < d:
            j += 1
        seg = cum[j + 1] - cum[j]
        t = 0.0 if seg <= 1e-12 else (d - cum[j]) / seg
        ax, ay = pts[j]
        bx, by = pts[j + 1]
        out.append((ax + (bx - ax) * t, ay + (by - ay) * t))
    return out


def _gaussian_smooth(pts: list[tuple[float, float]], sigma_steps: float
                     ) -> list[tuple[float, float]]:
    """Gaussian low-pass along the polyline; endpoints pinned."""
    n = len(pts)
    if n < 3 or sigma_steps <= 0:
        return list(pts)
    radius = max(1, int(math.ceil(3 * sigma_steps)))
    kernel = [math.exp(-(k * k) / (2 * sigma_steps * sigma_steps))
              for k in range(-radius, radius + 1)]
    total = sum(kernel)
    kernel = [k / total for k in kernel]

    out = []
    for i in range(n):
        sx = sy = sw = 0.0
        for j, w in enumerate(kernel, start=-radius):
            idx = i + j
            if idx < 0 or idx >= n:
                continue          # truncate at the ends rather than reflect:
            sx += pts[idx][0] * w  # reflecting invents curvature at a stroke tip
            sy += pts[idx][1] * w
            sw += w
        out.append((sx / sw, sy / sw) if sw > 0 else pts[i])
    out[0], out[-1] = pts[0], pts[-1]
    return out


def _smooth_scalar(vals: list[float], sigma_steps: float) -> list[float]:
    """Same Gaussian low-pass as `_gaussian_smooth`, over a scalar series."""
    n = len(vals)
    if n < 3 or sigma_steps <= 0:
        return list(vals)
    radius = max(1, int(math.ceil(3 * sigma_steps)))
    kernel = [math.exp(-(k * k) / (2 * sigma_steps * sigma_steps))
              for k in range(-radius, radius + 1)]
    out = []
    for i in range(n):
        sv = sw = 0.0
        for j, w in enumerate(kernel, start=-radius):
            idx = i + j
            if 0 <= idx < n:
                sv += vals[idx] * w
                sw += w
        out.append(sv / sw if sw > 0 else vals[i])
    return out


def edge_smoothness(edge) -> tuple[Smoothness, float] | None:
    """Measure one branch. Returns (metrics, arc length) or None if too short."""
    r = edge.median_radius or 0.0
    if r <= 0 or edge.is_dot():
        return None
    width = 2.0 * r
    length = float(edge.length)
    if length < MIN_BRANCH_WIDTHS * width:
        return None

    widths = length / width          # branch length in stroke widths
    pts = _resample(edge.points, RESAMPLE_R * r)
    if len(pts) < 5:
        return None

    # turning and reversals on the resampled path
    turning = 0.0
    reversals = 0
    prev_sign = 0
    for i in range(1, len(pts) - 1):
        ax, ay = pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]
        bx, by = pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]
        na, nb = math.hypot(ax, ay), math.hypot(bx, by)
        if na < 1e-12 or nb < 1e-12:
            continue
        cross = (ax * by - ay * bx) / (na * nb)
        dot = (ax * bx + ay * by) / (na * nb)
        ang = math.atan2(cross, max(-1.0, min(1.0, dot)))
        turning += abs(ang)
        if abs(ang) > TURN_EPS_RAD:
            sign = 1 if ang > 0 else -1
            if prev_sign and sign != prev_sign:
                reversals += 1
            prev_sign = sign

    # wiggle: RMS deviation from the path's own low-pass version, measured
    # PERPENDICULAR to the smoothed path. Smoothing also slides samples along the
    # curve, and that tangential component is a re-parameterization, not a wobble —
    # counting it made an exact straight line score 0.083 instead of 0.
    sigma_steps = (SMOOTH_WIDTHS * width) / (RESAMPLE_R * r) / 2.0
    smooth = _gaussian_smooth(pts, sigma_steps)
    m = len(smooth)
    resid = []
    for i, (p, q) in enumerate(zip(pts, smooth, strict=True)):
        a = smooth[max(0, i - 1)]
        b = smooth[min(m - 1, i + 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        tn = math.hypot(tx, ty)
        dx, dy = p[0] - q[0], p[1] - q[1]
        resid.append(math.hypot(dx, dy) if tn < 1e-12
                     else (dx * -ty + dy * tx) / tn)

    # The residual still contains a LOW-frequency part: smoothing pulls a genuinely
    # curved path toward its chord by roughly sigma^2 * curvature / 2, so a perfect
    # circular arc shows a near-constant offset. That is real drawing, not wobble.
    # Removing the residual's own low-frequency component leaves only the
    # high-frequency part — the course corrections. Without this an exact arc scored
    # 0.027, about half of what the real drawings scored, and every backend came out
    # indistinguishable.
    base = _smooth_scalar(resid, sigma_steps)
    hf = [x - y for x, y in zip(resid, base, strict=True)]
    wiggle = math.sqrt(sum(v * v for v in hf) / len(hf)) / r

    s = Smoothness(
        verts_per_width=len(edge.points) / widths,
        turning_per_width=turning / widths,
        reversals_per_width=reversals / widths,
        wiggle=wiggle,
        measured_length=length,
        branches=1,
    )
    return s, length


def graph_smoothness(graph) -> Smoothness:
    """Length-weighted smoothness over every branch long enough to characterize.

    Length weighting matters: an unweighted mean lets a swarm of short branches
    outvote the long strokes that actually carry the drawing's look.
    """
    total = sum(e.length for e in graph.edges.values() if not e.is_dot())
    acc = Smoothness()
    weight = 0.0
    for e in graph.edges.values():
        got = edge_smoothness(e)
        if got is None:
            continue
        s, ln = got
        acc.verts_per_width += s.verts_per_width * ln
        acc.turning_per_width += s.turning_per_width * ln
        acc.reversals_per_width += s.reversals_per_width * ln
        acc.wiggle += s.wiggle * ln
        acc.branches += 1
        weight += ln
    if weight <= 0:
        return acc
    acc.verts_per_width /= weight
    acc.turning_per_width /= weight
    acc.reversals_per_width /= weight
    acc.wiggle /= weight
    acc.measured_length = weight
    acc.coverage = weight / total if total > 0 else 0.0
    return acc


def naturalness_grade(s: Smoothness) -> tuple[str, float]:
    """A single readable grade from the wiggle, in the vocabulary of the ask.

    Thresholds are in stroke radii and were set by measuring known-clean geometry:
    a mathematically exact capsule centerline scores ~0.00, and the corpus spans
    roughly 0.00–0.30. They are a reading aid, not a physical constant.
    """
    w = s.wiggle
    if w < 0.02:
        return ("drawn in one motion", w)
    if w < 0.05:
        return ("smooth", w)
    if w < 0.10:
        return ("slightly restless", w)
    if w < 0.18:
        return ("visibly corrected", w)
    return ("chases the outline", w)
