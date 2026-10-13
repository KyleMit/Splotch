export const EMPTY_ALPHA_THRESHOLD = 4;
export const MAX_PNG_BASE64_CHARACTERS = 64 * 1024 * 1024;
export const MAX_PNG_PIXELS = 16 * 1024 * 1024;
export type PngGrid = Readonly<{ width: number; height: number }>;

export function assertPngGrid(grid: PngGrid) {
  if (
    !Number.isSafeInteger(grid.width) ||
    !Number.isSafeInteger(grid.height) ||
    grid.width <= 0 ||
    grid.height <= 0 ||
    grid.width * grid.height > MAX_PNG_PIXELS
  )
    throw new Error('Picture capture returned unsupported dimensions.');
}
