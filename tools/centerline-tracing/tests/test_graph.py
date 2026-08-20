#!/usr/bin/env python3
"""Invariant tests for the shared graph layer."""

from __future__ import annotations

import math
from pathlib import Path

from shapely.geometry import LineString

from centerline_tracing.graph import CenterlineGraph, metrics, prune, restroke, schema, svgio
from centerline_tracing.graph.graph import Edge, Node

CAPABILITY_ROOT = Path(__file__).resolve().parents[1]


def check(name: str, cond: bool, detail: str = "") -> None:
    assert cond, f"{name}: {detail}"


def _chain_graph(*, gap: float = 0.0, radius: float = 10.0) -> CenterlineGraph:
    """Two collinear edges sharing a degree-2 node, optionally with endpoint drift."""
    g = CenterlineGraph(view_box=[0, 0, 400, 200])
    for nid, x in (("a", 40.0), ("m", 200.0), ("b", 360.0)):
        g.nodes[nid] = Node(id=nid, x=x, y=100.0, radius=radius)
    left = [(40.0, 100.0), (200.0, 100.0)]
    right = [(200.0 + gap, 100.0), (360.0, 100.0)]
    g.edges["e1"] = Edge(id="e1", frm="a", to="m", points=left,
                         length=160.0, median_radius=radius,
                         radius_profile=[radius] * 2)
    g.edges["e2"] = Edge(id="e2", frm="m", to="b", points=right,
                         length=160.0 - gap, median_radius=radius,
                         radius_profile=[radius] * 2)
    return g


def test_merge_preserves_geometry() -> None:
    print("merge_chains preserves reconstruction")
    for gap in (0.0, 5.0, 13.7):
        g = _chain_graph(gap=gap)
        before = restroke.graph_to_fill(g)
        gc = g.copy()
        merged = gc.merge_chains()
        after = restroke.graph_to_fill(gc)
        lost = before.difference(after).area
        check(f"gap={gap}: one merge", merged == 1, f"got {merged}")
        check(f"gap={gap}: no area lost", lost < 1e-6, f"lost {lost:.3f}")


def test_merge_preserves_length_and_radius() -> None:
    print("merge_chains preserves length and radius profile")
    g = _chain_graph()
    total = g.total_length()
    gc = g.copy()
    gc.merge_chains()
    check("length preserved", abs(gc.total_length() - total) < 1e-9)
    e = next(iter(gc.edges.values()))
    check("radius profile matches vertex count",
          len(e.radii()) == len(e.points), f"{len(e.radii())} vs {len(e.points)}")
    # `mergedFrom` lists the ids folded IN; the survivor keeps its own id separately
    lineage = set(e.extra.get("mergedFrom", [])) | {e.id}
    check("provenance covers both originals", lineage == {"e1", "e2"}, str(sorted(lineage)))


def test_terminal_edge_is_not_a_bridge() -> None:
    print("is_bridge ignores nodes that merely become orphaned")
    g = _chain_graph()
    g.nodes["t"] = Node(id="t", x=200.0, y=40.0, radius=4.0)
    g.edges["spur"] = Edge(id="spur", frm="m", to="t",
                           points=[(200.0, 100.0), (200.0, 40.0)],
                           length=60.0, median_radius=4.0, radius_profile=[4.0, 4.0])
    check("terminal spur is not a bridge", not g.is_bridge("spur"))
    # e1 is not a bridge either: removing it only orphans node "a", it splits nothing.
    check("truncating edge is not a bridge", not g.is_bridge("e1"))
    # a genuine bridge: geometry on both sides that would be disconnected
    g.nodes["z"] = Node(id="z", x=420.0, y=40.0, radius=4.0)
    g.edges["far"] = Edge(id="far", frm="b", to="z",
                          points=[(360.0, 100.0), (420.0, 40.0)],
                          length=85.0, median_radius=4.0, radius_profile=[4.0, 4.0])
    check("edge with geometry on both sides IS a bridge", g.is_bridge("e2"))


