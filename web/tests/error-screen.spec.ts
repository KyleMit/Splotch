import { expect, test } from '@playwright/test';
import { drawCommittedStroke, firstOpaquePixel, readDrawingHistory } from './helpers';

const ERROR_TITLE = 'Oops! · Splotch';
const DRAWING_RECOVERY_TIMEOUT_MS = 10_000;

test('an unknown route responds with the friendly page and its own head without JavaScript', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  const response = await page.goto('/no-such-page');
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { name: 'This page wandered off', exact: true })
  ).toBeVisible();
  await expect(page.locator('head title')).toHaveCount(1);
  await expect(page).toHaveTitle('Page not found · Splotch');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(0);
  await context.close();
});

test('a missing privacy path keeps all sibling footer links', async ({ page }) => {
  const response = await page.goto('/privacy/missing');
  expect(response?.status()).toBe(404);
  const footer = page.getByRole('navigation', { name: 'Splotch pages' });
  await expect(footer.locator('[aria-current]')).toHaveCount(0);
  await expect(footer.getByRole('link', { name: 'Privacy', exact: true })).toHaveAttribute(
    'href',
    '/privacy'
  );
});

for (const { label, href, heading } of [
  { label: 'Changelog', href: '/changelog', heading: 'Changelog' },
  { label: 'Privacy', href: '/privacy', heading: 'Privacy policy' },
]) {
  test(`the missing page recovers through ${label}`, async ({ page }) => {
    await page.goto('/no-such-page');
    await page.locator('.not-found-links').getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(href);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(0);
  });
}

test('the primary recovery link opens a working drawing', async ({ page }) => {
  await page.goto('/no-such-page');
  await page
    .locator('.not-found-links')
    .getByRole('link', { name: 'Start drawing', exact: true })
    .click();
  await expect(page).toHaveURL('/');
  await expect
    .poll(() => readDrawingHistory(page), { timeout: DRAWING_RECOVERY_TIMEOUT_MS })
    .not.toBeNull();
  await drawCommittedStroke(page, [
    { x: 150, y: 150 },
    { x: 220, y: 190 },
  ]);
  await expect.poll(() => firstOpaquePixel(page)).not.toBeNull();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the ${colorScheme} missing page wraps compact links at 320px`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/no-such-page');
    await page.evaluate(() => document.fonts.ready);
    const links = page.locator('.not-found-links a');
    await expect(links).toHaveCount(3);
    const boxes = await links.evaluateAll((items) =>
      items.map((item) => {
        const { top, width, height } = item.getBoundingClientRect();
        return { top, width, height };
      })
    );
    expect(boxes[0].top).toBeLessThan(boxes[1].top);
    expect(boxes[1].top).toBe(boxes[2].top);
    expect(boxes.every(({ width, height }) => width < 280 && height >= 44)).toBe(true);
    await expect(links.first()).toHaveClass(/brand/);
    await expect(links.nth(1)).toHaveClass(/wash/);
    await expect(links.nth(2)).toHaveClass(/wash/);
    await expect(page.locator('.not-found-mark')).toHaveCSS('width', '80px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
  });
}

test('short screens compact the static decorative mark', async ({ page }) => {
  await page.setViewportSize({ width: 812, height: 375 });
  await page.goto('/no-such-page');
  await expect(page.locator('.lede')).toBeVisible();
  await expect(page.getByRole('button', { name: 'About this page' })).toHaveCount(0);
  const mark = page.locator('.not-found-mark');
  await expect(mark).toHaveCSS('width', '56px');
  await expect(mark).toHaveCSS('height', '56px');
  await expect(mark).toHaveAttribute('aria-hidden', 'true');
  await expect(mark).toHaveCSS('animation-name', 'none');
});

test('a hydration crash caught by the root boundary retitles the tab', async ({ page }) => {
  await page.goto('/dev/crash');
  await expect(page.getByRole('heading', { name: 'Oops!' })).toBeVisible();
  await expect(page.locator('head title')).toHaveCount(1);
  await expect(page).toHaveTitle(ERROR_TITLE);
});

test('standalone page glyphs retain their bounded canonical geometry in both themes and forced colors', async ({
  browser,
  baseURL,
}) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const forcedColors of ['none', 'active'] as const) {
      const context = await browser.newContext({ baseURL, colorScheme, forcedColors });
      const page = await context.newPage();
      await page.goto('/privacy');
      const back = page.locator('.back-icon svg').first();
      await expect(back).toBeVisible();
      expect((await back.boundingBox())?.width).toBe(24);
      expect((await back.boundingBox())?.height).toBe(24);
      await page.goto('/design');
      await page.evaluate(() => document.fonts.ready);
      for (const [selector, size] of [
        ['.external-demo-prose .external-mark-icon', 9],
        ['.external-demo-standalone .external-mark-icon', 12],
      ] as const) {
        const wrapper = page.locator(selector);
        await wrapper.scrollIntoViewIfNeeded();
        await expect(wrapper).toBeVisible();
        const svg = wrapper.locator('svg');
        expect((await svg.boundingBox())?.width).toBe(size);
        expect((await svg.boundingBox())?.height).toBe(size);
        await expect(svg).not.toHaveCSS('fill', 'none');
      }
      await context.close();
    }
  }
});
