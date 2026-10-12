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

interface EdgeBand {
  source: number;
  sourceSize: number;
  dest: number;
  destSize: number;
}

interface AxisBands {
  near: EdgeBand | null;
  span: EdgeBand;
  far: EdgeBand | null;
}

function axisBands(
  sheetExtent: number,
  boxOrigin: number,
  boxExtent: number,
  sourceExtent: number,
  destinationInset: number
): AxisBands {
  const nearEdge = Math.round(boxOrigin);
  const farEdge = Math.round(boxOrigin + boxExtent);
  const farMargin = sheetExtent - farEdge;
  const scale = boxExtent / sourceExtent;
  const sourcePixel = 1 / scale;
  const sourceInset = destinationInset / scale;
  const sourceFar = sourceExtent - sourcePixel - sourceInset;
  return {
    near:
      nearEdge > 0
        ? { source: sourceInset, sourceSize: sourcePixel, dest: 0, destSize: nearEdge }
        : null,
    span: { source: 0, sourceSize: sourceExtent, dest: boxOrigin, destSize: boxExtent },
    far:
      farMargin > 0
        ? { source: sourceFar, sourceSize: sourcePixel, dest: farEdge, destSize: farMargin }
        : null,
  };
}

function pushRegion(fills: EdgeFill[], x: EdgeBand | null, y: EdgeBand | null) {
  if (!x || !y) return;
  fills.push({
    sx: x.source,
    sy: y.source,
    sw: x.sourceSize,
    sh: y.sourceSize,
    dx: x.dest,
    dy: y.dest,
    dw: x.destSize,
    dh: y.destSize,
  });
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
  const destinationInset = Math.max(1, Math.round(Math.min(bw, bh) * EDGE_SAMPLE_INSET_FRACTION));
  const x = axisBands(W, ox, bw, sourceWidth, destinationInset);
  const y = axisBands(H, oy, bh, sourceHeight, destinationInset);
  const fills: EdgeFill[] = [];
  pushRegion(fills, x.span, y.near);
  pushRegion(fills, x.span, y.far);
  pushRegion(fills, x.near, y.span);
  pushRegion(fills, x.far, y.span);
  pushRegion(fills, x.near, y.near);
  pushRegion(fills, x.far, y.near);
  pushRegion(fills, x.near, y.far);
  pushRegion(fills, x.far, y.far);
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
