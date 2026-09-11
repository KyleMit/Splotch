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

const DARK_INK_RELATIVE_LUMINANCE_MAX = 0.14;
const SRGB_LINEAR_THRESHOLD = 0.04045;
const SRGB_LINEAR_DIVISOR = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_SCALE = 1.055;
const SRGB_EXPONENT = 2.4;

export function needsInkOutline(hex: string): boolean {
  const value = hex.replace('#', '');
  const expanded = value.length === 3 ? [...value].map((digit) => digit + digit).join('') : value;
  const [r, g, b] = [0, 2, 4].map((offset) => {
    const channel = parseInt(expanded.slice(offset, offset + 2), 16) / 255;
    return channel <= SRGB_LINEAR_THRESHOLD
      ? channel / SRGB_LINEAR_DIVISOR
      : ((channel + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_EXPONENT;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < DARK_INK_RELATIVE_LUMINANCE_MAX;
}
