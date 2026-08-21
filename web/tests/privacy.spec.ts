import { expect, test, type Page } from '@playwright/test';

import { openHydratedContents } from './helpers';

// The privacy policy's contents rail and disclosure reuse the changelog's
// treatment; these specs cover the wiring this page owns — that the contents
// list, the section ids, and the section headings are one agreeing list, that
// the scrollspy reports the section being read, and where a picked section
// lands. The policy's *sentences* are pinned elsewhere, by
// tools/mobile/tests/privacy-consistency.test.mjs.

function renderedSections(page: Page) {
  return page.locator('.sections section').evaluateAll((sections) =>
    sections.map((section) => ({
      id: section.id,
      heading: section.querySelector('h3')?.textContent?.trim() ?? '',
    }))
  );
}

test('the contents rail links every section by its own heading', async ({ page }) => {
  await page.goto('/privacy');

  // Derived from the sections the page actually renders, not a written list —
  // this is the drift guard for the id/label list the component keeps twice.
  const sections = await renderedSections(page);
  expect(sections.length).toBeGreaterThan(0);

  const contents = page.getByRole('navigation', { name: 'Privacy policy contents' });
  await expect(contents.getByRole('link')).toHaveCount(sections.length);
  for (const section of sections) {
    await expect(contents.getByRole('link', { name: section.heading })).toHaveAttribute(
      'href',
      `#${section.id}`
    );
  }
});

test('the contents rail marks the section being read', async ({ page }) => {
  // The rail indicates a reading position, not the last thing clicked.
  await page.goto('/privacy');

  const sections = await renderedSections(page);
  const contents = page.getByRole('navigation', { name: 'Privacy policy contents' });

  // Seeded to the first section, so the rail is never blank at the top.
  await expect(contents.getByRole('link', { name: sections[0].heading })).toHaveAttribute(
    'aria-current',
    'location'
  );

  // The last section is reachable only because the page reserves scroll room
  // under it; without the reserve the scroll clamps below the spy line.
  const last = sections[sections.length - 1];
  await page.locator(`#${last.id}`).evaluate((section) => section.scrollIntoView());
  await expect(contents.getByRole('link', { name: last.heading })).toHaveAttribute(
    'aria-current',
    'location'
  );
  await expect(contents.locator('[aria-current]')).toHaveCount(1);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // The collapsed row is the phone's whole scrollspy: with no rail on screen it
  // is the only thing reporting position, and it answers "what's here" before
  // the reader has entered the details and "where am I" after — symmetrically,
  // so scrolling back to the top returns it to the count.
  test('the contents row counts the sections at the top and names the one being read', async ({
    page,
  }) => {
    await page.goto('/privacy');

    const sections = await renderedSections(page);
    const row = page.locator('.contents-disclosure summary');
    await expect(row).toContainText(`${sections.length} sections`);

    const last = sections[sections.length - 1];
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(row).toContainText(last.heading);

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(row).toContainText(`${sections.length} sections`);
  });

  test('picking a section from the contents lands it clear of the pinned row', async ({ page }) => {
    await page.goto('/privacy');

    const sections = await renderedSections(page);
    const target = sections[Math.floor(sections.length / 2)];
    const contents = page.locator('.contents-disclosure');

    await openHydratedContents(contents);
    await contents.getByRole('link', { name: target.heading }).click();
    await expect(contents.locator('details')).not.toHaveAttribute('open');

    // Bounded on both sides: under the row is a heading parked out of sight,
    // and a screenful below it is the undershoot that jumping while the panel
    // is still in the flow produces.
    const gapBelowRow = () =>
      page.evaluate((id) => {
        const row = document.querySelector('.contents-disclosure')!.getBoundingClientRect();
        const section = document.getElementById(id)!.getBoundingClientRect();
        return Math.round(section.top - row.bottom);
      }, target.id);
    await expect.poll(gapBelowRow).toBeLessThanOrEqual(48);
    expect(await gapBelowRow()).toBeGreaterThanOrEqual(0);
    await expect(contents.locator('summary')).toContainText(target.heading);

    // The narrow pick has to leave the same trace the wide rail's anchor does,
    // or the section can't be shared and Back doesn't undo the jump.
    await expect(page).toHaveURL(new RegExp(`#${target.id}$`));
  });
});

// The native builds ship this route as a static privacy.html, so the whole
// policy has to exist in the prerendered document, not arrive with hydration.
test('the complete policy is present in prerendered HTML', async ({ page, request }) => {
  await page.goto('/privacy');
  const sections = await renderedSections(page);
  expect(sections.length).toBeGreaterThan(0);

  const response = await request.get('/privacy');
  expect(response.ok()).toBeTruthy();
  const html = await response.text();
  for (const section of sections) {
    expect(html).toContain(`id="${section.id}"`);
    expect(html).toContain(section.heading);
  }
});
