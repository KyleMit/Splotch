function hexToRgb(color: string): { r: number; g: number; b: number } {
  let hex = color.replace('#', '');
  if (hex.length === 3)
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

// Perceived brightness of a hex color on a 0–1 scale (ITU-R BT.601 weights).
// Accepts `#rgb`, `#rrggbb`, or the same without the leading `#`.
export function relativeLuminance(color: string): number {
  const { r, g, b } = hexToRgb(color);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// Whether dark foreground content (text/icons) reads better than light on top
// of this color. Used to pick a contrasting status-bar icon style.
export function isLightColor(color: string): boolean {
  return relativeLuminance(color) >= 0.5;
}

const DARK_SWATCH_LUMINANCE = 0.2;
const LIGHTEN_STEP = 38;
const DARKEN_FACTOR = 0.9;

// Compute a selection-ring color for a swatch: ~10% darker than the swatch so
// the ring reads as a contrasting outline — but for very dark swatches (e.g.
// black) darkening is invisible, so we lighten instead. Pure function, kept out
// of the .svelte component so it can be unit-tested directly.
export function getRingColor(color: string): string {
  const { r, g, b } = hexToRgb(color);

  const shift =
    relativeLuminance(color) < DARK_SWATCH_LUMINANCE
      ? (v: number) => Math.min(255, Math.round(v + LIGHTEN_STEP))
      : (v: number) => Math.max(0, Math.round(v * DARKEN_FACTOR));

  const toHex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${toHex(shift(r))}${toHex(shift(g))}${toHex(shift(b))}`;
}
