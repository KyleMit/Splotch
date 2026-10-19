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

type CrayonStroke = Extract<Stroke, { brush: 'crayon' }>;
type PassScan = Readonly<{
  resumes: (stroke: CrayonStroke, width: number, texelScale: number) => boolean;
  passes: () => readonly CrayonPass[];
}>;

function openScan(stroke: CrayonStroke, first: Point, width: number, texelScale: number): PassScan {
  const source = stroke.points;
  const directionStep = Math.max(
    MIN_DIRECTION_STEP_PX * texelScale,
    width * DIRECTION_STEP_FRACTION
  );
  const reentryDistance = width * REENTRY_DISTANCE_FRACTION;
  const exclusion = width * REENTRY_EXCLUSION_WIDTHS;
  let anchor = first;
  let direction: Point | null = null;
  let previous = first;
  let beforePrevious: Point | undefined;
  let lead: Point | undefined;
  let arc = 0;
  let points = [first];
  let anchors = new Map<string, { point: Point; arc: number }[]>();
  const passes: CrayonPass[] = [];
  const key = (point: Point) =>
    `${Math.floor(point.x / reentryDistance)},${Math.floor(point.y / reentryDistance)}`;
  let scanned = 1;
  anchors.set(key(first), [{ point: first, arc }]);
  function advance(point: Point) {
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
      passes.push({ seed: stroke.seed * PASS_SEED_MULTIPLIER + passes.length, points, lead });
      points = [previous];
      lead = beforePrevious;
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
    beforePrevious = previous;
    previous = point;
  }
  return {
    resumes: (candidate, candidateWidth, candidateTexelScale) =>
      candidate.points === source &&
      candidate.seed === stroke.seed &&
      candidateWidth === width &&
      candidateTexelScale === texelScale &&
      source[scanned - 1] === previous,
    passes() {
      for (; scanned < source.length; scanned++) advance(source[scanned]);
      return [
        ...passes,
        { seed: stroke.seed * PASS_SEED_MULTIPLIER + passes.length, points: [...points], lead },
      ];
    },
  };
}

// The last stroke scanned, resumable: a live stroke's points array only grows (contactCohort), so
// each packet's draft reads only the samples appended since the last, and its commit reads none.
// The passes are a function of the points, seed, width and texel scale alone; a list whose last
// scanned sample is no longer in place is scanned afresh.
let lastScan: PassScan | null = null;

export function crayonPasses(
  stroke: CrayonStroke,
  width: number,
  texelScale = 1
): readonly CrayonPass[] {
  const first = stroke.points[0];
  if (!first) return [];
  const scan = lastScan?.resumes(stroke, width, texelScale)
    ? lastScan
    : openScan(stroke, first, width, texelScale);
  lastScan = scan;
  return scan.passes();
}
