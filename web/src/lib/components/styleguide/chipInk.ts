// Ink selection for text printed directly on a color chip's own fill — the
// fill IS the specimen, so the label rides on it and must stay readable on
// whatever the token's value is. WCAG relative luminance + contrast ratio
// (design/colorContrast.ts), not a raw-sRGB heuristic: picking whichever of
// black/white contrasts better guarantees at least 4.58:1 on any opaque fill
// (the worst case sits where both inks tie), so every chip clears the 4.5:1 AA
// floor and the axe scan covers the chips like everything else. chipInk.test.ts
// locks the guarantee against every current token value in both themes.

import { colorContrast } from '../../design/colorContrast';

export const CHIP_INK_DARK = '#000';
export const CHIP_INK_LIGHT = '#fff';

/**
 * The contrast an ink achieves on a fill (translucent fills composited over
 * `ground`). Exported for chipInk.test.ts, which asserts the 4.5:1 floor
 * holds for every token value — the seam exists for that guard.
 */
export function chipInkContrast(ink: string, fill: string, ground: string): number {
  return colorContrast(ink, fill, ground);
}

/**
 * Pick black or white ink for text on the given fill(s) — whichever holds the
 * better worst-case contrast across all of them (a gradient passes each stop).
 */
export function pickChipInk(fills: string[], ground: string): string {
  let darkWorst = Number.POSITIVE_INFINITY;
  let lightWorst = Number.POSITIVE_INFINITY;
  for (const fill of fills) {
    darkWorst = Math.min(darkWorst, chipInkContrast(CHIP_INK_DARK, fill, ground));
    lightWorst = Math.min(lightWorst, chipInkContrast(CHIP_INK_LIGHT, fill, ground));
  }
  return darkWorst >= lightWorst ? CHIP_INK_DARK : CHIP_INK_LIGHT;
}
