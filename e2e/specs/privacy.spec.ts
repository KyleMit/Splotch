import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { openDocument } from '../support/app.ts';

// The privacy policy's contents rail and its section links: that the contents list, the section
// anchors and the section headings are one agreeing list, that the rail reports the section being
// read, and where a picked section lands. The policy's sentences are pinned elsewhere, and a
// browser with JavaScript off reads the whole page in the build's own check.

const SECTION_HEADINGS = [
  'What stays on your device',
  'Making an AI picture',
  'How the counting works',
  'Reporting a picture',
  'Sending feedback',
  'Hosting and downloads',
  "Children's privacy",
  'Changes and contact',
];
const LAST_SECTION = SECTION_HEADINGS[SECTION_HEADINGS.length - 1];
// The page scrolls inside its own scroller rather than the document.
const SCROLLER = 'information-page-scroll';
// The rail pins this far under the top of the window.
const RAIL_PIN_TOP_PX = 24;
const ROW_GAP_MAX_FRACTION = 0.1;
const CONTENTS_NAME = 'Privacy policy contents';
// One attempt of a retried scroll, short enough that the retry loop gets several.
const RETRY_STEP_MS = 1_000;

const scroller = (page: Page) => page.getByTestId(SCROLLER);
const contents = (page: Page) => page.getByRole('navigation', { name: CONTENTS_NAME });
const sectionHeading = (page: Page, name: string) =>
  page.getByRole('heading', { name, level: 3, exact: true });

function scrollTop(page: Page) {
  return scroller(page).evaluate((node) => node.scrollTop);
}

// react-native-web gives its scrollers an RN-style scrollTo, so the position is set directly.
function scrollTo(page: Page, position: 'top' | 'end') {
  return scroller(page).evaluate(
    (node, target) => (node.scrollTop = target === 'end' ? node.scrollHeight : 0),
    position
  );
}

function shareLink(page: Page, heading: string) {
  return page.getByRole('link', { name: `Copy link to “${heading}”`, exact: true });
}

test('the contents rail links every section by its own heading', async ({ page }) => {
  await openDocument(page, '/privacy');
  const links = contents(page).getByRole('link');
  await expect(links).toHaveCount(SECTION_HEADINGS.length);

  const anchors = await page.getByRole('link', { name: /^Copy link to “/ }).evaluateAll((nodes) =>
    nodes.map((node) => ({
      href: node.getAttribute('href'),
      name: node.getAttribute('aria-label'),
    }))
  );
  expect(anchors).toHaveLength(SECTION_HEADINGS.length);
  for (const heading of SECTION_HEADINGS) {
    const anchor = anchors.find(({ name }) => name === `Copy link to “${heading}”`);
    expect(anchor?.href, `${heading} anchor`).toMatch(/^#[a-z-]+$/);
    await expect(links.filter({ hasText: heading })).toHaveAttribute('href', anchor?.href ?? '');
    await expect(sectionHeading(page, heading)).toHaveCount(1);
  }
});

test.describe('section links', () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  });

  test('copying one keeps the reading position and navigation history', async ({ page }) => {
    await openDocument(page, '/feedback');
    await page.getByRole('link', { name: 'privacy policy', exact: true }).click();
    const heading = SECTION_HEADINGS[0];
    const anchor = shareLink(page, heading);
    await anchor.scrollIntoViewIfNeeded();
    await anchor.hover();
    const read = () =>
      page.evaluate(() => ({ historyLength: history.length, state: history.state }));
    const before = { ...(await read()), scroll: await scrollTop(page) };

    await anchor.click();

    await expect(page.getByRole('status')).toHaveText(`Link to “${heading}” copied.`);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
      /^https:\/\/splotch\.art\/privacy#on-device$/
    );
    expect({ ...(await read()), scroll: await scrollTop(page) }).toEqual(before);
    await expect(page).toHaveURL(/\/privacy#on-device$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/feedback$/);
  });
});

for (const clipboard of ['missing', 'rejected'] as const) {
  test(`section links fall back to fragment navigation when the clipboard is ${clipboard}`, async ({
    page,
  }) => {
    await page.addInitScript((mode) => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value:
          mode === 'missing' ? undefined : { writeText: () => Promise.reject(new Error('Denied')) },
      });
    }, clipboard);
    await openDocument(page, '/privacy');
    const heading = SECTION_HEADINGS[2];
    const anchor = shareLink(page, heading);
    await anchor.hover();

    await anchor.click();

    await expect(page).toHaveURL(/\/privacy#counting$/);
    await expect(page.getByRole('status')).toBeEmpty();
    expect(await scrollTop(page)).toBeGreaterThan(0);
  });
}

test('a rejected recopy navigates to a section already named in the URL', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    });
  });
  await openDocument(page, '/privacy#counting');
  const heading = SECTION_HEADINGS[2];
  const anchor = shareLink(page, heading);
  await anchor.click();
  await expect(page.getByRole('status')).toHaveText(`Link to “${heading}” copied.`);
  await page.evaluate((key) => {
    navigator.clipboard.writeText = () => Promise.reject(new Error('Denied'));
    const node = document.querySelector(`[data-testid="${key}"]`);
    if (node) node.scrollTop = 0;
  }, SCROLLER);
  await expect.poll(() => scrollTop(page)).toBe(0);

  await anchor.dispatchEvent('click', { button: 0 });

  await expect.poll(() => scrollTop(page)).toBeGreaterThan(0);
});

