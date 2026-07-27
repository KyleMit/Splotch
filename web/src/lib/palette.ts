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
