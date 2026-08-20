"""Pruning as model selection — pruning as model selection.

Instead of hand-tuning one threshold, prune at several strengths, re-stroke each
candidate, and choose. Two selection rules are provided:

  * `pareto_front`  — the candidates that are not dominated on
                      (reconstruction error, complexity);
  * `simplest_within_tolerance` — Experiment 4 proper: of the candidates whose
                      reconstruction error is within a tolerance of the best
                      achievable, take the simplest.

The second is the one to use. It is what lets each backend be evaluated at ITS
OWN best setting instead of at whatever threshold someone happened to pick, and
it converts a fiddly constant into a defensible, reproducible choice.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any

from . import metrics as metrics_mod
from . import prune as prune_mod

# Default sweep, in local stroke widths. Dense below 2 because that is where the
# spur/real-detail boundary lives; a long tail so heavily-noised graphs can be
# cleaned. lam = 0 (no pruning) is always included as the control.
DEFAULT_LAMBDAS: tuple[float, ...] = (
    0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 7.0, 10.0,
)

# Complexity is a weighted blend rather than a single count, because the counts
# disagree about what "simple" means: a bezier backend wins on control points and
# loses on branch count, a polyline backend the other way round. Weights are
# normalized per-candidate-set, so only their ratio matters.
COMPLEXITY_WEIGHTS = {
    "edges": 0.35,          # branch count
    "control_points": 0.30,  # "number of Bezier segments" / control points
    "total_length": 0.20,    # "total centerline length"
    "strokes": 0.15,         # "number of strokes"
}


@dataclass
class Candidate:
    lam: float
    graph: Any
    metrics: metrics_mod.ReconMetrics
    prune_info: dict[str, Any] = field(default_factory=dict)

    @property
    def error(self) -> float:
        """The optimization loss: symmetric difference as a fraction of source area.

        Symmetric difference is the right optimization loss here, and it
        is preferred over IoU here for a specific reason — IoU is forgiving of
        small missing marks, which is exactly the over-pruning failure mode this
        module is most at risk of.
        """
        return float(self.metrics.sym_diff_ratio)

    def complexity_raw(self) -> dict[str, float]:
        m = self.metrics
        return {
            "edges": float(m.edges),
            "control_points": float(m.control_points),
            "total_length": float(m.total_length),
            "strokes": float(m.strokes),
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            "lam": self.lam,
            "error": round(self.error, 6),
            "iou": round(self.metrics.iou, 6),
            "missingRatio": round(self.metrics.missing_ratio, 6),
            "extraRatio": round(self.metrics.extra_ratio, 6),
            "boundaryP95": round(self.metrics.boundary_p95, 4),
            "edges": self.metrics.edges,
            "strokes": self.metrics.strokes,
            "controlPoints": self.metrics.control_points,
            "totalLength": round(self.metrics.total_length, 2),
            "widthCv": round(self.metrics.width_cv, 5),
            "prune": self.prune_info,
        }


def complexity_scores(cands: Sequence[Candidate]) -> list[float]:
    """Blended complexity in [0, 1], normalized across the candidate set."""
    if not cands:
        return []
    raws = [c.complexity_raw() for c in cands]
    out = [0.0] * len(cands)
    for key, w in COMPLEXITY_WEIGHTS.items():
        vals = [r[key] for r in raws]
        lo, hi = min(vals), max(vals)
        span = hi - lo
        for i, v in enumerate(vals):
            out[i] += w * ((v - lo) / span if span > 1e-12 else 0.0)
    return out


def sweep(
    graph,
    source,
    *,
    lambdas: Sequence[float] = DEFAULT_LAMBDAS,
    width_mode: str = "auto",
    keep_dots: bool = True,
    on_candidate: Callable[[Candidate], None] | None = None,
) -> list[Candidate]:
    """Prune at every strength and score each result."""
    cands: list[Candidate] = []
    # Adjacent lambdas very often produce the identical graph; scoring is by far
    # the expensive step, so score each distinct edge set once and reuse it.
    seen: dict[frozenset, metrics_mod.ReconMetrics] = {}
    for lam in lambdas:
        g, info = prune_mod.prune(graph, lam, keep_dots=keep_dots)
        key = frozenset(g.edges)
        m = seen.get(key)
        if m is None:
            m = metrics_mod.score_graph(g, source, width_mode=width_mode)
            seen[key] = m
        c = Candidate(lam=float(lam), graph=g, metrics=m, prune_info=info.to_dict())
        cands.append(c)
        if on_candidate:
            on_candidate(c)
    return cands


def pareto_front(cands: Sequence[Candidate]) -> list[Candidate]:
    """Candidates not dominated on (error, complexity), lowest error first."""
    comp = complexity_scores(cands)
    front: list[Candidate] = []
    for i, c in enumerate(cands):
        dominated = any(
            j != i
            and cands[j].error <= c.error - 1e-12
            and comp[j] <= comp[i] - 1e-12
            for j in range(len(cands))
        )
        if not dominated:
            front.append(c)
    return sorted(front, key=lambda c: c.error)


def simplest_within_tolerance(
    cands: Sequence[Candidate],
    *,
    tolerance: float = 0.10,
    absolute: float | None = None,
    max_missing_increase: float = 0.02,
) -> Candidate | None:
    """The simplest graph that stays within reconstruction tolerance.

    `tolerance` is RELATIVE to the best error achieved in the sweep (0.10 = "may be
    up to 10% worse than the best candidate"), which keeps the rule scale-free in
    the same spirit as the pruning threshold itself. `absolute` optionally caps the
    error outright.

    `max_missing_increase` is the guard against the failure mode called out in the
    handoff: over-pruning can improve symmetric difference overall while deleting a
    real stroke, because removing a stroke removes its `extra` area too. Any
    candidate that increases MISSING area by more than this fraction of the source,
    relative to the unpruned graph, is disqualified regardless of how simple it is.
    """
    usable = [c for c in cands if c.metrics.source_area > 0 and c.metrics.recon_area > 0]
    if not usable:
        return None
    best_err = min(c.error for c in usable)
    limit = best_err * (1.0 + tolerance)
    if absolute is not None:
        limit = min(limit, absolute)

    base = next((c for c in cands if c.lam == 0.0), None)
    base_missing = base.metrics.missing_ratio if base else 0.0

    eligible = [
        c
        for c in usable
        if c.error <= limit + 1e-12
        and c.metrics.missing_ratio <= base_missing + max_missing_increase
    ]
    if not eligible:
        eligible = [c for c in usable if c.error <= limit + 1e-12] or list(usable)

    comp = dict(zip([id(c) for c in usable], complexity_scores(usable), strict=True))
    return min(eligible, key=lambda c: (comp[id(c)], c.error))


def select(
    graph,
    source,
    *,
    lambdas: Sequence[float] = DEFAULT_LAMBDAS,
    tolerance: float = 0.10,
    width_mode: str = "auto",
    max_missing_increase: float = 0.02,
) -> tuple[Candidate | None, list[Candidate]]:
    """Sweep, then pick. Returns (chosen, all candidates)."""
    cands = sweep(graph, source, lambdas=lambdas, width_mode=width_mode)
    chosen = simplest_within_tolerance(
        cands, tolerance=tolerance, max_missing_increase=max_missing_increase
    )
    return chosen, cands
