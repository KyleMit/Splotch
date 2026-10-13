import type { Drawing, Point } from './model';

// The canonical sheet: the version-5 coordinate space, the frame the sample coloring pages are
// drawn for, and the box an adopted paper's semantic size fits within, turned to its orientation.
export const PAPER_WIDTH = 1024;
export const PAPER_HEIGHT = 768;
export const MAX_BACKING_SCALE = 2;
// Bounds stored metadata rather than screens: larger than any display's CSS viewport.
export const MAX_PAPER_CSS_PX = 8192;
export type PaperSize = Readonly<{ width: number; height: number }>;
export const CANONICAL_PAPER_SIZE: PaperSize = Object.freeze({
  width: PAPER_WIDTH,
  height: PAPER_HEIGHT,
});
export type AdoptedPaper = Readonly<{
  kind: 'adopted';
  cssWidth: number;
  cssHeight: number;
  backingScale: number;
}>;
export type DrawingPaper = Readonly<{ kind: 'unadopted' }> | AdoptedPaper;
export type PaperReference = Readonly<{ kind: 'legacy' }> | DrawingPaper;
export const LEGACY_PAPER: PaperReference = Object.freeze({ kind: 'legacy' });
export const UNADOPTED_PAPER: DrawingPaper = Object.freeze({ kind: 'unadopted' });

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}

function cssLength(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_PAPER_CSS_PX
  );
}

export function readDrawingPaper(value: unknown): DrawingPaper {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('This saved picture contains an invalid paper reference.');
  const item = value as Record<string, unknown>;
  if (item.kind === 'unadopted' && exact(item, ['kind'])) return UNADOPTED_PAPER;
  if (
    item.kind !== 'adopted' ||
    !exact(item, ['kind', 'cssWidth', 'cssHeight', 'backingScale']) ||
    !cssLength(item.cssWidth) ||
    !cssLength(item.cssHeight) ||
    typeof item.backingScale !== 'number' ||
    !Number.isFinite(item.backingScale) ||
    item.backingScale <= 0 ||
    item.backingScale > MAX_BACKING_SCALE
  )
    throw new Error('This saved picture contains an invalid paper reference.');
  const paper: AdoptedPaper = {
    kind: 'adopted',
    cssWidth: item.cssWidth,
    cssHeight: item.cssHeight,
    backingScale: item.backingScale,
  };
  if (!Number.isFinite(1 / paperScale(paper) / paper.backingScale))
    throw new Error('This saved picture contains an invalid paper reference.');
  return Object.freeze(paper);
}

export function adoptPaper(cssWidth: number, cssHeight: number, pixelRatio: number): AdoptedPaper {
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0)
    throw new Error('The drawing display scale is not ready.');
  const paper = readDrawingPaper({
    kind: 'adopted',
    cssWidth,
    cssHeight,
    backingScale: Math.min(pixelRatio, MAX_BACKING_SCALE),
  });
  if (paper.kind !== 'adopted') throw new Error('The drawing paper is not ready.');
  return paper;
}

export function drawingPaper(drawing: Drawing): PaperReference {
  return drawing.version === 5 ? LEGACY_PAPER : drawing.paper;
}

function shapeBox(cssWidth: number, cssHeight: number): PaperSize {
  return cssHeight > cssWidth ? { width: PAPER_HEIGHT, height: PAPER_WIDTH } : CANONICAL_PAPER_SIZE;
}

// CSS pixels per semantic unit: the shape contain-fitted to the canonical sheet turned to match.
function shapeScale(cssWidth: number, cssHeight: number): number {
  const box = shapeBox(cssWidth, cssHeight);
  return Math.max(cssWidth / box.width, cssHeight / box.height);
}

function paperScale(paper: PaperReference): number {
  return paper.kind === 'adopted' ? shapeScale(paper.cssWidth, paper.cssHeight) : 1;
}

