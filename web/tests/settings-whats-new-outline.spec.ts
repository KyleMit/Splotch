import { expect, test, type Locator } from '@playwright/test';

import releases from '../src/lib/releases.json' with { type: 'json' };
import { gotoApp, openHubSection, openSettingsModal } from './helpers';

// What's New renders under a different section heading in each Settings shell:
// the wide pane's title, and the phone drill-in's dialog header. Its release
// date must sit one level under whichever heads it, and the release sections
// one level under the date, or a screen reader's heading list files the date
// beside "Updates" instead of inside it. axe's heading-order rule cannot catch
// that, because a heading at its parent's level skips nothing.

const RELEASE_DATE = releases[0].dateLabel;
const WIDE_VIEWPORT = { width: 1280, height: 900 };
const PHONE_VIEWPORT = { width: 460, height: 852 };

function headingLevel(heading: Locator) {
  return heading.evaluate((el) => Number(el.tagName.slice(1)));
}

async function expectReleaseNestedUnder(sectionHeading: Locator, card: Locator) {
  const level = await headingLevel(sectionHeading);
  await expect(card.getByRole('heading', { level: level + 1, name: RELEASE_DATE })).toBeVisible();
  const releaseSections = card.locator('.release-section-heading');
  await expect(releaseSections).not.toHaveCount(0);
  await expect(releaseSections.first().locator('.release-section-icon')).toBeVisible();
  await expect(releaseSections.first()).toHaveCSS('clip-path', 'none');
  await expect(card.getByRole('heading', { level: level + 2 })).toHaveCount(
    await releaseSections.count()
  );
}

test("What's New nests its release date under the wide pane's Updates title", async ({ page }) => {
  await page.setViewportSize(WIDE_VIEWPORT);
  await gotoApp(page);
  const modal = await openSettingsModal(page);
  const pane = modal.locator('.settings-section[data-section="whatsnew"]');

  await expectReleaseNestedUnder(
    pane.getByRole('heading', { name: 'Updates', exact: true }),
    pane.locator('.whats-new')
  );
});

test("What's New nests its release date under the phone drill-in's Updates title", async ({
  page,
}) => {
  await page.setViewportSize(PHONE_VIEWPORT);
  await gotoApp(page);
  const modal = await openSettingsModal(page);
  await openHubSection(page, 'whatsnew', '.whats-new');

  await expectReleaseNestedUnder(
    modal.getByRole('heading', { name: 'Updates', exact: true }),
    modal.locator('.whats-new')
  );
});
