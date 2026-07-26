import { describe, it, expect } from 'vitest';
import {
  hexGridColumnMaxWidthPx,
  hexGridRowMaxHeightPx,
  justBelowPx,
  landscapeBonusRevealMinHeightPx,
  landscapeSingleColumnMinHeightPx,
  landscapeTwoColumnMaxHeightPx,
  portraitMaxWidthPx,
} from './trimGeometry';

// Every expectation below is the literal committed in the matching `@media`
// rule, so these tests are the seam between the formulas and the CSS: change
// the geometry without re-deriving the ladder and they go red.

describe('ColorPalette trim ladders', () => {
  it('sizes the landscape single column', () => {
    expect(landscapeSingleColumnMinHeightPx(8)).toBe(588);
    expect(landscapeSingleColumnMinHeightPx(7)).toBe(516);
    expect(landscapeSingleColumnMinHeightPx(6)).toBe(444);
  });

  it('bounds the single-column trims just below the next slot up', () => {
    expect(justBelowPx(landscapeSingleColumnMinHeightPx(8))).toBe(587.98);
    expect(justBelowPx(landscapeSingleColumnMinHeightPx(7))).toBe(515.98);
  });

  it('opens the three bonus slots above the core eight', () => {
    expect(landscapeBonusRevealMinHeightPx(9)).toBe(660);
    expect(landscapeBonusRevealMinHeightPx(10)).toBe(732);
    expect(landscapeBonusRevealMinHeightPx(11)).toBe(804);
  });

  it('drops a landscape two-column row at a time', () => {
    expect(landscapeTwoColumnMaxHeightPx(4)).toBe(299.98);
    expect(landscapeTwoColumnMaxHeightPx(3)).toBe(227.98);
    expect(landscapeTwoColumnMaxHeightPx(2)).toBe(155.98);
    expect(landscapeTwoColumnMaxHeightPx(1)).toBe(83.98);
  });

  it('drops a portrait core swatch at a time', () => {
    expect(portraitMaxWidthPx(7)).toBe(515.98);
    expect(portraitMaxWidthPx(6)).toBe(452.98);
    expect(portraitMaxWidthPx(5)).toBe(389.98);
    expect(portraitMaxWidthPx(4)).toBe(326.98);
    expect(portraitMaxWidthPx(3)).toBe(263.98);
    expect(portraitMaxWidthPx(2)).toBe(200.98);
    expect(portraitMaxWidthPx(1)).toBe(137.98);
  });
});

describe('ColorPicker trim ladders', () => {
  // The second argument is the buffer the encoded step leaves over the
  // geometric minimum — the "few px of buffer" the component's comment names.
  it('drops a honeycomb row at a time', () => {
    expect(hexGridRowMaxHeightPx(9, -1)).toBe(564.98);
    expect(hexGridRowMaxHeightPx(8, 0)).toBe(508.98);
    expect(hexGridRowMaxHeightPx(7, 0)).toBe(452.98);
    expect(hexGridRowMaxHeightPx(6, 0)).toBe(395.98);
    expect(hexGridRowMaxHeightPx(5, 0)).toBe(338.98);
    expect(hexGridRowMaxHeightPx(4, 0)).toBe(282.98);
  });

  it('drops a honeycomb column at a time', () => {
    expect(hexGridColumnMaxWidthPx(9, 5)).toBe(674.98);
    expect(hexGridColumnMaxWidthPx(8, 6)).toBe(609.98);
    expect(hexGridColumnMaxWidthPx(7, 8)).toBe(544.98);
    expect(hexGridColumnMaxWidthPx(6, 5)).toBe(474.98);
    expect(hexGridColumnMaxWidthPx(5, 6)).toBe(409.98);
    expect(hexGridColumnMaxWidthPx(4, 3)).toBe(339.98);
    expect(hexGridColumnMaxWidthPx(3, 5)).toBe(274.98);
  });
});
