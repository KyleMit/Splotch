import { describe, it, expect, beforeEach } from 'vitest';
import {
  PALETTE_COLORS,
  TRIM_ORDER,
  CUSTOM_SWATCH,
  BLACK_INK,
  WHITE_INK,
  colors,
  selectPaletteColor,
  selectCustomSwatch,
  pickCustomColor,
  syncInkToTheme,
  themedSwatchColor,
  isWhite,
  isDarkInk,
} from './colors.svelte';
import { PICKER_DIM_BORDER } from '$lib/hexPickerLayout';
import { colorContrast } from '$lib/design/colorContrast';
import { themes } from '$lib/design/tokens';

// Ink the old BT.601 predicate reported as light enough to skip the keyline.
const PERCEIVED_BRIGHTNESS_MISSES = [
  '#C1121F',
  '#023E8A',
  '#5A189A',
  '#3E2723',
  '#263238',
  '#455A64',
  '#795548',
  '#8E44AD',
];

// WCAG's floor for non-text contrast. Every color above sits under it, which is
// what makes the keyline load-bearing rather than decorative.
const UNREADABLE_CONTRAST_CEILING = 3;

beforeEach(() => {
  // Reset to the documented default selection (Purple at index 0).
  colors.activeSwatch = PALETTE_COLORS[0].hex;
  colors.activeColor = PALETTE_COLORS[0].hex;
  colors.customColor = '#AB71E1';
  colors.customColorSelected = false;
});

describe('palette invariants', () => {
  it('keeps Purple as the index-0 default selection', () => {
    expect(PALETTE_COLORS[0].label).toBe('Purple');
  });

  it('TRIM_ORDER lists exactly the palette hexes (no missing/extra colors)', () => {
    expect([...TRIM_ORDER].sort()).toEqual(PALETTE_COLORS.map((c) => c.hex).sort());
  });
});

describe('selectPaletteColor', () => {
  it('sets the active swatch and color', () => {
    selectPaletteColor('#62A2E9');
    expect(colors.activeSwatch).toBe('#62A2E9');
    expect(colors.activeColor).toBe('#62A2E9');
  });

  it('paints a distinct color while keeping the swatch identity (dark-mode Black)', () => {
    selectPaletteColor(BLACK_INK, WHITE_INK);
    // The last swatch stays the active one (its ring/position are unchanged)...
    expect(colors.activeSwatch).toBe(BLACK_INK);
    // ...but it draws white so it shows on dark paper.
    expect(colors.activeColor).toBe(WHITE_INK);
  });
});

describe('themedSwatchColor', () => {
  it('flips only the Black swatch to white in dark mode', () => {
    expect(themedSwatchColor(BLACK_INK, true)).toBe(WHITE_INK);
    expect(themedSwatchColor(BLACK_INK, false)).toBe(BLACK_INK);
  });

  it('leaves every other palette color untouched in both themes', () => {
    for (const { hex } of PALETTE_COLORS) {
      if (hex === BLACK_INK) continue;
      expect(themedSwatchColor(hex, true)).toBe(hex);
      expect(themedSwatchColor(hex, false)).toBe(hex);
    }
  });
});

describe('syncInkToTheme', () => {
  it('switches selected Black ink to white for dark and back to black for light', () => {
    selectPaletteColor(BLACK_INK);

    syncInkToTheme(true);
    expect(colors.activeSwatch).toBe(BLACK_INK);
    expect(colors.activeColor).toBe(WHITE_INK);

    syncInkToTheme(false);
    expect(colors.activeSwatch).toBe(BLACK_INK);
    expect(colors.activeColor).toBe(BLACK_INK);
  });

  it('leaves a non-Black selection unchanged', () => {
    pickCustomColor('#123456');
    const before = { ...colors };

    syncInkToTheme(true);

    expect({ ...colors }).toEqual(before);
  });
});

describe('pickCustomColor', () => {
  it('records the custom color, selects the custom swatch, and marks it chosen', () => {
    pickCustomColor('#123456');
    expect(colors.customColor).toBe('#123456');
    expect(colors.customColorSelected).toBe(true);
    expect(colors.activeSwatch).toBe(CUSTOM_SWATCH);
    expect(colors.activeColor).toBe('#123456');
  });
});

