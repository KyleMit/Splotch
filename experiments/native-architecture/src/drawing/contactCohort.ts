import { drawingPaper, type AdoptedPaper, type PaperReference } from './paperSpace';
import type { PaintColor } from './palette';
import { appendPoint, strokeStyle, type Drawing, type Point, type Stroke } from './model';
import type { Brush } from './brushes';
import { DEFAULT_STROKE_WIDTH, type StrokeWidth } from './strokeWidth';

export function createContactCohort() {
  const active = new Map<string, number>();
  let strokes: readonly Stroke[] = [];
  let paper: PaperReference | null = null;

  function drain(): readonly Stroke[] | null {
    if (active.size > 0 || strokes.length === 0) return null;
    const completed = strokes;
    strokes = [];
    return completed;
  }

  return {
    start(
      identifier: string,
      color: PaintColor,
      brush: Brush,
      point: Point,
      drawing: Drawing,
      width: StrokeWidth = DEFAULT_STROKE_WIDTH,
      adoption?: () => AdoptedPaper
    ) {
      if (active.has(identifier)) return;
      if (active.size === 0) {
        const reference = drawingPaper(drawing);
        paper = reference.kind === 'unadopted' ? (adoption?.() ?? null) : reference;
        if (!paper) throw new Error('The drawing paper is not ready.');
      }
      const reserved = strokes.findLast((stroke) => stroke.brush === 'crayon');
      const style = strokeStyle(
        brush,
        color,
        reserved ? { ...drawing, strokes: [reserved] } : drawing,
        width
      );
      active.set(identifier, strokes.length);
      strokes = [...strokes, { ...style, points: [point] }];
    },
    sample(identifier: string, point: Point, endpoint = false) {
      const index = active.get(identifier);
      if (index === undefined) return;
      const stroke = strokes[index];
      const points = appendPoint(stroke.points, point, endpoint);
      const added = points.length - stroke.points.length;
      if (added === 0) return;
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
    paper(): PaperReference {
      if (!paper) throw new Error('The drawing paper is not ready.');
      return paper;
    },
    drafts(): readonly Stroke[] {
      return strokes;
    },
  };
}
