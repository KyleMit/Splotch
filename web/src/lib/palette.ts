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

/**
 * Look up a swatch by its display label, for UI that wants a specific crayon
 * hue (the /android-beta masthead strip and its step numerals). Throws rather
 * than returning undefined so a renamed entry fails loudly at render instead of
 * silently painting nothing — palette-source.test.mjs keeps this file the only
 * place those hexes are written.
 */
export function paletteHex(label: string): string {
  const color = PALETTE_COLORS.find((entry) => entry.label === label);
  if (!color) throw new Error(`No palette color labelled "${label}"`);
  return color.hex;
}

export const PALETTE_COLORS: PaletteColor[] = [
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
];
