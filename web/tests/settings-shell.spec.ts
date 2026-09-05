import { expect, test, type Page } from '@playwright/test';

import { gotoApp, openHubSection, openSettingsModal } from './helpers';

test('Settings opens the current shell before pending background prewarming', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await gotoApp(page);
  const modal = await openSettingsModal(page);
  await modal.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(modal).not.toBeVisible();

  // Hold background work to prove foreground demand does not wait for an idle slot.
  await page.evaluate(() => {
    window.requestIdleCallback = () => 0;
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => matchMedia('(orientation: portrait)').matches))
    .toBe(true);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
  await expect(modal).toHaveClass(/compact/);

  await openSettingsModal(page);
  await expect(modal).not.toHaveClass(/compact/);
  await expect(modal.locator('.hub-list')).toBeVisible();

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(modal).toHaveClass(/compact/);
  await expect(modal.locator('#quickNightToggle')).toBeVisible();
});

test('Settings prewarms the closed compact shell without constructing the wide pane', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);
  const modal = await openSettingsModal(page);
  await modal.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(modal).not.toBeVisible();
  const observation = await modal.evaluateHandle((dialog) => {
    const state = { wideMounts: 0 };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (
            node instanceof Element &&
            (node.matches('.settings-nav') || node.querySelector('.settings-nav'))
          ) {
            state.wideMounts += 1;
          }
        }
      }
    });
    observer.observe(dialog, { childList: true, subtree: true });
    return { state, stop: () => observer.disconnect() };
  });

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(modal).toHaveClass(/compact/);
  await expect(modal.locator('#quickNightToggle')).toHaveCount(1);
  await expect(modal).not.toBeVisible();
  expect(
    await observation.evaluate(({ state, stop }) => {
      stop();
      return state;
    })
  ).toEqual({ wideMounts: 0 });
  await observation.dispose();
});

async function beginButtonSizeDrag(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);
  const modal = await openSettingsModal(page);
  await openHubSection(page, 'controls', '#advancedControlsToggle');
  const advanced = page.locator('#advancedControlsToggle');
  if ((await advanced.getAttribute('aria-checked')) === 'false') await advanced.click();
  const slider = page.locator('.button-size-setting .slider');
  await expect(slider).toBeVisible();
  const box = await slider.boundingBox();
  if (!box) throw new Error('Button-size slider has no layout box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(modal).toHaveClass(/resizing/);
  return modal;
}

test('rotating during a button-size drag releases the unmounted preview', async ({ page }) => {
  const modal = await beginButtonSizeDrag(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(modal).toHaveClass(/compact/);
  await page.mouse.up();
  await expect(modal).not.toHaveClass(/resizing/);
  await expect(modal.locator('#quickNightToggle')).toBeVisible();
  await modal.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(modal).not.toBeVisible();
});

test('Escape preserves a live button-size drag until pointer release', async ({ page }) => {
  const modal = await beginButtonSizeDrag(page);
  await page.keyboard.press('Escape');
  await expect(modal).not.toBeVisible();
  await expect(modal).toHaveClass(/resizing/);
  await page.mouse.up();
  await expect(modal).not.toHaveClass(/resizing/);
});
