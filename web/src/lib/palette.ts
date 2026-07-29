// Display order, top-to-bottom (landscape) / left-to-right (portrait). The three
// `bonus` colors are extras that only appear on a tall landscape (see the trim
// rules in ColorPalette.svelte); when hidden, the remaining seven collapse back
// to the core rainbow. Purple must stay at index 0 — it's the default selection.
export interface PaletteColor {
  hex: string;
  label: string;
  /** Extra swatch shown only when there's the most room (see ColorPalette). */
  bonus?: boolean;
}

// The near-black ink. On dark paper it vanishes, so in dark mode the palette
// presents (and paints) this swatch as white instead — same position, same trim
// priority, only the pixels change (see themedSwatchColor / ColorPalette).
export const BLACK_INK = '#0a0b10';

// `as const` narrows each label to a literal so PaletteLabel can be derived from
// the list itself; the exported view widens `hex` back to string, because
// consumers compare it against non-palette values ('custom' in ColorPalette).
const PALETTE_SOURCE = [
  { hex: '#AB71E1', label: 'Purple' },
  { hex: '#62A2E9', label: 'Blue' },
  { hex: '#4FC4C0', label: 'Teal', bonus: true },
  { hex: '#8CC864', label: 'Green' },
  { hex: '#F9D24F', label: 'Yellow' },
  { hex: '#F89C45', label: 'Orange' },
  { hex: '#B5835A', label: 'Brown', bonus: true },
  { hex: '#EC534E', label: 'Red' },
  { hex: '#F47CB0', label: 'Pink', bonus: true },
  { hex: BLACK_INK, label: 'Black' },
] as const satisfies readonly PaletteColor[];

export const PALETTE_COLORS: readonly PaletteColor[] = PALETTE_SOURCE;

/** Every swatch label in PALETTE_COLORS — a closed vocabulary, not a string. */
export type PaletteLabel = (typeof PALETTE_SOURCE)[number]['label'];

/**
 * Look up a swatch by its display label, for UI that wants a specific crayon hue
 * (the /android-beta masthead strip and its callout accents). Renaming a swatch
 * is a compile error at every call site rather than a blank render; the throw is
 * belt-and-braces for callers that reach this from untyped code.
 * palette-source.test.mjs keeps this file the only place those hexes are written.
 */
export function paletteHex(label: PaletteLabel): string {
  const color = PALETTE_COLORS.find((entry) => entry.label === label);
  if (!color) throw new Error(`No palette color labelled "${label}"`);
  return color.hex;
}