function shapedSize(cssWidth: number, cssHeight: number): PaperSize {
  const scale = shapeScale(cssWidth, cssHeight);
  return {
    width: Math.max(1, Math.round(cssWidth / scale)),
    height: Math.max(1, Math.round(cssHeight / scale)),
  };
}

// A picture keeps the shape of the paper area it was first drawn in (ADR-0050). Its semantic
// size is that shape in whole units within the turned canonical sheet, so a 4:3 landscape
// adoption is exactly the canonical sheet and no export exceeds the canonical pixel count.
export function paperSize(paper: PaperReference): PaperSize {
  return paper.kind === 'adopted'
    ? shapedSize(paper.cssWidth, paper.cssHeight)
    : CANONICAL_PAPER_SIZE;
}

// An unadopted picture has no ink and no shape yet; it shows as the paper it would adopt from
// the frame it fills.
export function presentedPaperSize(
  paper: PaperReference,
  frame: Readonly<{ width: number; height: number }>
): PaperSize {
  if (paper.kind !== 'unadopted') return paperSize(paper);
  return cssLength(frame.width) && cssLength(frame.height)
    ? shapedSize(frame.width, frame.height)
    : CANONICAL_PAPER_SIZE;
}

export function drawingPaperSize(drawing: Drawing): PaperSize {
  return paperSize(drawingPaper(drawing));
}

export function semanticWidth(width: number, paper: PaperReference): number {
  if (paper.kind === 'unadopted') throw new Error('Ink requires an adopted paper reference.');
  return width / paperScale(paper);
}

export function textureScale(paper: PaperReference): number {
  if (paper.kind === 'unadopted') throw new Error('Ink requires an adopted paper reference.');
  return paper.kind === 'adopted' ? 1 / (paperScale(paper) * paper.backingScale) : 1;
}

export function paperKey(paper: PaperReference): string {
  return paper.kind === 'adopted'
    ? `${paper.kind}:${paper.cssWidth}:${paper.cssHeight}:${paper.backingScale}`
    : paper.kind;
}

export function samePaper(left: PaperReference, right: PaperReference): boolean {
  return paperKey(left) === paperKey(right);
}

// The paper contain-fitted and centered in a frame: how the ink plane presents it and how
// contacts map back onto it.
export function paperView(width: number, height: number, size: PaperSize) {
  if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0)
    throw new Error('The drawing paper is not ready.');
  const scale = Math.min(width / size.width, height / size.height);
  if (!Number.isFinite(size.width / scale)) throw new Error('The drawing paper is not ready.');
  return {
    scale,
    left: (width - size.width * scale) / 2,
    top: (height - size.height * scale) / 2,
  };
}

export function containsPaperPoint(
  x: number,
  y: number,
  width: number,
  height: number,
  size: PaperSize
): boolean {
  const view = paperView(width, height, size);
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= view.left &&
    y >= view.top &&
    x <= view.left + size.width * view.scale &&
    y <= view.top + size.height * view.scale
  );
}

export function paperContactPoint(
  x: number,
  y: number,
  width: number,
  height: number,
  size: PaperSize
): Point {
  if (![x, y].every(Number.isFinite)) throw new Error('The drawing paper is not ready.');
  const { scale, left, top } = paperView(width, height, size);
  return {
    x: Math.round(Math.max(0, Math.min(size.width, (x - left) / scale)) * 100) / 100,
    y: Math.round(Math.max(0, Math.min(size.height, (y - top) / scale)) * 100) / 100,
  };
}

// A coloring page's art frame sits contain-fitted and centered on the paper, the way the
// shipping app's coloring overlay is object-fit: contain within its paper. The sample pages and
// their Magic fills are drawn in the canonical frame.
export function pageArtTransform(paper: PaperSize) {
  const { scale, left, top } = paperView(paper.width, paper.height, CANONICAL_PAPER_SIZE);
  return `translate(${left} ${top}) scale(${scale})`;
}
