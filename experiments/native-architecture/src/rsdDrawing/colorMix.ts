const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function channels(hex: string): readonly number[] {
  if (!HEX_COLOR.test(hex)) throw new Error(`Not a hex color: ${hex}`);
  const digits = hex.length === 4 ? [...hex.slice(1)].map((digit) => digit + digit) : null;
  const full = digits ? digits.join('') : hex.slice(1);
  return [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16));
}

export function hexByte(value: number) {
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
