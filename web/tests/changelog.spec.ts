import { expect, test } from '@playwright/test';

import releases from '../src/lib/releases.json' with { type: 'json' };

test('the changelog renders every release with its notes', async ({ page }) => {
  await page.goto('/changelog');

  const history = page.locator('.release-history');
  await expect(history.locator('.release')).toHaveCount(releases.length);
  for (const release of releases) {
    const article = history.locator(`#${release.id}`);
    await expect(
      article.getByRole('heading', { name: `Version ${release.version}` })
    ).toBeVisible();
    await expect(article.locator('.release-notes li').first()).toBeVisible();
  }
});

test('the changelog table of contents links to every release', async ({ page }) => {
  await page.goto('/changelog');

  const contents = page.getByRole('navigation', { name: 'Changelog contents' });
  await expect(contents.getByRole('link')).toHaveCount(releases.length);
  for (const release of releases) {
    await expect(
      contents.getByRole('link', { name: `Version ${release.version}` })
    ).toHaveAttribute('href', `#${release.id}`);
  }
});

test('the complete changelog is present in prerendered HTML', async ({ request }) => {
  const response = await request.get('/changelog');
  expect(response.ok()).toBeTruthy();
  const html = await response.text();

  for (const release of releases) {
    expect(html).toContain(`id="${release.id}"`);
    expect(html).toContain(`Version ${release.version}`);
  }
});
