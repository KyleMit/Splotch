"""The common centerline graph: load / save / normalize / operate.

This is the shared layer: one graph model the extractor writes and every
downstream stage reads.
Every extraction backend (Tracks 1-7) emits JSON in the schema described in
clg/schema.py; everything downstream — pruning, scoring, model selection,
leaderboards — is written against `CenterlineGraph` and never against a backend.
"""

from __future__ import annotations

import json
import math
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from . import geom
from .schema import (
    SCHEMA_VERSION,
    ValidationReport,
    classify_geometry,
    geometry_points,
    validate_document,
)

Point = tuple[float, float]

# Flattening tolerance for bezier geometry, in SVG user units. Small enough that
# a 12-unit-wide stroke is reproduced faithfully; large enough to stay cheap.
BEZIER_TOL = 0.05


@dataclass
class Node:
    id: str
    x: float
    y: float
    radius: float | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def xy(self) -> Point:
        return (self.x, self.y)


@dataclass
class Edge:
    id: str
    frm: str
    to: str
    points: list[Point]                       # always a flattened polyline
    length: float = 0.0
    median_radius: float | None = None
    radius_profile: list[float] = field(default_factory=list)  # per point in `points`
    source_element_id: str | None = None
    closed: bool = False
    geometry_type: str = "polyline"           # original encoding: polyline | beziers
    beziers: list[Any] | None = None          # retained when the source was beziers
    extra: dict[str, Any] = field(default_factory=dict)

    def endpoints(self) -> tuple[str, str]:
        return (self.frm, self.to)

    def is_dot(self) -> bool:
        """An isolated mark with no extent: a self-loop of zero length."""
        return self.frm == self.to and self.length == 0.0 and (
            len(self.points) < 2
            or all(
                abs(p[0] - self.points[0][0]) < 1e-9 and abs(p[1] - self.points[0][1]) < 1e-9
                for p in self.points
            )
        )

    def other(self, node_id: str) -> str:
        return self.to if node_id == self.frm else self.frm

    def points_from(self, node_id: str) -> list[Point]:
        """Points ordered so that they start at `node_id`'s end."""
        return list(self.points) if node_id == self.frm else list(reversed(self.points))

    def radii_from(self, node_id: str) -> list[float]:
        prof = self.radii()
        return prof if node_id == self.frm else list(reversed(prof))

    def beziers_from(self, node_id: str) -> list:
        """Cubic segments ordered so they start at `node_id`'s end."""
        if not self.beziers:
            return []
        if node_id == self.frm:
            return list(self.beziers)
        return _reverse_beziers(self.beziers)

    def radii(self) -> list[float]:
        """Per-point radius profile, resampled/filled to len(points)."""
        n = len(self.points)
        if self.radius_profile:
            if len(self.radius_profile) == n:
                return [float(r) for r in self.radius_profile]
            return geom.resample_profile(self.radius_profile, n)
        if self.median_radius is not None:
            return [float(self.median_radius)] * n
        return []

    def control_point_count(self) -> int:
        if self.beziers:
            return sum(len(seg) for seg in self.beziers)
        return len(self.points)

    def bezier_segment_count(self) -> int:
        return len(self.beziers) if self.beziers else 0


def _reverse_beziers(segments: list) -> list:
    """Reverse a list of cubic segments (order and each segment's control points)."""
    return [list(reversed(list(seg))) for seg in reversed(list(segments))]


