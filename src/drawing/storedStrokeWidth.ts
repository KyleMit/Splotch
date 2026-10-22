import type { StoredBrush } from './brushes';
import { isStrokeWidthPx, type StrokeWidthPx } from './strokeWidth';

const HISTORIC_WIDTHS = {
  pencil: [3.5, 7, 14],
  marker: [11, 22, 44],
  crayon: [17, 34, 68],
  magic: [15, 30, 60],
  eraser: [22, 44, 88],
  pen: [11, 22, 44],
} as const satisfies Record<StoredBrush, readonly number[]>;
type HistoricWidthPx = (typeof HISTORIC_WIDTHS)[StoredBrush][number];
export type StoredStrokeWidthPx = StrokeWidthPx | HistoricWidthPx;
export function defaultStoredStrokeWidth(brush: StoredBrush): StoredStrokeWidthPx {
  return HISTORIC_WIDTHS[brush][1];
}
export function isStoredStrokeWidth(
  brush: StoredBrush,
  value: unknown
): value is StoredStrokeWidthPx {
  const historic: readonly number[] = HISTORIC_WIDTHS[brush];
  if (typeof value !== 'number') return false;
  return (
    historic.includes(value) ||
    (brush !== 'pencil' && brush !== 'marker' && isStrokeWidthPx(brush, value))
  );
}
