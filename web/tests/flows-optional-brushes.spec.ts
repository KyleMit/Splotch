import { expect, test, type Page } from '@playwright/test';

import { gotoApp, openSettingsModal, retryOpen } from './helpers';
import { openBrushMenu, openDrawer, pickBrush } from './flows-harness';
import { STORAGE_KEYS } from '../src/lib/storageKeys';

async function openToolDrawerSettings(page: Page) {
  await openSettingsModal(page);
  await retryOpen(page.locator('#crayonToggle'), () =>
    page.getByRole('button', { name: 'Tool Drawer' }).click({ timeout: 3000 })
  );
}

async function expectCommittedBrush(page: Page, brush: string) {
  await expect.poll(() => page.evaluate(() => window.__committedBrushMode?.())).toBe(brush);
}

test('one optional brush becomes a direct button that toggles against Pen', async ({ page }) => {
  await page.addInitScript(
    ({ crayon, magic }) => {
      localStorage.setItem(crayon, 'false');
      localStorage.setItem(magic, 'false');
    },
    { crayon: STORAGE_KEYS.crayonEnabled, magic: STORAGE_KEYS.magicBrushEnabled }
  );
  await gotoApp(page);
  await openDrawer(page);

  const brushButton = page.locator('#brushButton');
  await expect(brushButton).toHaveAttribute('aria-label', 'Eraser');
  await expect(brushButton).toHaveAttribute('aria-pressed', 'false');
  await expect(brushButton.locator('[data-brush-face="eraser"]')).toBeVisible();

  await brushButton.click();
  await expectCommittedBrush(page, 'eraser');
  await expect(brushButton).toHaveAttribute('aria-pressed', 'true');
  await expect(brushButton).toHaveClass(/active/);
  await expect(page.locator('.brush-menu')).toBeHidden();

  await brushButton.click();
  await expectCommittedBrush(page, 'pen');
  await expect(brushButton).toHaveAttribute('aria-pressed', 'false');
  await expect(brushButton).not.toHaveClass(/active/);
});

test('the brush flyout contains Pen and only enabled optional brushes', async ({ page }) => {
  await page.addInitScript(({ crayon }) => localStorage.setItem(crayon, 'false'), {
    crayon: STORAGE_KEYS.crayonEnabled,
  });
  await gotoApp(page);
  await openDrawer(page);
  await openBrushMenu(page);

  await expect(page.locator('#penBrushButton')).toBeVisible();
  await expect(page.locator('#magicBrushButton')).toBeVisible();
  await expect(page.locator('#eraserButton')).toBeVisible();
  await expect(page.locator('#crayonBrushButton')).toHaveCount(0);
  await expect(page.locator('#magicBrushButton')).toHaveCSS('animation-delay', '0.065s');
  await expect(page.locator('#eraserButton')).toHaveCSS('animation-delay', '0.09s');
});

test('no optional brushes removes the brush control', async ({ page }) => {
  await page.addInitScript(
    ({ crayon, magic, eraser }) => {
      localStorage.setItem(crayon, 'false');
      localStorage.setItem(magic, 'false');
      localStorage.setItem(eraser, 'false');
    },
    {
      crayon: STORAGE_KEYS.crayonEnabled,
      magic: STORAGE_KEYS.magicBrushEnabled,
      eraser: STORAGE_KEYS.eraserEnabled,
    }
  );
  await gotoApp(page);
  await openDrawer(page);

  await expect(page.locator('#brushButton')).toBeHidden();
  await expect(page.locator('#undoButton')).toBeVisible();
});

test('disabling the active optional brush in Settings returns to Pen', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);
  await pickBrush(page, '#magicBrushButton');
  await expectCommittedBrush(page, 'magic');

  await openToolDrawerSettings(page);
  await page.locator('#magicBrushToggle').click();

  await expectCommittedBrush(page, 'pen');
  await expect(page.locator('.actions-panel')).not.toHaveAttribute('data-brush');
});

test('disabling Eraser hides its Apple Pencil gesture setting', async ({ page }) => {
  await page.addInitScript(
    ({ applePencilSeen }) => {
      localStorage.setItem(applePencilSeen, 'true');
    },
    { applePencilSeen: STORAGE_KEYS.applePencilSeen }
  );
  await gotoApp(page);
  await openToolDrawerSettings(page);

  await expect(page.locator('#pencilEraserToggle')).toBeVisible();
  await page.locator('#eraserToggle').click();
  await expect(page.locator('#pencilEraserToggle')).toHaveCount(0);
});

// Settings can take the menu's brushes away while the menu is open, and a
// keyboard-driven Settings session never sends the panel the outside pointer
// that would otherwise close a flyout. The slot the menu held must be released
// all the same, or the old menu comes back when Settings closes.
test('a brush menu open under a keyboard Settings session does not return once its brushes come back', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  await openBrushMenu(page);
  await expect(page.locator('.brush-menu')).toBeVisible();

  await page.locator('#settingsButton').focus();
  await page.keyboard.press('Enter');
  const modal = page.locator('#settingsModal');
  await expect(modal).toBeVisible();
  await retryOpen(page.locator('#crayonToggle'), async () => {
    await page.getByRole('button', { name: 'Tool Drawer' }).focus();
    await page.keyboard.press('Enter');
  });

  for (const toggle of ['#magicBrushToggle', '#eraserToggle', '#eraserToggle']) {
    await page.locator(toggle).focus();
    await page.keyboard.press('Space');
  }
  await expect(page.locator('#eraserToggle')).toHaveAttribute('aria-pressed', 'true');

  // Escape would also reach the panel's own Escape handler and close the flyout
  // for a different reason; the header's Close button is the keyboard path that
  // only closes Settings.
  await modal.getByRole('button', { name: 'Close' }).first().focus();
  await page.keyboard.press('Enter');
  await expect(modal).toBeHidden();

  await expect(page.locator('.brush-menu')).toBeHidden();
  await expect(page.locator('#penBrushButton')).toBeHidden();
});
