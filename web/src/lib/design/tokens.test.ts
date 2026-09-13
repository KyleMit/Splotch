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

// The colour-function calls in a CSS value that use legacy notation: an rgba()/
// hsla() alias, or a comma between the function's own top-level arguments.
// Nested calls are skipped while scanning, so `rgb(var(--x), 0.3)` is caught
// and a comma inside a var() fallback is not mistaken for the legacy separator.
function legacyColorCalls(value: string): string[] {
  const calls: string[] = [];
  for (const match of value.matchAll(/\b(rgba?|hsla?)\(/g)) {
    const argsStart = match.index + match[0].length;
    let depth = 0;
    let end = argsStart;
    let topLevelComma = false;
    for (; end < value.length; end++) {
      const char = value[end];
      if (char === '(') depth++;
      else if (char === ')' && depth-- === 0) break;
      else if (char === ',' && depth === 0) topLevelComma = true;
    }
    if (match[1].endsWith('a') || topLevelComma) calls.push(value.slice(match.index, end + 1));
  }
  return calls;
}

describe('legacyColorCalls', () => {
  it.each([
    ['rgba(0, 0, 0, 0.2)', ['rgba(0, 0, 0, 0.2)']],
    ['rgb(0 0 0 / 20%)', []],
    ['rgba(0 0 0 / 20%)', ['rgba(0 0 0 / 20%)']],
    ['0 4px 12px rgb(var(--brand-rgb), 0.3)', ['rgb(var(--brand-rgb), 0.3)']],
    ['rgb(var(--brand-rgb) / 30%)', []],
    ['rgb(var(--brand-rgb, var(--fallback, 0 0 0)) / 30%)', []],
    ['hsl(0, 0%, 0%)', ['hsl(0, 0%, 0%)']],
    ['0 0 0 1px rgb(255 255 255 / 6%), 0 3px 10px rgba(0, 0, 0, 0.5)', ['rgba(0, 0, 0, 0.5)']],
  ])('%s', (value, expected) => {
    expect(legacyColorCalls(value)).toEqual(expected);
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
    expect(legacyColorCalls(value)).toEqual([]);
  });

  it('space-separates the brand channel triplet so it composes as rgb(var(--brand-rgb) / NN%)', () => {
    expect(brand.brandRgb).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
  });
});
