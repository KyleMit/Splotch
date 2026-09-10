import { expect, test, type Page } from '@playwright/test';
import { gotoApp, drawCommittedStroke } from './helpers';
import { openDrawer } from './flows-harness';
import { STORAGE_KEYS } from '../src/lib/storageKeys';

async function settleToolbar(page: Page) {
  await page
    .locator('.actions-panel')
    .evaluate((panel) =>
      Promise.all(
        panel
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => undefined))
      )
    );
}

async function swipeColor(page: Page, deltaY: number) {
  const box = await page.locator('#colorButton').boundingBox();
  if (!box) throw new Error('Color button has no bounds');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + deltaY, { steps: 8 });
  await page.mouse.up();
  await settleToolbar(page);
}

for (const height of [328, 412]) {
  test(`L-shaped tools fit a 906 by ${height} phone and leave the canvas full width`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 906, height });
    await gotoApp(page);
    await openDrawer(page);
    await settleToolbar(page);
    await expect(page.locator('.color-palette')).toBeHidden();
    const positions = await page
      .locator(
        '#colorButton, #brushButton, #strokeWidthButton, #coloringBookButton, #screenshotButton, #undoButton'
      )
      .evaluateAll((buttons) =>
        buttons.map((button) => {
          const { x, y, width, height } = button.getBoundingClientRect();
          return { id: button.id, x, y, width, height };
        })
      );
    expect(positions.slice(0, 4).map(({ x, y, width }) => ({ x, y, width }))).toEqual([
      { x: 8, y: height - 230, width: 48 },
      { x: 8, y: height - 172, width: 48 },
      { x: 8, y: height - 114, width: 48 },
      { x: 8, y: height - 56, width: 48 },
    ]);
    expect(positions.slice(4).every(({ x, y }) => x > 8 && y === height - 56)).toBe(true);
    await expect(page.locator('#drawingCanvas')).toHaveCSS('width', '906px');
  });
}

