import { describe, it, expect } from 'vitest';
import { colorContrast } from './colorContrast';
import { iconTokenEntries } from './iconTokens';
import { brand, isColorToken, scale, themes, toCssVarName, zIndex } from './tokens';

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
      'glassTintRgb',
      'lineartBlend',
      'lineartFilter',
      'ruleBlend',
      'ruleOpacity',
      'ruleSecondaryOpacity',
      'stepInkStrength',
      'stepWashStrength',
      'surfaceRgb',
    ]);
  });
});

const THEME_NAMES = ['light', 'dark'] as const;

function hexChannels(hex: string): string {
  const match = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  expect(match, `${hex} is a six-digit hex`).not.toBeNull();
  return match!
    .slice(1)
    .map((pair) => Number.parseInt(pair, 16))
    .join(' ');
}

// --surface-rgb is --surface restated as channels, for the fades that paint
// without color-mix(). Two spellings of one color agree only while this holds.
describe('surfaceRgb', () => {
  it.each(THEME_NAMES)('%s carries the channels of --surface', (theme) => {
    expect(themes[theme].surfaceRgb).toBe(hexChannels(themes[theme].surface));
  });
});

// The danger Button hovers from --danger-wash to --danger-wash-hover and keeps
// its --danger-text label, so the hovered fill holds the same AA floor.
describe('dangerWashHover', () => {
  const AA_MIN_CONTRAST = 4.5;

  it.each(THEME_NAMES)('%s keeps --danger-text at AA', (theme) => {
    const tokens = themes[theme];
    expect(
      colorContrast(tokens.dangerText, tokens.dangerWashHover, tokens.surface)
    ).toBeGreaterThanOrEqual(AA_MIN_CONTRAST);
  });
});

// The colour-function calls in a CSS value that use legacy notation: an rgba()/
// hsla() alias, or a comma between the function's own top-level arguments.
// Names match case-insensitively, as CSS does. Nested calls are skipped while
// scanning, so `rgb(var(--x), 0.3)` is caught and a comma inside a var()
// fallback is not mistaken for the legacy separator.
function legacyColorCalls(value: string): string[] {
  const calls: string[] = [];
  for (const match of value.matchAll(/\b(rgba?|hsla?)\(/gi)) {
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
    if (match[1].toLowerCase().endsWith('a') || topLevelComma)
      calls.push(value.slice(match.index, end + 1));
  }
  return calls;
}

describe('legacyColorCalls', () => {
  it.each([
    ['rgba(0, 0, 0, 0.2)', ['rgba(0, 0, 0, 0.2)']],
    ['rgb(0 0 0 / 20%)', []],
    ['rgba(0 0 0 / 20%)', ['rgba(0 0 0 / 20%)']],
    ['0 4px 12px rgb(var(--x), 0.3)', ['rgb(var(--x), 0.3)']],
    ['rgb(var(--x) / 30%)', []],
    ['rgb(var(--x, var(--fallback, 0 0 0)) / 30%)', []],
    ['hsl(0, 0%, 0%)', ['hsl(0, 0%, 0%)']],
    ['RGBA(0 0 0 / 20%)', ['RGBA(0 0 0 / 20%)']],
    ['Rgb(0, 0, 0)', ['Rgb(0, 0, 0)']],
    ['RGB(0 0 0 / 20%)', []],
    ['0 0 0 1px rgb(255 255 255 / 6%), 0 3px 10px rgba(0, 0, 0, 0.5)', ['rgba(0, 0, 0, 0.5)']],
  ])('%s', (value, expected) => {
    expect(legacyColorCalls(value)).toEqual(expected);
  });
});

// stylelint's modern colour-notation rules can't see tokens.css (it is
// generated and ignored), so every value gen-token-css.mjs emits carries the
// same guarantee here.
describe('colour notation', () => {
  const values: [string, string][] = [
    ...Object.entries(brand),
    ...Object.entries(scale),
    ...Object.entries(themes.light),
    ...Object.entries(themes.dark),
    ...Object.entries(zIndex).map(([key, value]): [string, string] => [key, String(value)]),
    ...iconTokenEntries().flatMap(({ cssVar, light, dark }): [string, string][] => [
      [`${cssVar} light`, light],
      [`${cssVar} dark`, dark],
    ]),
  ];

  it.each(values)('%s uses the modern rgb() form', (_key, value) => {
    expect(legacyColorCalls(value)).toEqual([]);
  });
});
