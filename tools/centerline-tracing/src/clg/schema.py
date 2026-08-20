"""Centerline graph schema, version 1.

The normative description lives in docs/graph-schema.md. This module is
the executable copy: it defines the version string, the accepted geometry
encodings, and a validator that every track can run against its own graph JSON.

Design rule: the schema is DESCRIPTIVE of what the seven extraction tracks
already emit, not prescriptive of something new. Anything a track already writes
is either required, optional-and-named, or preserved verbatim under `meta`.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

SCHEMA_VERSION = "centerline-graph/1"

# Fields a conforming document may carry at the top level. Anything else is kept
# but reported as an unknown-key note by the validator.
KNOWN_DOC_KEYS = {
    "schema",
    "schemaVersion",  # accepted alias (opencv-tracing uses this spelling)
    "backend",
    "slug",
    "producer",
    "image",
    "source",
    "units",
    "viewBox",
    "radiusSource",
    "nodes",
    "edges",
    "meta",
    "stats",
    "options",
    "params",
    # extension blocks observed in the wild; preserved, not interpreted here
    "raster",
    "radius",
    "strokeOrderMeta",
}

KNOWN_NODE_KEYS = {"id", "x", "y", "radius", "degree"}
KNOWN_EDGE_KEYS = {
    "id",
    "from",
    "to",
    "geometry",
    "geometryType",
    "length",
    "medianRadius",
    "radiusProfile",
    "radii",  # accepted alias of radiusProfile
    "sourceElementId",
    "sourceElementFill",
    "sourceFill",
    "closed",
    # extension fields observed in the wild
    "beziers",
    "corners",
    "branchType",
    "meanRadius",
    "minRadius",
    "maxRadius",
    "radiusCv",
    "radiusStd",
    "normLength",
    "widthRuns",
    "outlineLike",
    "strokeOrder",
}

SEVERITY_ERROR = "error"
SEVERITY_WARN = "warn"
SEVERITY_NOTE = "note"


@dataclass
class Issue:
    severity: str
    code: str
    message: str
    where: str = ""

    def __str__(self) -> str:  # pragma: no cover - display only
        loc = f" [{self.where}]" if self.where else ""
        return f"{self.severity.upper():5s} {self.code}{loc}: {self.message}"


@dataclass
class ValidationReport:
    issues: list[Issue] = field(default_factory=list)

    def add(self, severity: str, code: str, message: str, where: str = "") -> None:
        self.issues.append(Issue(severity, code, message, where))

    @property
    def errors(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == SEVERITY_ERROR]

    @property
    def warnings(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == SEVERITY_WARN]

    @property
    def notes(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == SEVERITY_NOTE]

    @property
    def ok(self) -> bool:
        return not self.errors

    def summary(self) -> str:
        return (
            f"{len(self.errors)} error(s), {len(self.warnings)} warning(s), "
            f"{len(self.notes)} note(s)"
        )


def _finite(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def classify_geometry(geom: Any) -> str:
    """Return 'polyline-pairs' | 'polyline-objects' | 'beziers' | 'unknown'.

    Accepted encodings (all three are in production use across the tracks):
      polyline-pairs   [[x, y], ...]                       flo-mat/autotrace/opencv/skimage/native
      polyline-objects [{"x": x, "y": y}, ...]             polygon-voronoi/tegaki
      beziers          [[[x,y],[x,y],[x,y],[x,y]], ...]    flo-mat (cubic segments)
    """
    if not isinstance(geom, list) or not geom:
        return "unknown"
    head = geom[0]
    if isinstance(head, dict):
        return "polyline-objects" if "x" in head and "y" in head else "unknown"
    if isinstance(head, (list, tuple)):
        if len(head) >= 2 and all(_finite(v) for v in head[:2]):
            return "polyline-pairs"
        if head and isinstance(head[0], (list, tuple)):
            return "beziers"
    return "unknown"


def validate_document(
    doc: Any,
    *,
    strict: bool = False,
    endpoint_tol: float = 1e-3,
    length_tol: float = 0.05,
) -> ValidationReport:
    """Validate a raw graph document (already parsed from JSON).

    strict=True promotes warnings about optional-but-strongly-recommended fields
    (schema string, radius, medianRadius, sourceElementId) to errors.
    """
    rep = ValidationReport()

    if not isinstance(doc, dict):
        rep.add(SEVERITY_ERROR, "doc-type", "document root must be a JSON object")
        return rep

    declared = doc.get("schema") or doc.get("schemaVersion")
    if declared is None:
        rep.add(
            SEVERITY_ERROR if strict else SEVERITY_WARN,
            "schema-missing",
            f'no "schema" field; expected "{SCHEMA_VERSION}"',
        )
    elif str(declared) != SCHEMA_VERSION:
        rep.add(
            SEVERITY_WARN,
            "schema-version",
            f'schema is "{declared}", this validator implements "{SCHEMA_VERSION}"',
        )

    for key in doc:
        if key not in KNOWN_DOC_KEYS:
            rep.add(SEVERITY_NOTE, "doc-extra-key", f'unknown top-level key "{key}"')

    nodes = doc.get("nodes")
    edges = doc.get("edges")
    if not isinstance(nodes, list):
        rep.add(SEVERITY_ERROR, "nodes-missing", '"nodes" must be an array')
        return rep
    if not isinstance(edges, list):
        rep.add(SEVERITY_ERROR, "edges-missing", '"edges" must be an array')
        return rep

    # ---- nodes -------------------------------------------------------------
    node_pos: dict[str, tuple[float, float]] = {}
    node_radius: dict[str, float | None] = {}
    seen_ids: set[str] = set()
    missing_radius = 0
    for i, n in enumerate(nodes):
        where = f"nodes[{i}]"
        if not isinstance(n, dict):
            rep.add(SEVERITY_ERROR, "node-type", "node must be an object", where)
            continue
        nid = n.get("id")
        if not isinstance(nid, str) or not nid:
            rep.add(SEVERITY_ERROR, "node-id", "node.id must be a non-empty string", where)
            continue
        if nid in seen_ids:
            rep.add(SEVERITY_ERROR, "node-id-dup", f'duplicate node id "{nid}"', where)
        seen_ids.add(nid)
        if not (_finite(n.get("x")) and _finite(n.get("y"))):
            rep.add(SEVERITY_ERROR, "node-xy", "node.x/node.y must be finite numbers", where)
            continue
        node_pos[nid] = (float(n["x"]), float(n["y"]))
        r = n.get("radius")
        if r is None:
            missing_radius += 1
            node_radius[nid] = None
        elif not _finite(r) or r < 0:
            rep.add(SEVERITY_ERROR, "node-radius", "node.radius must be finite and >= 0", where)
            node_radius[nid] = None
        else:
            node_radius[nid] = float(r)
        for key in n:
            if key not in KNOWN_NODE_KEYS:
                rep.add(SEVERITY_NOTE, "node-extra-key", f'unknown node key "{key}"', where)

    if missing_radius:
        rep.add(
            SEVERITY_ERROR if strict else SEVERITY_WARN,
            "node-radius-absent",
            f"{missing_radius}/{len(nodes)} nodes carry no radius; "
            "width-aware pruning degrades to length-only for those",
        )

    # ---- edges -------------------------------------------------------------
    seen_edge_ids: set[str] = set()
    no_median = 0
    no_source = 0
    for i, e in enumerate(edges):
        where = f"edges[{i}]"
        if not isinstance(e, dict):
            rep.add(SEVERITY_ERROR, "edge-type", "edge must be an object", where)
            continue
        eid = e.get("id")
        if not isinstance(eid, str) or not eid:
            rep.add(SEVERITY_ERROR, "edge-id", "edge.id must be a non-empty string", where)
        else:
            if eid in seen_edge_ids:
                rep.add(SEVERITY_ERROR, "edge-id-dup", f'duplicate edge id "{eid}"', where)
            seen_edge_ids.add(eid)
            where = f"edges[{i}] {eid}"

        for endpoint in ("from", "to"):
            ref = e.get(endpoint)
            if not isinstance(ref, str):
                rep.add(SEVERITY_ERROR, "edge-endpoint",
                        f"edge.{endpoint} must be a node id string", where)
            elif ref not in node_pos:
                rep.add(SEVERITY_ERROR, "edge-dangling",
                        f'edge.{endpoint} = "{ref}" is not a declared node', where)

        geom = e.get("geometry")
        kind = classify_geometry(geom)
        if kind == "unknown":
            rep.add(SEVERITY_ERROR, "edge-geometry",
                    "geometry must be [[x,y],...], [{x,y},...] or a list of cubic beziers",
                    where)
            continue
        declared_kind = e.get("geometryType")
        if declared_kind and declared_kind not in ("polyline", "beziers"):
            rep.add(SEVERITY_WARN, "edge-geometry-type",
                    f'geometryType "{declared_kind}" is not "polyline" or "beziers"', where)

        pts = geometry_points(geom, kind)
        if len(pts) == 1:
            # A DOT edge: an isolated mark with no extent (tegaki emits these for
            # single-pixel skeleton components). Legal, but only in this exact form.
            if e.get("from") != e.get("to"):
                rep.add(SEVERITY_ERROR, "edge-dot-endpoints",
                        "single-point geometry is a dot edge and requires from == to", where)
            if e.get("length") not in (0, 0.0):
                rep.add(SEVERITY_ERROR, "edge-dot-length",
                        "a dot edge must declare length 0", where)
            if e.get("medianRadius") is None:
                rep.add(SEVERITY_WARN, "edge-dot-radius",
                        "a dot edge without medianRadius cannot be reconstructed", where)
            continue
        if len(pts) < 2:
            rep.add(SEVERITY_ERROR, "edge-geometry-short",
                    "geometry must contain at least 1 point (dot) or 2+ points (path)", where)
            continue
        if not all(_finite(p[0]) and _finite(p[1]) for p in pts):
            rep.add(SEVERITY_ERROR, "edge-geometry-nan",
                    "geometry contains non-finite coordinates", where)
            continue

        # endpoints must agree with the referenced nodes
        for endpoint, pt in (("from", pts[0]), ("to", pts[-1])):
            ref = e.get(endpoint)
            if isinstance(ref, str) and ref in node_pos:
                nx, ny = node_pos[ref]
                d = math.hypot(nx - pt[0], ny - pt[1])
                scale = max(1.0, abs(nx), abs(ny))
                if d > endpoint_tol * scale:
                    rep.add(SEVERITY_WARN, "edge-endpoint-drift",
                            f"geometry {endpoint}-end is {d:.4g} units from node "
                            f'"{ref}"', where)

        declared_len = e.get("length")
        actual = polyline_length(pts)
        if declared_len is None:
            rep.add(SEVERITY_ERROR, "edge-length-missing", "edge.length is required", where)
        elif not _finite(declared_len) or declared_len < 0:
            rep.add(SEVERITY_ERROR, "edge-length", "edge.length must be finite and >= 0", where)
        elif actual > 0 and abs(declared_len - actual) > length_tol * max(actual, 1e-9):
            # beziers legitimately differ from their control polygon; only flag polylines
            if kind != "beziers":
                rep.add(SEVERITY_WARN, "edge-length-mismatch",
                        f"declared length {declared_len:.4g} vs polyline length "
                        f"{actual:.4g} ({abs(declared_len - actual) / max(actual, 1e-9):.1%})",
                        where)

        mr = e.get("medianRadius")
        if mr is None:
            no_median += 1
        elif not _finite(mr) or mr < 0:
            rep.add(SEVERITY_ERROR, "edge-median-radius",
                    "edge.medianRadius must be finite and >= 0", where)

        prof = e.get("radiusProfile", e.get("radii"))
        if prof is not None:
            if not isinstance(prof, list) or not all(_finite(v) for v in prof):
                rep.add(SEVERITY_ERROR, "edge-radius-profile",
                        "radiusProfile/radii must be an array of finite numbers", where)
            elif len(prof) != len(pts) and kind != "beziers":
                rep.add(SEVERITY_NOTE, "edge-radius-profile-len",
                        f"radiusProfile has {len(prof)} samples for {len(pts)} points; "
                        "it will be resampled", where)

        if not e.get("sourceElementId"):
            no_source += 1

        for key in e:
            if key not in KNOWN_EDGE_KEYS:
                rep.add(SEVERITY_NOTE, "edge-extra-key", f'unknown edge key "{key}"', where)

    if no_median:
        rep.add(
            SEVERITY_ERROR if strict else SEVERITY_WARN,
            "edge-median-radius-absent",
            f"{no_median}/{len(edges)} edges carry no medianRadius; re-stroke scoring "
            "must fall back to node radii",
        )
    if no_source:
        rep.add(
            SEVERITY_WARN if strict else SEVERITY_NOTE,
            "edge-source-absent",
            f"{no_source}/{len(edges)} edges carry no sourceElementId; per-element "
            "scoring and stroke grouping are unavailable for those",
        )

    return rep


def geometry_points(geom: Any, kind: str | None = None) -> list[tuple[float, float]]:
    """Flatten any accepted geometry encoding to a polyline of (x, y).

    Bezier segments are flattened at their control points plus adaptive
    subdivision, which is handled in geom.py; here we only need endpoints and a
    coarse polygon for validation, so control points suffice.
    """
    kind = kind or classify_geometry(geom)
    if kind == "polyline-pairs":
        return [(float(p[0]), float(p[1])) for p in geom]
    if kind == "polyline-objects":
        return [(float(p["x"]), float(p["y"])) for p in geom]
    if kind == "beziers":
        pts: list[tuple[float, float]] = []
        for seg in geom:
            for p in seg:
                q = (float(p[0]), float(p[1]))
                if not pts or pts[-1] != q:
                    pts.append(q)
        return pts
    return []


def polyline_length(pts: list[tuple[float, float]]) -> float:
    return sum(
        math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
        for i in range(len(pts) - 1)
    )
