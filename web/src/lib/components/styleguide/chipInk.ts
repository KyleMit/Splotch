// Ink selection for text printed directly on a color chip's own fill — the
// fill IS the specimen, so the label rides on it and must stay readable on
// whatever the token's value is. WCAG relative luminance + contrast ratio,
// not a raw-sRGB heuristic: picking whichever of black/white contrasts better
// guarantees at least 4.58:1 on any opaque fill (the worst case sits where
// both inks tie), so every chip clears the 4.5:1 AA floor and the axe scan
// covers the chips like everything else. chipInk.test.ts locks the guarantee
// against every current token value in both themes.

export const CHIP_INK_DARK = '#000';
export const CHIP_INK_LIGHT = '#fff';

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface ParsedColor extends Rgb {
  alpha: number;
}

// Hex (#abc / #aabbcc), rgb()/rgba(), and the transparent keyword — the only
// forms the design tokens use. Anything else (gradients) is the caller's job
// to break into stops first.
function parseColor(color: string): ParsedColor | null {
  const value = color.trim();
  if (value === 'transparent') return { r: 0, g: 0, b: 0, alpha: 0 };
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
    return {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16),
      alpha: 1,
    };
  }
  const match = value.match(/^rgba?\(([^)]+)\)$/);
  if (!match) return null;
  const parts = match[1].split(',').map((s) => Number.parseFloat(s));
  if (parts.length < 3 || parts.some(Number.isNaN)) return null;
  return { r: parts[0], g: parts[1], b: parts[2], alpha: parts.length > 3 ? parts[3] : 1 };
}

function compositeOver(fg: ParsedColor, bg: Rgb): Rgb {
  const mix = (f: number, b: number) => f * fg.alpha + b * (1 - fg.alpha);
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b) };
}

function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrast(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

// A translucent fill is measured as rendered: composited over the ground the
// chip actually sits on (the page's --app-bg for the active theme).
function effectiveLuminance(fill: string, ground: string): number | null {
  const parsed = parseColor(fill);
  if (!parsed) return null;
  const groundRgb = parseColor(ground);
  if (!groundRgb) return null;
  return relativeLuminance(compositeOver(parsed, groundRgb));
}

/**
 * The contrast an ink achieves on a fill (translucent fills composited over
 * `ground`). Exported for chipInk.test.ts, which asserts the 4.5:1 floor
 * holds for every token value — the seam exists for that guard.
 */
export function chipInkContrast(ink: string, fill: string, ground: string): number {
  const inkLuminance = effectiveLuminance(ink, ground);
  const fillLuminance = effectiveLuminance(fill, ground);
  if (inkLuminance === null || fillLuminance === null) return 0;
  return contrast(inkLuminance, fillLuminance);
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
