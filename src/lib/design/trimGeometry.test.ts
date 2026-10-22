import { describe, expect, it } from 'vitest';
import reference from './trimGeometry.fixture.json';
import { colorMenuTrimSteps, hexGridColumnLadderPx, hexGridRowLadderPx } from './trimGeometry';

describe('retained responsive picker thresholds', () => {
  it('preserves every menu trim rank and fractional threshold', () => {
    expect(colorMenuTrimSteps(11, 4)).toEqual(reference.colorMenu11FromRank4);
  });
  it('preserves the six honeycomb row boundaries including the tightened top step', () => {
    expect(hexGridRowLadderPx()).toEqual(reference.hexRows);
  });
  it('preserves the seven column boundaries including the tightened narrow step', () => {
    expect(hexGridColumnLadderPx()).toEqual(reference.hexColumns);
  });
});
