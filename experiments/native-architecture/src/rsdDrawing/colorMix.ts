const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function channels(hex: string): readonly number[] {
  if (!HEX_COLOR.test(hex)) throw new Error(`Not a hex color: ${hex}`);
  const digits = hex.length === 4 ? [...hex.slice(1)].map((digit) => digit + digit) : null;
  const full = digits ? digits.join('') : hex.slice(1);
  return [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16));
}

function hexByte(value: number) {
  return Math.round(value).toString(16).padStart(2, '0');
}

// The comma rgba() form, the only alpha notation React Native's color parser reads.
export function rgba(hex: string, alpha: number): string {
  return `rgba(${channels(hex).join(', ')}, ${alpha})`;
}

// React Native has no color-mix(), so a shipping `color-mix(in srgb, a p%, b)` over two opaque
// colors is computed here: each sRGB channel weighs `a` by p and `b` by the rest.
export function mixSrgb(first: string, percent: number, second: string): string {
  const from = channels(first);
  const to = channels(second);
  const weight = percent / 100;
  return `#${from.map((value, index) => hexByte(value * weight + to[index] * (1 - weight))).join('')}`;
}

// CSS grayscale(1): each sRGB channel becomes the color's luma, by the Filter Effects matrix.
const GRAYSCALE_LUMA = [0.2126, 0.7152, 0.0722] as const;
const MARKUP_HEX_COLOR = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi;

export function grayscale(hex: string): string {
  const luma = channels(hex).reduce((sum, value, index) => sum + value * GRAYSCALE_LUMA[index], 0);
  return `#${hexByte(luma).repeat(3)}`;
}

// Icon markup with grayscale(1) applied to each of its colors, which are all hex.
export function grayscaleMarkup(markup: string): string {
  return markup.replace(MARKUP_HEX_COLOR, (hex) => grayscale(hex));
}
