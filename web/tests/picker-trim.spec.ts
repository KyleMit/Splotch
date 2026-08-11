import { expect, test, type Page } from '@playwright/test';

import { HEX_GRID_GEOMETRY, hexGridRowLadderPx } from '$lib/design/trimGeometry';
import { CUSTOM_SWATCH_COLOR, swatch } from './helpers';

// The hex color picker trims purely via CSS media queries (no JS measurement),
// like the palette — see palette-trim.spec.ts. These tests pin the trim
// ladders documented in ColorPicker.svelte (ADR-0048): the short viewport
// axis drops shade levels, the long axis drops hue families, survivors keep
// an even spread, and the honeycomb offset alternates by visible position.
// Past the top of both ladders the grid stops trimming and starts scaling, so
// the same geometry checks run there against the scaled hexagon.

interface VisibleGrid {
  rowCount: number;
  colsPerRow: number[];
  /** Left edge of each visible row's first hexagon, top to bottom. */
  rowLefts: number[];
  hexWidth: number;
  clipped: boolean;
}

async function openPickerAt(page: Page, width: number, height: number): Promise<VisibleGrid> {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  const customSwatch = swatch(page, CUSTOM_SWATCH_COLOR);
  await expect(async () => {
    await customSwatch.click({ timeout: 1000 });
    await expect(page.locator('#color-picker')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  // Let the fly-in land before measuring geometry by awaiting the dialog's
  // own animations (the modal-fly-in dialogFlyFromOrigin — hover transitions
  // on descendants don't run at open, so no subtree). Deterministic where the
  // old consecutive-stable-rAF-frames poll was not: under full-suite CPU
  // contention, coalesced frames could report identical rects mid-animation
  // and exit early (#469). The just-opened dialog's animation is guaranteed
  // registered by collection time: the toBeVisible above already forced a
  // style pass with the dialog open, and getAnimations() itself flushes
  // pending style per spec — the leading rAF is belt-and-braces. The catch
  // shrugs off the AbortError a canceled animation rejects with, so a dialog
  // torn down mid-wait fails at the geometry assertions, not as a cryptic
  // evaluate error.
  await page.locator('#color-picker').evaluate(async (dialog) => {
    await new Promise(requestAnimationFrame);
    await Promise.all(
      dialog.getAnimations().map((animation) => animation.finished.catch(() => {}))
    );
  });

  return page.locator('#color-picker').evaluate((dialog) => {
    const rows = [...dialog.querySelectorAll<HTMLElement>('.row')].filter(
      (row) => row.getBoundingClientRect().width > 0
    );
    const colsPerRow: number[] = [];
    const rowLefts: number[] = [];
    let hexWidth = 0;
    for (const row of rows) {
      const hexes = [...row.querySelectorAll<HTMLElement>('.hexagon')]
        .map((hex) => hex.getBoundingClientRect())
        .filter((rect) => rect.width > 0);
      colsPerRow.push(hexes.length);
      rowLefts.push(hexes[0]?.left ?? 0);
      hexWidth = hexes[0]?.width ?? hexWidth;
    }
    const rect = dialog.getBoundingClientRect();
    const clipped =
      dialog.scrollWidth > dialog.clientWidth + 1 ||
      dialog.scrollHeight > dialog.clientHeight + 1 ||
      rect.width > innerWidth * 0.9 + 1 ||
      rect.height > innerHeight * 0.9 + 1;
    return { rowCount: rows.length, colsPerRow, rowLefts, hexWidth, clipped };
  });
}

function expectHoneycomb(grid: VisibleGrid) {
  // Uniform rows (never jagged) …
  expect(new Set(grid.colsPerRow).size).toBe(1);
  // … interlocking: adjacent visible rows offset by the half-hex indent, which
  // is a fixed share of the hexagon and so follows it when the grid scales.
  const indent = (HEX_GRID_GEOMETRY.rowOffsetPx * grid.hexWidth) / HEX_GRID_GEOMETRY.columnPitchPx;
  for (let i = 1; i < grid.rowLefts.length; i++) {
    expect(Math.abs(grid.rowLefts[i] - grid.rowLefts[i - 1])).toBeCloseTo(indent, 1);
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

// Above both ladders the room goes into the swatches instead of the backdrop.
// The count must not move — the grid is already whole there — and the scaled
// honeycomb must still fit inside the 90vw/90vh cap the dialog is clipped to,
// which `clipped` is what checks.
for (const [orientation, w, h] of [
  ['portrait', 1032, 1376],
  ['landscape', 1376, 1032],
] as const) {
  test(`large tablet ${orientation} grows the swatches rather than the backdrop`, async ({
    page,
  }) => {
    const grid = await openPickerAt(page, w, h);
    expect(grid.rowCount).toBe(9);
    expect(grid.colsPerRow).toEqual(Array(9).fill(9));
    expect(grid.hexWidth).toBeGreaterThan(HEX_GRID_GEOMETRY.columnPitchPx);
    expectHoneycomb(grid);
  });
}

// The offset restatement is the fragile part of the trim CSS: hidden rows
// still count for :nth-child, so each height step re-declares the offsets.
// Walk every rung of the height ladder at a fixed width and assert the
// honeycomb still interlocks.
test('honeycomb offsets alternate at every height-ladder rung', async ({ page }) => {
  // One height above the top breakpoint (the untrimmed grid), then one just
  // inside each breakpoint — the boundary-adjacent state every rung's CSS
  // re-declares its offsets for.
  const ladder = hexGridRowLadderPx();
  const rungHeights = [Math.ceil(ladder[0]) + 20, ...ladder.map((bp) => Math.floor(bp))];
  for (const h of rungHeights) {
    const grid = await openPickerAt(page, 1100, h);
    expectHoneycomb(grid);
  }
});
