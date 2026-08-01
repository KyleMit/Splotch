import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  HEX_GRID_GEOMETRY,
  PALETTE_COLUMN_GEOMETRY,
  PALETTE_ROW_GEOMETRY,
  hexGridColumnLadderPx,
  hexGridRowLadderPx,
  landscapeBonusRevealLadderPx,
  landscapeSingleColumnFloorPx,
  landscapeSingleColumnTrimLadderPx,
  landscapeTwoColumnLadderPx,
  portraitLadderPx,
} from './trimGeometry';

// The ladders are CSS, so the only thing that makes trimGeometry.ts a source of
// truth rather than a second copy is this file reading the components back off
// disk (precedent: src/app.html.test.ts). Both halves are parsed: the geometry
// declarations the module restates — a swatch's width, the honeycomb's row
// pitch, the 90vh cap — and every `@media` threshold derived from them. Bump
// `width: 60px` without re-deriving the ladder and this goes red, which is the
// drift the hand-computed thresholds could never catch.

function sourceFile(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function styleBlock(path: string): string {
  const source = sourceFile(path);
  const match = source.match(/<style>([\s\S]*)<\/style>/);
  expect(match, `${path} has a <style> block`).not.toBeNull();
  return match![1];
}

/** Body of the brace-matched block introduced by `header`, e.g. `.picker {`. */
function blockAfter(css: string, header: string, from = 0): string {
  const at = css.indexOf(header, from);
  expect(at, `expected \`${header}\` in the style block`).toBeGreaterThan(-1);
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}' && (depth -= 1) === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unbalanced braces after \`${header}\``);
}

function declaration(body: string, property: string, unit: string): number {
  const match = body.match(new RegExp(`(?:^|[\\s;{])${property}:\\s*(-?\\d+(?:\\.\\d+)?)${unit}`));
  expect(match, `expected a \`${property}\` declaration in ${unit}`).not.toBeNull();
  return Number(match![1]);
}

function px(body: string, property: string, variables = body): number {
  const variable = body.match(
    new RegExp(`(?:^|[\\s;{])${property}:\\s*(calc\\(\\s*-1\\s*\\*\\s*)?var\\((--[\\w-]+)\\)`)
  );
  if (!variable) return declaration(body, property, 'px');
  const value = declaration(variables, variable[2], 'px');
  return variable[1] ? -value : value;
}

/** `max-height: 90vh` → 0.9, the fraction of the viewport the grid may use. */
const viewportFraction = (body: string, property: string, unit: 'vw' | 'vh') =>
  declaration(body, property, unit) / 100;

interface MediaRule {
  condition: string;
  body: string;
}

