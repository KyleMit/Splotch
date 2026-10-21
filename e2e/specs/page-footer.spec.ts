import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { openDocument } from '../support/app.ts';

// The footer every standalone page ends with, and the contents beside or above the page: the
// footer names the page it is on without linking to it, its release line reaches the newest
// release, it fits a 320px phone, and at the end of a long page the contents still name the last
// thing there is to read, whichever of its two shapes the window gets.

const SCROLLER = 'information-page-scroll';
// One attempt of a retried step, short enough that the retry loop gets several.
const RETRY_STEP_MS = 1_000;
const TAP_TARGET_PX = 44;
const NEWEST_RELEASE_ID = 'release-1-6-0';
// With the older releases folded the changelog's last release is the third.
const LAST_VISIBLE_RELEASE = 'Version 1.4.0';
const LAST_PRIVACY_SECTION = 'Changes and contact';

// Where the contents is a pinned rail, and where it folds into one row above the page.
const WINDOWS = [
  { width: 1280, height: 800, shape: 'rail' },
  { width: 1280, height: 600, shape: 'rail' },
  { width: 1280, height: 501, shape: 'rail' },
  { width: 320, height: 568, shape: 'row' },
  { width: 812, height: 375, shape: 'row' },
] as const;

const footerNav = (page: Page) => page.getByRole('navigation', { name: 'Splotch pages' });

function scrollToEnd(page: Page) {
  return page.getByTestId(SCROLLER).evaluate((node) => void (node.scrollTop = node.scrollHeight));
}

for (const { route, current } of [
  { route: '/privacy', current: 'Privacy' },
  { route: '/changelog', current: 'Changelog' },
  { route: '/feedback', current: 'Send feedback' },
  { route: '/beta', current: null },
]) {
  test(`the ${route} footer names its page without linking to itself`, async ({ page }) => {
    await openDocument(page, route);
    const nav = footerNav(page);

    await expect(nav.getByRole('listitem')).toHaveCount(3);
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(current ? 1 : 0);
    await expect(nav.locator('[aria-current="page"]')).toHaveText(current ? [current] : []);
    await expect(nav.getByRole('link', { name: current ?? 'Splotch' })).toHaveCount(0);
  });
}

test('the footer release line reaches the newest release', async ({ page }) => {
  await openDocument(page, '/changelog');
  const link = page.getByRole('link', { name: "What's new" });
  await expect(link).toHaveAttribute('href', new RegExp(`#${NEWEST_RELEASE_ID}$`));

  await expect(async () => {
    await scrollToEnd(page);
    await link.click({ timeout: RETRY_STEP_MS });
    await expect(page).toHaveURL(new RegExp(`#${NEWEST_RELEASE_ID}$`), { timeout: RETRY_STEP_MS });
  }).toPass();

  await expect(page.getByRole('heading', { name: /^Version 1\.6\.0/ }).first()).toBeInViewport();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the ${colorScheme} footer fits a 320px phone with full-size links on one row`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 320, height: 568 });
    await openDocument(page, '/privacy');
    await scrollToEnd(page);
    const nav = footerNav(page);
    await expect(nav).toBeInViewport();

    const width = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(width.content).toBeLessThanOrEqual(width.viewport);
    const items = nav.getByRole('listitem');
    const tops = await items.evaluateAll((nodes) =>
      nodes.map((node) => Math.round(node.getBoundingClientRect().top))
    );
    expect(new Set(tops).size).toBe(1);
    // The links themselves, not their list items: a flex row stretches every item to the tallest
    // one, so an item can be full height around a link that is not.
    const heights = await nav
      .locator('a, [aria-current]')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    expect(heights.length).toBeGreaterThan(0);
    expect(heights.every((height) => height >= TAP_TARGET_PX)).toBe(true);
  });
}

for (const { width, height, shape } of WINDOWS) {
  test(`the privacy contents name the last section at the end on ${width}×${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await openDocument(page, '/privacy');

    await expect(async () => {
      await scrollToEnd(page);
      if (shape === 'rail')
        await expect(
          page
            .getByRole('navigation', { name: 'Privacy policy contents' })
            .getByRole('link', { name: LAST_PRIVACY_SECTION })
        ).toHaveAttribute('aria-current', 'location', { timeout: RETRY_STEP_MS });
      else
        await expect(
          page.getByRole('button', { name: /^Privacy policy contents/ })
        ).toHaveAttribute('aria-label', `Privacy policy contents, ${LAST_PRIVACY_SECTION}`, {
          timeout: RETRY_STEP_MS,
        });
    }).toPass();
  });

  test(`the changelog contents name the last visible release at the end on ${width}×${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await openDocument(page, '/changelog');

    await expect(async () => {
      await scrollToEnd(page);
      if (shape === 'rail')
        await expect(
          page
            .getByRole('navigation', { name: 'Changelog contents' })
            .getByRole('link', { name: new RegExp(`^${LAST_VISIBLE_RELEASE}`) })
        ).toHaveAttribute('aria-current', 'location', { timeout: RETRY_STEP_MS });
      else
        await expect(page.getByRole('button', { name: /^Changelog contents/ })).toHaveAttribute(
          'aria-label',
          new RegExp(`${LAST_VISIBLE_RELEASE}`),
          { timeout: RETRY_STEP_MS }
        );
    }).toPass();
    await expect(page.getByRole('button', { name: /^Show \d+ older releases$/ })).toBeVisible();
  });
}
