export const PALETTE_COLORS = [
  { hex: '#AB71E1', label: 'Purple' },
  { hex: '#62A2E9', label: 'Blue' },
  { hex: '#8CC864', label: 'Green' },
  { hex: '#F9D24F', label: 'Yellow' },
  { hex: '#F89C45', label: 'Orange' },
  { hex: '#EC534E', label: 'Red' },
  { hex: '#0a0b10', label: 'Black' }
];

// Order in which swatches drop off as the palette runs out of room (first
// listed → first to be hidden). This is independent of the display order
// above: colors still render in PALETTE_COLORS order; only which ones hide
// changes. Red goes first, then orange, green, yellow; blue and purple (the
// default selection) hang on longer, and black is kept the longest.
export const TRIM_ORDER = [
  '#EC534E', // Red
  '#F89C45', // Orange
  '#8CC864', // Green
  '#F9D24F', // Yellow
  '#62A2E9', // Blue
  '#AB71E1', // Purple
  '#0a0b10'  // Black
];

export const CUSTOM_SWATCH = 'custom';

export const colors = $state({
  activeSwatch: PALETTE_COLORS[0].hex,
  activeColor: PALETTE_COLORS[0].hex,
  customColor: '#AB71E1',
  customColorSelected: false,
  lastColorChangeAt: 0
});

export function selectPaletteColor(hex) {
  colors.activeSwatch = hex;
  colors.activeColor = hex;
  colors.lastColorChangeAt = Date.now();
}

export function selectCustomSwatch() {
  colors.activeSwatch = CUSTOM_SWATCH;
  if (colors.customColorSelected) {
    colors.activeColor = colors.customColor;
    colors.lastColorChangeAt = Date.now();
  }
}

export function pickCustomColor(hex) {
  colors.customColor = hex;
  colors.customColorSelected = true;
  colors.activeSwatch = CUSTOM_SWATCH;
  colors.activeColor = hex;
  colors.lastColorChangeAt = Date.now();
}
