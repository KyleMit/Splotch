import { MAX_UNDO_DEPTH } from '../../../../web/src/lib/drawing/undoHistory';
import { isPaintColor, type PaintColor } from './palette';
import type { PageId } from './pages';
import {
  INITIAL_RAINBOW,
  pickRainbow,
  MAX_CRAYON_SEED,
  type Brush,
  type LegacySolidBrush,
} from './brushes';
import {
  DEFAULT_STROKE_WIDTH,
  isStrokeWidthPx,
  strokeWidthPx,
  type StrokeWidth,
} from './strokeWidth';
import {
  PAPER_WIDTH,
  PAPER_HEIGHT,
  UNADOPTED_PAPER,
  readDrawingPaper,
  samePaper,
  type DrawingPaper,
  type PaperReference,
} from './paperSpace';
export { PAPER_WIDTH, PAPER_HEIGHT } from './paperSpace';
import { appendSmoothSegments, type PathSeg } from '../../../../web/src/lib/drawing/strokeMath';
import type { StoredStrokeWidthPx } from './storedStrokeWidth';

const MIN_SAMPLE_DISTANCE = 1;
export type Point = Readonly<{ x: number; y: number }>;
export type BrushStyle =
  | Readonly<{ color: PaintColor; brush: 'pen' | LegacySolidBrush }>
  | Readonly<{ color: PaintColor; brush: 'crayon'; seed: number }>
  | Readonly<{ brush: 'magic'; rainbow: number }>
  | Readonly<{ brush: 'eraser' }>;
export type StrokeStyle = BrushStyle & Readonly<{ width: StoredStrokeWidthPx }>;
// One retained op of a stroke (ADR-0178): the point count the stroke had reached when the op was
// painted, and the drawing-wide frame it was painted in. Op 0 is the dot at the first point; each
// later op paints the points after the previous op's end as one path continuing from its pen.
// Frames order every op of a drawing, so a cohort's contacts replay interleaved as they were drawn.
export type StrokeOp = readonly [end: number, frame: number];
export type Stroke = StrokeStyle &
  Readonly<{ points: readonly Point[]; ops?: readonly StrokeOp[] }>;
export type PaintStroke = Exclude<Stroke, { brush: 'eraser' }>;
type DrawingContents = Readonly<{ pageId: PageId; rainbow: number; strokes: readonly Stroke[] }>;
// Version 8 is version 7 whose strokes may carry ops; version 7 strokes never do. A version-5
// picture's strokes carry ops only while it is open: its saved format has none (drawingFormat.ts).
export type Drawing = DrawingContents &
  (
    | Readonly<{ version: 5 }>
    | Readonly<{ version: 7; paper: DrawingPaper }>
    | Readonly<{ version: 8; paper: DrawingPaper }>
  );
export type History = Readonly<{
  drawing: Drawing;
  undo: readonly Drawing[];
}>;

// An Undo copy that only changes the next Magic choice retains every existing pixel and scan.
const inkIdentities = new WeakMap<Drawing, Drawing>();
// The list each addStrokes list appended to, so a renderer holding the earlier list learns of the
// append without comparing every stroke. A list's own entry is dropped once it is appended to in
// turn, so no entry keeps a chain of ancestor lists alive.
const appendedTo = new WeakMap<readonly Stroke[], readonly Stroke[]>();

function appendStrokes(strokes: readonly Stroke[], additions: readonly Stroke[]) {
  const appended = [...strokes, ...additions];
  appendedTo.delete(strokes);
  appendedTo.set(appended, strokes);
  return appended;
}

// Whether `next` starts with every stroke of `base`, by identity.
export function extendsStrokes(base: readonly Stroke[], next: readonly Stroke[]): boolean {
  return (
    next === base ||
    appendedTo.get(next) === base ||
    (base.length <= next.length && base.every((stroke, index) => next[index] === stroke))
  );
}

export function drawingInkIdentity(drawing: Drawing): Drawing {
  return inkIdentities.get(drawing) ?? drawing;
}

export function emptyDrawing(
  rainbow = INITIAL_RAINBOW,
  pageId: PageId = 'blank'
): Extract<Drawing, { version: 8 }> {
  return { version: 8, paper: UNADOPTED_PAPER, pageId, rainbow, strokes: [] };
}

// The frame a new cohort's first ops take. A cohort's frames run without a gap, and the next
// cohort skips one frame past every op the drawing holds, so adjacent frames always mean the same
// cohort (the ink layer shares a Crayon glaze only between contacts drawn together).
export function cohortFrame(drawing: Drawing): number {
  let next = 0;
  for (const stroke of drawing.strokes) {
    const last = stroke.ops?.at(-1);
    if (last && last[1] + 2 > next) next = last[1] + 2;
  }
  return next;
}

export function strokeStyle(
  brush: Brush,
  color: PaintColor,
  drawing: Drawing,
  selection: StrokeWidth = DEFAULT_STROKE_WIDTH
): StrokeStyle {
  if (!isPaintColor(color)) throw new Error('Paint color is invalid.');
  const width = strokeWidthPx(brush, selection);
  if (brush === 'eraser') return { brush, width };
  if (brush === 'magic') return { brush, width, rainbow: drawing.rainbow };
  if (brush === 'crayon') {
    const largest = drawing.strokes.reduce(
      (largest, stroke) => (stroke.brush === 'crayon' ? Math.max(largest, stroke.seed) : largest),
      0
    );
    const seed = (largest % MAX_CRAYON_SEED) + 1;
    return { brush, width, color, seed };
  }
  return { brush, width, color };
}

export function createHistory(drawing: Drawing = emptyDrawing()): History {
  return { drawing, undo: [] };
}

