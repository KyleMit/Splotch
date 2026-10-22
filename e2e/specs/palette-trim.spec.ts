import type { Page } from '@playwright/test';
import { PALETTE_TRIM_ORDER } from '../../src/drawing/palette.ts';
import { expect, test } from '../fixtures.ts';
import { openDrawingScreen } from '../support/drawing.ts';

// The palette keeps as many swatches as the screen has room for and drops the rest in priority
// order, so a broken fit only shows in what is rendered. The counts below are the capacity math,
// and the devices the palette was sized for are named so a regression there reads plainly.

/** The swatches a palette with room for `count` of them keeps: the tail of the trim order. */
function keptSwatches(count: number): string[] {
  return count === 0 ? [] : PALETTE_TRIM_ORDER.slice(-count);
}

async function visibleSwatches(page: Page) {
  const buttons = page.getByTestId('rsd-palette-paints').getByRole('button');
  return buttons.evaluateAll((swatches) =>
    swatches.map((swatch) => swatch.getAttribute('aria-label') ?? '')
  );
}

type TrimCase = {
  width: number;
  height: number;
  kept: number;
  /** The device this size belongs to, when it is one. */
  device?: string;
};

const caseTitle = ({ width, height, kept, device }: TrimCase) =>
  `${device ? `${device} (${width}x${height})` : `${width}x${height}`} keeps ${kept} swatch(es)`;

async function expectKept(page: Page, { width, height, kept }: TrimCase) {
  await page.setViewportSize({ width, height });
  await openDrawingScreen(page);
  await expect
    .poll(async () => (await visibleSwatches(page)).sort())
    .toEqual(keptSwatches(kept).sort());
  // The custom swatch is never trimmed.
  await expect(page.getByRole('button', { name: 'Custom Color' })).toBeVisible();
}

// Portrait: a full-width row that fits one more swatch every 63px, dropping them one at a time as
// the width shrinks. Height fixed tall.
const PORTRAIT: TrimCase[] = [
  { device: 'large iPad Pro portrait', width: 1032, height: 1376, kept: 15 },
  { device: 'iPad mini portrait', width: 744, height: 1133, kept: 10 },
  { device: 'small iPhone portrait', width: 375, height: 812, kept: 4 },
  { width: 600, height: 900, kept: 8 },
  { width: 500, height: 900, kept: 6 },
  { width: 400, height: 900, kept: 5 },
  { width: 350, height: 900, kept: 4 },
  { width: 300, height: 900, kept: 3 },
  { width: 250, height: 900, kept: 2 },
  { width: 180, height: 900, kept: 1 },
  { width: 130, height: 900, kept: 0 },
];

for (const trimCase of PORTRAIT) {
  test(`portrait ${caseTitle(trimCase)}`, async ({ page }) => {
    await expectKept(page, trimCase);
  });
}

// Landscape: a single column that fits one swatch every 72px of height. Width fixed wide.
const LANDSCAPE: TrimCase[] = [
  { device: 'large iPad Pro landscape', width: 1376, height: 1032, kept: 13 },
  { device: 'iPad mini landscape', width: 1133, height: 744, kept: 9 },
  { width: 1000, height: 850, kept: 10 },
  { width: 1000, height: 700, kept: 8 },
  { width: 1000, height: 620, kept: 7 },
];

for (const trimCase of LANDSCAPE) {
  test(`landscape ${caseTitle(trimCase)}`, async ({ page }) => {
    await expectKept(page, trimCase);
  });
}
