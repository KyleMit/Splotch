import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { SHORT_PAGE_HEIGHT_PX } from '../../web/src/lib/breakpoints.ts';
import { expect, test } from '../fixtures.ts';
import { openDocument } from '../support/app.ts';

// A phone held sideways has too little height for a standalone page's introduction, so below
// SHORT_PAGE_HEIGHT_PX it folds behind an About this page button and the first field of the
// feedback form comes up into view. What a reader sees is what is measured here, in a real window.

const SHORT_WINDOWS = [
  { width: 812, height: 375 },
  { width: 956, height: 440 },
];
const SHORT_WINDOW = SHORT_WINDOWS[0];
const ROUTES = ['/feedback', '/changelog', '/beta'];
const SCROLLER = 'information-page-scroll';
const SERIOUS_IMPACTS = ['serious', 'critical'];
const PORTRAIT_PHONE = { width: 375, height: 812 };
const NARROW_SHORT_WINDOW = { width: 375, height: 480 };
// One attempt of a retried step, short enough that the retry loop gets several.
const RETRY_STEP_MS = 1_000;

const aboutToggle = (page: Page) => page.getByRole('button', { name: 'About this page' });

async function lede(page: Page): Promise<Locator> {
  const id = await aboutToggle(page).getAttribute('aria-controls');
  if (!id) throw new Error('About this page controls nothing');
  return page.locator(`[id="${id}"]`);
}

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter(({ impact }) => impact && SERIOUS_IMPACTS.includes(impact));
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} feedback`, () => {
    test.use({ colorScheme, hasTouch: true });

    for (const viewport of SHORT_WINDOWS) {
      test(`the complete first field fits at ${viewport.width}×${viewport.height}`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await openDocument(page, '/feedback');
        await expect(aboutToggle(page)).toBeVisible();

        await expect(page.getByRole('radiogroup', { name: 'Report type' })).toBeInViewport({
          ratio: 1,
        });
        await expect(page.getByRole('textbox', { name: 'What went wrong?' })).toBeInViewport({
          ratio: 1,
        });
        expect(await page.getByTestId(SCROLLER).evaluate((node) => node.scrollTop)).toBe(0);
      });
    }

    test('the disclosure stays accessible in both states', async ({ page }) => {
      await page.setViewportSize(SHORT_WINDOW);
      await openDocument(page, '/feedback');
      const trigger = aboutToggle(page);
      await expect(trigger).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);

      await trigger.click();

      await expect(await lede(page)).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });
  });
}

for (const route of ROUTES) {
  for (const hasTouch of [false, true]) {
    test.describe(`${route} with touch ${hasTouch}`, () => {
      test.use({ hasTouch, viewport: SHORT_WINDOW });

      test('the introduction opens, closes and is read again after rotation', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await openDocument(page, route);
        const trigger = aboutToggle(page);
        const hidden = await lede(page);
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
        await expect(hidden).toBeHidden();

        // A key pressed before the page has hydrated reaches a button nothing listens to yet.
        await expect(async () => {
          await trigger.focus();
          await page.keyboard.press('Enter');
          await expect(trigger).toHaveAttribute('aria-expanded', 'true', {
            timeout: RETRY_STEP_MS,
          });
        }).toPass();
        await expect(hidden).toBeVisible();
        await page.keyboard.press('Space');
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
        await expect(hidden).toBeHidden();

        await page.setViewportSize({ width: SHORT_WINDOW.width, height: SHORT_PAGE_HEIGHT_PX + 1 });
        await expect(trigger).toBeHidden();
        await expect(page.getByTestId('information-page-hero').locator('p').first()).toBeVisible();
        await page.setViewportSize({ width: SHORT_WINDOW.width, height: SHORT_PAGE_HEIGHT_PX });
        await expect(trigger).toBeVisible();
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');

        await page.reload();
        await expect(aboutToggle(page)).toHaveAttribute('aria-expanded', 'false');
      });
    });
  }
}

test('portrait keeps its introduction visible with no About this page button', async ({ page }) => {
  await page.setViewportSize(PORTRAIT_PHONE);
  await openDocument(page, '/feedback');

  await expect(aboutToggle(page)).toHaveCount(0);
  await expect(page.getByTestId('information-page-hero').locator('p').first()).toBeVisible();
});

test('a narrow short window keeps the phone reading width', async ({ page }) => {
  await page.setViewportSize(NARROW_SHORT_WINDOW);
  await openDocument(page, '/feedback');
  await expect(aboutToggle(page)).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    NARROW_SHORT_WINDOW.width
  );
});
