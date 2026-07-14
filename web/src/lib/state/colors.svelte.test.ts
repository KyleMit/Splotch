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
  themedSwatchColor,
  isWhite,
} from './colors.svelte';

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
