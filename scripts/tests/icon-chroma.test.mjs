import { describe, expect, it } from 'vitest';

import { isSpot, paintedValues } from '../lib/iconChroma.mjs';

// paintedValues's value character class deliberately excludes `}` and `/` so
// export shapes no icon in the corpus currently uses still parse to a clean
// value: a CSS declaration closing its block, and an unquoted attribute
// closing its self-closing tag. Without these cases the exclusions are
// exercised by nothing and could regress silently.
describe('paintedValues', () => {
  it('terminates a CSS-block declaration at the closing brace', () => {
    expect(paintedValues('<style>.cls-1{fill:#e91e63}</style>')).toEqual([
      { attr: 'fill', value: '#e91e63' },
    ]);
  });

  it('terminates an unquoted attribute at the self-closing slash', () => {
    expect(paintedValues('<path fill=#1f1f1f/>')).toEqual([{ attr: 'fill', value: '#1f1f1f' }]);
  });

  it('captures a var() fallback whole, not as a bare hex', () => {
    expect(paintedValues('<rect style="fill:var(--paper,#fcfbf8)"/>')).toEqual([
      { attr: 'fill', value: 'var(--paper,#fcfbf8)' },
    ]);
  });
});

describe('isSpot', () => {
  it('classifies a CSS-block spot color', () => {
    expect(isSpot('<style>.cls-1{fill:#e91e63}</style>')).toBe(true);
  });

  it('keeps an unquoted monochrome ink out of the spot set', () => {
    expect(isSpot('<path fill=#1f1f1f/>')).toBe(false);
  });

  it('never counts a var() fallback hex as a painted spot color', () => {
    expect(isSpot('<rect style="fill:var(--brand,#e91e63)"/>')).toBe(false);
  });
});
