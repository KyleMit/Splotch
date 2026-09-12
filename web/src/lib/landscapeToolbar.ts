import { PALETTE_COLORS, TRIM_ORDER } from './palette';

const OMITTED_COLOR_COUNT = 4;
export const LANDSCAPE_COLORS = PALETTE_COLORS.filter(
  ({ hex }) => TRIM_ORDER.indexOf(hex) >= OMITTED_COLOR_COUNT
);

export const COLOR_MENU_SWATCH_PX = 56;
export const COLOR_MENU_GAP_PX = 6;
export const COLOR_MENU_PADDING_PX = 6;
const CUSTOM_COLOR_SLOTS = 1;

export function landscapeMenuColors(availableWidthPx: number) {
  const slots = Math.floor(
    (availableWidthPx - 2 * COLOR_MENU_PADDING_PX + COLOR_MENU_GAP_PX) /
      (COLOR_MENU_SWATCH_PX + COLOR_MENU_GAP_PX)
  );
  const colorCount = Math.max(0, slots - CUSTOM_COLOR_SLOTS);
  const trimmedCount = TRIM_ORDER.length - colorCount;
  return LANDSCAPE_COLORS.filter(({ hex }) => TRIM_ORDER.indexOf(hex) >= trimmedCount);
}
