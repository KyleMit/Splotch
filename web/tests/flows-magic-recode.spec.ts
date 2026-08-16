import { expect, test, type Page } from '@playwright/test';

import { draw, gotoApp, openSettingsModal, renderedCanvasHandle } from './helpers';
import {
  applyFarmPage,
  openColoringDialog,
  openDrawer,
  openFarmPageGrid,
  pickBrush,
} from './flows-harness';

const RECODE_SETTLE_MS = 3000;
const MAGIC_STROKE_POINTS = [
  { x: 100, y: 120 },
  { x: 240, y: 260 },
  { x: 400, y: 120 },
  { x: 560, y: 280 },
];

async function opaqueCanvasDigest(page: Page): Promise<{ opaque: number; hash: number }> {
  const canvas = await renderedCanvasHandle(page);
  try {
    return await canvas.evaluate((c) => {
      const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
      let hash = 2_166_136_261;
      let opaque = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] < 200) continue;
        opaque++;
        hash ^= data[index];
        hash = Math.imul(hash, 16_777_619);
        hash ^= data[index + 1];
        hash = Math.imul(hash, 16_777_619);
        hash ^= data[index + 2];
        hash = Math.imul(hash, 16_777_619);
      }
      return { opaque, hash: hash >>> 0 };
    });
  } finally {
    await canvas.dispose();
  }
}

async function prepareMagicDrawing(page: Page) {
  await gotoApp(page);
  await openDrawer(page);
  await applyFarmPage(page);
  await pickBrush(page, '#magicBrushButton');
  await draw(page, MAGIC_STROKE_POINTS);
  await expect
    .poll(async () => (await opaqueCanvasDigest(page)).opaque, { timeout: RECODE_SETTLE_MS })
    .toBeGreaterThan(0);
}

test('changing the coloring page recodes magic ink and undo restores the page and ink', async ({
  page,
}) => {
  await prepareMagicDrawing(page);
  const catDigest = await opaqueCanvasDigest(page);

  await openColoringDialog(page);
  const dialog = page.locator('#coloring-book-dialog');
  const cow = (await openFarmPageGrid(page)).nth(1);
  await cow.click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#coloringOverlay')).toHaveAttribute(
    'src',
    /\/cow-(?:wide|tall)\.overlay\.webp$/
  );
  await expect
    .poll(() => opaqueCanvasDigest(page), { timeout: RECODE_SETTLE_MS })
    .not.toEqual(catDigest);

  await page.locator('#undoButton').click();
  await expect(page.locator('#coloringOverlay')).toHaveAttribute(
    'src',
    /\/cat-(?:wide|tall)\.overlay\.webp$/
  );
  await expect
    .poll(() => opaqueCanvasDigest(page), { timeout: RECODE_SETTLE_MS })
    .toEqual(catDigest);
});

test('changing theme recodes existing magic ink to the themed fill', async ({ page }) => {
  await prepareMagicDrawing(page);
  const lightDigest = await opaqueCanvasDigest(page);

  const settings = await openSettingsModal(page);
  await settings.locator('#themeOption-dark').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#coloringOverlay')).toHaveAttribute('src', /\.dark\.overlay\.webp$/);
  await expect
    .poll(() => opaqueCanvasDigest(page), { timeout: RECODE_SETTLE_MS })
    .not.toEqual(lightDigest);
});
