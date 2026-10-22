import type { Page } from '@playwright/test';
import {
  HEX_GRID_GEOMETRY,
  hexGridColumnLadderPx,
  hexGridRowLadderPx,
} from '../../src/lib/design/trimGeometry.ts';
import { expect, test } from '../fixtures.ts';
import { openDrawingScreen } from '../support/drawing.ts';

// The custom-colour picker trims its honeycomb to the window: the short axis drops shade levels,
// the long axis drops hue families, the survivors keep an even spread, and the offset alternates
// by visible row. Past the top of both ladders it stops trimming and scales the hexagon instead, so
// the same geometry checks run there against the larger swatch.

type VisibleGrid = {
  rowCount: number;
  colsPerRow: number[];
  /** Left edge of each visible row's first hexagon, top to bottom. */
  rowLefts: number[];
  hexWidth: number;
  /** Whether any hexagon lies outside the picker's card or the window. */
  clipped: boolean;
};

const FRAME_SETTLE_POLLS = 2;
const FRAME_POLL_MS = 50;
// Sub-pixel layout rounds a hexagon's edge by less than this.
const EDGE_TOLERANCE_PX = 1;
const INDENT_DIGITS = 1;
const HEX_LABEL = /^#[0-9A-F]{6}$/i;
// A width or height above both ladders, where the grid is whole at every size.
const ABOVE_LADDER_HEIGHT_PX = 1100;
const ABOVE_LADDER_MARGIN_PX = 20;

async function readGrid(page: Page): Promise<VisibleGrid> {
  const dialog = page.getByRole('dialog', { name: 'Color Picker' });
  const card = await dialog.boundingBox();
  const hexes = await dialog.getByRole('button').evaluateAll(
    (buttons, pattern) =>
      buttons
        .filter((button) => new RegExp(pattern, 'i').test(button.getAttribute('aria-label') ?? ''))
        .map((button) => {
          const { x, y, width, height } = button.getBoundingClientRect();
          return { x, y, width, height };
        }),
    HEX_LABEL.source
  );
  const rows = [...new Set(hexes.map((hex) => Math.round(hex.y)))].sort((a, b) => a - b);
  const byRow = rows.map((top) => hexes.filter((hex) => Math.round(hex.y) === top));
  const viewport = page.viewportSize();
  if (!card || !viewport) throw new Error('The picker or the window has no size');
  const clipped = hexes.some(
    (hex) =>
      hex.x < card.x - EDGE_TOLERANCE_PX ||
      hex.y < card.y - EDGE_TOLERANCE_PX ||
      hex.x + hex.width > card.x + card.width + EDGE_TOLERANCE_PX ||
      hex.y + hex.height > card.y + card.height + EDGE_TOLERANCE_PX ||
      hex.x + hex.width > viewport.width + EDGE_TOLERANCE_PX ||
      hex.y + hex.height > viewport.height + EDGE_TOLERANCE_PX
  );
  return {
    rowCount: rows.length,
    colsPerRow: byRow.map((row) => row.length),
    rowLefts: byRow.map((row) => Math.min(...row.map((hex) => hex.x))),
    hexWidth: hexes[0]?.width ?? 0,
    clipped,
  };
}

// The picker flies in, so its rows are read once two animation frames in a row agree.
async function settledGrid(page: Page): Promise<VisibleGrid> {
  let previous = '';
  let agreeing = 0;
  await expect
    .poll(
      async () => {
        const grid = JSON.stringify(await readGrid(page));
        agreeing = grid === previous ? agreeing + 1 : 0;
        previous = grid;
        return agreeing >= FRAME_SETTLE_POLLS;
      },
      { intervals: [FRAME_POLL_MS] }
    )
    .toBe(true);
  return JSON.parse(previous);
}

async function openPickerAt(page: Page, width: number, height: number): Promise<VisibleGrid> {
  await page.setViewportSize({ width, height });
  await openDrawingScreen(page);
  const custom = page.getByRole('button', { name: 'Custom Color' });
  // A phone held sideways folds the palette into one Colors button that opens a flyout.
  if (!(await custom.isVisible()))
    await page.getByRole('button', { name: 'Colors', exact: true }).click();
  await custom.click();
  await expect(page.getByRole('dialog', { name: 'Color Picker' })).toBeVisible();
  return settledGrid(page);
}

function expectHoneycomb(grid: VisibleGrid) {
  // Uniform rows, never jagged.
  expect(new Set(grid.colsPerRow).size).toBe(1);
  // Interlocking: adjacent visible rows offset by the half-hexagon indent, a fixed share of the
  // hexagon that follows it when the grid scales.
  const indent = (HEX_GRID_GEOMETRY.rowOffsetPx * grid.hexWidth) / HEX_GRID_GEOMETRY.columnPitchPx;
  for (let row = 1; row < grid.rowLefts.length; row++)
    expect(Math.abs(grid.rowLefts[row] - grid.rowLefts[row - 1])).toBeCloseTo(
      indent,
      INDENT_DIGITS
    );
  expect(grid.clipped).toBe(false);
}

// Rows by columns per window. Landscape rows are shade levels, with the hue families across;
// portrait rows are families, with the shades across. Either way the short axis costs shades.
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

// Above both ladders the room goes into the swatches instead of the backdrop. The count does not
// move, because the grid is already whole there, and the scaled honeycomb must still fit.
for (const [orientation, w, h] of [
  ['portrait', 1032, 1376],
  ['landscape', 1376, 1032],
] as const) {
  test(`a large tablet in ${orientation} grows the swatches rather than the backdrop`, async ({
    page,
  }) => {
    const grid = await openPickerAt(page, w, h);

    expect(grid.rowCount).toBe(9);
    expect(grid.colsPerRow).toEqual(Array(9).fill(9));
    expect(grid.hexWidth).toBeGreaterThan(HEX_GRID_GEOMETRY.columnPitchPx);
    expectHoneycomb(grid);
  });
}

// The width ladder's rungs are where the honeycomb sits closest to the card's width cap, so each is
// walked from just inside it: one column fewer than the rung keeps, still interlocking, still inside.
test('the honeycomb fits the width cap at every column-ladder rung', async ({ page }) => {
  const ladder = hexGridColumnLadderPx();
  const untrimmed = await openPickerAt(
    page,
    Math.ceil(ladder[0]) + ABOVE_LADDER_MARGIN_PX,
    ABOVE_LADDER_HEIGHT_PX
  );
  expect(untrimmed.colsPerRow).toEqual(Array(untrimmed.rowCount).fill(9));
  expectHoneycomb(untrimmed);
  for (const [rung, breakpoint] of ladder.entries()) {
    const grid = await openPickerAt(page, Math.floor(breakpoint), ABOVE_LADDER_HEIGHT_PX);
    expect(grid.colsPerRow, `${Math.floor(breakpoint)}px wide`).toEqual(
      Array(grid.rowCount).fill(8 - rung)
    );
    expectHoneycomb(grid);
  }
});

// Hidden rows still count for position, so each height step re-declares the offsets. Walking every
// rung of the height ladder at a fixed width asserts the honeycomb still interlocks.
test('the honeycomb offsets alternate at every height-ladder rung', async ({ page }) => {
  const ladder = hexGridRowLadderPx();
  const rungHeights = [
    Math.ceil(ladder[0]) + ABOVE_LADDER_MARGIN_PX,
    ...ladder.map((breakpoint) => Math.floor(breakpoint)),
  ];
  for (const height of rungHeights)
    expectHoneycomb(await openPickerAt(page, ABOVE_LADDER_HEIGHT_PX, height));
});
