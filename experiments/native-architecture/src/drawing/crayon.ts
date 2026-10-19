import type { Point, Stroke } from './model';

export const CRAYON_COLOR_MIX = 0.55;
export const CRAYON_BANDS = [
  { widthScale: 1, coverage: 0.45 },
  { widthScale: 0.68, coverage: 0.63 },
] as const;

const DIRECTION_STEP_FRACTION = 0.35;
const MIN_DIRECTION_STEP_PX = 3;
const REVERSAL_COSINE = Math.cos((100 * Math.PI) / 180);
const REENTRY_DISTANCE_FRACTION = 0.45;
const REENTRY_EXCLUSION_WIDTHS = 2.5;
const PASS_SEED_MULTIPLIER = 41;

export { CRAYON_TILE_PX, canonicalCrayonPhase as crayonPhase } from './crayonGrain';

// `lead` is the stroke point before `points[0]`: a later pass continues the stroke's smoothed
// curve from it (strokePath), so splitting a stroke into passes leaves its shape unchanged.
export type CrayonPass = Readonly<{ seed: number; points: readonly Point[]; lead?: Point }>;

type Anchor = Readonly<{ point: Point; arc: number }>;
type PassScan = {
  readonly source: readonly Point[];
  readonly seed: number;
  readonly width: number;
  readonly texelScale: number;
  readonly directionStep: number;
  readonly reentryDistance: number;
  readonly exclusion: number;
  readonly closed: CrayonPass[];
  scanned: number;
  anchor: Point;
  direction: Point | null;
  previous: Point;
  beforePrevious: Point | undefined;
  lead: Point | undefined;
  arc: number;
  points: Point[];
  anchors: Map<string, Anchor[]>;
};

const cellKey = (point: Point, reentryDistance: number) =>
  `${Math.floor(point.x / reentryDistance)},${Math.floor(point.y / reentryDistance)}`;

function openScan(
  stroke: Extract<Stroke, { brush: 'crayon' }>,
  first: Point,
  width: number,
  texelScale: number
): PassScan {
  const reentryDistance = width * REENTRY_DISTANCE_FRACTION;
  return {
    source: stroke.points,
    seed: stroke.seed,
    width,
    texelScale,
    directionStep: Math.max(MIN_DIRECTION_STEP_PX * texelScale, width * DIRECTION_STEP_FRACTION),
    reentryDistance,
    exclusion: width * REENTRY_EXCLUSION_WIDTHS,
    closed: [],
    scanned: 1,
    anchor: first,
    direction: null,
    previous: first,
    beforePrevious: undefined,
    lead: undefined,
    arc: 0,
    points: [first],
    anchors: new Map([[cellKey(first, reentryDistance), [{ point: first, arc: 0 }]]]),
  };
}

function advance(scan: PassScan, point: Point) {
  const { directionStep, reentryDistance, exclusion } = scan;
  const step = Math.hypot(point.x - scan.previous.x, point.y - scan.previous.y);
  const dx = point.x - scan.anchor.x;
  const dy = point.y - scan.anchor.y;
  const distance = Math.hypot(dx, dy);
  const reversal =
    distance >= directionStep &&
    scan.direction !== null &&
    (dx * scan.direction.x + dy * scan.direction.y) / distance < REVERSAL_COSINE;
  const nearby = [-1, 0, 1].flatMap((ox) =>
    [-1, 0, 1].flatMap(
      (oy) =>
        scan.anchors.get(
          `${Math.floor(point.x / reentryDistance) + ox},${Math.floor(point.y / reentryDistance) + oy}`
        ) ?? []
    )
  );
  const reentry = nearby.some(
    (old) =>
      scan.arc + step - old.arc > exclusion &&
      Math.hypot(point.x - old.point.x, point.y - old.point.y) <= reentryDistance
  );
  if (reversal || reentry) {
    scan.closed.push({
      seed: scan.seed * PASS_SEED_MULTIPLIER + scan.closed.length,
      points: scan.points,
      lead: scan.lead,
    });
    scan.points = [scan.previous];
    scan.lead = scan.beforePrevious;
    scan.anchors = new Map([
      [cellKey(scan.previous, reentryDistance), [{ point: scan.previous, arc: 0 }]],
    ]);
    scan.arc = 0;
    scan.anchor = scan.previous;
    scan.direction = null;
  }
  scan.arc += step;
  scan.points.push(point);
  const cell = cellKey(point, reentryDistance);
  const stored = scan.anchors.get(cell) ?? [];
  const last = stored.at(-1);
  if (!last || Math.hypot(point.x - last.point.x, point.y - last.point.y) >= directionStep) {
    scan.anchors.set(cell, [...stored, { point, arc: scan.arc }]);
  }
  if (distance >= directionStep && !reversal && !reentry) {
    scan.direction = { x: dx / distance, y: dy / distance };
    scan.anchor = point;
  }
  scan.beforePrevious = scan.previous;
  scan.previous = point;
}

// The last stroke scanned, resumable: a live stroke's points array only grows (contactCohort), so
// each packet's draft reads only the samples appended since the last, and its commit reads none.
// The passes are a function of the points, seed, width and texel scale alone; a list whose last
// scanned sample is no longer in place is scanned afresh.
let lastScan: PassScan | null = null;

function resumableScan(
  stroke: Extract<Stroke, { brush: 'crayon' }>,
  first: Point,
  width: number,
  texelScale: number
) {
  const scan = lastScan;
  if (
    scan?.source === stroke.points &&
    scan.seed === stroke.seed &&
    scan.width === width &&
    scan.texelScale === texelScale &&
    stroke.points[scan.scanned - 1] === scan.previous
  )
    return scan;
  lastScan = openScan(stroke, first, width, texelScale);
  return lastScan;
}

export function crayonPasses(
  stroke: Extract<Stroke, { brush: 'crayon' }>,
  width: number,
  texelScale = 1
): readonly CrayonPass[] {
  const first = stroke.points[0];
  if (!first) return [];
  const scan = resumableScan(stroke, first, width, texelScale);
  for (; scan.scanned < stroke.points.length; scan.scanned++)
    advance(scan, stroke.points[scan.scanned]);
  return [
    ...scan.closed,
    {
      seed: scan.seed * PASS_SEED_MULTIPLIER + scan.closed.length,
      points: [...scan.points],
      lead: scan.lead,
    },
  ];
}