test('the contents rail marks the section being read, and stays pinned through all eight', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openDocument(page, '/privacy');
  const rail = contents(page);
  // Seeded to the first section, so the rail is never blank at the top.
  await expect(rail.getByRole('link', { name: SECTION_HEADINGS[0] })).toHaveAttribute(
    'aria-current',
    'location'
  );

  for (const heading of SECTION_HEADINGS) {
    // The scroll is retried until it holds: hydration swaps the prerendered scroller in and resets
    // a position taken before it.
    await expect(async () => {
      await sectionHeading(page, heading).evaluate((node) => node.scrollIntoView());
      await expect(rail.getByRole('link', { name: heading })).toHaveAttribute(
        'aria-current',
        'location',
        { timeout: RETRY_STEP_MS }
      );
      await expect(rail.locator('[aria-current="location"]')).toHaveCount(1);
      expect(Math.round((await rail.boundingBox())?.y ?? 0)).toBe(RAIL_PIN_TOP_PX);
    }).toPass();
  }
});

test('the last section is active at the end of the scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openDocument(page, '/privacy');

  await expect(async () => {
    await scrollTo(page, 'end');
    await expect(contents(page).getByRole('link', { name: LAST_SECTION })).toHaveAttribute(
      'aria-current',
      'location',
      { timeout: RETRY_STEP_MS }
    );
  }).toPass();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  // The collapsed row is the phone's whole scrollspy: with no rail on screen it is the only thing
  // reporting position, and it answers "what's here" before the reader has entered the details and
  // "where am I" after, so scrolling back to the top returns it to the count.
  test('the contents row counts the sections at the top and names the one being read', async ({
    page,
  }) => {
    await openDocument(page, '/privacy');
    const row = page.getByRole('button', { name: /^Privacy policy contents/ });
    const atTop = `Privacy policy contents, ${SECTION_HEADINGS.length} sections`;
    await expect(row).toHaveAttribute('aria-label', atTop);

    await expect(async () => {
      await scrollTo(page, 'end');
      await expect(row).toHaveAttribute('aria-label', `Privacy policy contents, ${LAST_SECTION}`, {
        timeout: RETRY_STEP_MS,
      });
    }).toPass();

    await scrollTo(page, 'top');
    await expect(row).toHaveAttribute('aria-label', atTop);
  });

  test('picking a section from the contents lands it clear of the pinned row', async ({ page }) => {
    await openDocument(page, '/privacy');
    const target = SECTION_HEADINGS[Math.floor(SECTION_HEADINGS.length / 2)];
    const row = page.getByRole('button', { name: /^Privacy policy contents/ });
    await row.click();
    await expect(row).toHaveAttribute('aria-expanded', 'true');

    const link = contents(page).getByRole('link', { name: target });
    const id = await link.getAttribute('href');
    await link.click();

    await expect(row).toHaveAttribute('aria-expanded', 'false');
    // Bounded on both sides: under the row is a heading parked out of sight, and a screenful below
    // it is the undershoot that jumping while the panel is still in the flow produces.
    const gapBelowRow = () =>
      page.evaluate((name) => {
        const heading = [...document.querySelectorAll('h3')].find(
          (node) => node.textContent === name
        );
        const pinned = document.querySelector('[data-testid="page-contents-disclosure"]');
        if (!heading || !pinned) throw new Error('The heading or the contents row is missing');
        return heading.getBoundingClientRect().top - pinned.getBoundingClientRect().bottom;
      }, target);
    const viewportHeight = page.viewportSize()?.height ?? 0;
    await expect.poll(gapBelowRow).toBeLessThanOrEqual(viewportHeight * ROW_GAP_MAX_FRACTION);
    expect(await gapBelowRow()).toBeGreaterThanOrEqual(0);
    await expect(row).toContainText(target);
    // The narrow pick leaves the same trace the wide rail's anchor does, or the section could not
    // be shared and Back would not undo the jump.
    await expect(page).toHaveURL(new RegExp(`/privacy${id}$`));
  });
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 375, height: 667 },
]) {
  test(`the policy revision date sits above the fold at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openDocument(page, '/privacy');
    const updated = page.getByText('Updated September 28, 2026');

    await expect(updated).toBeInViewport({ ratio: 1 });
    const bounds = await updated.boundingBox();
    const summary = await page.getByRole('heading', { name: 'The short version' }).boundingBox();
    expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThan(summary?.y ?? 0);
  });
}

test('the contact section sends a parent with a question to feedback', async ({ page }) => {
  await openDocument(page, '/privacy#contact');
  await expect(page.getByText('Questions about privacy?')).toBeVisible();
  const link = page.getByRole('link', { name: 'Send us a note', exact: true });
  await expect(link).toHaveAttribute('href', '/feedback');

  // The page scrolls to #contact as it hydrates, moving the link out from under an early click.
  await expect(async () => {
    await link.click({ timeout: RETRY_STEP_MS });
    await expect(page).toHaveURL(/\/feedback$/, { timeout: RETRY_STEP_MS });
  }).toPass();
});
