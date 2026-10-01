import { expect, test } from '@playwright/test';
import releases from '../src/lib/releases.json' with { type: 'json' };

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1280, height: 600 },
  { width: 1280, height: 501 },
  { width: 320, height: 568 },
  { width: 812, height: 375 },
]) {
  test(`final sections remain active at maximum scroll on ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    for (const { route, label, href } of [
      { route: '/changelog', label: 'Changelog contents', href: `#${releases.at(-1)!.id}` },
      { route: '/privacy', label: 'Privacy policy contents', href: '#contact' },
    ]) {
      await page.goto(route);
      await expect(page.locator('.lede-toggle')).toBeAttached();
      await page.evaluate(() => document.fonts.ready);
      await page.locator('.release-older').evaluateAll((folds) => {
        for (const fold of folds) if (fold instanceof HTMLDetailsElement) fold.open = true;
      });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect(
        page.locator(`nav[aria-label="${label}"] a[href="${href}"]`).first()
      ).toHaveAttribute('aria-current', 'location');
      await expect(page.locator('.page-footer')).toBeInViewport();
    }
  });
}

for (const { route, current } of [
  { route: '/privacy', current: 'Privacy' },
  { route: '/changelog', current: 'Changelog' },
  { route: '/feedback', current: 'Send feedback' },
  { route: '/beta', current: null },
]) {
  test(`the ${route} footer identifies its section without linking to itself`, async ({ page }) => {
    await page.goto(route);
    const nav = page.getByRole('navigation', { name: 'Splotch pages' });
    await expect(nav.getByRole('listitem')).toHaveCount(3);
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(current ? 1 : 0);
    await expect(nav.locator('[aria-current="page"]')).toHaveText(current ? [current] : []);
    await expect(nav.getByRole('link', { name: current ?? 'Splotch' })).toHaveCount(0);
  });
}

test('the footer release link scrolls to the newest public release', async ({ page }) => {
  await page.goto('/changelog');
  const footer = page.locator('.page-footer');
  await footer.scrollIntoViewIfNeeded();
  await footer.getByRole('link', { name: "What's new" }).click();
  await expect(page).toHaveURL(new RegExp(`#${releases[0].id}$`));
  await expect(page.locator(`#${releases[0].id}`).getByRole('heading').first()).toBeInViewport();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the ${colorScheme} footer fits a 320px phone with readable links`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/privacy');
    const footer = page.locator('.page-footer');
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeInViewport();
    const width = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(width.content).toBeLessThanOrEqual(width.viewport);
    const nav = footer.getByRole('navigation');
    const rows = await nav
      .locator('li')
      .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top));
    expect(new Set(rows).size).toBe(1);
    const heights = await nav
      .locator('a, [aria-current]')
      .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
    expect(heights.every((height) => height >= 44)).toBe(true);
  });
}

test('forced colors preserve the footer rule and current marker', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/privacy');
  const footer = page.locator('.page-footer');
  await footer.scrollIntoViewIfNeeded();
  await expect(footer.locator('.page-footer-rule .squiggle-rule')).toHaveCSS(
    'border-top-style',
    'solid'
  );
  await expect(footer.locator('.paint-dot')).toHaveCSS('border-top-style', 'solid');
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1280, height: 600 },
  { width: 1280, height: 501 },
  { width: 320, height: 568 },
  { width: 812, height: 375 },
]) {
  test(`the final visible release is active while older history stays folded on ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/changelog');
    await expect(page.locator('.lede-toggle')).toBeAttached();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator('.release-older')).not.toHaveAttribute('open');
    await expect(
      page.locator(`nav[aria-label="Changelog contents"] a[href="#${releases[2].id}"]`).first()
    ).toHaveAttribute('aria-current', 'location');
  });
}
