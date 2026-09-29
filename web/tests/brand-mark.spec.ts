import { expect, test, type Page } from '@playwright/test';

const PHONE = { width: 360, height: 740 };
const DESKTOP = { width: 1280, height: 800 };

async function wordmarkLayout(page: Page) {
  return page.locator('.topbar .wordmark').evaluate((wordmark) => {
    const name = wordmark.querySelector('.name');
    if (!name) throw new Error('BrandMark renders no .name');
    const lineHeight = parseFloat(getComputedStyle(wordmark).lineHeight);
    return {
      lines: Math.round(wordmark.getBoundingClientRect().height / lineHeight),
      nameWidth: name.getBoundingClientRect().width,
    };
  });
}

for (const { path, suffix } of [
  { path: '/beta', suffix: 'beta' },
  { path: '/admin', suffix: 'Admin' },
]) {
  test.describe(`${path} brand mark`, () => {
    test('shows only its suffix on one line beside the back link on a phone', async ({ page }) => {
      await page.setViewportSize(PHONE);
      await page.goto(path);
      await expect(
        page.getByRole('link', { name: `Splotch ${suffix}`, exact: true })
      ).toBeVisible();
      const layout = await wordmarkLayout(page);
      expect(layout.lines).toBe(1);
      expect(layout.nameWidth).toBeLessThanOrEqual(1);
    });

    test('shows the whole mark on a desktop', async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await page.goto(path);
      await expect(
        page.getByRole('link', { name: `Splotch ${suffix}`, exact: true })
      ).toBeVisible();
      const layout = await wordmarkLayout(page);
      expect(layout.lines).toBe(1);
      expect(layout.nameWidth).toBeGreaterThan(1);
    });
  });
}

test('a mark with no suffix keeps its name on a phone', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/changelog');
  await expect(page.getByRole('link', { name: 'Splotch', exact: true })).toBeVisible();
  expect((await wordmarkLayout(page)).nameWidth).toBeGreaterThan(1);
});