describe('selectCustomSwatch', () => {
  it('adopts the custom color once one has been picked', () => {
    pickCustomColor('#abcdef');
    selectPaletteColor('#8CC864'); // move selection away
    selectCustomSwatch(); // back to custom
    expect(colors.activeSwatch).toBe(CUSTOM_SWATCH);
    expect(colors.activeColor).toBe('#abcdef');
  });

  it('selects the custom swatch but does NOT change color when none picked yet', () => {
    selectPaletteColor('#8CC864');
    selectCustomSwatch();
    expect(colors.activeSwatch).toBe(CUSTOM_SWATCH);
    // No custom color chosen, so the active drawing color stays put.
    expect(colors.activeColor).toBe('#8CC864');
  });
});

describe('isWhite', () => {
  it('matches white in any casing or shorthand it could arrive as', () => {
    expect(isWhite('#ffffff')).toBe(true);
    expect(isWhite('#FFFFFF')).toBe(true);
    expect(isWhite('#fff')).toBe(true);
    expect(isWhite('white')).toBe(true);
  });

  it('leaves every palette color — including pale yellow — un-outlined', () => {
    for (const { hex } of PALETTE_COLORS) {
      expect(isWhite(hex)).toBe(false);
    }
    expect(isWhite('#F9D24F')).toBe(false); // Yellow: light, but not white
    expect(isWhite('#90A4AE')).toBe(false); // Lightest non-white grey in the picker
  });

  it('returns false for malformed input', () => {
    expect(isWhite('')).toBe(false);
    expect(isWhite('#fffffe')).toBe(false);
  });
});

describe('isDarkInk', () => {
  it('claims the near-black ink that drives the keyline', () => {
    expect(isDarkInk(BLACK_INK)).toBe(true);
  });

  it('leaves every other palette color and the white ink alone', () => {
    for (const { hex } of PALETTE_COLORS) {
      if (hex === BLACK_INK) continue;
      expect(isDarkInk(hex), hex).toBe(false);
    }
    expect(isDarkInk(WHITE_INK)).toBe(false);
  });

  it("claims the picker's darkest swatch, which carries the dim border for the same reason", () => {
    expect(isDarkInk(PICKER_DIM_BORDER)).toBe(true);
  });

  // Moved here from landscapeToolbar.test.ts with needsInkOutline, which this
  // predicate replaced; the landscape toolbar now asks the same question of the
  // same function as the action buttons beside it.
  it.each([
    ['#000000', true],
    ['#fff', false],
    ['#696969', false],
    ['#686868', true],
    ['#7b4f2b', true],
    ['#AB71E1', false],
  ] as const)('measures the relative luminance of %s', (hex, dark) => {
    expect(isDarkInk(hex)).toBe(dark);
  });

  // The colors the two former predicates disagreed about. The companion test
  // below measures why against the owning token instead of quoting a ratio.
  it.each(PERCEIVED_BRIGHTNESS_MISSES)(
    'claims %s, which perceived brightness used to miss',
    (hex) => {
      expect(isDarkInk(hex)).toBe(true);
    }
  );

  it('reports unparseable ink as not dark rather than throwing', () => {
    expect(isDarkInk('')).toBe(false);
    expect(isDarkInk('rebeccapurple')).toBe(false);
  });

  // Derives the argument instead of restating it: each color the old predicate
  // passed is measured against the token that actually owns the card. If
  // floatSurface ever lightens enough for these to carry themselves, this fails
  // rather than a comment going quietly stale.
  it('keeps the keyline on ink that cannot carry itself against the float surface', () => {
    const card = themes.dark.floatSurface;
    for (const hex of PERCEIVED_BRIGHTNESS_MISSES) {
      expect(isDarkInk(hex), hex).toBe(true);
      expect(colorContrast(hex, card, card), hex).toBeLessThan(UNREADABLE_CONTRAST_CEILING);
    }
  });
});
