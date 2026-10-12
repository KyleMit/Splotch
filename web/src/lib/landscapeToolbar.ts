import { PALETTE_COLORS, TRIM_ORDER } from './palette';

const OMITTED_COLOR_COUNT = 4;
export const LANDSCAPE_COLORS = PALETTE_COLORS.filter(
  ({ hex }) => TRIM_ORDER.indexOf(hex) >= OMITTED_COLOR_COUNT
);

/** The rank the menu's trim ladder starts at: the first color it carries. */
export const LANDSCAPE_FIRST_TRIM_RANK = OMITTED_COLOR_COUNT;

/** A swatch's place in TRIM_ORDER, which ColorMenu's container-query ladder
 *  trims by — the same rank ColorPalette tags its swatches with. */
export function landscapeTrimRank(hex: string): number {
  return TRIM_ORDER.indexOf(hex);
}
