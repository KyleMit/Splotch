import { isPageId, type PageId } from './pages';
import { PALETTE_COLORS, type PaletteLabel } from './palette';

export const PAPER_WIDTH = 1024;
export const PAPER_HEIGHT = 768;
const MAX_STROKES = 1000;
export const MAX_POINTS = 100_000;
const MIN_SAMPLE_DISTANCE = 1;
export const BRUSHES = {
  pencil: { label: 'Pencil', width: 7 },
  marker: { label: 'Marker', width: 22 },
} as const;

export type Brush = keyof typeof BRUSHES;
export type Point = Readonly<{ x: number; y: number }>;
export type Stroke = Readonly<{ color: PaletteLabel; brush: Brush; points: readonly Point[] }>;
export type Drawing = Readonly<{ version: 2; pageId: PageId; strokes: readonly Stroke[] }>;
export type History = Readonly<{ drawing: Drawing; undo: readonly Drawing[] }>;

const HISTORY_LIMIT = 50;
const HISTORY_POINT_BUDGET = 200_000;

export function emptyDrawing(): Drawing {
  return { version: 2, pageId: 'blank', strokes: [] };
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

export function addStroke(history: History, stroke: Stroke): History {
  if (stroke.points.length === 0) return history;
  if (
    history.drawing.strokes.length >= MAX_STROKES ||
    pointCount(history.drawing) + stroke.points.length > MAX_POINTS
  ) {
    throw new Error('This picture is full. Save it, then start a new picture.');
  }
  return commitDrawing(history, {
    ...history.drawing,
    strokes: [...history.drawing.strokes, stroke],
  });
}

export function undoDrawing(history: History): History {
  const drawing = history.undo.at(-1);
  return drawing ? { drawing, undo: history.undo.slice(0, -1) } : history;
}

export function clearDrawing(history: History): History {
  return history.drawing.strokes.length
    ? commitDrawing(history, { ...history.drawing, strokes: [] })
    : history;
}

export function changePage(history: History, pageId: PageId): History {
  return pageId === history.drawing.pageId
    ? history
    : commitDrawing(history, { ...emptyDrawing(), pageId });
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

export function parseDrawing(value: unknown): Drawing {
  if (
    !record(value) ||
    (value.version !== 1 && value.version !== 2) ||
    (value.version === 2 && !isPageId(value.pageId)) ||
    !Array.isArray(value.strokes) ||
    value.strokes.length > MAX_STROKES
  ) {
    throw new Error('This saved picture is not a supported drawing.');
  }
  let total = 0;
  const strokes = value.strokes.map((item: unknown): Stroke => {
    if (
      !record(item) ||
      typeof item.color !== 'string' ||
      !PALETTE_COLORS.some((color) => color.label === item.color) ||
      (item.brush !== 'pencil' && item.brush !== 'marker') ||
      !Array.isArray(item.points) ||
      item.points.length === 0
    ) {
      throw new Error('This saved picture contains an invalid stroke.');
    }
    total += item.points.length;
    if (total > MAX_POINTS) throw new Error('This saved picture is too large.');
    const points = item.points.map((point: unknown): Point => {
      if (
        !record(point) ||
        typeof point.x !== 'number' ||
        typeof point.y !== 'number' ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        point.x < 0 ||
        point.x > PAPER_WIDTH ||
        point.y < 0 ||
        point.y > PAPER_HEIGHT
      ) {
        throw new Error('This saved picture contains an invalid point.');
      }
      return { x: point.x, y: point.y };
    });
    return { color: item.color as PaletteLabel, brush: item.brush, points };
  });
  return {
    version: 2,
    pageId: value.version === 2 && isPageId(value.pageId) ? value.pageId : 'blank',
    strokes,
  };
}
