import { drawingPaper, type AdoptedPaper, type PaperReference } from './paperSpace';
import type { PaintColor } from './palette';
import { sampleOutcome, strokeStyle, type Drawing, type Point, type Stroke } from './model';
import type { Brush } from './brushes';
import { DEFAULT_STROKE_WIDTH, type StrokeWidth } from './strokeWidth';
import { PERF_PROBE, perfAppend, perfDrained } from './perfProbe';

// A live stroke's points are its contact's own buffer, appended in place, so a kept sample costs
// O(1) rather than a copy of the whole stroke. Each kept sample still publishes a new Stroke in a
// new drafts list, so a consumer keyed on either identity sees every change; an earlier drafts list
// reads the buffer as it grows. Nothing writes a buffer once its contact ends, so a committed
// stroke never changes.
type LiveContact = Readonly<{ index: number; points: Point[] }>;

export function createContactCohort() {
  const active = new Map<string, LiveContact>();
  let strokes: readonly Stroke[] = [];
  let paper: PaperReference | null = null;

  function drain(): readonly Stroke[] | null {
    if (active.size > 0 || strokes.length === 0) return null;
    const completed = strokes;
    strokes = [];
    if (PERF_PROBE) perfDrained(completed);
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
      const points = [point];
      active.set(identifier, { index: strokes.length, points });
      strokes = [...strokes, { ...style, points }];
    },
    sample(identifier: string, point: Point, endpoint = false) {
      const live = active.get(identifier);
      if (!live) return;
      const outcome = sampleOutcome(live.points, point, endpoint);
      if (PERF_PROBE) perfAppend(outcome);
      if (outcome !== 'appended') return;
      live.points.push(point);
      strokes = strokes.map((item, position) =>
        position === live.index ? { ...item, points: live.points } : item
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
