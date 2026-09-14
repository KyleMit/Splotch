import { expect, test } from '@playwright/test';

// The error screen reaches the page two ways: SvelteKit renders +error.svelte
// for a failed load or an unknown route, and the root layout's
// <svelte:boundary> renders the same screen for a crash during render or
// hydration. The tab title has to follow the screen down both paths; the
// template used to carry a default title that masked the second.
const ERROR_TITLE = 'Oops! · Splotch';

test('an unknown route lands on the error page with its own title', async ({ page }) => {
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { name: 'Oops!' })).toBeVisible();
  await expect(page.locator('head title')).toHaveCount(1);
  await expect(page).toHaveTitle(ERROR_TITLE);
});

test('a hydration crash caught by the root boundary retitles the tab', async ({ page }) => {
  await page.goto('/dev/crash');
  await expect(page.getByRole('heading', { name: 'Oops!' })).toBeVisible();
  await expect(page.locator('head title')).toHaveCount(1);
  await expect(page).toHaveTitle(ERROR_TITLE);
});
