import {
  featherAlpha,
  normalCdf,
  paneBox,
  type PaneShape,
  type Rect,
} from '../lib/glassPaneGeometry';

// Raster cells per blur sigma. The mask is smooth at that scale, so the image's own interpolation,
// stretched over the pane, stays within a percent of shipping's mask (native-glass-pane-raster).
const CELLS_PER_SIGMA = 4;
// Horizontal slices standing in for a rounded corner's arc in the blur's input; the blur, several
// slices wide, smooths their steps away.
const ARC_SLICES = 6;
// Rows the blur leaves effectively untouched by a band are skipped.
const NEGLIGIBLE_BLUR = 1e-4;
const BYTE_MAX = 255;

// One pane's mask sampled on a grid that runs edge to edge of its box: the coverage byte times the
// pane ink's strength.
export type PaneRaster = Readonly<{ box: Rect; columns: number; rows: number; alpha: Uint8Array }>;

type Slab = Readonly<{ top: number; bottom: number; left: number; right: number }>;
// A horizontal band of the shapes' union and the spans it covers within it.
type Band = Readonly<{ top: number; bottom: number; runs: readonly (readonly [number, number])[] }>;

// A rectangle as horizontal slabs, its rounded corners stepped in ARC_SLICES slices per arc.
function slabs({ x, y, width, height, radius = 0 }: Rect): Slab[] {
  const r = Math.min(radius, width / 2, height / 2);
  const middle = { top: y + r, bottom: y + height - r, left: x, right: x + width };
  if (r <= 0) return [middle];
  const arcs = Array.from({ length: ARC_SLICES }, (_, slice) => {
    const rise = (r * (slice + 1 / 2)) / ARC_SLICES;
    const inset = r - Math.sqrt(r * r - (r - rise) ** 2);
    const [from, to] = [(r * slice) / ARC_SLICES, (r * (slice + 1)) / ARC_SLICES];
    const sides = { left: x + inset, right: x + width - inset };
    return [
      { top: y + from, bottom: y + to, ...sides },
      { top: y + height - to, bottom: y + height - from, ...sides },
    ];
  });
  return [middle, ...arcs.flat()];
}

// The union of the shapes inside the box, as disjoint bands. Shipping's mask blurs inside its
// filter region only, so a shape bleeding past the box adds nothing beyond it.
function unionBands(rects: readonly Rect[], box: Rect): Band[] {
  const inside = rects
    .flatMap(slabs)
    .map((slab) => ({
      top: Math.max(slab.top, box.y),
      bottom: Math.min(slab.bottom, box.y + box.height),
      left: Math.max(slab.left, box.x),
      right: Math.min(slab.right, box.x + box.width),
    }))
    .filter((slab) => slab.bottom > slab.top && slab.right > slab.left);
  const edges = [...new Set(inside.flatMap((slab) => [slab.top, slab.bottom]))].sort(
    (a, b) => a - b
  );
  return edges.slice(1).flatMap((bottom, index) => {
    const top = edges[index];
    const spans = inside
      .filter((slab) => slab.top <= top && slab.bottom >= bottom)
      .map((slab) => [slab.left, slab.right] as const)
      .sort((a, b) => a[0] - b[0]);
    const runs: [number, number][] = [];
    for (const [left, right] of spans) {
      const last = runs.at(-1);
      if (last && left <= last[1]) last[1] = Math.max(last[1], right);
      else runs.push([left, right]);
    }
    return runs.length ? [{ top, bottom, runs }] : [];
  });
}

// The Gaussian blur of a unit span [from, to], read at `at`.
function blurredSpan(at: number, from: number, to: number, sigma: number) {
  return normalCdf((at - from) / sigma) - normalCdf((at - to) / sigma);
}

function samples(start: number, length: number, count: number) {
  return Array.from({ length: count }, (_, index) => start + (index * length) / (count - 1));
}

// Where the image goes, against its box, so a stretched pixel's centre lands on its sample: half
// a cell past each edge. A box-sized clip trims the overhang, as shipping's mask ends at its box.
export function paneImagePlace({ box, columns, rows }: PaneRaster) {
  const across = box.width / (columns - 1);
  const down = box.height / (rows - 1);
  return {
    left: -across / 2,
    top: -down / 2,
    width: box.width + across,
    height: box.height + down,
  };
}

// Shipping's pane mask, computed as its SVG filter does: the union of the pane's shapes, blurred
// within the pane's box, read through the feather table. Unlike drawing each shape on its own, the
// union never lays the paper twice where shapes overlap.
export function glassPaneRaster(shape: PaneShape, strength: number): PaneRaster | null {
  const { sigma } = shape;
  const box = paneBox(shape);
  if (box.width <= 0 || box.height <= 0) return null;
  const cell = sigma / CELLS_PER_SIGMA;
  const columns = Math.ceil(box.width / cell) + 1;
  const rows = Math.ceil(box.height / cell) + 1;
  const xs = samples(box.x, box.width, columns);
  const ys = samples(box.y, box.height, rows);
  const blurred = new Float64Array(columns * rows);
  for (const band of unionBands(shape.rects, box)) {
    const along = xs.map((x) =>
      band.runs.reduce((sum, [left, right]) => sum + blurredSpan(x, left, right, sigma), 0)
    );
    ys.forEach((y, row) => {
      const across = blurredSpan(y, band.top, band.bottom, sigma);
      if (across < NEGLIGIBLE_BLUR) return;
      for (let column = 0; column < columns; column++)
        blurred[row * columns + column] += across * along[column];
    });
  }
  const feather = featherAlpha(sigma);
  const alpha = Uint8Array.from(blurred, (value) =>
    Math.round(BYTE_MAX * strength * feather(value))
  );
  return { box, columns, rows, alpha };
}