def test_pruning_is_scale_free() -> None:
    print("pruning decisions are invariant to overall scale")

    def build(scale: float) -> CenterlineGraph:
        g = CenterlineGraph(view_box=[0, 0, 400 * scale, 200 * scale])
        r = 10.0 * scale
        g.nodes["a"] = Node(id="a", x=40.0 * scale, y=100.0 * scale, radius=r)
        g.nodes["b"] = Node(id="b", x=360.0 * scale, y=100.0 * scale, radius=r)
        g.nodes["t"] = Node(id="t", x=200.0 * scale, y=92.0 * scale, radius=r * 0.3)
        g.nodes["m"] = Node(id="m", x=200.0 * scale, y=100.0 * scale, radius=r)
        g.edges["main1"] = Edge(id="main1", frm="a", to="m",
                                points=[(40.0 * scale, 100.0 * scale),
                                        (200.0 * scale, 100.0 * scale)],
                                length=160.0 * scale, median_radius=r,
                                radius_profile=[r, r])
        g.edges["main2"] = Edge(id="main2", frm="m", to="b",
                                points=[(200.0 * scale, 100.0 * scale),
                                        (360.0 * scale, 100.0 * scale)],
                                length=160.0 * scale, median_radius=r,
                                radius_profile=[r, r])
        # a spur 0.4 stroke widths long
        g.edges["spur"] = Edge(id="spur", frm="m", to="t",
                               points=[(200.0 * scale, 100.0 * scale),
                                       (200.0 * scale, 92.0 * scale)],
                               length=8.0 * scale, median_radius=r * 0.5,
                               radius_profile=[r, r * 0.3])
        return g

    outcomes = []
    for scale in (0.1, 1.0, 10.0, 1000.0):
        pruned, _ = prune.prune(build(scale), 1.0)
        alive = set(pruned.edges) | {
            i for e in pruned.edges.values() for i in e.extra.get("mergedFrom", [])
        }
        outcomes.append("spur" in alive)
    check("same decision at every scale", len(set(outcomes)) == 1, str(outcomes))
    check("the 0.4-width spur is removed at lam=1", outcomes[0] is False)


def test_fill_rule() -> None:
    print("source polygons honour the fill rule")
    src = svgio.load_source(CAPABILITY_ROOT / "tests" / "fixtures" / "filled" / "house-wide.svg")
    check("house-wide parses", len(src.elements) > 0)
    check("union is valid", src.polygon.is_valid)
    # measured against resvg ink: 184535 vector vs 183262 raster (+0.7%)
    check("area within 2% of the rasterized ink",
          abs(src.polygon.area - 183262) / 183262 < 0.02,
          f"area {src.polygon.area:.0f}")


def test_vector_matches_raster() -> None:
    print("vector score agrees with a raster ink diff")
    src = svgio.load_source(
        CAPABILITY_ROOT / "tests" / "fixtures" / "filled" / "balloon-tall.svg"
    )
    g = svgio.graph_from_stroked_svg(
        CAPABILITY_ROOT / "tests" / "fixtures" / "golden" / "balloon-tall.svg"
    )
    v = metrics.score_graph(g, src)
    r = metrics.raster_ink_diff(g, src)
    check("raster cross-check available", r is not None)
    if r:
        check("vector and raster agree within 0.01",
              abs(v.sym_diff_ratio - r["symDiffRatio"]) < 0.01,
              f"vector {v.sym_diff_ratio:.4f} vs raster {r['symDiffRatio']:.4f}")


def test_schema_round_trip() -> None:
    print("schema round-trips, including dot edges")
    g = _chain_graph()
    g.nodes["d"] = Node(id="d", x=300.0, y=50.0, radius=6.0)
    g.edges["dot"] = Edge(id="dot", frm="d", to="d", points=[(300.0, 50.0)],
                          length=0.0, median_radius=6.0)
    doc = g.to_document()
    rep = schema.validate_document(doc)
    check("validates clean", rep.ok, rep.summary())
    g2 = CenterlineGraph.from_document(doc)
    check("edges survive", set(g2.edges) == set(g.edges))
    check("dot survives as a dot", g2.edges["dot"].is_dot())
    check("dot reconstructs to a disc",
          abs(restroke.edge_to_fill(g2.edges["dot"]).area - math.pi * 36) < 1.0)


