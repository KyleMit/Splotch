"""The common centerline graph model.

    interface CenterlineNode { id: string; x: number; y: number; radius?: number }
    interface CenterlineEdge {
      id: string; from: string; to: string;
      geometry: Bezier[] | Point[];
      length: number; medianRadius?: number; sourceElementId?: string;
    }

This track writes the *superset*: `geometry` is a Point[] polyline (so it is
usable without any curve-fitting assumptions), and the extra fields below are
additive so a strict consumer can ignore them.

Extra fields, all documented in docs/pipeline.md:
  node.degree          skeleton degree (1 = endpoint, >=3 = junction)
  edge.radii           per-vertex local radius, same length as geometry
  edge.beziers         cubic Béziers fitted to geometry: [[p0,c1,c2,p3], ...]
  edge.corners         indices into geometry kept as C0 breaks
  edge.branchType      Skan branch type 0/1/2/3
  edge.meanRadius / minRadius / maxRadius / radiusCv
  edge.normLength      length / (2 * medianRadius)   <- the pruning feature
All coordinates are in the source SVG's user units (viewBox space).
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "centerline-graph/1"


@dataclass
class CenterlineNode:
    id: str
    x: float
    y: float
    radius: float | None = None
    degree: int | None = None


@dataclass
class CenterlineEdge:
    id: str
    from_: str
    to: str
    geometry: list[list[float]]
    length: float
    medianRadius: float | None = None
    sourceElementId: str | None = None
    radii: list[float] = field(default_factory=list)
    beziers: list[list[list[float]]] = field(default_factory=list)
    corners: list[int] = field(default_factory=list)
    branchType: int | None = None
    meanRadius: float | None = None
    minRadius: float | None = None
    maxRadius: float | None = None
    radiusCv: float | None = None
    normLength: float | None = None
    closed: bool = False
    # Contiguous runs of near-constant radius: [{bezierStart, bezierCount,
    # radius, length}].  Empty when the whole edge is one constant-width run.
    widthRuns: list[dict[str, float]] = field(default_factory=list)
    # Dense uniform chain used for Bézier fitting only; not serialised (it is
    # `geometry` before simplification, and roughly triples the file size).
    fitPoints: list[list[float]] = field(default_factory=list, repr=False)
    fitCorners: list[int] = field(default_factory=list, repr=False)
    fitRadii: list[float] = field(default_factory=list, repr=False)

    def to_json(self) -> dict[str, Any]:
        d = asdict(self)
        d["from"] = d.pop("from_")
        d.pop("fitPoints", None)
        d.pop("fitCorners", None)
        d.pop("fitRadii", None)
        return d


@dataclass
class CenterlineGraph:
    image: str
    backend: str
    viewBox: list[float]
    nodes: list[CenterlineNode] = field(default_factory=list)
    edges: list[CenterlineEdge] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)

    def to_json(self) -> dict[str, Any]:
        return {
            "schema": SCHEMA_VERSION,
            "image": self.image,
            "backend": self.backend,
            "units": "svg-user-units",
            "viewBox": self.viewBox,
            "radiusSource": "native",  # Euclidean distance transform, not derived
            "meta": self.meta,
            "nodes": [asdict(n) for n in self.nodes],
            "edges": [e.to_json() for e in self.edges],
        }

    def save(self, path: str | Path, precision: int = 3) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(_round(self.to_json(), precision), separators=(",", ":")))

    @property
    def total_length(self) -> float:
        return float(sum(e.length for e in self.edges))


def _round(obj: Any, p: int) -> Any:
    if isinstance(obj, float):
        return round(obj, p)
    if isinstance(obj, dict):
        return {k: _round(v, p) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_round(v, p) for v in obj]
    return obj


def load(path: str | Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text())


def validate(doc: dict[str, Any]) -> list[str]:
    """Cheap structural check — mirrors what the schema validator should enforce."""
    problems: list[str] = []
    for key in ("schema", "image", "backend", "viewBox", "nodes", "edges"):
        if key not in doc:
            problems.append(f"missing top-level key {key!r}")
    ids = {n["id"] for n in doc.get("nodes", [])}
    for e in doc.get("edges", []):
        if e.get("from") not in ids:
            problems.append(f"edge {e.get('id')}: unknown from-node {e.get('from')!r}")
        if e.get("to") not in ids:
            problems.append(f"edge {e.get('id')}: unknown to-node {e.get('to')!r}")
        geom = e.get("geometry") or []
        if len(geom) < 2:
            problems.append(f"edge {e.get('id')}: degenerate geometry ({len(geom)} pts)")
        if e.get("radii") and len(e["radii"]) != len(geom):
            problems.append(f"edge {e.get('id')}: radii/geometry length mismatch")
    return problems
