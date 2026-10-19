import type { Point, Stroke } from './model';

// The points one op paints, [from, to) of its stroke's points. An op from the first point is
// drawn whole: a dot for one point, else a path from that point. A later op continues the
// stroke's smoothed curve from the point before `from`, as a shipping path op continues from its
// pen (smoothStroke's lead).
export type OpRange = Readonly<{ from: number; to: number }>;
export type OpShape = Readonly<{ points: readonly Point[]; lead?: Point }>;

// One op of one stroke, in the order a scene paints it.
export type InkStep<S extends Stroke = Stroke> = Readonly<{ stroke: S; op: number }>;

// A stroke saved without ops is one op: the whole stroke, as it was drawn before ops existed.
export function opCount(stroke: Stroke): number {
  return stroke.ops?.length ?? 1;
}

export function opRange(stroke: Stroke, op: number): OpRange {
  const ops = stroke.ops;
  if (!ops) return { from: 0, to: stroke.points.length };
  return { from: op === 0 ? 0 : ops[op - 1][0], to: ops[op][0] };
}

export function rangeShape(points: readonly Point[], range: OpRange): OpShape {
  if (range.from === 0) return { points: points.slice(0, range.to) };
  return { points: points.slice(range.from - 1, range.to), lead: points[range.from - 2] };
}

type Keyed = { stroke: Stroke; op: number; frame: number; index: number };

function precedes(a: Keyed, b: Keyed) {
  return a.frame - b.frame || a.index - b.index || a.op - b.op;
}

// Every op of `strokes` in paint order: by frame, then by stroke, then by op, which is the order
// a cohort's contacts painted them live. A stroke without ops takes the last frame the strokes
// before it reached, so it paints after them and before any later cohort.
export function orderedOps(strokes: readonly Stroke[]): readonly InkStep[] {
  const steps: Keyed[] = [];
  let floor = -1;
  let sorted = true;
  for (const [index, stroke] of strokes.entries()) {
    const ops = stroke.ops;
    for (let op = 0; op < (ops?.length ?? 1); op++) {
      const step = { stroke, op, frame: ops ? ops[op][1] : floor, index };
      const last = steps.at(-1);
      if (last && precedes(last, step) > 0) sorted = false;
      steps.push(step);
    }
    const end = ops?.at(-1)?.[1];
    if (end !== undefined && end > floor) floor = end;
  }
  if (!sorted) steps.sort(precedes);
  return steps.map(({ stroke, op }) => ({ stroke, op }));
}
