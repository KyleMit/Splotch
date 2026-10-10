import { PALETTE_COLORS, type PaletteLabel } from './palette';
import { isPageId, type PageId } from './pages';
import { INITIAL_RAINBOW, MAGIC_RAINBOW_COUNT, MAX_CRAYON_SEED, type Brush } from './brushes';
import {
  DEFAULT_STROKE_WIDTH,
  isStrokeWidthPx,
  strokeWidthPx,
  type StrokeWidth,
  type StrokeWidthPx,
} from './strokeWidth';

export const PAPER_WIDTH = 1024;
export const PAPER_HEIGHT = 768;
const MAX_STROKES = 1000;
export const MAX_POINTS = 100_000;
export const DRAWING_FULL_MESSAGE = 'This picture is full. Save it, then start a new picture.';
const MIN_SAMPLE_DISTANCE = 1;
export type Point = Readonly<{ x: number; y: number }>;
type BrushStyle =
  | Readonly<{ color: PaletteLabel; brush: 'pencil' | 'marker' }>
  | Readonly<{ color: PaletteLabel; brush: 'crayon'; seed: number }>
  | Readonly<{ brush: 'magic'; rainbow: number }>
  | Readonly<{ brush: 'eraser' }>;
export type StrokeStyle = BrushStyle & Readonly<{ width: StrokeWidthPx }>;
export type Stroke = StrokeStyle & Readonly<{ points: readonly Point[] }>;
export type PaintStroke = Exclude<Stroke, { brush: 'eraser' }>;
export type Drawing = Readonly<{
  version: 4;
  pageId: PageId;
  rainbow: number;
  strokes: readonly Stroke[];
}>;
export type History = Readonly<{ drawing: Drawing; undo: readonly Drawing[] }>;

const HISTORY_LIMIT = 50;
const HISTORY_POINT_BUDGET = 200_000;

export function emptyDrawing(rainbow = INITIAL_RAINBOW, pageId: PageId = 'blank'): Drawing {
  return { version: 4, pageId, rainbow, strokes: [] };
}

export function strokeStyle(
  brush: Brush,
  color: PaletteLabel,
  drawing: Drawing,
  selection: StrokeWidth = DEFAULT_STROKE_WIDTH
): StrokeStyle {
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

function pointCount(drawing: Drawing): number {
  return drawing.strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
}

export function commitDrawing(history: History, drawing: Drawing): History {
  let undo = [...history.undo, history.drawing].slice(-HISTORY_LIMIT);
  while (
    undo.length > 1 &&
    undo.reduce((sum, item) => sum + pointCount(item), 0) > HISTORY_POINT_BUDGET
  ) {
    undo = undo.slice(1);
  }
  return { drawing, undo };
}

export function drawingCapacity(drawing: Drawing): { strokes: number; points: number } {
  return {
    strokes: MAX_STROKES - drawing.strokes.length,
    points: MAX_POINTS - pointCount(drawing),
  };
}

export function addStrokes(history: History, strokes: readonly Stroke[]): History {
  const additions = strokes.filter((stroke) => stroke.points.length > 0);
  if (additions.length === 0) return history;
  const capacity = drawingCapacity(history.drawing);
  const points = additions.reduce((sum, stroke) => sum + stroke.points.length, 0);
  if (additions.length > capacity.strokes || points > capacity.points)
    throw new Error(DRAWING_FULL_MESSAGE);
  return commitDrawing(history, {
    ...history.drawing,
    strokes: [...history.drawing.strokes, ...additions],
  });
}

export function addStroke(history: History, stroke: Stroke): History {
  return addStrokes(history, [stroke]);
}

export function undoDrawing(history: History): History {
  const drawing = history.undo.at(-1);
  return drawing ? { drawing, undo: history.undo.slice(0, -1) } : history;
}

export function clearDrawing(history: History, visuallyEmpty: boolean): History {
  const drawing = emptyDrawing(
    (history.drawing.rainbow + 1) % MAGIC_RAINBOW_COUNT,
    history.drawing.pageId
  );
  return visuallyEmpty ? { drawing, undo: history.undo } : commitDrawing(history, drawing);
}

export function changePage(history: History, pageId: PageId): History {
  return pageId === history.drawing.pageId
    ? history
    : commitDrawing(history, emptyDrawing(history.drawing.rainbow, pageId));
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
  if (points.length >= MAX_POINTS)
    throw new Error('This stroke is too long. Lift your finger to finish it.');
  return [...points, point];
}

export function strokePath(points: readonly Point[]): string {
  return points.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`).join(' ');
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type SavedFormat = 'legacy' | 'page' | 'brush' | 'joint' | 'width';

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
    (format === 'joint' || format === 'width') &&
    item.brush === 'eraser' &&
    exactKeys(item, ['brush', 'points'])
  )
    return { brush: 'eraser' };
  const rich = format === 'brush' || format === 'joint' || format === 'width';
  if (
    rich &&
    item.brush === 'magic' &&
    item.rainbow === rainbow &&
    exactKeys(item, ['brush', 'rainbow', 'points'])
  )
    return { brush: 'magic', rainbow };
  if (
    typeof item.color === 'string' &&
    PALETTE_COLORS.some((color) => color.label === item.color)
  ) {
    const color = item.color as PaletteLabel;
    if (
      (item.brush === 'pencil' || item.brush === 'marker') &&
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

function readPoint(point: unknown): Point {
  if (
    !record(point) ||
    !exactKeys(point, ['x', 'y']) ||
    typeof point.x !== 'number' ||
    typeof point.y !== 'number' ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    point.x < 0 ||
    point.x > PAPER_WIDTH ||
    point.y < 0 ||
    point.y > PAPER_HEIGHT
  )
    throw new Error('This saved picture contains an invalid point.');
  return { x: point.x, y: point.y };
}

export function parseDrawing(value: unknown): Drawing {
  if (!record(value) || !Array.isArray(value.strokes) || value.strokes.length > MAX_STROKES)
    throw new Error('This saved picture is not a supported drawing.');
  const format = savedFormat(value);
  const pageId = format === 'legacy' || format === 'brush' ? 'blank' : value.pageId;
  if (!isPageId(pageId)) throw new Error('This saved picture contains an invalid coloring page.');
  const rainbow =
    format === 'legacy' || format === 'page' ? INITIAL_RAINBOW : readRainbow(value.rainbow);
  let total = 0;
  const strokes = value.strokes.map((item: unknown): Stroke => {
    if (!record(item) || !Array.isArray(item.points) || item.points.length === 0)
      throw new Error('This saved picture contains an invalid stroke.');
    const { width, ...withoutWidth } = item;
    const style = readStyle(format === 'width' ? withoutWidth : item, format, rainbow);
    const actualWidth =
      format === 'width' ? width : strokeWidthPx(style.brush, DEFAULT_STROKE_WIDTH);
    if (!isStrokeWidthPx(style.brush, actualWidth))
      throw new Error('This saved picture contains an invalid stroke width.');
    total += item.points.length;
    if (total > MAX_POINTS) throw new Error('This saved picture is too large.');
    return { ...style, width: actualWidth, points: item.points.map(readPoint) };
  });
  return { version: 4, pageId, rainbow, strokes };
}
