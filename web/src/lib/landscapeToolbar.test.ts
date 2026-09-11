import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COLOR_MENU_GAP_PX,
  COLOR_MENU_PADDING_PX,
  COLOR_MENU_SWATCH_PX,
  LANDSCAPE_COLORS,
  landscapeMenuColors,
  needsInkOutline,
} from './landscapeToolbar';
import { PHONE_LANDSCAPE_QUERY, isPhoneLandscape } from './breakpoints';
import {
  PHONE_TOOLBAR_BUTTON_PX,
  PHONE_TOOLBAR_LEG_SLOTS,
  PHONE_TOOLBAR_VERTICAL_CHROME_PX,
  PHONE_TOOLBAR_HORIZONTAL_CHROME_PX,
} from './actionButtonLayout';

describe('phone landscape toolbar', () => {
  it('reserves the picker and trims bonus hues before the core rainbow', () => {
    expect(landscapeMenuColors(556).map(({ label }) => label)).toEqual([
      'Purple',
      'Blue',
      'Green',
      'Yellow',
      'Orange',
      'Red',
      'Black',
    ]);
  });

  it.each([1, 2, 5, 8, 12])('adds a complete swatch at the %s-slot boundary', (slots) => {
    const width =
      slots * COLOR_MENU_SWATCH_PX + (slots - 1) * COLOR_MENU_GAP_PX + 2 * COLOR_MENU_PADDING_PX;
    expect(landscapeMenuColors(width)).toHaveLength(slots - 1);
    expect(landscapeMenuColors(width - 0.01)).toHaveLength(Math.max(0, slots - 2));
  });

  it('caps the menu at its palette and handles an unmeasured width', () => {
    expect(landscapeMenuColors(2000)).toEqual(LANDSCAPE_COLORS);
    expect(landscapeMenuColors(0)).toEqual([]);
  });

  it('keeps eleven hues in palette order', () => {
    expect(LANDSCAPE_COLORS.map(({ label }) => label)).toEqual([
      'Purple',
      'Blue',
      'Teal',
      'Mint',
      'Green',
      'Yellow',
      'Orange',
      'Brown',
      'Red',
      'Pink',
      'Black',
    ]);
  });

  it.each([
    ['#000000', true],
    ['#fff', false],
    ['#696969', false],
    ['#686868', true],
    ['#7b4f2b', true],
    ['#AB71E1', false],
  ] as const)('measures the relative luminance of %s', (hex, outlined) => {
    expect(needsInkOutline(hex)).toBe(outlined);
  });

  it.each([
    [906, 412, true],
    [906, 328, true],
    [1000, 599.99, true],
    [1000, 600, false],
    [412, 906, false],
    [400, 400, false],
  ] as const)('classifies %s by %s', (width, height, compact) => {
    expect(isPhoneLandscape(width, height)).toBe(compact);
  });

  it('keeps the first-paint CSS breakpoint and size budget aligned', () => {
    const css = readFileSync('src/app.css', 'utf8');
    for (const file of ['src/app.css', 'src/lib/components/ColorPalette.svelte']) {
      expect(readFileSync(file, 'utf8')).toContain(`@media ${PHONE_LANDSCAPE_QUERY}`);
    }
    expect(css).toContain(`calc(${PHONE_TOOLBAR_BUTTON_PX}px * var(--action-btn-scale, 1))`);
    expect(css).toContain(`- ${PHONE_TOOLBAR_VERTICAL_CHROME_PX}px) / ${PHONE_TOOLBAR_LEG_SLOTS}`);
    expect(css).toContain(
      `- ${PHONE_TOOLBAR_HORIZONTAL_CHROME_PX}px) / ${PHONE_TOOLBAR_LEG_SLOTS}`
    );
  });
});
