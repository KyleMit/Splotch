import type { Point, Stroke } from './model';

export const CRAYON_TILE_PX = 256;
export const CRAYON_COLOR_MIX = 0.55;
export const CRAYON_BANDS = [
  { widthScale: 1, coverage: 0.45 },
  { widthScale: 0.68, coverage: 0.63 },
] as const;

const GRAIN_OCTAVES = [
  { cell: 6, weight: 0.22 },
  { cell: 4, weight: 0.3 },
  { cell: 3, weight: 0.3 },
  { cell: 2, weight: 0.18 },
] as const;
const BODY_VARIATION = 0.2;
const BODY_CELL_PX = 110;
const SHADE_VARIATION = 0.04;
const DIRECTION_STEP_FRACTION = 0.35;
const MIN_DIRECTION_STEP_PX = 3;
const REVERSAL_COSINE = Math.cos((100 * Math.PI) / 180);
const REENTRY_DISTANCE_FRACTION = 0.45;
const REENTRY_EXCLUSION_WIDTHS = 2.5;
const PHASE_X_MULTIPLIER = 73;
const PHASE_Y_MULTIPLIER = 151;
const PASS_SEED_MULTIPLIER = 41;

function hash(x: number, y: number): number {
  const bits = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263);
  const mixed = Math.imul(bits ^ (bits >>> 13), 1274126177);
  return ((mixed ^ (mixed >>> 16)) >>> 0) / 4294967296;
}

function noise(x: number, y: number, cell: number): number {
  const count = Math.round(CRAYON_TILE_PX / cell);
  const gx = (x / CRAYON_TILE_PX) * count;
  const gy = (y / CRAYON_TILE_PX) * count;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = hash(ix % count, iy % count) * (1 - sx) + hash((ix + 1) % count, iy % count) * sx;
  const bottom =
    hash(ix % count, (iy + 1) % count) * (1 - sx) + hash((ix + 1) % count, (iy + 1) % count) * sx;
  return top * (1 - sy) + bottom * sy;
}

function tooth(x: number, y: number): number {
  return GRAIN_OCTAVES.reduce(
    (height, octave) => height + noise(x, y, octave.cell) * octave.weight,
    0
  );
}

const PAPER_HEIGHTS = Array.from({ length: CRAYON_TILE_PX * CRAYON_TILE_PX }, (_, index) => {
  const x = index % CRAYON_TILE_PX;
  const y = Math.floor(index / CRAYON_TILE_PX);
  return tooth(x, y) - (noise(x, y, BODY_CELL_PX) - 0.5) * BODY_VARIATION;
});
const ORDERED_HEIGHTS = [...PAPER_HEIGHTS].sort((a, b) => a - b);

export function crayonPhase(seed: number) {
  return {
    x: (seed * PHASE_X_MULTIPLIER) % CRAYON_TILE_PX,
    y: (seed * PHASE_Y_MULTIPLIER) % CRAYON_TILE_PX,
  };
}

function wrap(value: number): number {
  return ((Math.floor(value) % CRAYON_TILE_PX) + CRAYON_TILE_PX) % CRAYON_TILE_PX;
}

function waxAt(x: number, y: number, seed: number, coverage: number): boolean {
  const phase = crayonPhase(seed);
  const tx = wrap(x - phase.x);
  const ty = wrap(y - phase.y);
  const threshold = ORDERED_HEIGHTS[Math.floor((1 - coverage) * (ORDERED_HEIGHTS.length - 1))];
  return PAPER_HEIGHTS[ty * CRAYON_TILE_PX + tx] >= threshold;
}

export function crayonTexture(coverage: number): readonly string[] {
  const paths = ['', '', ''];
  for (let y = 0; y < CRAYON_TILE_PX; y++) {
    let start = 0;
    let shade = -1;
    for (let x = 0; x <= CRAYON_TILE_PX; x++) {
      const height = tooth(x, y);
      const next =
        x < CRAYON_TILE_PX && waxAt(x, y, 0, coverage) ? Math.min(2, Math.floor(height * 3)) : -1;
      if (next === shade) continue;
      if (shade >= 0) {
        const length = x - start;
        paths[shade] += `M${start} ${y}h${length}v1h-${length}z`;
      }
      start = x;
      shade = next;
    }
  }
  return paths;
}

export function waxColor(hex: string, shade: number): string {
  const shift = (1 - shade) * SHADE_VARIATION;
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16);
    return Math.round(shift >= 0 ? channel + (255 - channel) * shift : channel * (1 + shift));
  });
  return `rgb(${channels.join(',')})`;
}

export type CrayonPass = Readonly<{ seed: number; points: readonly Point[] }>;

export function crayonPasses(
  stroke: Extract<Stroke, { brush: 'crayon' }>,
  width: number
): readonly CrayonPass[] {
  const first = stroke.points[0];
  if (!first) return [];
  const directionStep = Math.max(MIN_DIRECTION_STEP_PX, width * DIRECTION_STEP_FRACTION);
  const reentryDistance = width * REENTRY_DISTANCE_FRACTION;
  const exclusion = width * REENTRY_EXCLUSION_WIDTHS;
  let anchor = first;
  let direction: Point | null = null;
  let previous = first;
  let arc = 0;
  let points = [first];
  let anchors = new Map<string, { point: Point; arc: number }[]>();
  const passes: CrayonPass[] = [];
  const key = (point: Point) =>
    `${Math.floor(point.x / reentryDistance)},${Math.floor(point.y / reentryDistance)}`;
  anchors.set(key(first), [{ point: first, arc }]);
  for (const point of stroke.points.slice(1)) {
    const step = Math.hypot(point.x - previous.x, point.y - previous.y);
    const dx = point.x - anchor.x;
    const dy = point.y - anchor.y;
    const distance = Math.hypot(dx, dy);
    const reversal =
      distance >= directionStep &&
      direction !== null &&
      (dx * direction.x + dy * direction.y) / distance < REVERSAL_COSINE;
    const nearby = [-1, 0, 1].flatMap((ox) =>
      [-1, 0, 1].flatMap(
        (oy) =>
          anchors.get(
            `${Math.floor(point.x / reentryDistance) + ox},${Math.floor(point.y / reentryDistance) + oy}`
          ) ?? []
      )
    );
    const reentry = nearby.some(
      (old) =>
        arc + step - old.arc > exclusion &&
        Math.hypot(point.x - old.point.x, point.y - old.point.y) <= reentryDistance
    );
    if (reversal || reentry) {
      passes.push({ seed: stroke.seed * PASS_SEED_MULTIPLIER + passes.length, points });
      points = [previous];
      anchors = new Map([[key(previous), [{ point: previous, arc: 0 }]]]);
      arc = 0;
      anchor = previous;
      direction = null;
    }
    arc += step;
    points.push(point);
    const cell = key(point);
    const stored = anchors.get(cell) ?? [];
    const last = stored.at(-1);
    if (!last || Math.hypot(point.x - last.point.x, point.y - last.point.y) >= directionStep) {
      anchors.set(cell, [...stored, { point, arc }]);
    }
    if (distance >= directionStep && !reversal && !reentry) {
      direction = { x: dx / distance, y: dy / distance };
      anchor = point;
    }
    previous = point;
  }
  passes.push({ seed: stroke.seed * PASS_SEED_MULTIPLIER + passes.length, points });
  return passes;
}
