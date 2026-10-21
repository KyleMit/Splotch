import type { Page } from '@playwright/test';
import releases from '../../web/src/lib/releases.json' with { type: 'json' };
import { expect, test } from '../fixtures.ts';
import { openDocument } from '../support/app.ts';
import { expectWired } from '../support/group-a.ts';

const PHONE = { width: 390, height: 844 };
// The page's scroller sits under the window's centre; a wheel far past its end lands on the oldest
// release, which has nothing below it.
const PAGE_CENTER = { x: 640, y: 360 };
const PAGE_BOTTOM_SCROLL_PX = 100_000;
const OLDER_RELEASES = /^Show \d+ older releases$/;

const newest = releases[0];
const oldest = releases[releases.length - 1];

function contents(page: Page) {
  return page.getByRole('navigation', { name: 'Changelog contents' });
}

function releaseHeading(page: Page, version: string) {
  return page.getByRole('heading', { name: `Version ${version}`, exact: true });
}

// On a phone the contents folds behind one row that names the release being read.
function contentsRow(page: Page) {
  return page.getByRole('button', { name: /^Changelog contents/ });
}

async function showOlderReleases(page: Page) {
  const reveal = page.getByRole('button', { name: OLDER_RELEASES });
  await expectWired(reveal);
  await reveal.click();
  await expect(page.getByRole('button', { name: OLDER_RELEASES })).toBeHidden();
}

test.describe('the changelog', () => {
  test('renders every release with its notes', async ({ page }) => {
    await openDocument(page, '/changelog');
    await showOlderReleases(page);

    for (const release of releases) {
      const heading = releaseHeading(page, release.version);
      await expect(heading).toBeVisible();
      await expect(
        page.locator(`[id="${release.id}"]`).getByRole('listitem').first()
      ).toBeAttached();
    }
    await expect(page.getByRole('heading', { level: 2, name: /^Version / })).toHaveCount(
      releases.length
    );
  });

  test('lists every release in its contents, each linking to its own anchor', async ({ page }) => {
    await openDocument(page, '/changelog');

    await expect(contents(page).getByRole('link')).toHaveCount(releases.length);
    for (const release of releases) {
      await expect(
        contents(page).getByRole('link', { name: `Version ${release.version}` })
      ).toHaveAttribute('href', `#${release.id}`);
    }
  });

  test('marks the release being read in the contents, starting with the newest', async ({
    page,
  }) => {
    await openDocument(page, '/changelog');
    const marked = contents(page).locator('[aria-current="location"]');
    await expect(marked).toHaveCount(1);
    await expect(marked).toHaveAccessibleName(new RegExp(`^Version ${newest.version}`));

    await showOlderReleases(page);
    await page.mouse.move(PAGE_CENTER.x, PAGE_CENTER.y);
    await page.mouse.wheel(0, PAGE_BOTTOM_SCROLL_PX);
    await expect(marked).toHaveAccessibleName(new RegExp(`^Version ${oldest.version}`));
    await expect(marked).toHaveCount(1);
  });

  test('opens the older releases for a link that names one of them', async ({ page }) => {
    await openDocument(page, `/changelog#${oldest.id}`);

    await expect(releaseHeading(page, oldest.version)).toBeInViewport();
    await expect(page.getByRole('button', { name: OLDER_RELEASES })).toBeHidden();
  });
});

test.describe('the changelog on a phone', () => {
  test.use({ viewport: PHONE });

  test('folds the contents behind one row that counts the releases', async ({ page }) => {
    await openDocument(page, '/changelog');

    await expect(contentsRow(page)).toHaveAccessibleName(
      `Changelog contents, ${releases.length} releases`
    );
    await expect(contents(page)).toBeHidden();
    await expect(releaseHeading(page, newest.version)).toBeInViewport();

    await expectWired(contentsRow(page));
    await contentsRow(page).click();
    await expect(contents(page).getByRole('link')).toHaveCount(releases.length);
  });

  test('lands a release picked from the contents clear of the pinned row and names it there', async ({
    page,
  }) => {
    await openDocument(page, '/changelog');
    await expectWired(contentsRow(page));
    await contentsRow(page).click();
    await contents(page)
      .getByRole('link', { name: `Version ${oldest.version}` })
      .click();

    const heading = releaseHeading(page, oldest.version);
    await expect(heading).toBeInViewport();
    await expect(contentsRow(page)).toHaveAccessibleName(
      `Changelog contents, Version ${oldest.version}`
    );
    const [row, landed] = await Promise.all([
      contentsRow(page).boundingBox(),
      heading.boundingBox(),
    ]);
    expect(landed?.y).toBeGreaterThanOrEqual((row?.y ?? Infinity) + (row?.height ?? 0));
  });

  test('parks a release named in the address clear of the pinned row', async ({ page }) => {
    await openDocument(page, `/changelog#${oldest.id}`);

    const heading = releaseHeading(page, oldest.version);
    await expect(heading).toBeInViewport();
    const [row, landed] = await Promise.all([
      contentsRow(page).boundingBox(),
      heading.boundingBox(),
    ]);
    expect(landed?.y).toBeGreaterThanOrEqual((row?.y ?? Infinity) + (row?.height ?? 0));
  });
});
