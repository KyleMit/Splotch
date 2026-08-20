"""Core extraction: SVG -> per-element mask -> medial axis -> Skan graph.

Euclidean medial axis (medial_axis with return_distance=True) + Skan as the graph
layer).  Both outputs of medial_axis are kept: the skeleton gives topology, the
distance field gives the local stroke radius at every skeleton pixel, which is
what makes the width-aware pruning stage possible.
"""
from __future__ import annotations

import time
import warnings
from dataclasses import dataclass, field

import numpy as np
import scipy.ndimage as ndi
from skimage.morphology import medial_axis, remove_small_objects, skeletonize

import raster
import svgio
from graphmodel import CenterlineEdge, CenterlineGraph, CenterlineNode

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)


@dataclass
class ExtractConfig:
    scale: float = 4.0
    method: str = "medial-axis"        # or "skeletonize"
    alpha_threshold: int = 128
    min_object_px: int = 12            # drop specks in the mask
    min_branch_px: int = 3             # drop absurdly short skan paths
    smooth_px: int = 3                 # moving-average window on the pixel chain
    simplify_eps: float = 0.15         # RDP tolerance, SVG units
    resample: float = 0.0              # uniform arc-length step for the fitting
                                       # polyline; 0 => max(0.5, R_med / 8)
    corner_angle: float = 50.0         # degrees; C0 break threshold
    corner_window: float = 0.9         # window as a multiple of local radius
    cap_extend: bool = False           # march terminal ends to the outline, back off R
    margin: float = 2.0                # crop margin, SVG units
    rng_seed: int = 0                  # REQUIRED for determinism, see below


@dataclass
class ElementResult:
    index: int
    fill: str
    mask_px: int
    skeleton_px: int
    n_paths: int
    seconds: float
    failure: str | None = None
    extra: dict = field(default_factory=dict)


# ---------------------------------------------------------------- geometry --

def _moving_average(points: np.ndarray, window: int) -> np.ndarray:
    """Smooth the 1-pixel staircase without moving the endpoints."""
    n = len(points)
    if window < 3 or n < 3:
        return points
    half = window // 2
    out = np.empty_like(points, dtype=float)
    for i in range(n):
        lo, hi = max(0, i - half), min(n, i + half + 1)
        k = min(i - lo, hi - 1 - i)          # symmetric window, shrinking at the ends
        out[i] = points[i - k:i + k + 1].mean(axis=0)
    out[0], out[-1] = points[0], points[-1]
    return out


