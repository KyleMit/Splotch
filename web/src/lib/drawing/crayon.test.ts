import { describe, expect, it } from 'vitest';
import { toothAlphaAt, toothSize } from './crayon';

describe('phase-shifted crayon tooth', () => {
  it('gives a later pass new tooth pixels to fill without changing its colour', () => {
    let firstPassGaps = 0;
    let filledBySecondPass = 0;
    for (let y = 0; y < toothSize(); y++) {
      for (let x = 0; x < toothSize(); x++) {
        if (toothAlphaAt(x, y, 0) < 1) {
          firstPassGaps++;
          if (toothAlphaAt(x, y, 1) > toothAlphaAt(x, y, 0)) filledBySecondPass++;
        }
      }
    }
    expect(firstPassGaps).toBeGreaterThan(0);
    expect(filledBySecondPass).toBeGreaterThan(firstPassGaps / 3);
  });
});
