import { PALETTE_COLORS, type PaletteLabel } from './palette';

const OMITTED_COLORS: readonly PaletteLabel[] = ['Grey', 'Lime', 'Indigo', 'Magenta'];
export const LANDSCAPE_COLORS = PALETTE_COLORS.filter(
  ({ label }) => !OMITTED_COLORS.some((omitted) => omitted === label)
);

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
