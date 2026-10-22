import { describe, expect, it } from 'vitest';
import { LANDSCAPE_COLORS, LANDSCAPE_FIRST_TRIM_RANK, landscapeTrimRank } from './landscapeToolbar';
import { TRIM_ORDER } from './palette';
import { isPhoneLandscape } from './breakpoints';

describe('phone landscape toolbar', () => {
  it('ranks every hue it carries by its place in the trim order, from the first it keeps', () => {
    const ranks = LANDSCAPE_COLORS.map(({ hex }) => landscapeTrimRank(hex));
    expect(ranks.slice().sort((a, b) => a - b)).toEqual(
      Array.from(
        { length: TRIM_ORDER.length - LANDSCAPE_FIRST_TRIM_RANK },
        (_, offset) => LANDSCAPE_FIRST_TRIM_RANK + offset
      )
    );
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
    [906, 412, true],
    [906, 328, true],
    [1000, 599.99, true],
    [1000, 600, false],
    [412, 906, false],
    [400, 400, false],
  ] as const)('classifies %s by %s', (width, height, compact) => {
    expect(isPhoneLandscape(width, height)).toBe(compact);
  });
});
