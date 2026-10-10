import type { Brush } from './brushes';

export const STROKE_WIDTHS = ['thin', 'medium', 'thick'] as const;
export type StrokeWidth = (typeof STROKE_WIDTHS)[number];
export const DEFAULT_STROKE_WIDTH: StrokeWidth = 'medium';
export const STROKE_WIDTH_LABELS: Record<StrokeWidth, string> = {
  thin: 'Thin',
  medium: 'Medium',
  thick: 'Thick',
};
export const STROKE_WIDTH_PX = {
  pencil: { thin: 3.5, medium: 7, thick: 14 },
  marker: { thin: 11, medium: 22, thick: 44 },
  crayon: { thin: 17, medium: 34, thick: 68 },
  magic: { thin: 15, medium: 30, thick: 60 },
  eraser: { thin: 22, medium: 44, thick: 88 },
} as const satisfies Record<Brush, Record<StrokeWidth, number>>;
export type StrokeWidthPx = (typeof STROKE_WIDTH_PX)[Brush][StrokeWidth];

export function isStrokeWidth(value: unknown): value is StrokeWidth {
  return STROKE_WIDTHS.some((width) => width === value);
}

export function strokeWidthPx(brush: Brush, width: StrokeWidth): StrokeWidthPx {
  return STROKE_WIDTH_PX[brush][width];
}

export function isStrokeWidthPx(brush: Brush, value: unknown): value is StrokeWidthPx {
  return STROKE_WIDTHS.some((width) => strokeWidthPx(brush, width) === value);
}
