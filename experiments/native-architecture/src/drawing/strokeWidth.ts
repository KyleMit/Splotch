import type { Brush } from './brushes';

export const STROKE_WIDTHS = ['extraThin', 'thin', 'medium', 'thick', 'extraThick'] as const;
export type StrokeWidth = (typeof STROKE_WIDTHS)[number];
export const DEFAULT_STROKE_WIDTH: StrokeWidth = 'medium';
export const ERASER_WIDTH_MULTIPLIER = 2;
export const STROKE_WIDTH_LABELS: Record<StrokeWidth, string> = {
  extraThin: 'Extra thin',
  thin: 'Thin',
  medium: 'Medium',
  thick: 'Thick',
  extraThick: 'Extra thick',
};
const INK_WIDTH_PX = { extraThin: 2, thin: 4, medium: 8, thick: 14, extraThick: 22 } as const;
export const STROKE_WIDTH_PX = {
  pen: INK_WIDTH_PX,
  crayon: INK_WIDTH_PX,
  magic: INK_WIDTH_PX,
  eraser: { extraThin: 4, thin: 8, medium: 16, thick: 28, extraThick: 44 },
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
