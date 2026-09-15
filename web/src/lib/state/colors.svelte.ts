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

export const colorsState = $state({
  activeSwatch: PALETTE_COLORS[0].hex,
  activeColor: PALETTE_COLORS[0].hex,
  customColor: PALETTE_COLORS[0].hex,
  customColorSelected: false,
});

export function syncInkToTheme(dark: boolean) {
  if (colorsState.activeSwatch !== BLACK_INK) return;
  colorsState.activeColor = themedSwatchColor(BLACK_INK, dark);
}

// `hex` is the swatch's stable identity (what activeSwatch/trim/keys compare
// against); `paintColor` is what actually gets drawn, which differs only for the
// Black swatch in dark mode (it paints white). Defaults to painting the identity.
export function selectPaletteColor(hex: string, paintColor: string = hex) {
  colorsState.activeSwatch = hex;
  colorsState.activeColor = paintColor;
}

export function selectCustomSwatch() {
  colorsState.activeSwatch = CUSTOM_SWATCH;
  if (colorsState.customColorSelected) {
    colorsState.activeColor = colorsState.customColor;
  }
}

export function pickCustomColor(hex: string) {
  colorsState.customColor = hex;
  colorsState.customColorSelected = true;
  colorsState.activeSwatch = CUSTOM_SWATCH;
  colorsState.activeColor = hex;
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
// (ADR-0052). WCAG relative luminance rather than perceived brightness,
// because the question the keyline asks is contrast against that card — the
// `floatSurface` token in design/tokens.ts owns the surface, and
// colors.svelte.test.ts measures the claim against it rather than restating a
// ratio here that the token could drift away from.
// Deliberately a different mechanism from isWhite's string compare, not an
// oversight.
const DARK_INK_RELATIVE_LUMINANCE_MAX = 0.14;

export function isDarkInk(hex: string): boolean {
  const luminance = colorLuminance(hex);
  return luminance !== null && luminance < DARK_INK_RELATIVE_LUMINANCE_MAX;
}
