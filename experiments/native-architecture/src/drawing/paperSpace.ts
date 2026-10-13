import type { Drawing, Point } from './model';

export const PAPER_WIDTH = 1024;
export const PAPER_HEIGHT = 768;
export const MAX_BACKING_SCALE = 2;
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

export function readDrawingPaper(value: unknown): DrawingPaper {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('This saved picture contains an invalid paper reference.');
  const item = value as Record<string, unknown>;
  if (item.kind === 'unadopted' && exact(item, ['kind'])) return UNADOPTED_PAPER;
  if (
    item.kind !== 'adopted' ||
    !exact(item, ['kind', 'cssWidth', 'cssHeight', 'backingScale']) ||
    typeof item.cssWidth !== 'number' ||
    !Number.isFinite(item.cssWidth) ||
    item.cssWidth <= 0 ||
    item.cssWidth > PAPER_WIDTH ||
    typeof item.cssHeight !== 'number' ||
    !Number.isFinite(item.cssHeight) ||
    item.cssHeight <= 0 ||
    item.cssHeight > PAPER_HEIGHT ||
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
  if (!Number.isFinite(PAPER_WIDTH / paperScale(paper) / paper.backingScale))
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

function paperScale(paper: PaperReference): number {
  return paper.kind === 'adopted'
    ? Math.min(paper.cssWidth / PAPER_WIDTH, paper.cssHeight / PAPER_HEIGHT)
    : 1;
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

function contentView(width: number, height: number) {
  if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0)
    throw new Error('The drawing paper is not ready.');
  const scale = Math.min(width / PAPER_WIDTH, height / PAPER_HEIGHT);
  if (!Number.isFinite(PAPER_WIDTH / scale)) throw new Error('The drawing paper is not ready.');
  return {
    scale,
    left: (width - PAPER_WIDTH * scale) / 2,
    top: (height - PAPER_HEIGHT * scale) / 2,
  };
}

export function containsPaperPoint(x: number, y: number, width: number, height: number): boolean {
  const view = contentView(width, height);
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= view.left &&
    y >= view.top &&
    x <= view.left + PAPER_WIDTH * view.scale &&
    y <= view.top + PAPER_HEIGHT * view.scale
  );
}

export function paperContactPoint(x: number, y: number, width: number, height: number): Point {
  if (![x, y].every(Number.isFinite)) throw new Error('The drawing paper is not ready.');
  const { scale, left, top } = contentView(width, height);
  return {
    x: Math.round(Math.max(0, Math.min(PAPER_WIDTH, (x - left) / scale)) * 100) / 100,
    y: Math.round(Math.max(0, Math.min(PAPER_HEIGHT, (y - top) / scale)) * 100) / 100,
  };
}
