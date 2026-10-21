import type { Page } from '@playwright/test';
import { NARROW_PHONE_MIN_WIDTH_PX } from '../../web/src/lib/breakpoints.ts';
import { expect, test } from '../fixtures.ts';
import { openDocument } from '../support/app.ts';
import { openSettings } from '../support/group-c.ts';
import { openDrawingScreen } from '../support/drawing.ts';

// What every route of the export promises about itself as a document: its title and link preview,
// whether it locks the screen like a drawing surface or reads like a page, how its masthead names
// the way back to the drawing, and that leaving the drawing for a page and returning loses nothing.

const SITE_ORIGIN = 'https://splotch.art';
const PAGE_ROUTES = [
  ['/beta', 'Beta'],
  ['/changelog', 'Changelog'],
  ['/design', 'Design'],
  ['/feedback', 'Feedback'],
  ['/privacy', 'Privacy'],
] as const;
// The routes with a committed 1200×630 card of their own; the rest share the home page's image.
const OWN_CARD_ROUTES = ['/beta', '/changelog', '/feedback', '/privacy'];
// A second stroke, below the first one the drawing is given before it leaves.
const LATER_STROKE = [
  { x: 0.3, y: 0.8 },
  { x: 0.7, y: 0.85 },
];
const PNG_WIDTH_OFFSET = 16;
const PNG_HEIGHT_OFFSET = 20;
const MASTHEAD_WIDTHS_PX = [320, 360, 375, NARROW_PHONE_MIN_WIDTH_PX];
// One attempt of a retried step, short enough that the retry loop gets several.
const RETRY_STEP_MS = 1_000;

const metaContent = (page: Page, name: string, attribute = 'property') =>
  page.locator(`meta[${attribute}="${name}"]`).getAttribute('content');

const bodySurface = (page: Page) =>
  page.locator('body').evaluate((element) => {
    const style = getComputedStyle(element);
    return { touchAction: style.touchAction, userSelect: style.userSelect };
  });

// The masthead's first link names the way back to the drawing.
const backLink = (page: Page) => page.locator('main').getByRole('link').first();

// Reaches a page the way a parent does from the drawing: through Settings, in the same document.
// The About section is a row on a phone and a section of the wide shell, so it is found by name.
async function openPrivacyFromDrawing(page: Page) {
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: /^About/ }).click();
  await page.getByRole('link', { name: 'Privacy Policy' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();
}

test('the home page renders the drawing paper under its title', async ({ page }) => {
  await openDrawingScreen(page);

  await expect(page).toHaveTitle(/Splotch/);
  await expect(page.getByTestId('drawing-paper')).toBeVisible();
});

test('the viewport meta permits browser zoom', async ({ page }) => {
  await openDocument(page, '/');

  // The drawing surface is zoom-locked element by element, not through the viewport meta, so a
  // parent can still pinch-zoom every page.
  const content = await metaContent(page, 'viewport', 'name');
  expect(content).not.toContain('user-scalable');
  expect(content).not.toContain('maximum-scale');
});

test('the drawing route is an app surface: no zoom, scroll or selection', async ({ page }) => {
  await openDrawingScreen(page);

  expect(await page.locator('html').getAttribute('data-app-surface')).not.toBeNull();
  expect(
    await page.locator('body').evaluate((element) => getComputedStyle(element).overflowY)
  ).toBe('hidden');
  expect(await bodySurface(page)).toEqual({ touchAction: 'none', userSelect: 'none' });
});

test('a standalone page is a normal document: zoomable and selectable', async ({ page }) => {
  for (const route of ['/privacy', '/admin']) {
    await openDocument(page, route);

    expect(await page.locator('html').getAttribute('data-app-surface'), route).toBeNull();
    expect(await bodySurface(page), route).toEqual({ touchAction: 'auto', userSelect: 'auto' });
  }
});

test('leaving the drawing for a page drops the app-surface locks without a reload', async ({
  page,
}) => {
  await openDrawingScreen(page);
  expect((await bodySurface(page)).touchAction).toBe('none');
  await page.evaluate(() => Object.assign(window, { sameDocument: true }));
  const teardownErrors: string[] = [];
  page.on('pageerror', (error) => teardownErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') teardownErrors.push(message.text());
  });

  await openPrivacyFromDrawing(page);

  expect(await page.evaluate(() => 'sameDocument' in window)).toBe(true);
  expect(teardownErrors, 'navigating away must not log teardown errors').toEqual([]);
  expect(await page.locator('html').getAttribute('data-app-surface')).toBeNull();
  expect(await bodySurface(page)).toEqual({ touchAction: 'auto', userSelect: 'auto' });
});

// The standalone pages' back link names the way to the drawing by how the visitor arrived: a cold
// visit is invited to start drawing, a parent who came from the drawing goes back to it.
test('a cold visit keeps the start label across navigation between pages', async ({ page }) => {
  await openDocument(page, '/privacy');
  await expect(backLink(page)).toHaveText('Start drawing');

  const changelog = page
    .getByRole('navigation', { name: 'Splotch pages' })
    .getByRole('link', { name: 'Changelog' });

  // A click before the page has hydrated can land on a link that is about to be replaced.
  await expect(async () => {
    await changelog.click({ timeout: RETRY_STEP_MS });
    await expect(page).toHaveURL(/\/changelog$/, { timeout: RETRY_STEP_MS });
  }).toPass();

  await expect(page.getByRole('heading', { level: 1, name: 'Changelog' })).toBeVisible();
  await expect(backLink(page)).toHaveText('Start drawing');
  await expect(backLink(page)).toHaveAttribute('href', '/');
});

