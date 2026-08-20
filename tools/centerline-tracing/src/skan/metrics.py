"""Re-stroke reconstruction metrics for this pipeline.

All areas/distances are reported in SVG user units, so numbers are comparable
across images with different canvas sizes.
"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

import numpy as np
import scipy.ndimage as ndi
from scipy.spatial import cKDTree

import raster
import svgio
from graphmodel import CenterlineGraph

REPO = Path(__file__).resolve().parent.parent.parent


def mask_svg_from_svg_file(path: Path, box, scale) -> str:
    """White-on-black mask SVG for an arbitrary SVG file (strokes included).

    The file's own <svg> wrapper is dropped and its children are re-hosted in a
    canvas with the requested crop box, with every explicit colour rewritten to
    white.  Attribute rewriting is used rather than a CSS override because it
    does not depend on the renderer's CSS support.  This is what lets a
    *stroked* output be compared against the *filled* input.
    """
    text = Path(path).read_text()
    body = re.sub(r"(?s)^.*?<svg[^>]*>", "", text, count=1)
    body = re.sub(r"(?s)</svg>\s*$", "", body)
    body = re.sub(r'(fill|stroke)="(?!none")[^"]*"', r'\1="#ffffff"', body)
    x, y, w, h = box
    width, height = svgio._px(box, scale)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
        f'viewBox="{x} {y} {w} {h}" width="{width}" height="{height}">'
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#000"/>'
        f'{body}</svg>'
    )


def boundary(mask: np.ndarray) -> np.ndarray:
    return mask & ~ndi.binary_erosion(mask, np.ones((3, 3), bool), border_value=0)


def shape_metrics(orig: np.ndarray, recon: np.ndarray, scale: float) -> dict:
    inter = int((orig & recon).sum())
    union = int((orig | recon).sum())
    sym = int((orig ^ recon).sum())
    px_area = 1.0 / (scale ** 2)
    out = {
        "iou": inter / union if union else 1.0,
        "symDiffArea": sym * px_area,
        "origArea": int(orig.sum()) * px_area,
        "reconArea": int(recon.sum()) * px_area,
        "symDiffFrac": sym / max(1, int(orig.sum())),
        "missedFrac": int((orig & ~recon).sum()) / max(1, int(orig.sum())),
        "addedFrac": int((recon & ~orig).sum()) / max(1, int(orig.sum())),
    }
    bo, br = boundary(orig), boundary(recon)
    if bo.any() and br.any():
        d_to_o = ndi.distance_transform_edt(~bo) / scale
        d_to_r = ndi.distance_transform_edt(~br) / scale
        a = d_to_o[br]
        b = d_to_r[bo]
        both = np.concatenate([a, b])
        out.update({
            "boundaryMedian": float(np.median(both)),
            "boundaryP95": float(np.percentile(both, 95)),
            "boundaryReconToOrigMedian": float(np.median(a)),
            "boundaryOrigToReconMedian": float(np.median(b)),
        })
    return out


def restroke_score(doc: svgio.SvgDoc, recon_svg: Path, scale: float = 4.0) -> dict:
    box = (doc.viewbox[0], doc.viewbox[1], doc.viewbox[2], doc.viewbox[3])
    jobs = [
        (svgio.doc_svg(doc, box, scale), box, scale),
        (mask_svg_from_svg_file(recon_svg, box, scale), box, scale),
    ]
    orig, recon = raster.render_many(jobs)
    return shape_metrics(orig.mask, recon.mask, scale)


def centerline_error(graph: CenterlineGraph, truth: list[list[list[float]]],
                     sample: float = 0.5) -> dict:
    """Two-way nearest-distance error vs the known source centerlines.

    Only meaningful on the synthetic corpus.  `recovered->truth` says "did we
    invent geometry"; `truth->recovered` says "did we miss any".
    """
    def densify(lines):
        pts = []
        for line in lines:
            arr = np.asarray(line, float)
            if len(arr) < 2:
                pts.append(arr)
                continue
            seg = np.hypot(*np.diff(arr, axis=0).T)
            s = np.r_[0.0, np.cumsum(seg)]
            n = max(2, int(s[-1] / sample))
            t = np.linspace(0, s[-1], n)
            pts.append(np.column_stack([np.interp(t, s, arr[:, 0]), np.interp(t, s, arr[:, 1])]))
        return np.vstack(pts) if pts else np.zeros((0, 2))

    got = densify([e.geometry for e in graph.edges if len(e.geometry) >= 2])
    want = densify(truth)
    if len(got) == 0 or len(want) == 0:
        return {"centerlineMedian": None, "centerlineP95": None, "centerlineHausdorff": None}
    d1, _ = cKDTree(want).query(got)
    d2, _ = cKDTree(got).query(want)
    both = np.concatenate([d1, d2])
    return {
        "centerlineMedian": float(np.median(both)),
        "centerlineP95": float(np.percentile(both, 95)),
        "centerlineHausdorff": float(max(d1.max(), d2.max())),
        "recoveredToTruthP95": float(np.percentile(d1, 95)),
        "truthToRecoveredP95": float(np.percentile(d2, 95)),
    }


def complexity(graph: CenterlineGraph, svg_path: Path | None = None) -> dict:
    from emit import bezier_segment_count, control_point_count
    poly_pts = int(sum(len(e.geometry) for e in graph.edges))
    out = {
        "nodes": len(graph.nodes),
        "edges": len(graph.edges),
        "polylinePoints": poly_pts,
        "bezierSegments": bezier_segment_count(graph),
        "controlPoints": control_point_count(graph),
        "totalLength": graph.total_length,
        "junctions": sum(1 for n in graph.nodes if (n.degree or 0) >= 3),
        "endpoints": sum(1 for n in graph.nodes if (n.degree or 0) == 1),
    }
    radii = [e.medianRadius for e in graph.edges if e.medianRadius]
    cvs = [e.radiusCv for e in graph.edges if e.radiusCv is not None]
    if radii:
        out["medianRadius"] = float(np.median(radii))
        out["radiusSpread"] = float(np.percentile(radii, 90) - np.percentile(radii, 10))
    if cvs:
        out["widthErrorMeanCv"] = float(np.mean(cvs))
        out["widthErrorMedianCv"] = float(np.median(cvs))
    if svg_path is not None and Path(svg_path).exists():
        out["fileBytes"] = Path(svg_path).stat().st_size
    return out


def pixel_diff(input_svg: Path, output_svg: Path, size: int = 1200,
               diff_png: Path | None = None) -> float | None:
    """The incumbent's src/compare.js, kept for continuity of numbers."""
    diff = str(diff_png) if diff_png else "runs/scratch_diff.png"
    Path(diff).parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        ["node", "src/compare.js", str(input_svg), str(output_svg), str(size), diff],
        capture_output=True, text=True, cwd=str(REPO),
    )
    if proc.returncode != 0:
        return None
    m = re.search(r"=\s*([0-9.]+)%", proc.stdout)
    return float(m.group(1)) if m else None


