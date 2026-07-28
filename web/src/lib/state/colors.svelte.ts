import { perceivedBrightness } from '../colorRing';
import { BLACK_INK, PALETTE_COLORS } from '../palette';

export { BLACK_INK, PALETTE_COLORS };
export type { PaletteColor } from '../palette';

export const WHITE_INK = '#ffffff';

export const DEFAULT_STROKE_COLOR = PALETTE_COLORS[0].hex;

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
const paletteByLabel = Object.fromEntries(PALETTE_COLORS.map(({ hex, label }) => [label, hex]));
export const TRIM_ORDER: string[] = [
  'Brown',
  'Teal',
  'Pink',
  'Red',
  'Orange',
  'Green',
  'Yellow',
  'Blue',
  'Purple',
  'Black',
].map((label) => paletteByLabel[label]);

export const CUSTOM_SWATCH = 'custom';

export const colors = $state({
  activeSwatch: PALETTE_COLORS[0].hex,
  activeColor: PALETTE_COLORS[0].hex,
  customColor: PALETTE_COLORS[0].hex,
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
// Exact/shorthand match, not a luminance threshold — input can arrive as
// 'white'/'#fff', and unlike isDarkInk this needs exact-identity, not
// near-white, detection.
export function isWhite(hex: string): boolean {
  const v = hex.trim().toLowerCase();
  return v === WHITE_INK || v === '#fff' || v === 'white';
}

// Tuned perceptual cutoff: below this, ink needs the light keyline against dark
// action-button cards (mirrors the --dark-ink-keyline trigger, per ADR-0052).
// Deliberately a different mechanism from isWhite's string compare, not an
// oversight.
const DARK_INK_LUMINANCE_MAX = 0.15;

export function isDarkInk(hex: string): boolean {
  return perceivedBrightness(hex) < DARK_INK_LUMINANCE_MAX;
}
