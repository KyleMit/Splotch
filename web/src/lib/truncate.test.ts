// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { truncateCodeUnits } from './truncate';

// U+1F58D (lower left crayon) is one astral code point: two UTF-16 code units.
const CRAYON = '🖍';

describe('truncateCodeUnits', () => {
  it('measures the crayon fixture as a surrogate pair', () => {
    expect(CRAYON).toHaveLength(2);
  });

  it('cuts plain text at exactly the budget, as slice does', () => {
    expect(truncateCodeUnits('abcdefgh', 5)).toBe('abcde');
  });

  it('returns text within the budget unchanged', () => {
    expect(truncateCodeUnits('abc', 3)).toBe('abc');
    expect(truncateCodeUnits(`ab${CRAYON}`, 4)).toBe(`ab${CRAYON}`);
  });

  it('drops a pair the cut would split, staying well-formed and within the budget', () => {
    const text = `abcd${CRAYON}efg`;
    expect(text.slice(0, 5).isWellFormed()).toBe(false);

    const truncated = truncateCodeUnits(text, 5);

    expect(truncated).toBe('abcd');
    expect(truncated.isWellFormed()).toBe(true);
  });

  it('keeps a pair that ends exactly at the budget', () => {
    expect(truncateCodeUnits(`abcd${CRAYON}efg`, 6)).toBe(`abcd${CRAYON}`);
  });

  it('never exceeds the budget across every cut of an emoji-dense string', () => {
    const text = `a${CRAYON}${CRAYON}b${CRAYON}c`;
    for (let budget = 0; budget <= text.length; budget++) {
      const truncated = truncateCodeUnits(text, budget);
      expect(truncated.length).toBeLessThanOrEqual(budget);
      expect(truncated.length).toBeGreaterThanOrEqual(budget - 1);
      expect(truncated.isWellFormed()).toBe(true);
      expect(text.startsWith(truncated)).toBe(true);
    }
  });

  it('returns nothing for a budget of zero or less', () => {
    expect(truncateCodeUnits('abc', 0)).toBe('');
    expect(truncateCodeUnits('abc', -1)).toBe('');
  });
});