test('a visit from the drawing offers the way back, through a reload', async ({ page }) => {
  await openDrawingScreen(page);
  await openPrivacyFromDrawing(page);
  await expect(backLink(page)).toHaveText('Back to drawing');

  await page.reload();

  await expect(backLink(page)).toHaveText('Back to drawing');
});

// The masthead holds the back link and the brand mark on one row, inside the page, with either label.
for (const width of MASTHEAD_WIDTHS_PX) {
  for (const cameFromDrawing of [false, true]) {
    const label = cameFromDrawing ? 'Back to drawing' : 'Start drawing';
    test(`the masthead fits one row at ${width}px reading "${label}"`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      if (cameFromDrawing) {
        await openDrawingScreen(page);
        await openPrivacyFromDrawing(page);
      } else await openDocument(page, '/privacy');
      await expect(backLink(page)).toHaveText(label);

      const brand = page
        .locator('main')
        .getByRole('link', { name: 'Splotch', exact: true })
        .first();
      // The prerendered masthead wraps its brand mark to a second row at the narrowest widths and
      // hydration settles it beside the link, so the row is read once it has.
      await expect
        .poll(async () => {
          const [backBox, brandBox, mainBox] = await Promise.all([
            backLink(page).boundingBox(),
            brand.boundingBox(),
            page.locator('main').boundingBox(),
          ]);
          if (!backBox || !brandBox || !mainBox) return 'missing';
          if (brandBox.x + brandBox.width > mainBox.x + mainBox.width) return 'brand overflows';
          return backBox.x + backBox.width < brandBox.x ? 'one row' : 'wrapped';
        })
        .toBe('one row');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    });
  }
}

test('the drawing survives leaving for a page and returning, and takes more ink', async ({
  page,
}) => {
  const { pickColor, inkedPixels, drawStroke } = await openDrawingScreen(page);
  await pickColor('Black');
  const stroke = await drawStroke();
  await expect.poll(() => inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);

  await openPrivacyFromDrawing(page);
  await page.goBack();
  // Going back restores the Settings dialog the page was opened from.
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  await settings.getByRole('button', { name: 'Close' }).click();
  await expect(settings).toBeHidden();

  expect(await inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);
  const later = await drawStroke(LATER_STROKE);
  await expect.poll(() => inkedPixels(later)).toBeGreaterThan(later.lengthPx);
});

test('the home page previews itself with an image whose declared size is its real size', async ({
  page,
  request,
}) => {
  await openDocument(page, '/');

  // One title and one description, so a scraper reads neither a default nor a duplicate.
  await expect(page.locator('head title')).toHaveCount(1);
  await expect(page.locator('meta[name="description"]')).toHaveCount(1);
  expect(await page.title()).toBe(await metaContent(page, 'og:title'));
  expect(await metaContent(page, 'og:url')).toBe(`${SITE_ORIGIN}/`);
  expect(await metaContent(page, 'twitter:card', 'name')).toBe('summary_large_image');
  expect(await metaContent(page, 'og:image')).toContain('/large-image.png');
  expect(await metaContent(page, 'twitter:image', 'name')).toContain('/large-image.png');
  const declared = {
    width: Number(await metaContent(page, 'og:image:width')),
    height: Number(await metaContent(page, 'og:image:height')),
  };

  const image = await request.get('/large-image.png');
  expect(image.ok()).toBe(true);
  const png = await image.body();
  expect({
    width: png.readUInt32BE(PNG_WIDTH_OFFSET),
    height: png.readUInt32BE(PNG_HEIGHT_OFFSET),
  }).toEqual(declared);
});

// Every public standalone route unfurls as itself, not as the home page. One card per document: a
// second og:title would hand the scraper the wrong one.
for (const [path, titleWord] of PAGE_ROUTES) {
  test(`${path} carries its own link-preview card`, async ({ page }) => {
    await openDocument(page, path);

    expect(await metaContent(page, 'og:url')).toBe(`${SITE_ORIGIN}${path}`);
    expect(await metaContent(page, 'og:title')).toContain(titleWord);
    expect(await metaContent(page, 'og:description')).toBe(
      await metaContent(page, 'description', 'name')
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
    await expect(page.locator('head title')).toHaveCount(1);
  });
}

for (const path of OWN_CARD_ROUTES) {
  test(`${path} previews its own committed card image`, async ({ page, request }) => {
    await openDocument(page, path);
    const image = (await metaContent(page, 'og:image')) ?? '';
    expect(new URL(image).pathname).toBe(`/share/${path.slice(1)}.png`);
    expect(await metaContent(page, 'twitter:image', 'name')).toBe(image);
    expect(await metaContent(page, 'og:image:alt')).toBeTruthy();
    expect(await metaContent(page, 'twitter:image:alt', 'name')).toBe(
      await metaContent(page, 'og:image:alt')
    );

    const answer = await request.get(new URL(image).pathname);
    expect(answer.ok()).toBe(true);
    const png = await answer.body();
    expect({
      width: png.readUInt32BE(PNG_WIDTH_OFFSET),
      height: png.readUInt32BE(PNG_HEIGHT_OFFSET),
    }).toEqual({
      width: Number(await metaContent(page, 'og:image:width')),
      height: Number(await metaContent(page, 'og:image:height')),
    });
  });
}
