import { expect, test, type Page } from '@playwright/test';

// The hex color picker trims purely via CSS media queries (no JS measurement),
// like the palette — see palette-trim.spec.ts. These tests pin the trim
// ladders documented in ColorPicker.svelte (ADR-0048): the short viewport
// axis drops shade levels, the long axis drops hue families, survivors keep
// an even spread, and the honeycomb offset alternates by visible position.

interface VisibleGrid {
  rowCount: number;
  colsPerRow: number[];
  /** Left edge of each visible row's first hexagon, top to bottom. */
  rowLefts: number[];
  clipped: boolean;
}

async function openPickerAt(page: Page, width: number, height: number): Promise<VisibleGrid> {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  const customSwatch = page.locator('button.color-swatch[data-color="custom"]');
  await expect(async () => {
    await customSwatch.click({ timeout: 1000 });
    await expect(page.locator('#color-picker')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  // Let the fly-in animation land before measuring geometry: wait until the
  // dialog's rect holds still across consecutive frames (a fixed sleep costs
  // 400ms × 13 calls across this file; settling takes only a few frames).
  await page.locator('#color-picker').evaluate(async (dialog) => {
    const snap = () => JSON.stringify(dialog.getBoundingClientRect());
    let prev = snap();
    let stable = 0;
    for (let frames = 0; frames < 120 && stable < 2; frames++) {
      await new Promise(requestAnimationFrame);
      const cur = snap();
      stable = cur === prev ? stable + 1 : 0;
      prev = cur;
    }
  });

  return page.locator('#color-picker').evaluate((dialog) => {
    const rows = [...dialog.querySelectorAll<HTMLElement>('.row')].filter(
      (row) => row.getBoundingClientRect().width > 0
    );
    const colsPerRow: number[] = [];
    const rowLefts: number[] = [];
    for (const row of rows) {
      const hexes = [...row.querySelectorAll<HTMLElement>('.hexagon')]
        .map((hex) => hex.getBoundingClientRect())
        .filter((rect) => rect.width > 0);
      colsPerRow.push(hexes.length);
      rowLefts.push(Math.round(hexes[0]?.left ?? 0));
    }
    const rect = dialog.getBoundingClientRect();
    const clipped =
      dialog.scrollWidth > dialog.clientWidth + 1 ||
      dialog.scrollHeight > dialog.clientHeight + 1 ||
      rect.width > innerWidth * 0.9 + 1 ||
      rect.height > innerHeight * 0.9 + 1;
    return { rowCount: rows.length, colsPerRow, rowLefts, clipped };
  });
}

function expectHoneycomb(grid: VisibleGrid) {
  // Uniform rows (never jagged) …
  expect(new Set(grid.colsPerRow).size).toBe(1);
  // … interlocking: adjacent visible rows offset by the half-hex 31px.
  for (let i = 1; i < grid.rowLefts.length; i++) {
    expect(Math.abs(grid.rowLefts[i] - grid.rowLefts[i - 1])).toBe(31);
  }
  expect(grid.clipped).toBe(false);
}

// rows × cols per viewport. Landscape rows are shade levels (families run
// across); portrait rows are families (shades run across) — either way the
// short axis is what costs shades.
const CASES = [
  { w: 1280, h: 800, rows: 9, cols: 9, label: 'desktop landscape shows the full 9×9' },
  { w: 768, h: 1024, rows: 9, cols: 9, label: 'tablet portrait shows the full 9×9' },
  { w: 844, h: 390, rows: 5, cols: 9, label: 'phone landscape keeps all 9 families' },
  { w: 390, h: 844, rows: 9, cols: 4, label: 'phone portrait keeps all 9 families' },
  { w: 568, h: 320, rows: 4, cols: 7, label: 'iPhone SE landscape keeps 7 families' },
  { w: 320, h: 480, rows: 7, cols: 3, label: 'tiny portrait floors at 3 shades' },
];

for (const { w, h, rows, cols, label } of CASES) {
  test(`${label} (${w}×${h} → ${rows}×${cols})`, async ({ page }) => {
    const grid = await openPickerAt(page, w, h);
    expect(grid.rowCount).toBe(rows);
    expect(grid.colsPerRow).toEqual(Array(rows).fill(cols));
    expectHoneycomb(grid);
  });
}

// The offset restatement is the fragile part of the trim CSS: hidden rows
// still count for :nth-child, so each height step re-declares the offsets.
// Walk every rung of the height ladder at a fixed width and assert the
// honeycomb still interlocks.
test('honeycomb offsets alternate at every height-ladder rung', async ({ page }) => {
  for (const h of [600, 550, 500, 440, 380, 330, 275]) {
    const grid = await openPickerAt(page, 1100, h);
    expectHoneycomb(grid);
  }
});