test.describe('phone landscape interactions', () => {
  test.use({ viewport: { width: 906, height: 328 } });

  test('enlarged buttons leave the fullscreen corner clear', async ({ page }) => {
    await page.addInitScript(
      (key) => localStorage.setItem(key, '130'),
      STORAGE_KEYS.actionButtonScale
    );
    await gotoApp(page);
    await openDrawer(page);
    await settleToolbar(page);
    await expect(page.locator('#colorButton')).toHaveCSS('width', '58.5px');
    const color = await page.locator('#colorButton').boundingBox();
    expect(color?.y).toBeGreaterThanOrEqual(56);
  });

  test('draws in the reclaimed left strip and dismisses colors when drawing starts', async ({
    page,
  }) => {
    await gotoApp(page);
    await page.locator('#colorButton').click();
    await drawCommittedStroke(page, [
      { x: 12, y: 24 },
      { x: 30, y: 30 },
      { x: 50, y: 40 },
    ]);
    await expect(page.locator('.color-menu')).toBeHidden();
    await openDrawer(page);
    await expect(page.locator('#screenshotButton')).toBeEnabled();
  });

  test('retains colors when every optional action is disabled', async ({ page }) => {
    await page.addInitScript(
      (keys) => {
        for (const key of keys) localStorage.setItem(key, 'false');
      },
      [
        STORAGE_KEYS.crayonEnabled,
        STORAGE_KEYS.magicBrushEnabled,
        STORAGE_KEYS.eraserEnabled,
        STORAGE_KEYS.strokeWidthControl,
        STORAGE_KEYS.coloringBookEnabled,
        STORAGE_KEYS.screenshotEnabled,
        STORAGE_KEYS.aiImageEnabled,
        STORAGE_KEYS.undoButtonEnabled,
      ]
    );
    await gotoApp(page);
    await expect(page.locator('.drawer-toggle')).toBeHidden();
    await page.locator('#colorButton').click();
    await expect(page.locator('.color-menu')).toBeVisible();
  });

  test('colors select ink, dismiss, and restore keyboard focus', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#colorButton').click();
    const menu = page.getByRole('group', { name: 'Colors', exact: true });
    await expect(menu.getByRole('button')).toHaveCount(12);
    await menu.getByRole('button', { name: 'Red', exact: true }).click();
    await expect(menu).toBeHidden();
    await expect(page.locator('#colorButton')).toBeFocused();
    await expect(page.locator('#colorButton')).toHaveCSS('color', 'rgb(236, 83, 78)');
    await page.locator('#colorButton').press('Enter');
    await expect(menu).toBeVisible();
    await menu.getByRole('button').first().focus();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.locator('#colorButton')).toBeFocused();
  });

  test('flyout owners share one open menu and custom colors open the full picker', async ({
    page,
  }) => {
    await gotoApp(page);
    await openDrawer(page);
    await page.locator('#colorButton').click();
    await page.locator('#strokeWidthButton').click();
    await expect(page.locator('.color-menu')).toBeHidden();
    await expect(page.locator('.stroke-width-menu')).toBeVisible();
    await settleToolbar(page);
    const menuBox = await page.locator('.stroke-width-menu').boundingBox();
    expect(menuBox?.x).toBe(64);
    await page.locator('#colorButton').click();
    await expect(page.locator('.stroke-width-menu')).toBeHidden();
    await page.locator('.color-menu').getByRole('button', { name: 'Custom Color' }).click();
    await expect(page.locator('.color-menu')).toBeHidden();
    await expect(page.locator('dialog[open]')).toBeVisible();
  });

  test('swipes fold and restore without opening colors or drawing beneath the gesture', async ({
    page,
  }) => {
    await gotoApp(page);
    await openDrawer(page);
    await swipeColor(page, 50);
    await expect(page.getByRole('button', { name: 'Expand controls', exact: true })).toBeVisible();
    await expect(page.locator('#brushButton')).toBeHidden();
    await expect(page.locator('.color-menu')).toBeHidden();
    await expect.poll(async () => (await page.locator('#colorButton').boundingBox())?.y).toBe(140);
    await page.locator('#colorButton').click();
    await expect(page.locator('.color-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await swipeColor(page, -50);
    await expect(
      page.getByRole('button', { name: 'Collapse controls', exact: true })
    ).toBeVisible();
    await expect(page.locator('#brushButton')).toBeVisible();
    await expect(page.locator('.color-menu')).toBeHidden();
    await expect(page.locator('#screenshotButton')).toBeDisabled();
  });

  test('rotation restores portrait palette and closes the landscape color flyout', async ({
    page,
  }) => {
    await gotoApp(page);
    await page.locator('#colorButton').click();
    await page.setViewportSize({ width: 412, height: 906 });
    await expect(page.locator('.color-palette')).toBeVisible();
    await expect(page.locator('#colorButton')).toBeHidden();
    await expect(page.locator('.color-menu')).toBeHidden();
  });

  test('color remains available with advanced controls disabled', async ({ page }) => {
    await page.addInitScript(
      (key) => localStorage.setItem(key, 'false'),
      STORAGE_KEYS.advancedControls
    );
    await gotoApp(page);
    await expect(page.locator('.drawer-toggle')).toBeHidden();
    await page.locator('#colorButton').click();
    await expect(page.locator('.color-menu')).toBeVisible();
    await swipeColor(page, -50);
    await expect(page.locator('#brushButton')).toBeHidden();
  });

  test('narrow phones retain full swatch targets and can scroll to custom colors', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 568, height: 320 });
    await gotoApp(page);
    await page.locator('#colorButton').click();
    const menu = page.locator('.color-menu');
    await expect(menu.getByRole('button').first()).toHaveCSS('width', '56px');
    const box = await menu.boundingBox();
    expect(box && box.x + box.width).toBeLessThanOrEqual(560);
    await menu.getByRole('button', { name: 'Custom Color' }).click();
    await expect(page.locator('dialog[open]')).toBeVisible();
  });
});

test('landscape tablets retain the palette and existing toolbar', async ({ page }) => {
  await page.setViewportSize({ width: 1133, height: 744 });
  await gotoApp(page);
  await expect(page.locator('.color-palette')).toBeVisible();
  await expect(page.locator('#colorButton')).toBeHidden();
});
