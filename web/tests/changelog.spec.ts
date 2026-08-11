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

test('the contents rail marks the release being read', async ({ page }) => {
  // The rail has to indicate a reading position, not the last thing clicked —
  // marking a click target is the one thing this treatment is chosen not to do.
  await page.goto('/changelog');

  const contents = page.getByRole('navigation', { name: 'Changelog contents' });
  const railLink = (version: string) => contents.getByRole('link', { name: `Version ${version}` });

  // Seeded to the newest release, so the rail is never blank at the top.
  await expect(railLink(releases[0].version)).toHaveAttribute('aria-current', 'location');

  // The oldest release: nothing below it, so the release the reading line lands
  // in is unambiguous however tall any one release's notes happen to be.
  const oldest = releases[releases.length - 1];
  await page.locator(`#${oldest.id}`).evaluate((article) => article.scrollIntoView());
  await expect(railLink(oldest.version)).toHaveAttribute('aria-current', 'location');
  await expect(contents.locator('[aria-current]')).toHaveCount(1);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the contents collapses behind one row so the newest release clears the fold', async ({
    page,
  }) => {
    await page.goto('/changelog');

    const contents = page.locator('.contents-disclosure');
    // The count is derived from the manifest, never written into the copy.
    await expect(contents.locator('summary')).toContainText(`${releases.length} releases`);
    await expect(
      page.getByRole('heading', { name: `Version ${releases[0].version}` })
    ).toBeInViewport();

    // It is only ever opened deliberately, and then it carries every anchor.
    await contents.locator('summary').click();
    await expect(contents.getByRole('link')).toHaveCount(releases.length);
  });
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
