import type { PaletteLabel } from './palette';
import {
  appendPoint,
  strokeStyle,
  drawingCapacity,
  DRAWING_FULL_MESSAGE,
  type Drawing,
  type Point,
  type Stroke,
} from './model';
import type { Brush } from './brushes';

export function createContactCohort() {
  const active = new Map<string, number>();
  let strokes: readonly Stroke[] = [];
  let capacity = { strokes: 0, points: 0 };
  let acceptedPoints = 0;

  function drain(): readonly Stroke[] | null {
    if (active.size > 0 || strokes.length === 0) return null;
    const completed = strokes;
    strokes = [];
    acceptedPoints = 0;
    return completed;
  }

  return {
    start(identifier: string, color: PaletteLabel, brush: Brush, point: Point, drawing: Drawing) {
      if (active.has(identifier)) return;
      if (active.size === 0) capacity = drawingCapacity(drawing);
      if (strokes.length >= capacity.strokes || acceptedPoints >= capacity.points) {
        throw new Error(DRAWING_FULL_MESSAGE);
      }
      active.set(identifier, strokes.length);
      const reserved = strokes.findLast((stroke) => stroke.brush === 'crayon');
      const style = strokeStyle(
        brush,
        color,
        reserved ? { ...drawing, strokes: [reserved] } : drawing
      );
      strokes = [...strokes, { ...style, points: [point] }];
      acceptedPoints += 1;
    },
    sample(identifier: string, point: Point, endpoint = false) {
      const index = active.get(identifier);
      if (index === undefined) return;
      const stroke = strokes[index];
      const points = appendPoint(stroke.points, point, endpoint);
      const added = points.length - stroke.points.length;
      if (acceptedPoints + added > capacity.points) throw new Error(DRAWING_FULL_MESSAGE);
      if (added === 0) return;
      acceptedPoints += added;
      strokes = strokes.map((item, position) =>
        position === index ? { ...stroke, points } : item
      );
    },
    finish(identifier: string): readonly Stroke[] | null {
      if (!active.delete(identifier)) return null;
      return drain();
    },
    interrupt(): readonly Stroke[] | null {
      active.clear();
      return drain();
    },
    hasActive(): boolean {
      return active.size > 0;
    },
    drafts(): readonly Stroke[] {
      return strokes;
    },
  };
}
