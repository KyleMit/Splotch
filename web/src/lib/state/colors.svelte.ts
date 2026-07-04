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
  { hex: '#0a0b10', label: 'Black' },
];

// Priority order (first listed → first to be hidden / last to appear). This is
// independent of the display order above. The three bonus colors lead the list,
// so they are the first to go and only show when there's the most room. Among
// the core seven, red goes first, then orange, green, yellow; blue and purple
// (the default selection) hang on longer, and black is kept the longest.
export const TRIM_ORDER: string[] = [
  '#B5835A', // Brown  (bonus)
  '#4FC4C0', // Teal   (bonus)
  '#F47CB0', // Pink   (bonus)
  '#EC534E', // Red
  '#F89C45', // Orange
  '#8CC864', // Green
  '#F9D24F', // Yellow
  '#62A2E9', // Blue
  '#AB71E1', // Purple
  '#0a0b10', // Black
];

export const CUSTOM_SWATCH = 'custom';

export const colors = $state({
  activeSwatch: PALETTE_COLORS[0].hex,
  activeColor: PALETTE_COLORS[0].hex,
  customColor: '#AB71E1',
  customColorSelected: false,
});

export function selectPaletteColor(hex: string) {
  colors.activeSwatch = hex;
  colors.activeColor = hex;
}

export function selectCustomSwatch() {
  colors.activeSwatch = CUSTOM_SWATCH;
  if (colors.customColorSelected) {
    colors.activeColor = colors.customColor;
  }
}

export function pickCustomColor(hex: string) {
  colors.customColor = hex;
  colors.customColorSelected = true;
  colors.activeSwatch = CUSTOM_SWATCH;
  colors.activeColor = hex;
}

// White is the one selectable color that vanishes against the white icon
// buttons and paper (it's only reachable via the picker's greys ramp — the
// palette has none), so the stroke-width icons get a dark outline just for it.
export function isWhite(hex: string): boolean {
  const v = hex.trim().toLowerCase();
  return v === '#ffffff' || v === '#fff' || v === 'white';
}
