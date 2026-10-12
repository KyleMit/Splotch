export type StrokeSize = 1 | 2 | 3 | 4 | 5;
export const STROKE_SIZES: readonly StrokeSize[] = [1, 2, 3, 4, 5];
export const DEFAULT_SIZE: StrokeSize = 3;

// The eraser runs noticeably larger than the pen at the same stroke level — a
// toddler erasing wants big sweeps, not precision, and 1.4× was too subtle to
// feel. Matching the pen exactly makes precise erasing frustrating.
export const ERASER_SIZE_MULTIPLIER = 2;

const SIZE_TO_PX: Record<StrokeSize, number> = {
  1: 2,
  2: 4,
  3: 8,
  4: 14,
  5: 22,
};

export function getStrokeWidthPx(size: StrokeSize): number {
  return SIZE_TO_PX[size];
}

export function getEraserWidthPx(size: StrokeSize): number {
  return getStrokeWidthPx(size) * ERASER_SIZE_MULTIPLIER;
}
