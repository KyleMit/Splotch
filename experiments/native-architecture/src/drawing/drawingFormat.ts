import { isPaintColor, isPaletteLabel } from './palette';
import { isPageId } from './pages';
import { INITIAL_RAINBOW, MAGIC_RAINBOW_COUNT, MAX_CRAYON_SEED } from './brushes';
import { isStrokeWidthPx } from './strokeWidth';
import { LEGACY_PAPER, paperSize, readDrawingPaper, type PaperSize } from './paperSpace';
import { defaultStoredStrokeWidth, isStoredStrokeWidth } from './storedStrokeWidth';
import type { BrushStyle, Drawing, Point, Stroke, StrokeOp } from './model';

// The saved drawing formats and their strict reader. Only the AI original model reads or writes a
// saved drawing, so this stays out of the drawing screen's startup path on web (ADR-0179).

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type SavedFormat = 'legacy' | 'page' | 'brush' | 'joint' | 'width' | 'color' | 'paper' | 'ops';

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
  if (value.version === 8 && exactKeys(value, ['version', 'paper', 'pageId', 'rainbow', 'strokes']))
    return 'ops';
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

function readPoint(point: unknown, size: PaperSize | null): Point {
  if (
    !record(point) ||
    !exactKeys(point, ['x', 'y']) ||
    typeof point.x !== 'number' ||
    typeof point.y !== 'number' ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    (size !== null && (point.x < 0 || point.x > size.width || point.y < 0 || point.y > size.height))
  )
    throw new Error('This saved picture contains an invalid point.');
  return { x: point.x, y: point.y };
}

function readOpNumber(value: unknown, least: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < least)
    throw new Error('This saved picture contains an invalid stroke op.');
  return value;
}

// Op 0 is the first point's dot; every later op ends past the one before it, the last at the
// stroke's final point, and frames never run backwards within a stroke.
function readOps(value: unknown, points: number): readonly StrokeOp[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error('This saved picture contains an invalid stroke op.');
  let end = 0;
  let frame = 0;
  const ops = value.map((item: unknown, index): StrokeOp => {
    if (!Array.isArray(item) || item.length !== 2)
      throw new Error('This saved picture contains an invalid stroke op.');
    const opEnd = readOpNumber(item[0], index === 0 ? 1 : end + 1);
    if (index === 0 && opEnd !== 1)
      throw new Error('This saved picture contains an invalid stroke op.');
    frame = readOpNumber(item[1], frame);
    end = opEnd;
    return [opEnd, frame];
  });
  if (end !== points) throw new Error('This saved picture contains an invalid stroke op.');
  return ops;
}

export function parseDrawing(value: unknown): Drawing {
  if (!record(value) || !Array.isArray(value.strokes))
    throw new Error('This saved picture is not a supported drawing.');
  const saved = savedFormat(value);
  // Version 8 saves version 7's strokes, each optionally with its ops.
  const format = saved === 'ops' ? 'paper' : saved;
  const pageId = format === 'legacy' || format === 'brush' ? 'blank' : value.pageId;
  if (!isPageId(pageId)) throw new Error('This saved picture contains an invalid coloring page.');
  const rainbow =
    format === 'legacy' || format === 'page' ? INITIAL_RAINBOW : readRainbow(value.rainbow);
  const paper = format === 'paper' ? readDrawingPaper(value.paper) : LEGACY_PAPER;
  const size = paperSize(paper);
  const sized = format === 'width' || format === 'color' || format === 'paper';
  const strokes = value.strokes.map((item: unknown): Stroke => {
    if (!record(item) || !Array.isArray(item.points) || item.points.length === 0)
      throw new Error('This saved picture contains an invalid stroke.');
    const { width, ...withoutWidth } = item;
    const { ops, ...withoutOps } = withoutWidth;
    const style = readStyle(
      saved === 'ops' ? withoutOps : sized ? withoutWidth : item,
      format,
      rainbow
    );
    const actualWidth = sized ? width : defaultStoredStrokeWidth(style.brush);
    if (
      format === 'paper' &&
      (style.brush === 'pencil' ||
        style.brush === 'marker' ||
        !isStrokeWidthPx(style.brush, actualWidth))
    )
      throw new Error('This saved picture contains an invalid stroke width.');
    if (!isStoredStrokeWidth(style.brush, actualWidth))
      throw new Error('This saved picture contains an invalid stroke width.');
    const points = item.points.map((point: unknown) =>
      readPoint(point, format === 'paper' ? null : size)
    );
    return saved === 'ops' && ops !== undefined
      ? { ...style, width: actualWidth, points, ops: readOps(ops, points.length) }
      : { ...style, width: actualWidth, points };
  });
  if (paper.kind !== 'legacy') {
    if (paper.kind === 'unadopted' && strokes.length > 0)
      throw new Error('This saved picture contains ink without a paper reference.');
    return { version: saved === 'ops' ? 8 : 7, paper, pageId, rainbow, strokes };
  }
  return { version: 5, pageId, rainbow, strokes };
}
