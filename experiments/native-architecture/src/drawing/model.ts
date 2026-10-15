import { MAX_UNDO_DEPTH } from '../../../../web/src/lib/drawing/undoHistory';
import { isPaintColor, isPaletteLabel, type PaintColor } from './palette';
import { isPageId, type PageId } from './pages';
import {
  INITIAL_RAINBOW,
  pickRainbow,
  MAGIC_RAINBOW_COUNT,
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
  LEGACY_PAPER,
  UNADOPTED_PAPER,
  paperSize,
  readDrawingPaper,
  samePaper,
  type DrawingPaper,
  type PaperReference,
  type PaperSize,
} from './paperSpace';
export { PAPER_WIDTH, PAPER_HEIGHT } from './paperSpace';
import { appendSmoothSegments, type PathSeg } from '../../../../web/src/lib/drawing/strokeMath';
import {
  defaultStoredStrokeWidth,
  isStoredStrokeWidth,
  type StoredStrokeWidthPx,
} from './storedStrokeWidth';

const MIN_SAMPLE_DISTANCE = 1;
export type Point = Readonly<{ x: number; y: number }>;
type BrushStyle =
  | Readonly<{ color: PaintColor; brush: 'pen' | LegacySolidBrush }>
  | Readonly<{ color: PaintColor; brush: 'crayon'; seed: number }>
  | Readonly<{ brush: 'magic'; rainbow: number }>
  | Readonly<{ brush: 'eraser' }>;
export type StrokeStyle = BrushStyle & Readonly<{ width: StoredStrokeWidthPx }>;
export type Stroke = StrokeStyle & Readonly<{ points: readonly Point[] }>;
export type PaintStroke = Exclude<Stroke, { brush: 'eraser' }>;
type DrawingContents = Readonly<{ pageId: PageId; rainbow: number; strokes: readonly Stroke[] }>;
export type Drawing = DrawingContents &
  (Readonly<{ version: 5 }> | Readonly<{ version: 7; paper: DrawingPaper }>);
export type History = Readonly<{
  drawing: Drawing;
  undo: readonly Drawing[];
}>;

// An Undo copy that only changes the next Magic choice retains every existing pixel and scan.
const inkIdentities = new WeakMap<Drawing, Drawing>();

export function drawingInkIdentity(drawing: Drawing): Drawing {
  return inkIdentities.get(drawing) ?? drawing;
}

export function emptyDrawing(
  rainbow = INITIAL_RAINBOW,
  pageId: PageId = 'blank'
): Extract<Drawing, { version: 7 }> {
  return { version: 7, paper: UNADOPTED_PAPER, pageId, rainbow, strokes: [] };
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
  if (drawing.version === 5) {
    if (paper && paper.kind !== 'legacy') throw new Error('The drawing paper reference changed.');
    return commitDrawing(history, { ...drawing, strokes: [...drawing.strokes, ...additions] });
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
    paper: drawing.paper.kind === 'adopted' ? drawing.paper : adopted,
    strokes: [...drawing.strokes, ...additions],
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

export function paperPoint(x: number, y: number, width: number, height: number): Point {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error('The drawing paper is not ready.');
  }
  return {
    x: Math.round(Math.max(0, Math.min(PAPER_WIDTH, (x / width) * PAPER_WIDTH)) * 100) / 100,
    y: Math.round(Math.max(0, Math.min(PAPER_HEIGHT, (y / height) * PAPER_HEIGHT)) * 100) / 100,
  };
}

export function appendPoint(
  points: readonly Point[],
  point: Point,
  includeEndpoint = false
): readonly Point[] {
  const last = points.at(-1);
  if (last && last.x === point.x && last.y === point.y) return points;
  if (
    !includeEndpoint &&
    last &&
    Math.hypot(point.x - last.x, point.y - last.y) < MIN_SAMPLE_DISTANCE
  )
    return points;
  return [...points, point];
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

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type SavedFormat = 'legacy' | 'page' | 'brush' | 'joint' | 'width' | 'color' | 'paper';

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}

function savedFormat(value: Record<string, unknown>): SavedFormat {
  if (value.version === 1 && exactKeys(value, ['version', 'strokes'])) return 'legacy';
  if (value.version === 2 && exactKeys(value, ['version', 'pageId', 'strokes'])) return 'page';
  if (value.version === 2 && exactKeys(value, ['version', 'rainbow', 'strokes'])) return 'brush';
  if (value.version === 3 && exactKeys(value, ['version', 'pageId', 'rainbow', 'strokes']))
    return 'joint';
  if (value.version === 4 && exactKeys(value, ['version', 'pageId', 'rainbow', 'strokes']))
    return 'width';
  if (value.version === 5 && exactKeys(value, ['version', 'pageId', 'rainbow', 'strokes']))
    return 'color';
  if (value.version === 7 && exactKeys(value, ['version', 'paper', 'pageId', 'rainbow', 'strokes']))
    return 'paper';
  throw new Error('This saved picture is not a supported drawing.');
}

function readRainbow(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value >= MAGIC_RAINBOW_COUNT
  )
    throw new Error('This saved picture contains an invalid rainbow.');
  return value;
}