function mediaRules(css: string): MediaRule[] {
  return [...css.matchAll(/@media ([^{]+)\{/g)].map((match) => ({
    condition: match[1].trim(),
    body: blockAfter(css, match[0], match.index),
  }));
}

function feature(rule: MediaRule, name: string): number | null {
  const match = rule.condition.match(new RegExp(`\\(${name}:\\s*(\\d+(?:\\.\\d+)?)px\\)`));
  return match ? Number(match[1]) : null;
}

const has = (rule: MediaRule, name: string) => feature(rule, name) !== null;

/** Rules a ladder could own — the rest select a layout or a hover capability. */
const thresholdRules = (rules: MediaRule[]) => rules.filter((rule) => /px\)/.test(rule.condition));

describe('ColorPalette', () => {
  const css = styleBlock('../components/ColorPalette.svelte');
  const rules = mediaRules(css);

  const landscape = rules.filter((rule) => rule.condition.includes('orientation: landscape'));
  const bonusReveal = landscape.filter((rule) => rule.body.includes('.color-swatch.bonus'));
  const singleColumnTrim = landscape.filter(
    (rule) => !bonusReveal.includes(rule) && has(rule, 'min-height') && has(rule, 'max-height')
  );
  const layoutSwitch = landscape.filter((rule) => rule.body.includes('grid-template-columns'));
  const twoColumnTrim = landscape.filter(
    (rule) => !has(rule, 'min-height') && has(rule, 'max-height')
  );
  const portraitTrim = rules.filter(
    (rule) => rule.condition.includes('orientation: portrait') && has(rule, 'max-width')
  );

  it('classifies every @media rule, so no ladder is silently skipped', () => {
    const classified = [
      ...bonusReveal,
      ...singleColumnTrim,
      ...layoutSwitch,
      ...twoColumnTrim,
      ...portraitTrim,
    ];
    expect(new Set(classified).size).toBe(classified.length);
    expect(classified).toHaveLength(thresholdRules(rules).length);
    expect(layoutSwitch).toHaveLength(1);
  });

  it('restates the landscape column geometry', () => {
    const palette = blockAfter(css, '.color-palette {');
    const swatch = blockAfter(css, '.color-swatch {');
    expect(PALETTE_COLUMN_GEOMETRY.swatchPx).toBe(px(swatch, 'width'));
    expect(px(swatch, 'height')).toBe(px(swatch, 'width'));
    expect(PALETTE_COLUMN_GEOMETRY.gapPx).toBe(px(palette, 'gap'));
    expect(PALETTE_COLUMN_GEOMETRY.paddingPx).toBe(2 * px(palette, 'padding'));
  });

  it('restates the portrait row geometry', () => {
    const portrait = blockAfter(css, '@media (orientation: portrait) {');
    const palette = blockAfter(portrait, '.color-palette {');
    const swatch = blockAfter(portrait, '.color-swatch {');
    expect(PALETTE_ROW_GEOMETRY.swatchPx).toBe(px(swatch, 'width'));
    expect(px(swatch, 'height')).toBe(px(swatch, 'width'));
    expect(PALETTE_ROW_GEOMETRY.gapPx).toBe(px(palette, 'gap'));
    expect(PALETTE_ROW_GEOMETRY.paddingPx).toBe(2 * px(palette, 'padding'));
  });

  it('keeps orientation-driven swatch geometry out of interaction transitions', () => {
    const swatch = blockAfter(css, '.color-swatch {');
    expect(swatch).not.toMatch(/transition:\s*all\b/);
    expect(swatch).not.toMatch(/\b(?:width|height)\s+var\(--duration-/);
    expect(swatch).toContain('transform var(--duration-base) ease');
  });

  it('falls back to two columns at the single-column floor', () => {
    expect(feature(layoutSwitch[0], 'min-height')).toBe(landscapeSingleColumnFloorPx());
  });

  it('trims the single column, floored at that same height', () => {
    expect(singleColumnTrim.map((rule) => feature(rule, 'max-height'))).toEqual(
      landscapeSingleColumnTrimLadderPx()
    );
    for (const rule of singleColumnTrim) {
      expect(feature(rule, 'min-height')).toBe(landscapeSingleColumnFloorPx());
    }
  });

  it('opens the bonus slots above the core eight', () => {
    expect(bonusReveal.map((rule) => feature(rule, 'min-height'))).toEqual(
      landscapeBonusRevealLadderPx()
    );
  });

  it('drops a landscape two-column row at a time', () => {
    expect(twoColumnTrim.map((rule) => feature(rule, 'max-height'))).toEqual(
      landscapeTwoColumnLadderPx()
    );
  });

  it('drops a portrait core swatch at a time', () => {
    expect(portraitTrim.map((rule) => feature(rule, 'max-width'))).toEqual(portraitLadderPx());
  });
});

describe('ColorPicker', () => {
  const css = styleBlock('../components/ColorPicker.svelte');
  const tokens = sourceFile('../../tokens.css');
  const rules = mediaRules(css);
  const rowTrim = rules.filter((rule) => has(rule, 'max-height'));
  const columnTrim = rules.filter((rule) => has(rule, 'max-width'));

  it('classifies every @media rule, so no ladder is silently skipped', () => {
    const classified = [...rowTrim, ...columnTrim];
    expect(new Set(classified).size).toBe(classified.length);
    expect(classified).toHaveLength(thresholdRules(rules).length);
  });

  it('restates the honeycomb geometry', () => {
    const dialog = blockAfter(css, '.color-picker {');
    const picker = blockAfter(css, '.picker {');
    const hexagon = blockAfter(css, '.hexagon {');
    const firstRow = blockAfter(css, '.row {');
    const laterRow = blockAfter(css, '.row:not(:first-child) {');
    const offsetRow = blockAfter(css, '.r8 {');

    expect(HEX_GRID_GEOMETRY.firstRowPx).toBe(px(hexagon, 'height'));
    expect(HEX_GRID_GEOMETRY.columnPitchPx).toBe(px(hexagon, 'width'));
    // Later rows overlap upward, so the pitch is the hexagon minus that pull.
    expect(HEX_GRID_GEOMETRY.rowPitchPx).toBe(
      px(hexagon, 'height') + px(laterRow, 'margin-top', picker)
    );
    expect(HEX_GRID_GEOMETRY.rowOffsetPx).toBe(px(offsetRow, 'margin-left', picker));
    expect(HEX_GRID_GEOMETRY.paddingPx).toBe(2 * px(picker, 'padding', tokens));
    expect(HEX_GRID_GEOMETRY.viewportFraction).toBe(viewportFraction(dialog, 'max-height', 'vh'));
    expect(HEX_GRID_GEOMETRY.viewportFraction).toBe(viewportFraction(dialog, 'max-width', 'vw'));
    // firstRowPx counts the first hexagon whole, which only holds while the
    // first row's negative margin is cancelled by the picker's own.
    expect(px(picker, 'margin-top') + px(firstRow, 'margin-top', picker)).toBe(0);
  });

  it('drops a honeycomb row at a time', () => {
    expect(rowTrim.map((rule) => feature(rule, 'max-height'))).toEqual(hexGridRowLadderPx());
  });

  it('drops a honeycomb column at a time', () => {
    expect(columnTrim.map((rule) => feature(rule, 'max-width'))).toEqual(hexGridColumnLadderPx());
  });
});
