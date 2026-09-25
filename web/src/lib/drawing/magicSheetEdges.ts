// Sample a hair inside the picture's border, not on it, so a coloring page's edge
// outline doesn't smear across the extended margin.
const EDGE_SAMPLE_INSET_FRACTION = 0.02;

// The picture (fill) is drawn at box (ox,oy,bw,bh) inside a W×H sheet and can leave
// transparent letterbox margins on any side — top/bottom or left/right where the
// fill is contain-fit in the paper, AND (under a rotation lock) the other axis where
// the paper itself is contain-fit in the larger sheet, so all four sides plus corners
// can be empty. `edgeMargins` returns direct source-image blits for every band and
// corner, as pure geometry so the math is unit-testable without a real canvas.
//
// Each source is taken a hair INSIDE the picture (`inset`), not on the literal border:
// a coloring page can carry an outline right at its edge, and sampling the 1px border
// would smear that black line across the margin. One row/column in lands on the flat
// fill behind the outline, so the margin extends the picture's colour (sky stays blue)
// with no line streak. Stretching a row/column (not a flat per-edge average) preserves
// along-edge variation — a landscape scene keeps sky-at-top / grass-at-bottom.
export interface EdgeFill {
  /** Source rect in the fill image to sample. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Destination rect in the sheet to stretch that strip across. */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

export function edgeMargins(
  W: number,
  H: number,
  ox: number,
  oy: number,
  bw: number,
  bh: number,
  sourceWidth = bw,
  sourceHeight = bh
): EdgeFill[] {
  const top = Math.round(oy);
  const left = Math.round(ox);
  const bottom = Math.round(oy + bh);
  const right = Math.round(ox + bw);
  const bottomMargin = H - bottom;
  const rightMargin = W - right;
  const scaleX = bw / sourceWidth;
  const scaleY = bh / sourceHeight;
  const sourcePixelX = 1 / scaleX;
  const sourcePixelY = 1 / scaleY;
  const destinationInset = Math.max(1, Math.round(Math.min(bw, bh) * EDGE_SAMPLE_INSET_FRACTION));
  const sourceInsetX = destinationInset / scaleX;
  const sourceInsetY = destinationInset / scaleY;
  const sourceRight = sourceWidth - sourcePixelX - sourceInsetX;
  const sourceBottom = sourceHeight - sourcePixelY - sourceInsetY;
  const fills: EdgeFill[] = [];
  if (top > 0)
    fills.push({
      sx: 0,
      sy: sourceInsetY,
      sw: sourceWidth,
      sh: sourcePixelY,
      dx: ox,
      dy: 0,
      dw: bw,
      dh: top,
    });
  if (bottomMargin > 0)
    fills.push({
      sx: 0,
      sy: sourceBottom,
      sw: sourceWidth,
      sh: sourcePixelY,
      dx: ox,
      dy: bottom,
      dw: bw,
      dh: bottomMargin,
    });
  if (left > 0)
    fills.push({
      sx: sourceInsetX,
      sy: 0,
      sw: sourcePixelX,
      sh: sourceHeight,
      dx: 0,
      dy: oy,
      dw: left,
      dh: bh,
    });
  if (rightMargin > 0)
    fills.push({
      sx: sourceRight,
      sy: 0,
      sw: sourcePixelX,
      sh: sourceHeight,
      dx: right,
      dy: oy,
      dw: rightMargin,
      dh: bh,
    });
  if (top > 0 && left > 0)
    fills.push({
      sx: sourceInsetX,
      sy: sourceInsetY,
      sw: sourcePixelX,
      sh: sourcePixelY,
      dx: 0,
      dy: 0,
      dw: left,
      dh: top,
    });
  if (top > 0 && rightMargin > 0)
    fills.push({
      sx: sourceRight,
      sy: sourceInsetY,
      sw: sourcePixelX,
      sh: sourcePixelY,
      dx: right,
      dy: 0,
      dw: rightMargin,
      dh: top,
    });
  if (bottomMargin > 0 && left > 0)
    fills.push({
      sx: sourceInsetX,
      sy: sourceBottom,
      sw: sourcePixelX,
      sh: sourcePixelY,
      dx: 0,
      dy: bottom,
      dw: left,
      dh: bottomMargin,
    });
  if (bottomMargin > 0 && rightMargin > 0)
    fills.push({
      sx: sourceRight,
      sy: sourceBottom,
      sw: sourcePixelX,
      sh: sourcePixelY,
      dx: right,
      dy: bottom,
      dw: rightMargin,
      dh: bottomMargin,
    });
  return fills;
}

// Fill the transparent letterbox margins of the drawn picture by extending its edge
// colours outward, so a stroke in the margin reveals the colour of the nearest
// picture edge instead of nothing — the child paints across the whole canvas with no
// hard seam (fixes ADR-0043's "painting in the letterbox reveals nothing" edge, and
// the rotation-lock margins around the fitted paper).
export function extendSheetEdges(
  g: CanvasRenderingContext2D,
  image: HTMLImageElement,
  W: number,
  H: number,
  ox: number,
  oy: number,
  bw: number,
  bh: number
) {
  for (const fill of edgeMargins(W, H, ox, oy, bw, bh, image.naturalWidth, image.naturalHeight)) {
    g.drawImage(image, fill.sx, fill.sy, fill.sw, fill.sh, fill.dx, fill.dy, fill.dw, fill.dh);
  }
}
