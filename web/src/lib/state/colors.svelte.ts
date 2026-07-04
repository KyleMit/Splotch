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

// A near-white color is indistinguishable from the paper background, so the
// stroke-width icons (which paint their brush lines in the active color) need a
// dark outline to stay visible. Threshold sits high enough to catch only the
// white end of the greys ramp, not pale yellows.
export function isNearWhite(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance >= 0.92;
}
