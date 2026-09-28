import { colorLuminance } from '$lib/design/colorContrast';
import { BLACK_INK, PALETTE_COLORS, TRIM_ORDER } from '../palette';

export { BLACK_INK, PALETTE_COLORS, TRIM_ORDER };

export const WHITE_INK = '#ffffff';

export const DEFAULT_STROKE_COLOR = PALETTE_COLORS[0].hex;

export const CUSTOM_SWATCH = 'custom';

export interface ColorsState {
  // The swatch's stable identity (what trim/keys compare against): a palette hex
  // or CUSTOM_SWATCH.
  readonly activeSwatch: string;
  // What actually gets drawn; differs from the swatch only for the Black swatch
  // in dark mode (it paints white).
  readonly activeColor: string;
  readonly customColor: string;
  readonly customColorSelected: boolean;
  // The color a palette swatch shows and paints under the followed theme.
  themedSwatchColor(hex: string): string;
  // Until a theme is followed, every swatch paints its light-theme ink.
  followTheme(isDark: () => boolean): void;
  selectPaletteColor(hex: string): void;
  selectCustomSwatch(): void;
  pickCustomColor(hex: string): void;
}

export function createColors(): ColorsState {
  const s = $state({
    activeSwatch: DEFAULT_STROKE_COLOR,
    customColor: DEFAULT_STROKE_COLOR,
    customColorSelected: false,
    // The custom swatch chosen before any color is picked keeps drawing with the
    // ink in use at that moment.
    inheritedInk: DEFAULT_STROKE_COLOR,
  });
  let isDark = () => false;

  // The Black swatch flips to white on dark paper; every other swatch is itself.
  // Only Black reads the theme, so no other swatch's ink depends on it.
  const themedSwatchColor = (hex: string) => (hex === BLACK_INK && isDark() ? WHITE_INK : hex);

  function activeColor() {
    if (s.activeSwatch !== CUSTOM_SWATCH) return themedSwatchColor(s.activeSwatch);
    return s.customColorSelected ? s.customColor : s.inheritedInk;
  }

  return {
    get activeSwatch() {
      return s.activeSwatch;
    },
    get activeColor() {
      return activeColor();
    },
    get customColor() {
      return s.customColor;
    },
    get customColorSelected() {
      return s.customColorSelected;
    },
    themedSwatchColor,
    followTheme(dark) {
      isDark = dark;
    },
    selectPaletteColor(hex) {
      s.activeSwatch = hex;
    },
    selectCustomSwatch() {
      if (!s.customColorSelected) s.inheritedInk = activeColor();
      s.activeSwatch = CUSTOM_SWATCH;
    },
    pickCustomColor(hex) {
      s.customColor = hex;
      s.customColorSelected = true;
      s.activeSwatch = CUSTOM_SWATCH;
    },
  };
}

export const colorsState = createColors();

export const { selectPaletteColor, selectCustomSwatch, pickCustomColor } = colorsState;

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
