import { expect, test, type Page } from '@playwright/test';

import { TEST_PALETTE } from './helpers';

// Layer 4 — the color palette trims/reveals swatches purely via CSS media
// queries (no JS measurement), so a broken breakpoint only shows up in what's
// actually rendered. These tests pin the trim rules documented in
// ColorPalette.svelte by asserting exactly which swatches are visible at each
// viewport, plus a few visual snapshots for appearance regressions.

const CORE = [
  TEST_PALETTE.purple,
  TEST_PALETTE.blue,
  TEST_PALETTE.green,
  TEST_PALETTE.yellow,
  TEST_PALETTE.orange,
  TEST_PALETTE.red,
  TEST_PALETTE.black,
];

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

async function expectVisible(page: Page, expected: string[]) {
  await expect.poll(async () => (await visibleSwatches(page)).sort()).toEqual([...expected].sort());
  // The custom (gradient) swatch is never trimmed.
  await expect(page.locator('.color-palette .gradient-swatch')).toBeVisible();
}

// ── Portrait: full-width row, trims one core color at a time as width shrinks,
// in TRIM_ORDER priority (red → orange → green → yellow → blue → purple →
// black). Bonus colors never appear in portrait. Height fixed tall. ──────────
const PORTRAIT = [
  { w: 600, visible: CORE }, // > 515.98 → all 7 core
  {
    w: 500,
    visible: [
      TEST_PALETTE.purple,
      TEST_PALETTE.blue,
      TEST_PALETTE.green,
      TEST_PALETTE.yellow,
      TEST_PALETTE.orange,
      TEST_PALETTE.black,
    ],
  }, // − red
  {
    w: 400,
    visible: [
      TEST_PALETTE.purple,
      TEST_PALETTE.blue,
      TEST_PALETTE.green,
      TEST_PALETTE.yellow,
      TEST_PALETTE.black,
    ],
  }, // − red,orange
  {
    w: 350,
    visible: [TEST_PALETTE.purple, TEST_PALETTE.blue, TEST_PALETTE.yellow, TEST_PALETTE.black],
  }, // − green
  { w: 300, visible: [TEST_PALETTE.purple, TEST_PALETTE.blue, TEST_PALETTE.black] }, // − yellow
  { w: 250, visible: [TEST_PALETTE.purple, TEST_PALETTE.black] }, // − blue
  { w: 180, visible: [TEST_PALETTE.black] }, // − purple
  { w: 130, visible: [] }, // − black (only the custom swatch remains)
];

for (const { w, visible } of PORTRAIT) {
  test(`portrait ${w}px shows ${visible.length} core swatch(es)`, async ({ page }) => {
    await loadAt(page, w, 900);
    await expectVisible(page, visible);
  });
}

// ── Landscape single column: reveals bonus colors as height grows (pink ≥660,
// teal ≥732, brown ≥804) and trims core colors as height shrinks (red ≤587.98,
// orange ≤515.98). Width fixed wide. ────────────────────────────────────────
const LANDSCAPE = [
  {
    h: 850,
    visible: [...CORE, TEST_PALETTE.pink, TEST_PALETTE.teal, TEST_PALETTE.brown],
  }, // all bonus revealed
  { h: 760, visible: [...CORE, TEST_PALETTE.pink, TEST_PALETTE.teal] }, // brown still hidden
  { h: 700, visible: [...CORE, TEST_PALETTE.pink] }, // only pink revealed
  { h: 620, visible: CORE }, // no bonus, no trim
  {
    h: 550,
    visible: [
      TEST_PALETTE.purple,
      TEST_PALETTE.blue,
      TEST_PALETTE.green,
      TEST_PALETTE.yellow,
      TEST_PALETTE.orange,
      TEST_PALETTE.black,
    ],
  }, // − red
  {
    h: 480,
    visible: [
      TEST_PALETTE.purple,
      TEST_PALETTE.blue,
      TEST_PALETTE.green,
      TEST_PALETTE.yellow,
      TEST_PALETTE.black,
    ],
  }, // − red,orange
];

for (const { h, visible } of LANDSCAPE) {
  test(`landscape ${h}px tall shows ${visible.length} swatch(es)`, async ({ page }) => {
    await loadAt(page, 1000, h);
    await expectVisible(page, visible);
  });
}

// Very short landscape falls back to a two-column grid that drops swatches in
// pairs; ≤299.98px tall drops red+orange (ranks 3–4), bonus stays hidden.
test('short landscape (two-column) drops red and orange', async ({ page }) => {
  await loadAt(page, 1000, 250);
  await expectVisible(page, [
    TEST_PALETTE.purple,
    TEST_PALETTE.blue,
    TEST_PALETTE.green,
    TEST_PALETTE.yellow,
    TEST_PALETTE.black,
  ]);
});

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

  test('tall landscape (bonus colors)', async ({ page }) => {
    await loadAt(page, 1000, 850);
    await expect(page.locator('.color-palette')).toHaveScreenshot('palette-landscape-bonus.png');
  });
});
