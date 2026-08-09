import { expect, test, type Page } from '@playwright/test';

import { gotoApp, openSettingsModal, retryOpen } from './helpers';
import { openBrushMenu, openDrawer, pickBrush } from './flows-harness';
import { STORAGE_KEYS } from '../src/lib/storageKeys';

async function openButtonsSettings(page: Page) {
  await openSettingsModal(page);
  await retryOpen(page.locator('#crayonToggle'), () =>
    page.getByRole('button', { name: 'Buttons' }).click({ timeout: 3000 })
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
  await expect(page.locator('.brush-menu')).toBeHidden();

  await brushButton.click();
  await expectCommittedBrush(page, 'pen');
  await expect(brushButton).toHaveAttribute('aria-pressed', 'false');
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

  await openButtonsSettings(page);
  await page.locator('#magicBrushToggle').click();

  await expectCommittedBrush(page, 'pen');
  await expect(page.locator('.actions-panel')).not.toHaveAttribute('data-brush');
});
