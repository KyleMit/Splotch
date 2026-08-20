"""SVG parsing / element extraction for this pipeline.

Inherits the incumbent's hard-won lesson (the tool this replaced):
process each *filled element* separately.  Merging same-colour elements into
one mask fuses strokes that only touch visually and wrecks landscape-square.

Unlike the incumbent (regex over the raw markup) this uses svgelements, so
transforms, nested groups and non-path shapes are resolved properly.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path as FsPath

from svgelements import SVG, Shape
from svgelements import Path as SvgPath


@dataclass
class FilledElement:
    """One filled shape, in absolute (viewBox) user units."""

    index: int
    tag: str
    fill: str
    d: str
    bbox: tuple[float, float, float, float]
    fill_rule: str = "nonzero"
    raw_d_len: int = 0


@dataclass
class SvgDoc:
    path: FsPath
    viewbox: tuple[float, float, float, float]
    width: float
    height: float
    elements: list[FilledElement] = field(default_factory=list)

    @property
    def id(self) -> str:
        return self.path.stem


def _fill_of(shape: Shape) -> str | None:
    fill = shape.values.get("fill")
    if fill is None:
        fill = getattr(shape, "fill", None)
    if fill is None:
        return None
    text = str(fill)
    if text.lower() in ("none", "transparent"):
        return None
    if re.match(r"^#[0-9a-fA-F]{6}$", text):
        return text.lower()
    if re.match(r"^#[0-9a-fA-F]{3}$", text):
        return "#" + "".join(c * 2 for c in text[1:]).lower()
    return text


def load(path: str | FsPath) -> SvgDoc:
    path = FsPath(path)
    svg = SVG.parse(str(path))
    vb = svg.viewbox
    if vb is None:
        raise ValueError(f"{path} has no viewBox")
    viewbox = (float(vb.x), float(vb.y), float(vb.width), float(vb.height))
    doc = SvgDoc(path=path, viewbox=viewbox, width=float(svg.width), height=float(svg.height))

    for element in svg.elements():
        if not isinstance(element, Shape):
            continue
        fill = _fill_of(element)
        if fill is None:
            continue
        p = SvgPath(element)
        d = p.d()
        if not d.strip():
            continue
        bbox = p.bbox()
        if bbox is None:
            continue
        rule = str(element.values.get("fill-rule", "nonzero")).lower()
        doc.elements.append(
            FilledElement(
                index=len(doc.elements),
                tag=type(element).__name__.lower(),
                fill=fill,
                d=d,
                bbox=tuple(float(v) for v in bbox),
                fill_rule="evenodd" if "even" in rule else "nonzero",
                raw_d_len=len(d),
            )
        )
    return doc


def _px(box: tuple[float, float, float, float], scale: float) -> tuple[int, int]:
    return max(1, int(round(box[2] * scale))), max(1, int(round(box[3] * scale)))


def element_svg(element: FilledElement, box: tuple[float, float, float, float],
                scale: float) -> str:
    """Minimal SVG that paints just this element, white on black, over `box`."""
    x, y, w, h = box
    width, height = _px(box, scale)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
        f'viewBox="{x} {y} {w} {h}" width="{width}" height="{height}">'
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#000"/>'
        f'<path d="{element.d}" fill="#fff" fill-rule="{element.fill_rule}"/>'
        f"</svg>"
    )


def doc_svg(doc: SvgDoc, box: tuple[float, float, float, float], scale: float) -> str:
    """All filled elements of a doc, white on black (whole-image mask)."""
    x, y, w, h = box
    width, height = _px(box, scale)
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
        f'viewBox="{x} {y} {w} {h}" width="{width}" height="{height}">',
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#000"/>',
    ]
    for e in doc.elements:
        parts.append(f'<path d="{e.d}" fill="#fff" fill-rule="{e.fill_rule}"/>')
    parts.append("</svg>")
    return "".join(parts)
