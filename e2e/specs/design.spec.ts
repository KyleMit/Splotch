import sharp from 'sharp';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { openDocument } from '../support/app.ts';
import { expectWired } from '../support/group-a.ts';

const DESIGN_PATH = '/design';
// A blank stretch of the styleguide's header, clear of its picker and mark.
const BLANK_PAGE_SPOT = { x: 640, y: 20, width: 4, height: 4 };
const DARK_PAGE_MAX_BRIGHTNESS = 96;
const LIGHT_PAGE_MIN_BRIGHTNESS = 200;

function previewTheme(page: Page) {
  return page.getByRole('radiogroup', { name: 'Preview theme' });
}

async function pageBrightness(page: Page): Promise<number> {
  const { data } = await sharp(await page.screenshot({ clip: BLANK_PAGE_SPOT }))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let total = 0;
  for (const channel of data) total += channel;
  return total / data.length;
}

test.describe('the design styleguide', () => {
  test('the preview theme picker exposes its selected option and repaints the page', async ({
    page,
  }) => {
    await openDocument(page, DESIGN_PATH);
    const light = previewTheme(page).getByRole('radio', { name: 'Light' });
    const dark = previewTheme(page).getByRole('radio', { name: 'Dark' });
    await expect(light).toBeChecked();
    await expect.poll(() => pageBrightness(page)).toBeGreaterThan(LIGHT_PAGE_MIN_BRIGHTNESS);

    await expectWired(dark);
    await dark.click();
    await expect(dark).toBeChecked();
    await expect(light).not.toBeChecked();
    await expect.poll(() => pageBrightness(page)).toBeLessThan(DARK_PAGE_MAX_BRIGHTNESS);

    await light.click();
    await expect(light).toBeChecked();
    await expect.poll(() => pageBrightness(page)).toBeGreaterThan(LIGHT_PAGE_MIN_BRIGHTNESS);
  });

  test.describe('on a system that prefers dark', () => {
    test.use({ colorScheme: 'dark' });

    test('opens with Dark selected and paints dark', async ({ page }) => {
      await openDocument(page, DESIGN_PATH);

      await expect(previewTheme(page).getByRole('radio', { name: 'Dark' })).toBeChecked();
      await expect.poll(() => pageBrightness(page)).toBeLessThan(DARK_PAGE_MAX_BRIGHTNESS);
    });
  });

  test('a contents link brings its section into view and the rail marks it', async ({ page }) => {
    await openDocument(page, DESIGN_PATH);
    const rail = page.getByRole('navigation', { name: 'Contents' }).filter({ visible: true });
    const link = rail.getByRole('link', { name: 'Button', exact: true });
    await expectWired(link);
    await link.click();

    await expect(page).toHaveURL(/#button$/);
    await expect(page.locator('section[id="button"]')).toBeInViewport();
    await expect(link).toHaveAttribute('aria-current', 'location');
    await expect(rail.locator('[aria-current="location"]')).toHaveCount(1);
  });

  for (const width of [320, 390]) {
    test(`never scrolls sideways on a ${width}px phone`, async ({ page }) => {
      await page.setViewportSize({ width, height: 740 });
      await openDocument(page, DESIGN_PATH);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Splotch design system' })
      ).toBeVisible();

      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    });
  }
});
