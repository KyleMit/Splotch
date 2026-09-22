import { expect, test, type Page } from '@playwright/test';

import { ANDROID_UA, drawCommittedStroke, gotoApp, openSettingsModal, retryOpen } from './helpers';

declare global {
  interface Window {
    __gateRetired?: Promise<void>;
  }
}

interface BackLayer {
  guard: boolean;
  dialogs: number;
}

function backLayer(page: Page): Promise<BackLayer | null> {
  return page.evaluate(() => {
    function find(value: unknown): BackLayer | null {
      if (value === null || typeof value !== 'object') return null;
      if ('splotchBackNavigation' in value) {
        const marker = value.splotchBackNavigation;
        if (
          marker !== null &&
          typeof marker === 'object' &&
          'guard' in marker &&
          typeof marker.guard === 'boolean' &&
          'dialogs' in marker &&
          typeof marker.dialogs === 'number'
        ) {
          return { guard: marker.guard, dialogs: marker.dialogs };
        }
      }
      for (const nested of Object.values(value)) {
        const marker = find(nested);
        if (marker) return marker;
      }
      return null;
    }

    return find(history.state);
  });
}

async function expectBackLayer(page: Page, expected: BackLayer | null) {
  await expect.poll(() => backLayer(page)).toEqual(expected);
}

async function enterDrawingFromPrivacy(page: Page) {
  await page.goto('/privacy');
  await gotoApp(page);
}

async function drawInk(page: Page) {
  await drawCommittedStroke(page, [
    { x: 90, y: 120 },
    { x: 260, y: 190 },
  ]);
}

test('desktop Back closes the top dialog before navigating normally', async ({ page }) => {
  await enterDrawingFromPrivacy(page);
  const settings = await openSettingsModal(page);
  await expectBackLayer(page, { guard: false, dialogs: 1 });

  await page.goBack();

  await expect(settings).not.toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expectBackLayer(page, null);

  await page.goBack();
  await expect(page).toHaveURL(/\/privacy$/);
});

test('dialog controls remove their entries across repeated open and close cycles', async ({
  page,
}) => {
  await enterDrawingFromPrivacy(page);

  for (let cycle = 0; cycle < 3; cycle++) {
    const settings = await openSettingsModal(page);
    await expectBackLayer(page, { guard: false, dialogs: 1 });
    await settings.getByRole('button', { name: 'Close' }).click();
    await expect(settings).not.toBeVisible();
    await expectBackLayer(page, null);
  }

  await page.goBack();
  await expect(page).toHaveURL(/\/privacy$/);
});

test('native dialog closes remove their entries across repeated open and close cycles', async ({
  page,
}) => {
  await enterDrawingFromPrivacy(page);

  for (let cycle = 0; cycle < 3; cycle++) {
    const settings = await openSettingsModal(page);
    await expectBackLayer(page, { guard: false, dialogs: 1 });
    await page.keyboard.press('Escape');
    await expect(settings).not.toBeVisible();
    await expectBackLayer(page, null);
  }

  await page.goBack();
  await expect(page).toHaveURL(/\/privacy$/);
});

test('Back closes nested dialogs from the top down', async ({ page }) => {
  await page.goto('/privacy');
  await gotoApp(page, '/', { gates: 'always' });
  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'Parent Center' }).click();
  const gate = page.locator('#parentalGate');
  await expect(gate).toBeVisible();
  await expectBackLayer(page, { guard: false, dialogs: 2 });

  // The gate leaves the modal stack on its `close` event, a task after
  // `dialog.open` flips. A Back that lands inside that window is refused as a
  // request racing the retirement (modalDialog's requestDismiss) and re-pushes
  // the entry, so the next Back waits for the event itself, not the flag. The
  // listener is installed, and awaited, before the Back that closes the gate:
  // the event can land before a listener attached in the same breath.
  await gate.evaluate((dialog) => {
    window.__gateRetired = new Promise<void>((resolve) =>
      dialog.addEventListener('close', () => resolve(), { once: true })
    );
  });
  await page.goBack();
  await page.evaluate(() => window.__gateRetired);
  await expect(gate).not.toBeVisible();
  await expect(settings).toBeVisible();
  await expectBackLayer(page, { guard: false, dialogs: 1 });

  await page.goBack();
  await expect(settings).not.toBeVisible();
  await expectBackLayer(page, null);
});

test('refreshing with a dialog open retires its stale history entry', async ({ page }) => {
  await enterDrawingFromPrivacy(page);
  await openSettingsModal(page);
  await expectBackLayer(page, { guard: false, dialogs: 1 });

  await page.reload();

  await expect(page.locator('#drawingCanvas')).toBeVisible();
  await expect(page.locator('#settingsModal')).not.toBeVisible();
  await expectBackLayer(page, null);
  await page.goBack();
  await expect(page).toHaveURL(/\/privacy$/);
});

test('direct privacy entry keeps ordinary browser history', async ({ page }) => {
  await page.goto('/feedback');
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy policy', level: 1 })).toBeVisible();

  await page.goBack();

  await expect(page).toHaveURL(/\/feedback$/);
});

test('in-app navigation restores an open dialog without adding a stray layer', async ({ page }) => {
  await page.goto('/feedback');
  await gotoApp(page);
  const settings = await openSettingsModal(page);
  await retryOpen(page.getByRole('link', { name: 'Privacy Policy' }), () =>
    settings.getByRole('button', { name: 'About' }).click({ timeout: 3000 })
  );
  await page.getByRole('link', { name: 'Privacy Policy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#settingsModal')).toBeVisible();
  await expectBackLayer(page, { guard: false, dialogs: 1 });

  await page.goBack();
  await expect(page.locator('#settingsModal')).not.toBeVisible();
  await expectBackLayer(page, null);
  await page.goBack();
  await expect(page).toHaveURL(/\/feedback$/);
});

test.describe('Android browser Back', () => {
  test.use({
    hasTouch: true,
    userAgent: ANDROID_UA,
    viewport: { width: 412, height: 915 },
  });

  test('closes a dialog, consumes the drawing guard once, then navigates normally', async ({
    page,
  }) => {
    await enterDrawingFromPrivacy(page);
    await drawInk(page);
    await expectBackLayer(page, { guard: true, dialogs: 0 });
    const settings = await openSettingsModal(page);
    await expectBackLayer(page, { guard: true, dialogs: 1 });

    await page.goBack();
    await expect(settings).not.toBeVisible();
    await expectBackLayer(page, { guard: true, dialogs: 0 });

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expectBackLayer(page, null);

    await drawInk(page);
    await expectBackLayer(page, null);
    await page.goBack();
    await expect(page).toHaveURL(/\/privacy$/);
  });
});

test('standalone display mode guards a drawing even with a fine pointer', async ({ page }) => {
  await page.addInitScript(() => {
    const realMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const result = realMatchMedia(query);
      if (query === '(display-mode: standalone)') {
        Object.defineProperty(result, 'matches', { value: true });
      }
      return result;
    };
  });
  await enterDrawingFromPrivacy(page);
  expect(await page.evaluate(() => matchMedia('(display-mode: standalone)').matches)).toBe(true);
  await drawInk(page);
  await expectBackLayer(page, { guard: true, dialogs: 0 });

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expectBackLayer(page, null);

  await page.goBack();
  await expect(page).toHaveURL(/\/privacy$/);
});

test('desktop tabs do not add a drawing guard', async ({ page }) => {
  await enterDrawingFromPrivacy(page);
  await drawInk(page);
  await expectBackLayer(page, null);

  await page.goBack();

  await expect(page).toHaveURL(/\/privacy$/);
});
