import { expect, test } from '@playwright/test';

import releases from '../src/lib/releases.json' with { type: 'json' };

import { openHydratedContents } from './helpers';

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
    await openHydratedContents(contents);
    await expect(contents.getByRole('link')).toHaveCount(releases.length);
  });

  // The collapsed row is the phone's whole scrollspy: with no rail on screen it
  // is the only thing reporting position, and it has to answer "what's here"
  // before the reader has gone anywhere and "where am I" after — symmetrically,
  // so scrolling back to the hero returns it to the count.
  test('the contents row counts the releases at the hero and names the one being read', async ({
    page,
  }) => {
    await page.goto('/changelog');
    const row = page.locator('.contents-disclosure summary');
    await expect(row).toContainText(`${releases.length} releases`);

    // The oldest release, at max scroll: nothing follows it, so it is the one a
    // spy keyed on "has it climbed into the band" can only reach if the page
    // reserves room under it.
    const oldest = releases[releases.length - 1];
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(row).toContainText(`Version ${oldest.version}`);

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(row).toContainText(`${releases.length} releases`);
  });

  // The row is in the flow above every release it links to, so the panel's
  // height has to leave the document before the target's position means
  // anything — jumping while open lands a full panel-height short.
  test('picking a release from the contents lands it clear of the pinned row', async ({ page }) => {
    await page.goto('/changelog');
    const contents = page.locator('.contents-disclosure');

    const target = releases[2];
    const targetLink = contents.getByRole('link', { name: `Version ${target.version}` });
    const targetUrl = new RegExp(`#${target.id}$`);
    await openHydratedContents(contents);
    await targetLink.click();
    await expect(contents.locator('details')).not.toHaveAttribute('open');

    // Bounded on both sides: under the row is a heading parked out of sight,
    // and a screenful below it is the undershoot that measuring the row where
    // it happens to sit — rather than where it comes to rest pinned — produces.
    const gapBelowRow = () =>
      page.evaluate((id) => {
        const row = document.querySelector('.contents-disclosure')!.getBoundingClientRect();
        const release = document.getElementById(id)!.getBoundingClientRect();
        return Math.round(release.top - row.bottom);
      }, target.id);
    await expect.poll(gapBelowRow).toBeLessThanOrEqual(48);
    expect(await gapBelowRow()).toBeGreaterThanOrEqual(0);
    await expect(contents.locator('summary')).toContainText(`Version ${target.version}`);

    // The narrow pick has to leave the same trace the wide rail's anchor does,
    // or the release can't be shared and Back doesn't undo the jump.
    await expect(page).toHaveURL(targetUrl);
  });
});

// The jumps the contents doesn't compute for itself — a deep link, and the
// browser's own hash navigation — ride on scroll-margin-top, which below the
// breakpoint has a pinned row to clear rather than only the rail's offset. Only
// the narrow treatment can occlude a release; the wide rail is a side column.
test.describe('phone deep link', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('parks its release clear of the pinned contents row', async ({ page }) => {
    const target = releases[2];
    await page.goto(`/changelog#${target.id}`);

    await expect
      .poll(() =>
        page.evaluate((id) => {
          const row = document.querySelector('.contents-disclosure')!.getBoundingClientRect();
          const release = document.getElementById(id)!.getBoundingClientRect();
          return Math.round(release.top - row.bottom);
        }, target.id)
      )
      .toBeGreaterThanOrEqual(0);
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
