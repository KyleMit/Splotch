import { describe, expect, it } from 'vitest';
import { paletteHex } from '../palette';
import { colorContrast } from './colorContrast';
import { brand, themes } from './tokens';

const AA_MIN_CONTRAST = 4.5;
const NON_TEXT_MIN_CONTRAST = 3;
const THEME_NAMES = ['light', 'dark'] as const;
const LIGHT_TAPE_HUES = ['Green', 'Blue', 'Orange', 'Pink'] as const;
const DARK_TAPE_HUES = [...LIGHT_TAPE_HUES, 'Purple'] as const;

function translucentHex(hex: string, strength: string): string {
  expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
  expect(strength).toMatch(/^\d+%$/);
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  return `rgb(${channels.join(' ')} / ${strength})`;
}

describe.each(THEME_NAMES)('%s crayon contrast', (theme) => {
  const tokens = themes[theme];

  it.each(theme === 'light' ? LIGHT_TAPE_HUES : DARK_TAPE_HUES)(
    '%s tape holds body text at AA',
    (hue) => {
      expect(
        colorContrast(
          tokens.tapeInk,
          translucentHex(paletteHex(hue), tokens.tapeStrength),
          tokens.surface
        )
      ).toBeGreaterThanOrEqual(AA_MIN_CONTRAST);
    }
  );

  it('highlighter holds heading text at AA', () => {
    expect(
      colorContrast(tokens.textStrong, tokens.highlighter, tokens.surface)
    ).toBeGreaterThanOrEqual(AA_MIN_CONTRAST);
  });

  it('arrival wash holds body text at AA', () => {
    expect(
      colorContrast(tokens.textStrong, tokens.arrivalWash, tokens.surface)
    ).toBeGreaterThanOrEqual(AA_MIN_CONTRAST);
  });

  it('wavy underline holds the non-text minimum on the sheet', () => {
    expect(tokens.linkCrayon).toBe(theme === 'light' ? brand.brand : tokens.brandText);
    const underline = tokens.linkCrayon;
    expect(colorContrast(underline, tokens.surface, tokens.surface)).toBeGreaterThanOrEqual(
      NON_TEXT_MIN_CONTRAST
    );
  });
});
