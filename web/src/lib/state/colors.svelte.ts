import { colorLuminance } from '$lib/design/colorContrast';
import { BLACK_INK, PALETTE_COLORS, TRIM_ORDER } from '../palette';

export { BLACK_INK, PALETTE_COLORS, TRIM_ORDER };

export const WHITE_INK = '#ffffff';

export const DEFAULT_STROKE_COLOR = PALETTE_COLORS[0].hex;

// The color a palette swatch actually shows and paints for the current theme:
// the Black swatch flips to white on dark paper; every other swatch is itself.
export function themedSwatchColor(hex: string, dark: boolean): string {
  return dark && hex === BLACK_INK ? WHITE_INK : hex;
}

export const CUSTOM_SWATCH = 'custom';

export const colors = $state({
  activeSwatch: PALETTE_COLORS[0].hex,
  activeColor: PALETTE_COLORS[0].hex,
  customColor: PALETTE_COLORS[0].hex,
  customColorSelected: false,
});

export function syncInkToTheme(dark: boolean) {
  if (colors.activeSwatch !== BLACK_INK) return;
  colors.activeColor = themedSwatchColor(BLACK_INK, dark);
}

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

// Below this relative luminance, ink is too close to the dark action-button
// cards to read on its own and takes the light --dark-ink-keyline ring
// (ADR-0052). WCAG relative luminance, not perceived brightness: the question
// is contrast against the card, and every color the two measures disagree
// about sits at 1.0-1.8x against it — i.e. genuinely unreadable.
// Deliberately a different mechanism from isWhite's string compare, not an
// oversight.
const DARK_INK_RELATIVE_LUMINANCE_MAX = 0.14;

export function isDarkInk(hex: string): boolean {
  const luminance = colorLuminance(hex);
  return luminance !== null && luminance < DARK_INK_RELATIVE_LUMINANCE_MAX;
}
