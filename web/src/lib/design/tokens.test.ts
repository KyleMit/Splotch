import { describe, it, expect } from 'vitest';
import { brand, isColorToken, scale, themes, toCssVarName } from './tokens';

// The gen:tokens drift gate only proves the committed CSS matches the
// generator's output — it would happily bless a wrong var name on both sides.
// These tests pin the name mapping itself, so every var(--…) reference in
// component styles keeps resolving.
describe('toCssVarName', () => {
  it('maps the tricky key shapes', () => {
    expect(toCssVarName('appBg')).toBe('--app-bg');
    expect(toCssVarName('surface2')).toBe('--surface-2');
    expect(toCssVarName('space1')).toBe('--space-1');
    expect(toCssVarName('fontSizeXs')).toBe('--font-size-xs');
    expect(toCssVarName('brandSolidHover')).toBe('--brand-solid-hover');
  });

  it('emits a well-formed kebab-case custom property for every token', () => {
    const keys = [...Object.keys(brand), ...Object.keys(scale), ...Object.keys(themes.light)];
    for (const key of keys) {
      expect(toCssVarName(key)).toMatch(/^--[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});

describe('isColorToken', () => {
  it('classifies every themed token', () => {
    expect(Object.keys(isColorToken).sort()).toEqual(Object.keys(themes.light).sort());
  });

  it('marks mix strengths, filters, blend modes and shadows as non-colors', () => {
    const nonColors = Object.keys(isColorToken).filter(
      (key) => !isColorToken[key as keyof typeof isColorToken]
    );
    expect(nonColors.sort()).toEqual([
      'floatShadow',
      'lineartBlend',
      'lineartFilter',
      'stepInkStrength',
      'stepWashStrength',
    ]);
  });
});

// stylelint's modern colour-notation rules can't see tokens.css (it is
// generated and ignored), so the token values carry the same guarantee here.
describe('colour notation', () => {
  const values = [
    ...Object.entries(brand),
    ...Object.entries(scale),
    ...Object.entries(themes.light),
    ...Object.entries(themes.dark),
  ];

  it.each(values)('%s uses the modern rgb() form', (_key, value) => {
    expect(value).not.toMatch(/\b(rgba|hsla)\(/);
    expect(value).not.toMatch(/\b(rgb|hsl)\([^)]*,/);
  });

  it('space-separates the brand channel triplet so it composes as rgb(var(--brand-rgb) / NN%)', () => {
    expect(brand.brandRgb).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
  });
});
