import { relativeLuminance } from '../colorRing';

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
export const WHITE_INK = '#ffffff';

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

// The color a palette swatch actually shows and paints for the current theme:
// the Black swatch flips to white on dark paper; every other swatch is itself.
export function themedSwatchColor(hex: string, dark: boolean): string {
  return dark && hex === BLACK_INK ? WHITE_INK : hex;
}

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
  BLACK_INK, // Black
];

export const CUSTOM_SWATCH = 'custom';

export const colors = $state({
  activeSwatch: PALETTE_COLORS[0].hex,
  activeColor: PALETTE_COLORS[0].hex,
  customColor: '#AB71E1',
  customColorSelected: false,
});

// `hex` is the swatch's stable identity (what activeSwatch/trim/keys compare
// against); `paintColor` is what actually gets drawn, which differs only for the
// Black swatch in dark mode (it paints white). Defaults to painting the identity.
export function selectPaletteColor(hex: string, paintColor: string = hex) {
  colors.activeSwatch = hex;
  colors.activeColor = paintColor;
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

// The dark-mode mirror of isWhite: near-black ink vanishes against the dark
// action-button cards, so those colors get a light outline there. Applied as a
// class in every theme — the keyline color token (--dark-ink-keyline) is
// transparent in light mode, so only dark mode ever shows it.
export function isDarkInk(hex: string): boolean {
  return relativeLuminance(hex) < 0.15;
}