def _rdp_indices(points: np.ndarray, eps: float) -> list[int]:
    """Douglas-Peucker, returning kept indices (iterative to avoid recursion limits)."""
    n = len(points)
    if n < 3:
        return list(range(n))
    keep = np.zeros(n, dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        seg = points[b] - points[a]
        norm = np.hypot(*seg)
        rel = points[a + 1:b] - points[a]
        if norm < 1e-12:
            dist = np.hypot(rel[:, 0], rel[:, 1])
        else:
            dist = np.abs(rel[:, 0] * seg[1] - rel[:, 1] * seg[0]) / norm
        i = int(np.argmax(dist))
        if dist[i] > eps:
            idx = a + 1 + i
            keep[idx] = True
            stack.append((a, idx))
            stack.append((idx, b))
    return list(np.nonzero(keep)[0])


def resample_uniform(points: np.ndarray, values: np.ndarray, step: float
                     ) -> tuple[np.ndarray, np.ndarray]:
    """Uniform arc-length resampling, carrying a per-vertex value along.

    Schneider fitting (fit-curve) estimates end tangents from the first/last
    couple of samples and does a chord-length parameterisation, so it behaves
    badly on a 3-point near-collinear polyline.  Feeding it a uniformly spaced
    chain is the difference between a clean fit and a control point flung
    across the canvas.
    """
    if len(points) < 3 or step <= 0:
        return points, values
    seg = np.hypot(*np.diff(points, axis=0).T)
    s = np.r_[0.0, np.cumsum(seg)]
    if s[-1] <= step:
        return points, values
    n = max(3, int(round(s[-1] / step)) + 1)
    t = np.linspace(0.0, s[-1], n)
    out = np.column_stack([np.interp(t, s, points[:, 0]), np.interp(t, s, points[:, 1])])
    vals = np.interp(t, s, values)
    return out, vals


def polyline_length(points: np.ndarray) -> float:
    if len(points) < 2:
        return 0.0
    return float(np.hypot(*np.diff(points, axis=0).T).sum())


def detect_corners(points: np.ndarray, radii: np.ndarray, angle_deg: float,
                   window_mult: float) -> list[int]:
    """Genuine corners kept as C0 breaks before Bézier fitting.

    The window is measured in arc length and scaled by the *local stroke
    radius*, so the same threshold works on a fat marker stroke and a thin one.
    """
    n = len(points)
    if n < 5:
        return []
    seg = np.hypot(*np.diff(points, axis=0).T)
    s = np.r_[0.0, np.cumsum(seg)]
    thresh = np.radians(angle_deg)
    scores = np.zeros(n)
    for i in range(1, n - 1):
        win = max(float(radii[i]) * window_mult, 1e-6)
        j = int(np.searchsorted(s, s[i] - win, side="left"))
        k = int(np.searchsorted(s, s[i] + win, side="right")) - 1
        j, k = min(j, i - 1), max(k, i + 1)
        if j < 0 or k > n - 1:
            continue
        a, b = points[i] - points[j], points[k] - points[i]
        na, nb = np.hypot(*a), np.hypot(*b)
        if na < 1e-9 or nb < 1e-9:
            continue
        cos = float(np.clip(np.dot(a, b) / (na * nb), -1.0, 1.0))
        scores[i] = np.arccos(cos)
    corners: list[int] = []
    order = np.argsort(-scores)
    taken = np.zeros(n, dtype=bool)
    for i in order:
        if scores[i] < thresh:
            break
        win = max(float(radii[i]) * window_mult, 1e-6)
        lo = np.searchsorted(s, s[i] - win)
        hi = np.searchsorted(s, s[i] + win)
        if taken[lo:hi].any():
            continue
        taken[i] = True
        corners.append(int(i))
    return sorted(corners)


def _march_to_edge(mask: np.ndarray, start_rc: np.ndarray, direction_rc: np.ndarray,
                   limit_px: float) -> float:
    """Distance in px from `start` along `direction` until the mask ends."""
    d = direction_rc / (np.hypot(*direction_rc) + 1e-12)
    h, w = mask.shape
    step, travelled = 0.5, 0.0
    while travelled < limit_px:
        travelled += step
        r, c = start_rc + d * travelled
        ri, ci = int(round(r)), int(round(c))
        if ri < 0 or ci < 0 or ri >= h or ci >= w or not mask[ri, ci]:
            return travelled - step
    return travelled


# --------------------------------------------------------------- extraction --

def skeletonize_mask(mask: np.ndarray, method: str, rng_seed: int = 0
                     ) -> tuple[np.ndarray, np.ndarray]:
    """Returns (skeleton, distance).  Distance is always the true Euclidean DT.

    NOTE (determinism): `skimage.morphology.medial_axis` randomises
    the pixel ordering it uses to break thinning ties, and its `rng` argument
    defaults to None.  Calling it twice on the *same* mask therefore returns
    *different* skeletons — verified on skimage 0.26.0 — which silently makes
    scores irreproducible.  Passing a fixed seed is mandatory, not hygiene.
    `skeletonize()` has no such parameter and is already deterministic.
    """
    if method == "medial-axis":
        skel, dist = medial_axis(mask, return_distance=True, rng=rng_seed)
        return skel, dist
    if method == "skeletonize":
        skel = skeletonize(mask)
        dist = ndi.distance_transform_edt(mask)
        return skel, dist
    raise ValueError(f"unknown skeleton method {method!r}")


def extract_document(doc: svgio.SvgDoc, cfg: ExtractConfig
                     ) -> tuple[CenterlineGraph, list[ElementResult]]:
    from skan import Skeleton, summarize

    graph = CenterlineGraph(
        image=doc.id,
        backend=f"skimage-skan/{cfg.method}",
        viewBox=list(doc.viewbox),
        meta={
            "scale": cfg.scale,
            "method": cfg.method,
            "simplifyEps": cfg.simplify_eps,
            "smoothPx": cfg.smooth_px,
            "cornerAngle": cfg.corner_angle,
            "capExtend": cfg.cap_extend,
        },
    )
    results: list[ElementResult] = []

    jobs = []
    boxes = []
    for e in doc.elements:
        box = raster.pad_box(e.bbox, cfg.margin, doc.viewbox)
        boxes.append(box)
        jobs.append((svgio.element_svg(e, box, cfg.scale), box, cfg.scale))
    t0 = time.perf_counter()
    rasters = raster.render_many(jobs, cfg.alpha_threshold)
    raster_seconds = time.perf_counter() - t0

    for element, rast in zip(doc.elements, rasters):
        t_el = time.perf_counter()
        mask = rast.mask
        raw_px = int(mask.sum())
        if cfg.min_object_px > 0:
            mask = remove_small_objects(mask, cfg.min_object_px)
        mask_px = int(mask.sum())
        if mask_px == 0:
            # Distinguish "this element is a sub-pixel speck in the source" from
            # "we lost a real stroke": only the latter is a backend failure.
            reason = "subpixel-element" if raw_px < cfg.min_object_px else "empty-mask"
            results.append(ElementResult(element.index, element.fill, 0, 0, 0,
                                         time.perf_counter() - t_el, failure=reason,
                                         extra={"rawMaskPx": raw_px}))
            continue

        skel, dist = skeletonize_mask(mask, cfg.method, cfg.rng_seed)
        skel_px = int(skel.sum())
        if skel_px < 2:
            results.append(ElementResult(element.index, element.fill, mask_px, skel_px, 0,
                                         time.perf_counter() - t_el, failure="degenerate-skeleton"))
            continue

        try:
            sk = Skeleton(skel)
            summary = summarize(sk, separator="_")
        except Exception as exc:  # pragma: no cover - skan edge cases
            results.append(ElementResult(element.index, element.fill, mask_px, skel_px, 0,
                                         time.perf_counter() - t_el, failure=f"skan:{exc}"))
            continue

        elem_id = f"e{element.index}"
        node_ids: dict[int, str] = {}

        def node_for(skan_node: int) -> str:
            if skan_node in node_ids:
                return node_ids[skan_node]
            r, c = sk.coordinates[skan_node]
            x, y = rast.px_to_svg(np.array([r]), np.array([c]))
            nid = f"{elem_id}n{skan_node}"
            graph.nodes.append(CenterlineNode(
                id=nid, x=float(x[0]), y=float(y[0]),
                radius=float(dist[int(round(r)), int(round(c))]) / cfg.scale,
                degree=int(sk.degrees[skan_node]),
            ))
            node_ids[skan_node] = nid
            return nid

        n_paths = 0
        cap_deltas: list[float] = []
        for i in range(sk.n_paths):
            px = sk.path_coordinates(i)          # (n, 2) float pixel coords, ordered
            if len(px) < max(2, cfg.min_branch_px):
                continue
            rows = np.clip(np.rint(px[:, 0]).astype(int), 0, mask.shape[0] - 1)
            cols = np.clip(np.rint(px[:, 1]).astype(int), 0, mask.shape[1] - 1)
            radii_full = dist[rows, cols] / cfg.scale

            row = summary.iloc[i]
            branch_type = int(row["branch_type"])
            src, dst = int(row["node_id_src"]), int(row["node_id_dst"])
            closed = branch_type == 3 or src == dst

            smoothed_px = _moving_average(px.astype(float), cfg.smooth_px)
            xs, ys = rast.px_to_svg(smoothed_px[:, 0], smoothed_px[:, 1])
            pts = np.column_stack([xs, ys])

            if not closed:
                # Always *measure* cap mismatch, whether or not we correct it:
                # how far the outline is past the skeleton end, versus the local
                # radius.  A round cap gives ~0; a taper or butt cap does not.
                free = (int(sk.degrees[src]) == 1, int(sk.degrees[dst]) == 1)
                cap_deltas += _cap_deltas(radii_full, sk, i, mask, cfg, free)
                if cfg.cap_extend:
                    pts, radii_full = _extend_caps(pts, radii_full, sk, i, mask,
                                                   rast, cfg, free)

            r_med_raw = float(np.median(radii_full)) or 1.0
            step = cfg.resample if cfg.resample > 0 else max(0.5, r_med_raw / 8.0)
            dense, dense_radii = resample_uniform(pts, radii_full, step)

            # Corners are found on the dense chain, then forced to survive
            # simplification so the same C0 breaks exist in both index spaces.
            dense_corners = detect_corners(dense, dense_radii, cfg.corner_angle,
                                           cfg.corner_window)
            keep = sorted(set(_rdp_indices(dense, cfg.simplify_eps)) | set(dense_corners))
            pts_s = dense[keep]
            radii_s = dense_radii[keep]
            if len(pts_s) < 2:
                continue
            pos = {k: i for i, k in enumerate(keep)}
            corners = [pos[c] for c in dense_corners if c in pos]

            length = polyline_length(pts_s)
            med = float(np.median(radii_s))
            mean = float(np.mean(radii_s))

            graph.edges.append(CenterlineEdge(
                id=f"{elem_id}b{i}",
                from_=node_for(src),
                to=node_for(dst),
                geometry=[[float(a), float(b)] for a, b in pts_s],
                length=length,
                medianRadius=med,
                sourceElementId=elem_id,
                radii=[float(r) for r in radii_s],
                corners=corners,
                branchType=branch_type,
                meanRadius=mean,
                minRadius=float(np.min(radii_s)),
                maxRadius=float(np.max(radii_s)),
                radiusCv=float(np.std(radii_s) / mean) if mean > 0 else None,
                normLength=float(length / (2 * med)) if med > 0 else None,
                closed=bool(closed),
                fitPoints=[[float(a), float(b)] for a, b in dense],
                fitCorners=list(dense_corners),
                fitRadii=[float(r) for r in dense_radii],
            ))
            n_paths += 1

        results.append(ElementResult(
            index=element.index, fill=element.fill, mask_px=mask_px, skeleton_px=skel_px,
            n_paths=n_paths, seconds=time.perf_counter() - t_el,
            extra={"box": list(boxes[element.index]),
                   "maskArea": mask_px / (cfg.scale ** 2),
                   "maxRadius": float(dist.max()) / cfg.scale,
                   "maskComponents": int(ndi.label(mask)[1]),
                   "skeletonComponents": int(ndi.label(skel, np.ones((3, 3)))[1]),
                   "terminalEnds": len(cap_deltas),
                   "capArtifacts": int(sum(1 for d in cap_deltas if abs(d) > 0.25)),
                   "capDeltaMedian": float(np.median(cap_deltas)) if cap_deltas else None},
        ))

    graph.meta["rasterSeconds"] = raster_seconds
    graph.meta["elementSeconds"] = float(sum(r.seconds for r in results))
    return graph, results


def _cap_deltas(radii: np.ndarray, sk, path_index: int, mask: np.ndarray,
                cfg: ExtractConfig, free: tuple[bool, bool]) -> list[float]:
    """(outline reach - local radius) / local radius at each FREE end.

    Only degree-1 ends count.  Marching outward from a junction node hits the
    far side of the other stroke, which would flag every junction as a cap
    artifact — the first version of this detector did exactly that.
    """
    px = sk.path_coordinates(path_index)
    if len(px) < 4:
        return []
    out = []
    for idx, start_rc, dir_rc in (
        (0, px[0], px[0] - px[3]),
        (len(px) - 1, px[-1], px[-1] - px[-4]),
    ):
        if not free[0 if idx == 0 else 1]:
            continue
        r_local = float(radii[idx]) * cfg.scale
        if r_local < 1.0:
            continue
        reach = _march_to_edge(mask, np.asarray(start_rc, float),
                               np.asarray(dir_rc, float), limit_px=r_local * 2.5 + 4)
        out.append((reach - r_local) / r_local)
    return out


def _extend_caps(pts: np.ndarray, radii: np.ndarray, sk, path_index: int,
                 mask: np.ndarray, rast: raster.Raster, cfg: ExtractConfig,
                 free: tuple[bool, bool]) -> tuple[np.ndarray, np.ndarray]:
    """Push a terminal end out to the outline, then back off one local radius.

    The `--calibrate-caps` trick from the tool this replaced (the tool this replaced).
    Only applied where the skeleton end really is degree 1.
    """
    px = sk.path_coordinates(path_index)
    out_pts, out_radii = pts.copy(), radii.copy()
    ends = []
    if len(px) >= 4:
        if free[0]:
            ends.append((0, px[0], px[0] - px[min(3, len(px) - 1)]))
        if free[1]:
            ends.append((len(px) - 1, px[-1], px[-1] - px[max(0, len(px) - 4)]))
    for idx, start_rc, dir_rc in ends:
        r_local = float(radii[idx]) * cfg.scale
        reach = _march_to_edge(mask, np.asarray(start_rc, float), np.asarray(dir_rc, float),
                               limit_px=r_local * 2.5 + 4)
        delta = reach - r_local
        if abs(delta) < 0.5:
            continue
        d = np.asarray(dir_rc, float)
        d = d / (np.hypot(*d) + 1e-12)
        new_rc = np.asarray(start_rc, float) + d * delta
        x, y = rast.px_to_svg(np.array([new_rc[0]]), np.array([new_rc[1]]))
        out_pts[idx] = [x[0], y[0]]
    return out_pts, out_radii
