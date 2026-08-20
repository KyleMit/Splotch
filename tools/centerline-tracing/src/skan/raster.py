"""Deterministic rasterization via resvg.

Coordinate convention used everywhere in this track
---------------------------------------------------
A crop box (bx, by, bw, bh) in SVG user units is rendered to an image of
(round(bw*scale), round(bh*scale)) pixels.  Pixel (col, row) covers the SVG
square [bx + col/s, bx + (col+1)/s) x [by + row/s, by + (row+1)/s), so its
*centre* is at

    x_svg = bx + (col + 0.5) / s
    y_svg = by + (row + 0.5) / s

`px_to_svg` is the single place that mapping is written down.  Getting this
wrong is the classic source of a backend that "looks broken" but is really
just half a pixel out, so the synthetic corpus checks it explicitly.
"""
from __future__ import annotations

import json
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
RENDER_JS = HERE / "resvg_render.js"
REPO = HERE.parent.parent


@dataclass
class Raster:
    mask: np.ndarray               # bool (H, W)
    box: tuple[float, float, float, float]   # SVG-unit crop box
    scale: float

    def px_to_svg(self, rows: np.ndarray, cols: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        bx, by, _, _ = self.box
        return bx + (np.asarray(cols) + 0.5) / self.scale, by + (np.asarray(rows) + 0.5) / self.scale

    def svg_to_px(self, x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        bx, by, _, _ = self.box
        return (np.asarray(y) - by) * self.scale - 0.5, (np.asarray(x) - bx) * self.scale - 0.5


def render_many(jobs: list[tuple[str, tuple[float, float, float, float], float]],
                alpha_threshold: int = 128) -> list[Raster]:
    """jobs: (svg_text, box, scale).  One node process for the whole batch."""
    if not jobs:
        return []
    with tempfile.TemporaryDirectory() as tmp:
        payload = {"jobs": []}
        shapes = []
        for i, (svg, box, scale) in enumerate(jobs):
            w = max(1, int(round(box[2] * scale)))
            h = max(1, int(round(box[3] * scale)))
            shapes.append((w, h))
            payload["jobs"].append(
                {"svg": svg, "width": w, "height": h, "out": str(Path(tmp) / f"{i}.raw")}
            )
        proc = subprocess.run(
            ["node", str(RENDER_JS)],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            cwd=str(REPO),
        )
        if proc.returncode != 0:
            raise RuntimeError(f"resvg render failed: {proc.stderr[:2000]}")
        results = json.loads(proc.stdout)["results"]
        out = []
        for (svg, box, scale), res, (w, h) in zip(jobs, results, shapes):
            buf = np.fromfile(res["out"], dtype=np.uint8)
            rw, rh = int(res["width"]), int(res["height"])
            buf = buf.reshape(rh, rw)
            out.append(Raster(mask=buf >= alpha_threshold, box=box, scale=scale))
        return out


def render_one(svg: str, box: tuple[float, float, float, float], scale: float,
               alpha_threshold: int = 128) -> Raster:
    return render_many([(svg, box, scale)], alpha_threshold)[0]


def pad_box(bbox: tuple[float, float, float, float], margin: float,
            clip: tuple[float, float, float, float] | None = None,
            ) -> tuple[float, float, float, float]:
    """bbox is (x0, y0, x1, y1); returns an (x, y, w, h) crop box grown by margin."""
    x0, y0, x1, y1 = bbox
    x0, y0, x1, y1 = x0 - margin, y0 - margin, x1 + margin, y1 + margin
    if clip is not None:
        cx, cy, cw, ch = clip
        x0, y0 = max(x0, cx), max(y0, cy)
        x1, y1 = min(x1, cx + cw), min(y1, cy + ch)
    return (x0, y0, max(x1 - x0, 1e-6), max(y1 - y0, 1e-6))