def test_boundary_distance_symmetry() -> None:
    print("boundary distance is symmetric and uses P95 not max")
    a = LineString([(0, 0), (100, 0)]).buffer(10)
    b = LineString([(0, 0), (100, 0)]).buffer(11)
    med, p95 = metrics.boundary_distances(a, b, 1.0)
    check("median ~ 1 unit", abs(med - 1.0) < 0.2, f"{med:.3f}")
    check("p95 finite and small", 0.5 < p95 < 2.0, f"{p95:.3f}")
    med2, _ = metrics.boundary_distances(b, a, 1.0)
    check("symmetric", abs(med - med2) < 1e-6, f"{med:.4f} vs {med2:.4f}")


def test_boundary_index_matches_brute_force() -> None:
    print("the indexed boundary distance equals the unindexed one")
    import numpy as np
    import shapely

    # A deliberately awkward pair: a many-armed star against a fat capsule, so
    # nearest segments are genuinely scattered rather than all on one ring.
    arms = [(math.cos(t) * (60 if i % 2 else 100) + 200,
             math.sin(t) * (60 if i % 2 else 100) + 200)
            for i, t in enumerate(np.linspace(0, 2 * math.pi, 41)[:-1])]
    star = shapely.geometry.Polygon(arms)
    blob = LineString([(120, 200), (280, 200)]).buffer(50)

    for a, b in ((star, blob), (blob, star)):
        pts = metrics._boundary_points(a, 2.0)
        brute = shapely.distance(shapely.points(pts), b.boundary)
        fast = metrics.nearest_boundary_distance(pts, b, 2.0)
        check(f"{len(pts)} samples agree to 1e-9",
              float(np.max(np.abs(brute - fast))) < 1e-9,
              f"max delta {float(np.max(np.abs(brute - fast))):.3e}")
        check("every sample got a nearest segment", bool(np.isfinite(fast).all()))


def test_centerline_error_needs_both_directions() -> None:
    print("centerline error separates invented geometry from missed geometry")
    truth = [[[0.0, 0.0], [100.0, 0.0]]]

    exact = CenterlineGraph(view_box=[0, 0, 120, 40])
    exact.nodes["a"] = Node(id="a", x=0.0, y=0.0, radius=10.0)
    exact.nodes["b"] = Node(id="b", x=100.0, y=0.0, radius=10.0)
    exact.edges["e1"] = Edge(id="e1", frm="a", to="b",
                             points=[(0.0, 0.0), (100.0, 0.0)],
                             length=100.0, median_radius=10.0)
    m = metrics.centerline_error(exact, truth)
    check("an exact centerline scores 0", m["centerlineMedian"] < 1e-9,
          f"{m['centerlineMedian']:.6f}")

    # a spur the source never had: invented, not missed
    spurred = exact.copy()
    spurred.nodes["c"] = Node(id="c", x=50.0, y=20.0, radius=10.0)
    spurred.edges["spur"] = Edge(id="spur", frm="b", to="c",
                                 points=[(50.0, 0.0), (50.0, 20.0)],
                                 length=20.0, median_radius=10.0)
    # Both directions have a floor at ~half the densification step, because the
    # two point sets are sampled independently and need not land on each other.
    # Anything below that is sampling noise, not geometry.
    floor = 0.5
    ms = metrics.centerline_error(spurred, truth)
    check("a spurious branch shows up as invented geometry",
          ms["recoveredToTruthP95"] > 5.0, f"{ms['recoveredToTruthP95']:.3f}")
    check("...and not as missed geometry",
          ms["truthToRecoveredP95"] < floor, f"{ms['truthToRecoveredP95']:.3f}")

    # half the stroke deleted: missed, not invented — the over-pruning failure
    half = CenterlineGraph(view_box=[0, 0, 120, 40])
    half.nodes["a"] = Node(id="a", x=0.0, y=0.0, radius=10.0)
    half.nodes["b"] = Node(id="b", x=50.0, y=0.0, radius=10.0)
    half.edges["e1"] = Edge(id="e1", frm="a", to="b",
                            points=[(0.0, 0.0), (50.0, 0.0)],
                            length=50.0, median_radius=10.0)
    mh = metrics.centerline_error(half, truth)
    check("a deleted half shows up as missed geometry",
          mh["truthToRecoveredP95"] > 40.0, f"{mh['truthToRecoveredP95']:.3f}")
    check("...and not as invented geometry",
          mh["recoveredToTruthP95"] < floor, f"{mh['recoveredToTruthP95']:.3f}")
