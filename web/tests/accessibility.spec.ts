import { expect, test, type Page } from '@playwright/test';

import { openHydratedContents } from './helpers';

// The accessibility statement reuses /privacy's contents rail and disclosure;
// these specs cover the wiring this page owns — that the contents list, the
// section ids, and the section headings are one agreeing list, that the
// scrollspy reports the section being read, that the whole statement is in the
// prerendered document the native builds ship, and that its contact path stays
// inside Splotch. The scan of the page itself lives in a11y.spec.ts.

function renderedSections(page: Page) {
  return page.locator('.sections section').evaluateAll((sections) =>
    sections.map((section) => ({
      id: section.id,
      heading: section.querySelector('h2')?.textContent?.trim() ?? '',
    }))
  );
}

test('the contents rail links every section by its own heading', async ({ page }) => {
  await page.goto('/accessibility');

  // Derived from the sections the page actually renders, not a written list —
  // this is the drift guard for the id/label list the component keeps twice.
  const sections = await renderedSections(page);
  expect(sections.length).toBeGreaterThan(0);

  const contents = page.getByRole('navigation', { name: 'Accessibility statement contents' });
  await expect(contents.getByRole('link')).toHaveCount(sections.length);
  for (const section of sections) {
    await expect(contents.getByRole('link', { name: section.heading })).toHaveAttribute(
      'href',
      `#${section.id}`
    );
  }
});

test('the contents rail marks the section being read', async ({ page }) => {
  await page.goto('/accessibility');

  const sections = await renderedSections(page);
  const contents = page.getByRole('navigation', { name: 'Accessibility statement contents' });

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

  test('the contents row counts the sections at the top and names the one being read', async ({
    page,
  }) => {
    await page.goto('/accessibility');

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
    await page.goto('/accessibility');

    const sections = await renderedSections(page);
    const target = sections[Math.floor(sections.length / 2)];
    const contents = page.locator('.contents-disclosure');

    await openHydratedContents(contents);
    await contents.getByRole('link', { name: target.heading }).click();
    await expect(contents.locator('details')).not.toHaveAttribute('open');

    const gapBelowRow = () =>
      page.evaluate((id) => {
        const row = document.querySelector('.contents-disclosure')!.getBoundingClientRect();
        const section = document.getElementById(id)!.getBoundingClientRect();
        return Math.round(section.top - row.bottom);
      }, target.id);
    await expect.poll(gapBelowRow).toBeLessThanOrEqual(48);
    expect(await gapBelowRow()).toBeGreaterThanOrEqual(0);
    await expect(contents.locator('summary')).toContainText(target.heading);
    await expect(page).toHaveURL(new RegExp(`#${target.id}$`));
  });
});

// The native builds ship this route as a static accessibility.html, so the
// whole statement has to exist in the prerendered document, not arrive with
// hydration.
test('the complete statement is present in prerendered HTML', async ({ page, request }) => {
  await page.goto('/accessibility');
  const sections = await renderedSections(page);
  expect(sections.length).toBeGreaterThan(0);

  const response = await request.get('/accessibility');
  expect(response.ok()).toBeTruthy();
  const html = await response.text();
  for (const section of sections) {
    expect(html).toContain(`id="${section.id}"`);
    expect(html).toContain(section.heading);
  }
});

// The statement's one contact path is the same private feedback form /privacy
// offers, and on the web it stays a relative link inside Splotch.
test('the contact stays inside Splotch and points to the feedback page', async ({ page }) => {
  await page.goto('/accessibility');

  const link = page.getByRole('link', { name: 'private feedback form' });
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute('href', '/feedback');
});
