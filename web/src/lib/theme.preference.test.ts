// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isThemePreference, RESOLVED_THEMES } from './theme';

describe('isThemePreference', () => {
  it('accepts every resolved theme and system', () => {
    expect([...RESOLVED_THEMES, 'system'].every(isThemePreference)).toBe(true);
  });

  it('rejects anything outside the stored vocabulary', () => {
    expect(isThemePreference('sepia')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });
});
