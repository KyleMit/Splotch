"""Width-aware pruning.

The point of this module is that **every threshold is scale-free**. A spur 0.15
stroke widths long is a boundary artifact whether the drawing is 100 units wide or
10,000; an absolute length threshold is why previous attempts needed per-image
tuning. So the primary feature is

    normLength = L / (2 * R_med)          # branch length in local stroke widths

and the decision threshold `lam` is expressed in the same unit: `lam = 1.0` means
"remove terminal branches shorter than one local stroke width".

The secondary features do not replace that threshold, they modulate it: a branch
that continues the parent stroke straight through, at a consistent width matching
the parent, earns a lower threshold (harder to delete); a thin, ragged, wildly
off-axis stub earns a higher one.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from typing import Any

from . import geom

# Modulation weights. Deliberately gentle: the scale-free length term should do
# most of the work, and these should only break ties. Fitted on the synthetic
# corpus (cases 13-20), never on the ten real inputs.
W_RADIUS_DROP = 0.8      # branch much thinner than its parent -> more spur-like
W_WIDTH_CV = 1.0         # inconsistent width along the branch -> more spur-like
W_CONTINUATION = 0.5     # smoothly continues the parent stroke -> less spur-like
SPUR_FACTOR_MIN = 0.4
SPUR_FACTOR_MAX = 2.5

# Arc length over which tangents are measured at a junction, in units of the local
# radius. Too short and vertex noise dominates; too long and real curvature does.
TANGENT_SPAN_R = 1.5


@dataclass
class BranchFeatures:
    """The pruning feature set for one terminal branch."""

    edge_id: str
    tip: str
    anchor: str
    # raw features
    length: float = 0.0              # L
    r_med: float = 0.0               # R_med
    r_parent: float = 0.0            # R_parent
    r_tip: float = 0.0
    d_radius: float = 0.0            # dR: std of radius along the branch
    theta_deg: float = 180.0         # angle to the best-aligned parent leg
    # normalized features
    norm_length: float = 0.0         # L / (2 R_med)
    scale_ratio: float = 0.0         # R_med / R_global
    width_cv: float = 0.0            # std(R) / mean(R)
    radius_ratio: float = 1.0        # R_med / R_parent
    continuation: float = 0.0        # +1 straight through the parent, -1 doubled back
    # decision support
    spur_factor: float = 1.0
    isolated: bool = False           # whole stroke, not a spur: never prune as noise
    terminal: bool = True            # has a degree-1 tip (all enumerated branches do)
    dot: bool = False

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        return {k: (round(v, 5) if isinstance(v, float) else v) for k, v in d.items()}


def branch_features(graph, edge, tip: str, anchor: str, *, r_global: float | None = None
                    ) -> BranchFeatures:
    """Compute the features for one terminal branch, oriented tip -> anchor."""
    r_global = r_global if r_global is not None else graph.global_radius()
    deg = graph.degree()
    f = BranchFeatures(edge_id=edge.id, tip=tip, anchor=anchor)
    f.dot = edge.is_dot()
    f.isolated = deg.get(anchor, 0) <= 1        # both ends terminal: a whole stroke

    pts_from_anchor = edge.points_from(anchor)
    radii_from_anchor = edge.radii_from(anchor)

    f.length = float(edge.length)
    radii = radii_from_anchor or ([edge.median_radius] if edge.median_radius else [])
    radii = [r for r in radii if r is not None]
    if radii:
        f.r_med = geom.median(radii)
        f.d_radius = geom.stdev(radii)
        m = geom.mean(radii)
        f.width_cv = (f.d_radius / m) if m > 1e-9 else 0.0
        f.r_tip = float(radii[-1])
    elif edge.median_radius:
        f.r_med = float(edge.median_radius)

    # R_parent: radius of the other branches at the junction, measured close in
    parent_radii: list[float] = []
    legs: list[tuple[float, float]] = []
    for other in graph.incident(anchor):
        if other.id == edge.id:
            continue
        o_pts = other.points_from(anchor)
        o_rad = other.radii_from(anchor)
        if o_rad:
            near = o_rad[: max(2, len(o_rad) // 4)]
            parent_radii.append(geom.median(near))
        elif other.median_radius:
            parent_radii.append(float(other.median_radius))
        span = TANGENT_SPAN_R * max(f.r_med, 1e-6)
        t = geom.tangent_at_start(o_pts, span)
        if t:
            legs.append(t)
    f.r_parent = geom.median(parent_radii) if parent_radii else f.r_med

    if f.r_med > 1e-9:
        f.norm_length = f.length / (2.0 * f.r_med)
    if r_global > 1e-9:
        f.scale_ratio = f.r_med / r_global
    if f.r_parent > 1e-9:
        f.radius_ratio = f.r_med / f.r_parent

    # theta: how well the branch continues a parent leg through the junction
    span = TANGENT_SPAN_R * max(f.r_med, 1e-6)
    b = geom.tangent_at_start(pts_from_anchor, span)
    if b and legs:
        best = -1.0
        for leg in legs:
            # -dot: +1 when the branch leaves opposite the leg, i.e. straight through
            best = max(best, -(b[0] * leg[0] + b[1] * leg[1]))
        f.continuation = max(-1.0, min(1.0, best))
        f.theta_deg = math.degrees(math.acos(max(-1.0, min(1.0, f.continuation))))

    drop = max(0.0, 1.0 - min(f.radius_ratio, 1.0))
    f.spur_factor = max(
        SPUR_FACTOR_MIN,
        min(
            SPUR_FACTOR_MAX,
            1.0
            + W_RADIUS_DROP * drop
            + W_WIDTH_CV * f.width_cv
            - W_CONTINUATION * f.continuation,
        ),
    )
    return f


def enumerate_branches(graph, *, r_global: float | None = None) -> list[BranchFeatures]:
    """Features for every terminal branch in the graph."""
    r_global = r_global if r_global is not None else graph.global_radius()
    return [
        branch_features(graph, e, tip, anchor, r_global=r_global)
        for e, tip, anchor in graph.terminal_edges()
    ]


def should_prune(f: BranchFeatures, lam: float, *, keep_dots: bool = True) -> bool:
    """The scale-free decision. `lam` is a threshold in local stroke widths."""
    if lam <= 0:
        return False
    if f.dot:
        return not keep_dots
    if f.isolated:
        # a free-standing stroke, not a spur off something else. Only remove it if
        # it is below the threshold outright — never with the spur modifiers, which
        # are about junction geometry that does not exist here.
        return f.norm_length < lam * 0.5
    return f.norm_length < lam * f.spur_factor


@dataclass
class PruneResult:
    lam: float
    removed: list[str] = field(default_factory=list)
    passes: int = 0
    removed_length: float = 0.0
    kept_edges: int = 0
    merges: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "lam": self.lam,
            "removed": len(self.removed),
            "removedLength": round(self.removed_length, 3),
            "passes": self.passes,
            "keptEdges": self.kept_edges,
            "merges": self.merges,
        }


def prune(
    graph,
    lam: float,
    *,
    keep_dots: bool = True,
    max_passes: int = 24,
    protect_bridges: bool = True,
    canonicalize: bool = True,
):
    """Iteratively remove spur-like terminal branches. Returns (graph, PruneResult).

    Iterative because removing a spur can expose the spur behind it; a single pass
    leaves stair-stepped noise behind. `protect_bridges` refuses to remove an edge
    whose deletion would disconnect otherwise-connected geometry — a terminal edge
    can never be a bridge in that sense, but the guard matters once merged chains
    and closed loops are in play.
    """
    g = graph.copy()
    if canonicalize:
        g.merge_chains()
    res = PruneResult(lam=lam)
    if lam <= 0:
        res.kept_edges = len(g.edges)
        return g, res

    for _ in range(max_passes):
        if canonicalize:
            # RE-canonicalize every pass. Removing a spur turns its junction into a
            # degree-2 node, and the two stubs left behind are each short relative
            # to the stroke width even though the branch they belong to is not.
            # Without this the prune cascades inward and eats the drawing:
            # flo-mat case-20 went 426 edges -> 11 and IoU 0.77 -> 0.28.
            res.merges += g.merge_chains()
        feats = enumerate_branches(g)
        doomed = [f for f in feats if should_prune(f, lam, keep_dots=keep_dots)]
        if not doomed:
            break
        removed_this_pass = []
        for f in doomed:
            e = g.edges.get(f.edge_id)
            if e is None:
                continue
            if protect_bridges and not f.isolated and not f.terminal and \
                    g.is_bridge(f.edge_id):
                # removing it would strand geometry beyond it; leave it alone.
                # Note this can never fire for a true terminal branch: deleting one
                # only orphans its degree-1 tip, which splits nothing. The guard is
                # kept for the day a non-terminal branch becomes prunable, but it is
                # skipped here because is_bridge costs two component scans per call
                # and would dominate the sweep for no effect.
                continue
            res.removed_length += e.length
            del g.edges[f.edge_id]
            removed_this_pass.append(f.edge_id)
        if not removed_this_pass:
            break
        res.removed.extend(removed_this_pass)
        res.passes += 1
        g.drop_orphan_nodes()

    res.kept_edges = len(g.edges)
    return g, res
