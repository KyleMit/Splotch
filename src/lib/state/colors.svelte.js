export const PALETTE_COLORS = [
  { hex: '#AB71E1', label: 'Purple' },
  { hex: '#62A2E9', label: 'Blue' },
  { hex: '#8CC864', label: 'Green' },
  { hex: '#F9D24F', label: 'Yellow' },
  { hex: '#F89C45', label: 'Orange' },
  { hex: '#EC534E', label: 'Red' },
  { hex: '#0a0b10', label: 'Black' }
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
