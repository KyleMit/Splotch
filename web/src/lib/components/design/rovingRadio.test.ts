import { describe, expect, it } from 'vitest';
import { arrowDelta, nextEnabledIndex, rovingTabIndex } from './rovingRadio';

describe('arrowDelta', () => {
  it('maps left and up to -1, right and down to 1, anything else to 0', () => {
    expect(arrowDelta('ArrowLeft')).toBe(-1);
    expect(arrowDelta('ArrowUp')).toBe(-1);
    expect(arrowDelta('ArrowRight')).toBe(1);
    expect(arrowDelta('ArrowDown')).toBe(1);
    expect(arrowDelta('Enter')).toBe(0);
    expect(arrowDelta(' ')).toBe(0);
  });
});

describe('nextEnabledIndex', () => {
  const three = [{}, {}, {}];

  it('steps forward and backward', () => {
    expect(nextEnabledIndex(three, 0, 1)).toBe(1);
    expect(nextEnabledIndex(three, 2, -1)).toBe(1);
  });

  it('wraps past either end', () => {
    expect(nextEnabledIndex(three, 2, 1)).toBe(0);
    expect(nextEnabledIndex(three, 0, -1)).toBe(2);
  });

  it('skips disabled options', () => {
    const options = [{}, { disabled: true }, {}];
    expect(nextEnabledIndex(options, 0, 1)).toBe(2);
    expect(nextEnabledIndex(options, 2, -1)).toBe(0);
  });

  it('stays put when every other option is disabled', () => {
    const options = [{ disabled: true }, {}, { disabled: true }];
    expect(nextEnabledIndex(options, 1, 1)).toBe(1);
    expect(nextEnabledIndex(options, 1, -1)).toBe(1);
  });
});

describe('rovingTabIndex', () => {
  const options = [{ value: 'a', disabled: true }, { value: 'b' }, { value: 'c' }];

  it('gives the tab stop to the selected option', () => {
    expect(rovingTabIndex(options, (value) => value === 'c')).toBe(2);
  });

  it('falls back to the first enabled option when nothing is selected', () => {
    expect(rovingTabIndex(options, () => false)).toBe(1);
  });

  it('ignores a selected option that is disabled', () => {
    expect(rovingTabIndex(options, (value) => value === 'a')).toBe(1);
  });

  it('returns -1 when every option is disabled', () => {
    expect(rovingTabIndex([{ value: 'a', disabled: true }], () => true)).toBe(-1);
  });
});
