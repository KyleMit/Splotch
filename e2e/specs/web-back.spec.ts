import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { openDocument } from '../support/app.ts';
import { openDrawingScreen } from '../support/drawing.ts';
import {
  ANDROID_UA,
  armParentCenterGate,
  drawRowStroke,
  expectBackLayers,
  openSettings,
  solveParentGate,
} from '../support/group-c.ts';

// Browser Back on the drawing screen: it closes the top dialog before it leaves the page, a drawing
// is guarded once on a touch or installed device, and a closed dialog leaves no history entry
// behind. The entry marks come from product/browserBack.ts; every case starts one page deeper than
// the drawing screen so a Back that overshoots lands somewhere a spec can name.

const NO_LAYERS = { guard: false, dialogs: 0 };
const ONE_DIALOG = { guard: false, dialogs: 1 };
// Narrower than the wide Settings shell, which swaps it for the phone hub.
const NARROW_WINDOW_WIDTH_PX = 600;

async function enterDrawingFromPrivacy(page: Page) {
  await openDocument(page, '/privacy');
  return openDrawingScreen(page);
}

test.describe('on a desktop browser', () => {
  test('Back closes the top dialog before navigating normally', async ({ page }) => {
    await enterDrawingFromPrivacy(page);
    const settings = await openSettings(page);
    await expectBackLayers(page, ONE_DIALOG);

    await page.goBack();

    await expect(settings).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
    await expectBackLayers(page, NO_LAYERS);

    await page.goBack();
    await expect(page).toHaveURL(/\/privacy$/);
  });

  test('the Close button removes its entry across repeated open and close cycles', async ({
    page,
  }) => {
    await enterDrawingFromPrivacy(page);

    for (let cycle = 0; cycle < 3; cycle++) {
      const settings = await openSettings(page);
      await expectBackLayers(page, ONE_DIALOG);
      await settings.getByRole('button', { name: 'Close' }).click();
      await expect(settings).toBeHidden();
      await expectBackLayers(page, NO_LAYERS);
    }

    await page.goBack();
    await expect(page).toHaveURL(/\/privacy$/);
  });

  test('Escape removes its entry across repeated open and close cycles', async ({ page }) => {
    await enterDrawingFromPrivacy(page);

    for (let cycle = 0; cycle < 3; cycle++) {
      const settings = await openSettings(page);
      await expectBackLayers(page, ONE_DIALOG);
      await page.keyboard.press('Escape');
      await expect(settings).toBeHidden();
      await expectBackLayers(page, NO_LAYERS);
    }

    await page.goBack();
    await expect(page).toHaveURL(/\/privacy$/);
  });

  test('Back closes nested dialogs from the top down', async ({ page }) => {
    await enterDrawingFromPrivacy(page);
    await armParentCenterGate(page);
    const settings = await openSettings(page);
    await settings.getByRole('button', { name: 'Parent Center' }).click();
    const gate = page.getByRole('dialog', { name: 'Grown-Ups Only' });
    await expect(gate).toBeVisible();
    await expectBackLayers(page, { guard: false, dialogs: 2 });

    await page.goBack();

    await expect(gate).toBeHidden();
    await expect(settings).toBeVisible();
    await expectBackLayers(page, ONE_DIALOG);

    await page.goBack();
    await expect(settings).toBeHidden();
    await expectBackLayers(page, NO_LAYERS);
  });

  // Narrowing the window swaps the Settings shell under the open confirmation, which remounts it.
  test('a Settings shell change under an open confirmation leaves one layer per open dialog', async ({
    page,
  }) => {
    await enterDrawingFromPrivacy(page);
    await armParentCenterGate(page);
    const settings = await openSettings(page);
    await settings.getByRole('button', { name: 'Parent Center' }).click();
    await solveParentGate(page);
    await settings
      .getByRole('radiogroup', { name: 'Opening Parent Center parental gate frequency' })
      .getByRole('radio', { name: 'Never' })
      .click();
    const confirm = page.getByRole('dialog', { name: 'Turn off the Parent Center check?' });
    await expect(confirm).toBeVisible();
    await expectBackLayers(page, { guard: false, dialogs: 2 });

    await page.setViewportSize({ width: NARROW_WINDOW_WIDTH_PX, height: 900 });

    await expect(confirm).toBeVisible();
    await expectBackLayers(page, { guard: false, dialogs: 2 });
    await page.goBack();
    await expect(confirm).toBeHidden();
    await expectBackLayers(page, ONE_DIALOG);
    await page.goBack();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden();
    await expectBackLayers(page, NO_LAYERS);
  });

  test('refreshing with a dialog open retires its stale history entry', async ({ page }) => {
    await enterDrawingFromPrivacy(page);
    await openSettings(page);
    await expectBackLayers(page, ONE_DIALOG);

    await page.reload();

    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden();
    await expectBackLayers(page, NO_LAYERS);
    await page.goBack();
    await expect(page).toHaveURL(/\/privacy$/);
  });

  test('a visit to the privacy page keeps ordinary browser history', async ({ page }) => {
    await openDocument(page, '/feedback');
    await openDocument(page, '/privacy');
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();

    await page.goBack();

    await expect(page).toHaveURL(/\/feedback$/);
  });

  test('following a link out of an open dialog restores it on Back without a stray layer', async ({
    page,
  }) => {
    await openDocument(page, '/feedback');
    await openDrawingScreen(page);
    const settings = await openSettings(page);
    await settings.getByRole('button', { name: 'About' }).click();
    await settings.getByRole('link', { name: 'Privacy Policy' }).click();
    await expect(page).toHaveURL(/\/privacy$/);

    await page.goBack();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    await expectBackLayers(page, ONE_DIALOG);

    await page.goBack();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden();
    await expectBackLayers(page, NO_LAYERS);
    await page.goBack();
    await expect(page).toHaveURL(/\/feedback$/);
  });

  test('a desktop tab adds no drawing guard', async ({ page }) => {
    const { paper } = await enterDrawingFromPrivacy(page);
    await drawRowStroke(page, paper, 0);
    await expectBackLayers(page, NO_LAYERS);

    await page.goBack();

    await expect(page).toHaveURL(/\/privacy$/);
  });
});

test.describe('on an Android browser', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    userAgent: ANDROID_UA,
    viewport: { width: 412, height: 915 },
  });

  test('Back closes a dialog, consumes the drawing guard once, then navigates normally', async ({
    page,
  }) => {
    const { paper } = await enterDrawingFromPrivacy(page);
    await drawRowStroke(page, paper, 0);
    await expectBackLayers(page, { guard: true, dialogs: 0 });
    const settings = await openSettings(page);
    await expectBackLayers(page, { guard: true, dialogs: 1 });

    await page.goBack();
    await expect(settings).toBeHidden();
    await expectBackLayers(page, { guard: true, dialogs: 0 });

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expectBackLayers(page, NO_LAYERS);

    await drawRowStroke(page, paper, 1);
    await expectBackLayers(page, NO_LAYERS);
    await page.goBack();
    await expect(page).toHaveURL(/\/privacy$/);
  });
});

test('an installed app guards a drawing even with a fine pointer', async ({ page }) => {
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
  const { paper } = await enterDrawingFromPrivacy(page);
  expect(await page.evaluate(() => matchMedia('(display-mode: standalone)').matches)).toBe(true);
  await drawRowStroke(page, paper, 0);
  await expectBackLayers(page, { guard: true, dialogs: 0 });

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expectBackLayers(page, NO_LAYERS);

  await page.goBack();
  await expect(page).toHaveURL(/\/privacy$/);
});
