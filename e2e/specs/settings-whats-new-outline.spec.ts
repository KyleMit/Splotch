import type { Locator } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { openDrawingScreen } from '../support/drawing.ts';
import { openSettings } from '../support/group-c.ts';

// What's New renders under a different heading in each Settings shell: the wide pane's section title
// and the phone drill-in's dialog title. Its release date must sit one level under whichever heads
// it, and the release sections one level under the date, or a screen reader's heading list files
// the date beside "Updates" instead of inside it. A heading at its parent's level skips nothing,
// so no automated heading-order rule can catch that.

const WIDE_WINDOW = { width: 1280, height: 900 };
const PHONE_WINDOW = { width: 460, height: 852 };
const RELEASE_DATE = /^[A-Z][a-z]+ \d{1,2}, \d{4}$/;
const RELEASE_SECTIONS = ['New', 'Improved', 'Fixed'];

function headingLevel(heading: Locator) {
  return heading.evaluate((node) => Number(node.tagName.slice(1)));
}

async function expectReleaseNestedUnder(sectionHeading: Locator, card: Locator) {
  const level = await headingLevel(sectionHeading);
  await expect(card.getByRole('heading', { level: level + 1, name: RELEASE_DATE })).toHaveCount(1);
  for (const name of RELEASE_SECTIONS)
    await expect(card.getByRole('heading', { level: level + 2, name, exact: true })).toHaveCount(1);
  await expect(card.getByRole('heading', { level: level + 2 })).toHaveCount(
    RELEASE_SECTIONS.length
  );
}

test("What's New nests its release date under the wide pane's Updates title", async ({ page }) => {
  await page.setViewportSize(WIDE_WINDOW);
  await openDrawingScreen(page);
  const settings = await openSettings(page);
  const pane = settings.getByRole('region', { name: 'Updates' });

  await expectReleaseNestedUnder(pane.getByRole('heading', { name: 'Updates', exact: true }), pane);
});

test("What's New nests its release date under the phone drill-in's Updates title", async ({
  page,
}) => {
  await page.setViewportSize(PHONE_WINDOW);
  await openDrawingScreen(page);
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: /^What's New/ }).click();
  const section = page.getByRole('dialog', { name: 'Updates' });

  await expectReleaseNestedUnder(
    section.getByRole('heading', { name: 'Updates', exact: true }),
    section
  );
});
