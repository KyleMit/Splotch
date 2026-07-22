import { describe, it, expect } from 'vitest';
import { brand, scale, themes, toCssVarName } from './tokens';

// The gen:tokens drift gate only proves the committed CSS matches the
// generator's output — it would happily bless a wrong var name on both sides.
// These tests pin the name mapping itself, so every var(--…) reference in
// component styles keeps resolving.
describe('toCssVarName', () => {
  it('maps the tricky key shapes', () => {
    expect(toCssVarName('appBg')).toBe('--app-bg');
    expect(toCssVarName('surface2')).toBe('--surface-2');
    expect(toCssVarName('text2xl')).toBe('--text-2xl');
    expect(toCssVarName('radiusXs')).toBe('--radius-xs');
    expect(toCssVarName('brandTintFilter')).toBe('--brand-tint-filter');
  });

  it('emits a well-formed kebab-case custom property for every token', () => {
    const keys = [...Object.keys(brand), ...Object.keys(scale), ...Object.keys(themes.light)];
    for (const key of keys) {
      expect(toCssVarName(key)).toMatch(/^--[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});

describe('themes', () => {
  it('light and dark stay structurally identical', () => {
    expect(Object.keys(themes.dark)).toEqual(Object.keys(themes.light));
  });
});
