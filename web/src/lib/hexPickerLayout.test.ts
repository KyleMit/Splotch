// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  COLOR_FAMILIES,
  FAMILY_COUNT,
  LANDSCAPE_ROWS,
  PORTRAIT_ROWS,
  SHADE_COUNT,
} from './hexPickerLayout';

describe('COLOR_FAMILIES', () => {
  it('is a full grid of unique colors', () => {
    expect(COLOR_FAMILIES).toHaveLength(FAMILY_COUNT);
    for (const family of COLOR_FAMILIES) {
      expect(family.shades).toHaveLength(SHADE_COUNT);
      for (const shade of family.shades) expect(shade).toMatch(/^#[0-9A-F]{6}$/);
    }
    const all = COLOR_FAMILIES.flatMap((f) => f.shades.map((s) => s.toLowerCase()));
    expect(new Set(all).size).toBe(FAMILY_COUNT * SHADE_COUNT);
  });
});

describe('grid arrangements', () => {
  it('portrait rows are the families, shades in declared order', () => {
    expect(PORTRAIT_ROWS.map((r) => r.key)).toEqual(COLOR_FAMILIES.map((f) => f.name));
    PORTRAIT_ROWS.forEach((row, i) => expect(row.colors).toEqual(COLOR_FAMILIES[i].shades));
  });

  it('landscape rows are the exact transpose, light row first', () => {
    expect(LANDSCAPE_ROWS).toHaveLength(SHADE_COUNT);
    expect(LANDSCAPE_ROWS[0].key).toBe('shade-1');
    expect(LANDSCAPE_ROWS.at(-1)?.key).toBe(`shade-${SHADE_COUNT}`);
    LANDSCAPE_ROWS.forEach((row, s) => {
      expect(row.colors).toEqual(COLOR_FAMILIES.map((f) => f.shades[s]));
    });
  });

  it('both grids contain the same colors', () => {
    expect(new Set(LANDSCAPE_ROWS.flatMap((r) => r.colors))).toEqual(
      new Set(PORTRAIT_ROWS.flatMap((r) => r.colors))
    );
  });
});
