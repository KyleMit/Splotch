import { describe, expect, it } from 'vitest';
import { trailingRowCutHeight, type RowCutMeasurements } from './scrollCue';

// A two-column phone picker: eight tiles over four 150px rows, an 8px gap, and
// a header block above the grid.
const PHONE: RowCutMeasurements = {
  gridTop: 88,
  rowHeight: 150,
  rowGap: 8,
  rowCount: 4,
  viewportHeight: 690,
  contentHeight: 744,
};

describe('trailingRowCutHeight', () => {
  it('cuts the trailing row in half', () => {
    // 88 header + three whole rows and their gaps (474) + half of the fourth.
    expect(trailingRowCutHeight(PHONE)).toBe(88 + 3 * 158 + 75);
  });

  it('leaves the height alone when nothing sits below the fold', () => {
    expect(trailingRowCutHeight({ ...PHONE, contentHeight: PHONE.viewportHeight })).toBeNull();
  });

  it('shortens rather than lengthens when the fold already cuts deep into a row', () => {
    const height = trailingRowCutHeight({ ...PHONE, viewportHeight: 700 });
    expect(height).not.toBeNull();
    expect(height!).toBeLessThan(700);
  });

  it('gives no row away on a viewport too short to seat one whole row plus the peek', () => {
    // A landscape phone: the modal is height-starved, and cutting here would
    // leave less than a row of list to choose from.
    expect(
      trailingRowCutHeight({
        ...PHONE,
        rowHeight: 223,
        rowGap: 12,
        rowCount: 3,
        viewportHeight: 318,
        contentHeight: 800,
      })
    ).toBeNull();
  });

  it('declines a cut that would cost a roomy viewport a whole row of choices', () => {
    // A desktop window: the page grid's rows are tall enough that budgeting one
    // away drops the picker from two-and-a-bit rows to one-and-a-half.
    expect(
      trailingRowCutHeight({
        gridTop: 128,
        rowHeight: 281,
        rowGap: 12,
        rowCount: 3,
        viewportHeight: 765,
        contentHeight: 996,
      })
    ).toBeNull();
  });

  it('leaves the height alone when only padding overflows', () => {
    // Every row already fits; the overflow is the content's own bottom padding,
    // so a cut would expose blank space rather than a tile.
    expect(
      trailingRowCutHeight({ ...PHONE, rowCount: 3, contentHeight: PHONE.viewportHeight + 4 })
    ).toBeNull();
  });

  it('ignores an unmeasurable grid', () => {
    expect(trailingRowCutHeight({ ...PHONE, rowHeight: 0 })).toBeNull();
    expect(trailingRowCutHeight({ ...PHONE, viewportHeight: 0 })).toBeNull();
  });
});