@dataclass
class CenterlineGraph:
    nodes: dict[str, Node] = field(default_factory=dict)
    edges: dict[str, Edge] = field(default_factory=dict)
    image: str | None = None
    backend: str | None = None
    source: str | None = None
    units: str = "svg-user"
    view_box: list[float] | None = None
    radius_source: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)

    # ---------------------------------------------------------------- loading
    @classmethod
    def from_document(cls, doc: dict[str, Any], *, image: str | None = None) -> CenterlineGraph:
        g = cls()
        g.image = image or doc.get("image")
        g.backend = doc.get("backend") or doc.get("slug") or doc.get("producer")
        if isinstance(g.backend, dict):  # opencv-tracing nests a backend object
            g.backend = g.backend.get("skeletonizer") or None
        g.source = doc.get("source")
        g.units = doc.get("units") or "svg-user"
        vb = doc.get("viewBox")
        if isinstance(vb, dict):
            vb = [vb.get("x", 0), vb.get("y", 0), vb.get("w", 0), vb.get("h", 0)]
        if isinstance(vb, list) and len(vb) == 4:
            g.view_box = [float(v) for v in vb]
        g.radius_source = doc.get("radiusSource") or (doc.get("radius") or {}).get("derivedFrom")
        for key in ("meta", "options", "params", "stats", "raster", "strokeOrderMeta", "backend"):
            if key in doc and isinstance(doc[key], (dict, list)):
                g.meta[key] = doc[key]

        for n in doc.get("nodes", []):
            extra = {k: v for k, v in n.items() if k not in ("id", "x", "y", "radius")}
            g.nodes[n["id"]] = Node(
                id=n["id"],
                x=float(n["x"]),
                y=float(n["y"]),
                radius=(float(n["radius"]) if n.get("radius") is not None else None),
                extra=extra,
            )

        for e in doc.get("edges", []):
            kind = classify_geometry(e.get("geometry"))
            beziers = None
            if kind == "beziers":
                pts = geom.flatten_beziers(e["geometry"], BEZIER_TOL)
                beziers = e["geometry"]
            else:
                pts = geom.dedupe(geometry_points(e.get("geometry"), kind))
            if not pts:
                continue
            if len(pts) == 1:
                # dot edge: keep it, duplicate the point so downstream polyline
                # code has two vertices to work with (zero length, round cap only)
                pts = [pts[0], pts[0]]
            prof = e.get("radiusProfile", e.get("radii")) or []
            extra = {
                k: v
                for k, v in e.items()
                if k
                not in (
                    "id", "from", "to", "geometry", "geometryType", "length",
                    "medianRadius", "radiusProfile", "radii", "sourceElementId", "closed",
                )
            }
            g.edges[e["id"]] = Edge(
                id=e["id"],
                frm=e["from"],
                to=e["to"],
                points=pts,
                length=float(e.get("length") or geom.polyline_length(pts)),
                median_radius=(
                    float(e["medianRadius"]) if e.get("medianRadius") is not None else None
                ),
                radius_profile=[float(r) for r in prof] if prof else [],
                source_element_id=e.get("sourceElementId"),
                closed=bool(e.get("closed", False)),
                geometry_type="beziers" if kind == "beziers" else "polyline",
                beziers=beziers,
                extra=extra,
            )
        g.backfill_radii()
        return g

    @classmethod
    def load(cls, path: str | Path, *, image: str | None = None) -> CenterlineGraph:
        p = Path(path)
        doc = json.loads(p.read_text())
        return cls.from_document(doc, image=image or p.stem)

    # ---------------------------------------------------------------- saving
    def to_document(self, *, keep_beziers: bool = True) -> dict[str, Any]:
        doc: dict[str, Any] = {"schema": SCHEMA_VERSION}
        if self.backend:
            doc["backend"] = self.backend
        if self.image:
            doc["image"] = self.image
        if self.source:
            doc["source"] = self.source
        doc["units"] = self.units
        if self.view_box:
            doc["viewBox"] = self.view_box
        if self.radius_source:
            doc["radiusSource"] = self.radius_source
        doc["nodes"] = [
            {
                "id": n.id,
                "x": round(n.x, 4),
                "y": round(n.y, 4),
                **({"radius": round(n.radius, 4)} if n.radius is not None else {}),
            }
            for n in self.nodes.values()
        ]
        edges = []
        for e in self.edges.values():
            rec: dict[str, Any] = {
                "id": e.id,
                "from": e.frm,
                "to": e.to,
            }
            if e.is_dot():
                rec["geometry"] = [[round(e.points[0][0], 4), round(e.points[0][1], 4)]]
                rec["geometryType"] = "polyline"
                rec["length"] = 0.0
                if e.median_radius is not None:
                    rec["medianRadius"] = round(e.median_radius, 4)
                if e.source_element_id:
                    rec["sourceElementId"] = e.source_element_id
                edges.append(rec)
                continue
            if keep_beziers and e.beziers:
                rec["geometry"] = e.beziers
                rec["geometryType"] = "beziers"
            else:
                rec["geometry"] = [[round(x, 4), round(y, 4)] for x, y in e.points]
                rec["geometryType"] = "polyline"
            rec["length"] = round(e.length, 4)
            if e.median_radius is not None:
                rec["medianRadius"] = round(e.median_radius, 4)
            if e.radius_profile:
                rec["radiusProfile"] = [round(r, 4) for r in e.radius_profile]
            if e.source_element_id:
                rec["sourceElementId"] = e.source_element_id
            if e.closed:
                rec["closed"] = True
            edges.append(rec)
        doc["edges"] = edges
        doc["stats"] = self.stats()
        if self.meta:
            doc["meta"] = self.meta
        return doc

    def save(self, path: str | Path, *, keep_beziers: bool = True) -> None:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(self.to_document(keep_beziers=keep_beziers)))

    def validate(self, *, strict: bool = False) -> ValidationReport:
        return validate_document(self.to_document(), strict=strict)

    # ------------------------------------------------------------ invariants
    def backfill_radii(self) -> None:
        """Fill missing radius information from whatever the backend did provide.

        Backends vary: some carry per-node radius only, some per-edge medianRadius
        only, some both. Downstream code assumes both are available, so normalize
        once here and record what had to be inferred.
        """
        inferred_edges = 0
        for e in self.edges.values():
            if e.median_radius is None:
                prof = e.radius_profile
                if prof:
                    e.median_radius = geom.median(prof)
                    inferred_edges += 1
                else:
                    rs = [
                        self.nodes[nid].radius
                        for nid in (e.frm, e.to)
                        if nid in self.nodes and self.nodes[nid].radius is not None
                    ]
                    if rs:
                        e.median_radius = sum(rs) / len(rs)
                        inferred_edges += 1
        inferred_nodes = 0
        for n in self.nodes.values():
            if n.radius is None:
                rs = [
                    e.median_radius
                    for e in self.incident(n.id)
                    if e.median_radius is not None
                ]
                if rs:
                    n.radius = sum(rs) / len(rs)
                    inferred_nodes += 1
        if inferred_edges or inferred_nodes:
            self.meta.setdefault("clg", {})["radiusBackfill"] = {
                "edges": inferred_edges,
                "nodes": inferred_nodes,
            }

    # ------------------------------------------------------------ graph ops
    def incident(self, node_id: str) -> list[Edge]:
        return [e for e in self.edges.values() if e.frm == node_id or e.to == node_id]

    def adjacency(self) -> dict[str, list[str]]:
        adj: dict[str, list[str]] = {nid: [] for nid in self.nodes}
        for e in self.edges.values():
            adj.setdefault(e.frm, []).append(e.id)
            if e.to != e.frm:
                adj.setdefault(e.to, []).append(e.id)
            else:
                adj[e.frm].append(e.id)  # self-loop counts twice
        return adj

    def degree(self) -> dict[str, int]:
        return {nid: len(ids) for nid, ids in self.adjacency().items()}

    def terminal_nodes(self) -> list[str]:
        return [nid for nid, d in self.degree().items() if d == 1]

    def junction_nodes(self) -> list[str]:
        return [nid for nid, d in self.degree().items() if d >= 3]

    def isolated_nodes(self) -> list[str]:
        return [nid for nid, d in self.degree().items() if d == 0]

    def terminal_edges(self) -> list[tuple[Edge, str, str]]:
        """Every edge with a degree-1 endpoint, as (edge, tip_node, anchor_node)."""
        deg = self.degree()
        out = []
        for e in self.edges.values():
            if e.frm == e.to:
                continue
            f_term = deg.get(e.frm, 0) == 1
            t_term = deg.get(e.to, 0) == 1
            if f_term and not t_term:
                out.append((e, e.frm, e.to))
            elif t_term and not f_term:
                out.append((e, e.to, e.frm))
            elif f_term and t_term:
                # an isolated single-edge stroke; report tip=from, anchor=to but
                # callers must treat it as a whole stroke, not a spur
                out.append((e, e.frm, e.to))
        return out

    def connected_components(self) -> list[set[str]]:
        adj_nodes: dict[str, set[str]] = {nid: set() for nid in self.nodes}
        for e in self.edges.values():
            adj_nodes.setdefault(e.frm, set()).add(e.to)
            adj_nodes.setdefault(e.to, set()).add(e.frm)
        seen: set[str] = set()
        comps: list[set[str]] = []
        for nid in adj_nodes:
            if nid in seen:
                continue
            stack, comp = [nid], set()
            seen.add(nid)
            while stack:
                cur = stack.pop()
                comp.add(cur)
                for nb in adj_nodes.get(cur, ()):  # noqa: B007
                    if nb not in seen:
                        seen.add(nb)
                        stack.append(nb)
            comps.append(comp)
        return comps

    def edge_components(self) -> list[list[str]]:
        """Connected components expressed as lists of edge ids (i.e. strokes)."""
        node_comp: dict[str, int] = {}
        for i, comp in enumerate(self.connected_components()):
            for nid in comp:
                node_comp[nid] = i
        out: dict[int, list[str]] = {}
        for e in self.edges.values():
            out.setdefault(node_comp.get(e.frm, -1), []).append(e.id)
        return [v for _, v in sorted(out.items())]

    def is_bridge(self, edge_id: str) -> bool:
        """True if removing this edge strands geometry — i.e. splits a component.

        Counted over nodes that still carry at least one edge, so a terminal edge
        (whose removal merely leaves its tip node dangling) is correctly NOT a
        bridge. Getting this wrong would block every prune.
        """

        def live_components(g: CenterlineGraph) -> int:
            live = {nid for e in g.edges.values() for nid in (e.frm, e.to)}
            return sum(1 for c in g.connected_components() if c & live)

        before = live_components(self)
        e = self.edges.pop(edge_id)
        after = live_components(self)
        self.edges[edge_id] = e
        return after > before

    # ------------------------------------------------------------ mutation
    def copy(self) -> CenterlineGraph:
        g = CenterlineGraph(
            image=self.image,
            backend=self.backend,
            source=self.source,
            units=self.units,
            view_box=list(self.view_box) if self.view_box else None,
            radius_source=self.radius_source,
            meta=json.loads(json.dumps(self.meta)) if self.meta else {},
        )
        for n in self.nodes.values():
            g.nodes[n.id] = Node(n.id, n.x, n.y, n.radius, dict(n.extra))
        for e in self.edges.values():
            g.edges[e.id] = Edge(
                id=e.id,
                frm=e.frm,
                to=e.to,
                points=list(e.points),
                length=e.length,
                median_radius=e.median_radius,
                radius_profile=list(e.radius_profile),
                source_element_id=e.source_element_id,
                closed=e.closed,
                geometry_type=e.geometry_type,
                beziers=e.beziers,
                extra=dict(e.extra),
            )
        return g

    def remove_edges(self, edge_ids: Iterable[str]) -> None:
        for eid in edge_ids:
            self.edges.pop(eid, None)
        self.drop_orphan_nodes()

    def drop_orphan_nodes(self) -> None:
        used: set[str] = set()
        for e in self.edges.values():
            used.add(e.frm)
            used.add(e.to)
        for nid in [n for n in self.nodes if n not in used]:
            del self.nodes[nid]

    def merge_chains(self) -> int:
        """Splice edges through every degree-2 node. Returns the merge count.

        **This is the canonical form, and pruning requires it.** A chain of
        degree-2 splits is an extraction artifact, not real topology, and backends
        disagree wildly about it: flo-mat emits 426 edges for a single noisy
        capsule where skimage-skan emits 61. Without canonicalization, a pruning
        threshold expressed in stroke widths means something different for every
        backend — measured: pruning flo-mat's un-merged case-20 graph at lam=1.0
        destroys the skeleton (426 edges -> 11, IoU 0.77 -> 0.28) because each
        individual edge is short relative to the local stroke width, so the tips
        cascade inwards. After merging, lam=1.0 means what it says.
        """
        merged = 0
        adj = self.adjacency()
        queue = [nid for nid, eids in adj.items() if len(eids) == 2]
        # Mirror of `queue` for membership tests. The re-queue check below runs
        # once per merge, so a list scan makes canonicalization O(V^2) and a dense
        # graph never finishes; the set keeps it linear.
        queued = set(queue)
        while queue:
            nid = queue.pop()
            queued.discard(nid)
            eids = adj.get(nid)
            if not eids or len(eids) != 2:
                continue
            a_id, b_id = eids
            if a_id == b_id:
                continue
            a, b = self.edges.get(a_id), self.edges.get(b_id)
            if a is None or b is None:
                continue
            if a.is_dot() or b.is_dot():
                continue
            # geometry oriented away from the shared node, then reversed for a
            a_pts = a.points_from(nid)
            b_pts = b.points_from(nid)
            a_rad = a.radii_from(nid)
            b_rad = b.radii_from(nid)
            # Drop the shared vertex only if the two edges really do meet there.
            # Several backends (tegaki, flo-mat) let edge geometry drift from the
            # node they both reference - up to 13.7 user units - and dropping a's
            # endpoint on that assumption deletes real geometry: measured at 997
            # units^2 lost across 51 fragments from just 2 merges on house-wide.
            a_rev = list(reversed(a_pts))
            gap = math.hypot(a_rev[-1][0] - b_pts[0][0], a_rev[-1][1] - b_pts[0][1])
            coincident = gap <= 1e-6
            pts = geom.dedupe((a_rev[:-1] if coincident else a_rev) + b_pts)
            if len(pts) < 2:
                continue
            a_rad_rev = list(reversed(a_rad)) if a_rad else []
            rad = ((a_rad_rev[:-1] if coincident else a_rad_rev) + b_rad) \
                if (a_rad and b_rad) else []
            if rad and len(rad) != len(pts):
                rad = geom.resample_profile(rad, len(pts))
            # cubic segments survive the splice, so bezier complexity stays honest
            bez = None
            if a.beziers and b.beziers:
                bez = _reverse_beziers(a.beziers_from(nid)) + b.beziers_from(nid)
            new = Edge(
                id=a.id,
                frm=a.other(nid),
                to=b.other(nid),
                points=pts,
                length=a.length + b.length,
                median_radius=geom.median(rad) if rad else a.median_radius,
                radius_profile=rad,
                source_element_id=a.source_element_id or b.source_element_id,
                closed=(a.other(nid) == b.other(nid)),
                geometry_type="beziers" if bez else "polyline",
                beziers=bez,
                extra={**b.extra, **a.extra},
            )
            # provenance: which original edge ids this spliced branch contains.
            # Needed to tell "this branch was pruned away" from "this branch was
            # merged into its neighbour and kept the neighbour's id".
            new.extra["mergedFrom"] = sorted(
                (set(a.extra.get("mergedFrom", [])) | {a.id}
                 | set(b.extra.get("mergedFrom", [])) | {b.id}) - {new.id}
            )
            del self.edges[a_id]
            del self.edges[b_id]
            self.edges[new.id] = new
            self.nodes.pop(nid, None)
            adj.pop(nid, None)
            # keep the incremental adjacency consistent
            for endpoint in (new.frm, new.to):
                lst = adj.get(endpoint)
                if lst is None:
                    continue
                adj[endpoint] = [new.id if x in (a_id, b_id) else x for x in lst]
                seen_self = [x for x in adj[endpoint] if x == new.id]
                if len(seen_self) > 1 and new.frm != new.to:
                    adj[endpoint] = [x for x in adj[endpoint] if x != new.id] + [new.id]
                if len(adj[endpoint]) == 2 and endpoint not in queued:
                    queue.append(endpoint)
                    queued.add(endpoint)
            merged += 1
        return merged

    # ------------------------------------------------------------ measures
    def total_length(self) -> float:
        return sum(e.length for e in self.edges.values())

    def global_radius(self) -> float:
        """Length-weighted median edge radius: the drawing's dominant stroke radius.

        Length weighting matters — an unweighted median over edges lets a swarm of
        tiny noise spurs define "the dominant stroke", which is exactly backwards.
        """
        samples: list[tuple[float, float]] = []
        for e in self.edges.values():
            if e.median_radius is None:
                continue
            samples.append((float(e.median_radius), max(e.length, 1e-9)))
        if not samples:
            return 0.0
        samples.sort()
        total = sum(w for _, w in samples)
        acc = 0.0
        for r, w in samples:
            acc += w
            if acc >= total / 2:
                return r
        return samples[-1][0]

    def control_points(self) -> int:
        return sum(e.control_point_count() for e in self.edges.values())

    def stats(self) -> dict[str, Any]:
        deg = self.degree()
        return {
            "nodes": len(self.nodes),
            "edges": len(self.edges),
            "strokes": len(self.edge_components()),
            "terminals": sum(1 for d in deg.values() if d == 1),
            "junctions": sum(1 for d in deg.values() if d >= 3),
            "controlPoints": self.control_points(),
            "bezierSegments": sum(e.bezier_segment_count() for e in self.edges.values()),
            "totalLength": round(self.total_length(), 4),
            "globalRadius": round(self.global_radius(), 4),
        }