export function commitDrawing(history: History, drawing: Drawing): History {
  return { drawing, undo: [...history.undo, history.drawing].slice(-MAX_UNDO_DEPTH) };
}

export function addStrokes(
  history: History,
  strokes: readonly Stroke[],
  paper?: PaperReference
): History {
  const additions = strokes.filter((stroke) => stroke.points.length > 0);
  if (additions.length === 0) return history;
  const drawing = history.drawing;
  // A version-5 picture stays version 5; its new strokes keep their ops while it is open, so
  // they replay as they were drawn. Only an imported picture is version 5; a session starts at 8.
  if (drawing.version === 5) {
    if (paper && paper.kind !== 'legacy') throw new Error('The drawing paper reference changed.');
    return commitDrawing(history, {
      ...drawing,
      strokes: appendStrokes(drawing.strokes, additions),
    });
  }
  const reference = drawing.paper.kind === 'adopted' ? drawing.paper : paper;
  if (!reference || reference.kind !== 'adopted' || (paper && !samePaper(reference, paper)))
    throw new Error('The drawing paper reference is not ready.');
  const validated = readDrawingPaper(reference);
  const adopted = Object.isFrozen(reference) ? reference : validated;
  for (const stroke of additions) {
    if (
      stroke.brush === 'pencil' ||
      stroke.brush === 'marker' ||
      !isStrokeWidthPx(stroke.brush, stroke.width)
    )
      throw new Error('This picture contains an invalid stroke width.');
  }
  return commitDrawing(history, {
    ...drawing,
    version: 8,
    paper: drawing.paper.kind === 'adopted' ? drawing.paper : adopted,
    strokes: appendStrokes(drawing.strokes, additions),
  });
}

export function addStroke(history: History, stroke: Stroke, paper?: PaperReference): History {
  return addStrokes(history, [stroke], paper);
}

export function undoDrawing(history: History): History {
  const previous = history.undo.at(-1);
  if (!previous) return history;
  const current = history.drawing;
  const restoresMagicPage =
    previous.strokes === current.strokes &&
    current.strokes.some((stroke) => stroke.brush === 'magic');
  const restored =
    restoresMagicPage || previous.pageId === current.pageId
      ? previous
      : { ...previous, pageId: current.pageId };
  const drawing =
    restored.rainbow === current.rainbow ? restored : { ...restored, rainbow: current.rainbow };
  if (drawing !== restored) inkIdentities.set(drawing, drawingInkIdentity(restored));
  return { drawing, undo: history.undo.slice(0, -1) };
}

export function clearDrawing(history: History, visuallyEmpty: boolean): History {
  const drawing = emptyDrawing(pickRainbow(), history.drawing.pageId);
  return visuallyEmpty ? { drawing, undo: history.undo } : commitDrawing(history, drawing);
}

export function changePage(history: History, pageId: PageId): History {
  if (pageId === history.drawing.pageId) return history;
  const drawing = { ...history.drawing, pageId };
  return drawing.strokes.some((stroke) => stroke.brush === 'magic')
    ? commitDrawing(history, drawing)
    : { ...history, drawing };
}

export function clearColoringOverlay(history: History): History {
  if (history.drawing.pageId === 'blank') return history;
  return { ...history, drawing: { ...history.drawing, pageId: 'blank' } };
}

export function paperPoint(x: number, y: number, width: number, height: number): Point {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error('The drawing paper is not ready.');
  }
  return {
    x: Math.round(Math.max(0, Math.min(PAPER_WIDTH, (x / width) * PAPER_WIDTH)) * 100) / 100,
    y: Math.round(Math.max(0, Math.min(PAPER_HEIGHT, (y / height) * PAPER_HEIGHT)) * 100) / 100,
  };
}

export type AppendOutcome = 'appended' | 'duplicate' | 'minDistanceRejected';

// What a stroke keeps of a sample that follows `points`.
export function sampleOutcome(
  points: readonly Point[],
  point: Point,
  includeEndpoint = false
): AppendOutcome {
  const last = points.at(-1);
  if (last && last.x === point.x && last.y === point.y) return 'duplicate';
  if (
    !includeEndpoint &&
    last &&
    Math.hypot(point.x - last.x, point.y - last.y) < MIN_SAMPLE_DISTANCE
  )
    return 'minDistanceRejected';
  return 'appended';
}

export function appendPoint(
  points: readonly Point[],
  point: Point,
  includeEndpoint = false
): readonly Point[] {
  return sampleOutcome(points, point, includeEndpoint) === 'appended' ? [...points, point] : points;
}

type SmoothStroke = Readonly<{ start: Point; segments: readonly PathSeg[] }>;

// Shipping's stroke geometry, from its own builder: midpoint quadratics that end at the last
// midpoint. `lead`, the point drawn before `points[0]`, continues a stroke split into passes
// from where the earlier pass stopped, as a shipping op continues from its pen.
export function smoothStroke(points: readonly Point[], lead?: Point): SmoothStroke {
  const first = points[0];
  if (!first) throw new Error('A stroke needs a point.');
  const start = lead ? { x: (lead.x + first.x) / 2, y: (lead.y + first.y) / 2 } : first;
  const pen = { x: first.x, y: first.y, midX: start.x, midY: start.y };
  const segments: PathSeg[] = [];
  appendSmoothSegments(pen, points.slice(1), segments);
  return { start, segments };
}

export function strokePath(points: readonly Point[], lead?: Point): string {
  const { start, segments } = smoothStroke(points, lead);
  let path = `M${start.x} ${start.y}`;
  for (const segment of segments) path += ` Q${segment.cx} ${segment.cy} ${segment.x} ${segment.y}`;
  return path;
}

export function hasDrawingInk(drawing: Drawing): boolean {
  return drawing.strokes.length > 0;
}
