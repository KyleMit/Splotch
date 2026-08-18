// WCAG relative luminance and contrast over the color forms the design tokens
// use. Shared because two guards need the same arithmetic on the same tokens:
// the /design chips pick their label ink with it (chipInk.ts), and the
// scrollbar thumb is held to the non-text minimum with it
// (scrollbarThumbContrast.test.ts). One implementation, so a fix to the
// compositing or the curve reaches both.

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
export function parseColor(color: string): ParsedColor | null {
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

export function contrastFromLuminance(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The luminance a color renders at — a translucent one measured as composited
 * over the ground it actually sits on. Null when the color is a form
 * `parseColor` does not read.
 */
export function effectiveLuminance(color: string, ground: string): number | null {
  const parsed = parseColor(color);
  if (!parsed) return null;
  const groundRgb = parseColor(ground);
  if (!groundRgb) return null;
  return relativeLuminance(compositeOver(parsed, groundRgb));
}

/**
 * The contrast between two colors as rendered on `ground` (which is also the
 * ground a translucent one composites over). Returns 0 when either is
 * unparseable, so a caller comparing against a floor fails rather than passes.
 */
export function colorContrast(a: string, b: string, ground: string): number {
  const luminanceA = effectiveLuminance(a, ground);
  const luminanceB = effectiveLuminance(b, ground);
  if (luminanceA === null || luminanceB === null) return 0;
  return contrastFromLuminance(luminanceA, luminanceB);
}
