import { expect, test, type Page } from '@playwright/test';

import { TRIM_ORDER } from '../src/lib/palette';

// Layer 4 — the color palette trims swatches purely via CSS media queries (no
// JS measurement), so a broken breakpoint only shows up in what's actually
// rendered. These tests pin the trim rules documented in ColorPalette.svelte by
// asserting exactly which swatches survive at each viewport, plus a few visual
// snapshots for appearance regressions. The counts are the point: they are the
// capacity math, and the devices the palette was sized for are called out by
// name so a regression there is legible.

/** The swatches a palette with room for `count` of them keeps: TRIM_ORDER puts
 *  the first swatch to be hidden first, so the survivors are its tail. */
function keptSwatches(count: number): string[] {
  return count === 0 ? [] : [...TRIM_ORDER].slice(-count);
}

/** data-color of every palette swatch (excluding the always-on custom swatch)
 *  that is currently rendered (not display:none). */
async function visibleSwatches(page: Page) {
  return page
    .locator('.color-palette .color-swatch:not(.gradient-swatch)')
    .evaluateAll((els: HTMLElement[]) =>
      els.filter((el) => getComputedStyle(el).display !== 'none').map((el) => el.dataset.color)
    );
}

async function loadAt(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await expect(page.locator('.color-palette')).toBeVisible();
}

async function expectKept(page: Page, count: number) {
  const expected = keptSwatches(count).sort();
  await expect.poll(async () => (await visibleSwatches(page)).sort()).toEqual(expected);
  // The custom (gradient) swatch is never trimmed.
  await expect(page.locator('.color-palette .gradient-swatch')).toBeVisible();
}

interface TrimCase {
  w: number;
  h: number;
  kept: number;
  /** The device this width/height belongs to, when it is one. */
  device?: string;
}

const caseTitle = ({ w, h, kept, device }: TrimCase) =>
  `${device ? `${device} (${w}x${h})` : `${w}x${h}`} keeps ${kept} swatch(es)`;

// ── Portrait: a full-width row that fits one more swatch every 63px, dropping
// them one at a time in TRIM_ORDER priority as the width shrinks. Height fixed
// tall. ─────────────────────────────────────────────────────────────────────
const PORTRAIT: TrimCase[] = [
  { device: 'large iPad Pro portrait', w: 1032, h: 1376, kept: 15 },
  { device: 'iPad mini portrait', w: 744, h: 1133, kept: 10 },
  { device: 'small iPhone portrait', w: 375, h: 812, kept: 4 },
  { w: 600, h: 900, kept: 8 },
  { w: 500, h: 900, kept: 6 },
  { w: 400, h: 900, kept: 5 },
  { w: 350, h: 900, kept: 4 },
  { w: 300, h: 900, kept: 3 },
  { w: 250, h: 900, kept: 2 },
  { w: 180, h: 900, kept: 1 },
  { w: 130, h: 900, kept: 0 },
];

for (const trimCase of PORTRAIT) {
  test(`portrait ${caseTitle(trimCase)}`, async ({ page }) => {
    await loadAt(page, trimCase.w, trimCase.h);
    await expectKept(page, trimCase.kept);
  });
}

// ── Landscape single column: one swatch every 72px of height, trimmed one at a
// time down to the layout switch at 444px. Width fixed wide. ────────────────
const LANDSCAPE_SINGLE_COLUMN: TrimCase[] = [
  { device: 'large iPad Pro landscape', w: 1376, h: 1032, kept: 13 },
  { device: 'iPad mini landscape', w: 1133, h: 744, kept: 9 },
  { w: 1000, h: 850, kept: 10 },
  { w: 1000, h: 700, kept: 8 },
  { w: 1000, h: 620, kept: 7 },
  { w: 1000, h: 550, kept: 6 },
  { w: 1000, h: 480, kept: 5 },
];

for (const trimCase of LANDSCAPE_SINGLE_COLUMN) {
  test(`landscape ${caseTitle(trimCase)}`, async ({ page }) => {
    await loadAt(page, trimCase.w, trimCase.h);
    await expectKept(page, trimCase.kept);
  });
}

// ── Landscape two columns: below the 444px layout switch the palette becomes a
// grid of full rows of two, which fits more swatches than the single column did
// and drops them a pair at a time. ─────────────────────────────────────────
const LANDSCAPE_TWO_COLUMN: TrimCase[] = [
  { device: 'large iPhone landscape', w: 956, h: 440, kept: 9 },
  { device: 'small iPhone landscape', w: 812, h: 375, kept: 9 },
  { w: 1000, h: 350, kept: 7 },
  { w: 1000, h: 250, kept: 5 },
];

for (const trimCase of LANDSCAPE_TWO_COLUMN) {
  test(`short landscape ${caseTitle(trimCase)}`, async ({ page }) => {
    await loadAt(page, trimCase.w, trimCase.h);
    await expectKept(page, trimCase.kept);
  });
}

// ── Visual snapshots — catch appearance regressions (swatch colors, sizing,
// the selection ring, the custom swatch icon) beyond the show/hide logic above.
// NOTE: baselines are platform-specific (Playwright suffixes them with the OS);
// regenerate on the CI platform with `npx playwright test --update-snapshots`.
test.describe('palette appearance', () => {
  test('portrait full row', async ({ page }) => {
    await loadAt(page, 600, 900);
    await expect(page.locator('.color-palette')).toHaveScreenshot('palette-portrait-full.png');
  });

  test('narrow portrait (trimmed)', async ({ page }) => {
    await loadAt(page, 300, 900);
    await expect(page.locator('.color-palette')).toHaveScreenshot('palette-portrait-narrow.png');
  });

  test('tall landscape (core and bonus swatches)', async ({ page }) => {
    await loadAt(page, 1000, 850);
    await expect(page.locator('.color-palette')).toHaveScreenshot('palette-landscape-bonus.png');
  });
});
