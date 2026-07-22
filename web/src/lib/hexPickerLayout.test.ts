// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { COLOR_FAMILIES, LANDSCAPE_ROWS, PORTRAIT_ROWS } from './hexPickerLayout';

describe('COLOR_FAMILIES', () => {
  it('is a full 9×9 grid of unique colors', () => {
    expect(COLOR_FAMILIES).toHaveLength(9);
    for (const family of COLOR_FAMILIES) expect(family.shades).toHaveLength(9);
    const all = COLOR_FAMILIES.flatMap((f) => f.shades.map((s) => s.toLowerCase()));
    expect(new Set(all).size).toBe(81);
  });
});

describe('grid arrangements', () => {
  it('portrait rows are the families, shades in declared order', () => {
    expect(PORTRAIT_ROWS.map((r) => r.key)).toEqual(COLOR_FAMILIES.map((f) => f.name));
    PORTRAIT_ROWS.forEach((row, i) => expect(row.colors).toEqual(COLOR_FAMILIES[i].shades));
  });

  it('landscape rows are the exact transpose, light row first', () => {
    expect(LANDSCAPE_ROWS).toHaveLength(9);
    expect(LANDSCAPE_ROWS[0].key).toBe('shade-1');
    expect(LANDSCAPE_ROWS.at(-1)?.key).toBe('shade-9');
    LANDSCAPE_ROWS.forEach((row, s) => {
      expect(row.colors).toEqual(COLOR_FAMILIES.map((f) => f.shades[s]));
    });
  });

  it('both grids contain the same 81 colors', () => {
    expect(new Set(LANDSCAPE_ROWS.flatMap((r) => r.colors))).toEqual(
      new Set(PORTRAIT_ROWS.flatMap((r) => r.colors))
    );
  });
});
