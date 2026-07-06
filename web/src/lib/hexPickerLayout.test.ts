import { describe, expect, it } from 'vitest';
import { buildPickerRows, COLOR_FAMILIES, spreadIndices } from './hexPickerLayout';

describe('spreadIndices', () => {
  it('returns every index when the count covers the total', () => {
    expect(spreadIndices(9, 9)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(spreadIndices(9, 12)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('always keeps both endpoints', () => {
    for (let count = 2; count <= 9; count++) {
      const picked = spreadIndices(9, count);
      expect(picked[0]).toBe(0);
      expect(picked.at(-1)).toBe(8);
    }
  });

  it('spaces survivors evenly with no duplicates', () => {
    expect(spreadIndices(9, 5)).toEqual([0, 2, 4, 6, 8]);
    expect(spreadIndices(9, 3)).toEqual([0, 4, 8]);
    for (let count = 2; count <= 9; count++) {
      const picked = spreadIndices(9, count);
      expect(new Set(picked).size).toBe(count);
      expect(picked).toEqual([...picked].sort((a, b) => a - b));
    }
  });
});

describe('buildPickerRows', () => {
  it('shows the full 9×9 grid when the viewport has room, in either orientation', () => {
    const landscape = buildPickerRows(1280, 800);
    expect(landscape).toHaveLength(9);
    for (const row of landscape) expect(row.colors).toHaveLength(9);

    const portrait = buildPickerRows(800, 1280);
    expect(portrait.map((r) => r.key)).toEqual(COLOR_FAMILIES.map((f) => f.name));
    for (const row of portrait) expect(row.colors).toHaveLength(9);

    expect(new Set(landscape.flatMap((r) => r.colors))).toEqual(
      new Set(portrait.flatMap((r) => r.colors))
    );
  });

  it('portrait: a narrow viewport trims shades but keeps every hue family', () => {
    const rows = buildPickerRows(375, 667);
    expect(rows.map((r) => r.key)).toEqual(COLOR_FAMILIES.map((f) => f.name));
    for (const row of rows) {
      expect(row.colors.length).toBeLessThan(9);
      expect(row.colors.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('landscape: transposes so a short viewport trims shades, not hue families', () => {
    const rows = buildPickerRows(667, 375);
    for (const row of rows) expect(row.key).toMatch(/^shade-/);
    const familiesShown = rows[0].colors.length;
    expect(familiesShown).toBeGreaterThanOrEqual(7);
    expect(rows.length).toBeLessThan(familiesShown);
  });

  it('landscape rows hold one shade of each surviving family, light row first', () => {
    const rows = buildPickerRows(667, 375);
    expect(rows[0].key).toBe('shade-1');
    expect(rows.at(-1)?.key).toBe('shade-9');
    for (const row of rows) {
      const familyIndexes = row.colors.map((hex) =>
        COLOR_FAMILIES.findIndex((f) => f.shades.includes(hex))
      );
      expect(familyIndexes).not.toContain(-1);
      expect(familyIndexes).toEqual([...familyIndexes].sort((a, b) => a - b));
      expect(new Set(familyIndexes).size).toBe(familyIndexes.length);
    }
  });

  it('keeps light-to-dark range when shades are trimmed', () => {
    const rows = buildPickerRows(375, 667);
    const reds = rows.find((r) => r.key === 'reds')!;
    expect(reds.colors[0]).toBe(COLOR_FAMILIES[0].shades[0]);
    expect(reds.colors.at(-1)).toBe(COLOR_FAMILIES[0].shades.at(-1));
  });

  it('keeps the rainbow endpoints when families are trimmed', () => {
    const rows = buildPickerRows(500, 375);
    const first = rows[0];
    expect(COLOR_FAMILIES[0].shades).toContain(first.colors[0]);
    expect(COLOR_FAMILIES.at(-1)?.shades).toContain(first.colors.at(-1));
  });

  it('never renders fewer than 2 rows or 2 columns, even on tiny viewports', () => {
    const rows = buildPickerRows(200, 150);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) expect(row.colors.length).toBeGreaterThanOrEqual(2);
  });
});