function readStyle(
  item: Record<string, unknown>,
  format: SavedFormat,
  rainbow: number
): BrushStyle {
  if (
    (format === 'joint' || format === 'width' || format === 'color' || format === 'paper') &&
    item.brush === 'eraser' &&
    exactKeys(item, ['brush', 'points'])
  )
    return { brush: 'eraser' };
  const rich =
    format === 'brush' ||
    format === 'joint' ||
    format === 'width' ||
    format === 'color' ||
    format === 'paper';
  if (
    rich &&
    item.brush === 'magic' &&
    item.rainbow === rainbow &&
    exactKeys(item, ['brush', 'rainbow', 'points'])
  )
    return { brush: 'magic', rainbow };
  if (
    format === 'color' || format === 'paper' ? isPaintColor(item.color) : isPaletteLabel(item.color)
  ) {
    const color = item.color;
    if (!isPaintColor(color)) throw new Error('This saved picture contains an invalid color.');
    if (
      ((format !== 'paper' && (item.brush === 'pencil' || item.brush === 'marker')) ||
        ((format === 'color' || format === 'paper') && item.brush === 'pen')) &&
      exactKeys(item, ['brush', 'color', 'points'])
    )
      return { brush: item.brush, color };
    if (
      rich &&
      item.brush === 'crayon' &&
      typeof item.seed === 'number' &&
      Number.isSafeInteger(item.seed) &&
      item.seed > 0 &&
      item.seed <= MAX_CRAYON_SEED &&
      exactKeys(item, ['brush', 'color', 'seed', 'points'])
    )
      return { brush: 'crayon', color, seed: item.seed };
  }
  throw new Error('This saved picture contains an invalid brush.');
}

function readPoint(point: unknown, size: PaperSize): Point {
  if (
    !record(point) ||
    !exactKeys(point, ['x', 'y']) ||
    typeof point.x !== 'number' ||
    typeof point.y !== 'number' ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    point.x < 0 ||
    point.x > size.width ||
    point.y < 0 ||
    point.y > size.height
  )
    throw new Error('This saved picture contains an invalid point.');
  return { x: point.x, y: point.y };
}

export function parseDrawing(value: unknown): Drawing {
  if (!record(value) || !Array.isArray(value.strokes))
    throw new Error('This saved picture is not a supported drawing.');
  const format = savedFormat(value);
  const pageId = format === 'legacy' || format === 'brush' ? 'blank' : value.pageId;
  if (!isPageId(pageId)) throw new Error('This saved picture contains an invalid coloring page.');
  const rainbow =
    format === 'legacy' || format === 'page' ? INITIAL_RAINBOW : readRainbow(value.rainbow);
  const paper = format === 'paper' ? readDrawingPaper(value.paper) : LEGACY_PAPER;
  const size = paperSize(paper);
  const strokes = value.strokes.map((item: unknown): Stroke => {
    if (!record(item) || !Array.isArray(item.points) || item.points.length === 0)
      throw new Error('This saved picture contains an invalid stroke.');
    const { width, ...withoutWidth } = item;
    const style = readStyle(
      format === 'width' || format === 'color' || format === 'paper' ? withoutWidth : item,
      format,
      rainbow
    );
    const actualWidth =
      format === 'width' || format === 'color' || format === 'paper'
        ? width
        : defaultStoredStrokeWidth(style.brush);
    if (
      format === 'paper' &&
      (style.brush === 'pencil' ||
        style.brush === 'marker' ||
        !isStrokeWidthPx(style.brush, actualWidth))
    )
      throw new Error('This saved picture contains an invalid stroke width.');
    if (!isStoredStrokeWidth(style.brush, actualWidth))
      throw new Error('This saved picture contains an invalid stroke width.');
    return {
      ...style,
      width: actualWidth,
      points: item.points.map((point: unknown) => readPoint(point, size)),
    };
  });
  if (paper.kind !== 'legacy') {
    if (paper.kind === 'unadopted' && strokes.length > 0)
      throw new Error('This saved picture contains ink without a paper reference.');
    return { version: 7, paper, pageId, rainbow, strokes };
  }
  return { version: 5, pageId, rainbow, strokes };
}

export function hasDrawingInk(drawing: Drawing): boolean {
  return drawing.strokes.length > 0;
}