def failure_tags(graph: CenterlineGraph, results, cfg) -> dict[str, int]:
    """The failure-tag taxonomy, counted mechanically.

    These are *heuristic detectors*, deliberately simple, so the counts are
    comparable across tracks rather than hand-curated.
    """
    tags = {
        "cap artifact": 0,
        "join artifact": 0,
        "outline noise branch": 0,
        "crossing ambiguity": 0,
        "disconnected skeleton": 0,
        "missing narrow segment": 0,
        "wrong endpoint": 0,
        "excessive curve complexity": 0,
        "raster quantization": 0,
    }
    deg = {n.id: (n.degree or 0) for n in graph.nodes}
    for e in graph.edges:
        norm = e.normLength
        is_terminal = deg.get(e.from_, 0) == 1 or deg.get(e.to, 0) == 1
        if norm is None:
            continue
        if is_terminal and 0.2 <= norm < 0.6:
            tags["outline noise branch"] += 1
        if norm < 0.2:
            tags["raster quantization"] += 1
        # The Y-fan a T junction makes: a short bridge between two junctions.
        if not is_terminal and norm < 1.0:
            tags["join artifact"] += 1
        # "too many curves for the amount of stroke" — only meaningful on edges
        # that are at least one stroke width long, else every spur trips it.
        if e.beziers and norm >= 1.0:
            per_unit = len(e.beziers) / max(e.length, 1e-6) * (2 * (e.medianRadius or 1))
            if per_unit > 1.5:
                tags["excessive curve complexity"] += 1
    # degree-4 nodes: "two crossing strokes" vs "one four-way junction" is
    # genuinely ambiguous and is the pruning stage's call, not the extractor's.
    tags["crossing ambiguity"] = sum(1 for n in graph.nodes if (n.degree or 0) >= 4)
    for r in results:
        if r.failure in ("degenerate-skeleton", "empty-mask"):
            tags["missing narrow segment"] += 1
        # measured during extraction: terminal ends where the outline is more
        # than 25% of a local radius away from where a round cap would put it
        tags["cap artifact"] += int(r.extra.get("capArtifacts") or 0)
    # disconnected skeleton: the skeleton fragmented into MORE pieces than the
    # mask itself had.  An element that legitimately contains several separate
    # blobs is not a failure, so the mask component count is the baseline.
    for r in results:
        mc = r.extra.get("maskComponents")
        sc = r.extra.get("skeletonComponents")
        if mc and sc and sc > mc:
            tags["disconnected skeleton"] += sc - mc
    return tags
