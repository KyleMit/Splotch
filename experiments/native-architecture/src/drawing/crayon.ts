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

// The pass splitter one point at a time, so live ink and a replay of the whole stroke find the
// same passes. `advance` takes each point after `first` in order and reports whether it opens a
// new pass: a scribble reversed direction, or the stroke came back over its own laid strip.
export function createCrayonPassTracker(first: Point, width: number, texelScale = 1) {
  const directionStep = Math.max(
    MIN_DIRECTION_STEP_PX * texelScale,
    width * DIRECTION_STEP_FRACTION
  );
  const reentryDistance = width * REENTRY_DISTANCE_FRACTION;
  const exclusion = width * REENTRY_EXCLUSION_WIDTHS;
  const cellOf = (value: number) => Math.floor(value / reentryDistance);
  const key = (point: Point) => `${cellOf(point.x)},${cellOf(point.y)}`;
  let anchor = first;
  let direction: Point | null = null;
  let previous = first;
  let arc = 0;
  let anchors = new Map<string, Anchor[]>([[key(first), [{ point: first, arc }]]]);
  return {
    advance(point: Point): boolean {
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
          (oy) => anchors.get(`${cellOf(point.x) + ox},${cellOf(point.y) + oy}`) ?? []
        )
      );
      const reentry = nearby.some(
        (old) =>
          arc + step - old.arc > exclusion &&
          Math.hypot(point.x - old.point.x, point.y - old.point.y) <= reentryDistance
      );
      const split = reversal || reentry;
      if (split) {
        anchors = new Map([[key(previous), [{ point: previous, arc: 0 }]]]);
        arc = 0;
        anchor = previous;
        direction = null;
      }
      arc += step;
      const cell = key(point);
      const stored = anchors.get(cell) ?? [];
      const last = stored.at(-1);
      if (!last || Math.hypot(point.x - last.point.x, point.y - last.point.y) >= directionStep) {
        anchors.set(cell, [...stored, { point, arc }]);
      }
      if (distance >= directionStep && !split) {
        direction = { x: dx / distance, y: dy / distance };
        anchor = point;
      }
      previous = point;
      return split;
    },
  };
}

// The indices of the points that open each pass after the first, ascending.
export function crayonPassBreaks(
  points: readonly Point[],
  width: number,
  texelScale = 1
): readonly number[] {
  const first = points[0];
  if (!first) return [];
  const tracker = createCrayonPassTracker(first, width, texelScale);
  const breaks: number[] = [];
  for (let index = 1; index < points.length; index++)
    if (tracker.advance(points[index])) breaks.push(index);
  return breaks;
}

export function crayonPassSeed(stroke: Extract<Stroke, { brush: 'crayon' }>, pass: number) {
  return stroke.seed * PASS_SEED_MULTIPLIER + pass;
}

// A pass opened at point k continues the curve from the point before it (its first point) with
// the one before that as its lead, so splitting a stroke into passes leaves its shape unchanged.
export function crayonPasses(
  stroke: Extract<Stroke, { brush: 'crayon' }>,
  width: number,
  texelScale = 1
): readonly CrayonPass[] {
  const points = stroke.points;
  if (points.length === 0) return [];
  const starts = [0, ...crayonPassBreaks(points, width, texelScale)];
  return starts.map((start, pass) => {
    const end = starts[pass + 1] ?? points.length;
    const seed = crayonPassSeed(stroke, pass);
    return start === 0
      ? { seed, points: points.slice(0, end), lead: undefined }
      : { seed, points: points.slice(start - 1, end), lead: points[start - 2] };
  });
}
