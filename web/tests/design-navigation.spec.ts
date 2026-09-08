import { expect, test, type Page } from '@playwright/test';
import { primitiveSections } from '../src/lib/components/styleguide/primitiveSections';
import { gotoApp } from './helpers';

async function selectTheme(page: Page, theme: 'Light' | 'Dark') {
  const option = page.locator('header').getByRole('radio', { name: theme, exact: true });
  await expect(async () => {
    await option.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.toLowerCase(), {
      timeout: 500,
    });
  }).toPass();
  await expect(option).toHaveAttribute('aria-checked', 'true');
}

for (const theme of ['Light', 'Dark'] as const) {
  test(`the ${theme} choice persists across reloads and drawing-page visits`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme === 'Light' ? 'dark' : 'light' });
    await page.goto('/design');
    await selectTheme(page, theme);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('splotch-theme')))
      .toBe(theme.toLowerCase());
    await page.reload();
    await expect(
      page.locator('header').getByRole('radio', { name: theme, exact: true })
    ).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.toLowerCase());
    await gotoApp(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.toLowerCase());
    await page.goto('/design');
    await expect(
      page.locator('header').getByRole('radio', { name: theme, exact: true })
    ).toHaveAttribute('aria-checked', 'true');
  });

  test(`settings icons and borderless status banners follow the ${theme} theme`, async ({
    page,
  }) => {
    await page.goto('/design');
    await selectTheme(page, theme);
    const furniture = page.locator('.furniture-demo');
    const expectedInk = await furniture.evaluate((el) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--icon-ink)';
      el.append(probe);
      const ink = getComputedStyle(probe).color;
      probe.remove();
      return ink;
    });
    const icons = furniture.locator('[data-icon]:not(.icon-color) svg');
    expect(await icons.count()).toBeGreaterThan(1);
    for (const icon of await icons.all()) await expect(icon).toHaveCSS('fill', expectedInk);
    const colored = furniture.locator('.icon-color svg');
    await expect(colored).toHaveCount(1);
    await expect(colored).not.toHaveCSS('fill', expectedInk);
    for (const status of ['success', 'error', 'warning']) {
      await expect(page.locator(`.status-demo .${status}`)).toHaveCSS('border-top-width', '0px');
    }
  });
}

test('every primitive has a direct link under its own contents group', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/design');
  await selectTheme(page, 'Light');
  await page.evaluate(() => document.fonts.ready);
  const links = page
    .locator('.toc .toc-group')
    .filter({ hasText: /^Primitives$/ })
    .locator('+ ol')
    .getByRole('link');
  await expect(links).toHaveText(Object.values(primitiveSections).map(({ label }) => label));
  for (const { id } of Object.values(primitiveSections)) {
    await expect(page.locator(`[id="${id}"][data-sg-section]`)).toHaveCount(1);
  }
  await links.getByText('Button', { exact: true }).click();
  await expect(page).toHaveURL(/#button$/);
  await expect(page.locator('.toc [data-section="button"]')).toHaveAttribute(
    'aria-current',
    'location'
  );
  await expect
    .poll(() =>
      page
        .locator('#button')
        .evaluate(
          (el) =>
            el.getBoundingClientRect().top -
            document.querySelector('.site-header')!.getBoundingClientRect().bottom
        )
    )
    .toBeGreaterThanOrEqual(0);
});

test('page scrolling keeps the sidebar entry visible without moving focus or feeding back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto('/design');
  await selectTheme(page, 'Light');
  const focused = page.locator('header').getByRole('radio', { name: 'Light', exact: true });
  await focused.focus();
  for (const section of ['dottie', 'color']) {
    await page.evaluate(
      (id) =>
        window.scrollTo({
          top: id === 'dottie' ? document.documentElement.scrollHeight : 0,
          behavior: 'instant',
        }),
      section
    );
    const current = page.locator(`.toc [data-section="${section}"]`);
    await expect(current).toHaveAttribute('aria-current', 'location');
    await expect
      .poll(() =>
        current.evaluate((row) => {
          const pane = row.closest('.toc')!.getBoundingClientRect();
          const rect = row.getBoundingClientRect();
          return rect.top >= pane.top - 1 && rect.bottom <= pane.bottom + 1;
        })
      )
      .toBe(true);
    await expect(focused).toBeFocused();
    const positions = await page.evaluate(async () => {
      const samples = [];
      const observationFrames = 12;
      for (let frame = 0; frame < observationFrames; frame++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        samples.push(window.scrollY);
      }
      return samples;
    });
    expect(new Set(positions).size).toBe(1);
  }
});
