import type { Page } from '@playwright/test';
import { TAP_ZONE_DURATION_MS } from '../../src/rsdDrawing/tapZone.ts';
import { expect, test } from '../fixtures.ts';
import {
  blackInkInCentralBand,
  closeDialog,
  goToSettingsSection,
  holdOnline,
  openBookShelf,
  openDrawer,
  openSettings,
  SHELF_TEST_TIMEOUT_MS,
  waitUntilSettled,
} from '../support/group-b.ts';

test.use({ colorScheme: 'light', viewport: { width: 1280, height: 720 } });

// Line art is black on the light paper; a drawn page crosses the central band with far more ink
// than a stroke leaves, and a blank paper leaves none.
const LINE_ART_MIN_PIXELS = 500;
const FARM_PAGE_COUNT = 6;
// A tap that lands soon after a dialog opens is swallowed, so a toddler mashing a button does not
// dismiss or answer what it just opened. A mashing child's second tap lands a couple of tenths of a
// second after the first; the observation then idles past the repeat tap's effect.
const REPEAT_TAP_DELAY_MS = 250;
const TAP_GUARD_OBSERVATION_MS = 300;
// Once the zone has lapsed the same spot answers as any other. The clock is let go and the lapse
// waited out in real time, which a slower machine only lengthens; a press can still fall in a
// quieter guard of the dialog's own while it settles, so it is repeated until it answers.
const LAPSED_TAP_ANSWER_TIMEOUT_MS = 1_000;
const HELD_CLOCK = '__heldClock';

// The guard measures its dead zone with Date.now. The spec holds that clock still and moves it by
// hand, so how long a loaded worker takes between two taps cannot decide whether the second one
// falls inside the zone.
async function installHeldClock(page: Page) {
  await page.evaluate((key) => {
    const realNow = Date.now.bind(Date);
    let held: number | null = null;
    Date.now = () => held ?? realNow();
    Reflect.set(window, key, {
      hold: () => {
        held = realNow();
      },
      advance: (ms: number) => {
        held = (held ?? realNow()) + ms;
      },
      release: () => {
        held = null;
      },
    });
  }, HELD_CLOCK);
}

async function heldClock(page: Page, action: 'hold' | 'advance' | 'release', ms = 0) {
  await page.evaluate(([key, method, by]) => Reflect.get(window, key)[method](by), [
    HELD_CLOCK,
    action,
    ms,
  ] as const);
}

async function openColoringBooks(page: Page) {
  await openDrawer(page);
  await page.getByRole('button', { name: 'Coloring books', exact: true }).click();
}

function statusSaying(page: Page, text: string) {
  return page.getByRole('status').filter({ hasText: text });
}

test.describe('coloring books', () => {
  test.beforeEach(async ({ drawingScreen }) => {
    await holdOnline(drawingScreen.page);
  });

  test('a first visit opens the Farm book, and a page picked from it lands on the paper', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    expect(await blackInkInCentralBand(page)).toBe(0);

    await openColoringBooks(page);
    const farm = page.getByRole('dialog', { name: 'Farm' });
    await expect(farm.getByRole('button', { name: /coloring page$/ })).toHaveCount(FARM_PAGE_COUNT);
    await farm.getByRole('button', { name: 'Cat coloring page', exact: true }).click();

    await expect(farm).toBeHidden();
    await expect(statusSaying(page, 'Cat ready.')).toBeVisible();
    await expect.poll(() => blackInkInCentralBand(page)).toBeGreaterThan(LINE_ART_MIN_PIXELS);
  });

  test('the next visit lists the books, and another book offers its own pages', async ({
    drawingScreen,
  }) => {
    test.setTimeout(SHELF_TEST_TIMEOUT_MS);
    const { page } = drawingScreen;
    const books = await openBookShelf(page);
    await expect(books.getByRole('button', { name: 'Farm coloring book' })).toBeVisible();
    await books.getByRole('button', { name: 'Dinosaurs coloring book', exact: true }).click();

    const dinosaurs = page.getByRole('dialog', { name: 'Dinosaurs' });
    await dinosaurs.getByRole('button', { name: 'T. Rex coloring page', exact: true }).click();
    await expect(dinosaurs).toBeHidden();
    await expect(statusSaying(page, 'T. Rex ready.')).toBeVisible();
    await expect.poll(() => blackInkInCentralBand(page)).toBeGreaterThan(LINE_ART_MIN_PIXELS);
  });

  test('the active page shows as a chip in the picker, and the chip takes the page off', async ({
    drawingScreen,
  }) => {
    test.setTimeout(SHELF_TEST_TIMEOUT_MS);
    const { page } = drawingScreen;
    await openColoringBooks(page);
    await page
      .getByRole('dialog', { name: 'Farm' })
      .getByRole('button', { name: 'Cat coloring page', exact: true })
      .click();
    await expect.poll(() => blackInkInCentralBand(page)).toBeGreaterThan(LINE_ART_MIN_PIXELS);

    const books = await openBookShelf(page);
    await books.getByRole('button', { name: 'Clear active coloring page: Cat' }).click();

    await expect(books).toBeHidden();
    await expect.poll(() => blackInkInCentralBand(page)).toBe(0);
  });

  test('switching Coloring book off in Settings takes its button out of the drawer', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await openDrawer(page);
    await expect(page.getByRole('button', { name: 'Coloring books', exact: true })).toBeVisible();

    const settings = await openSettings(page);
    await goToSettingsSection(settings, 'Coloring');
    await settings.getByRole('switch', { name: 'Coloring book', exact: true }).click();
    await closeDialog(settings);

    await expect(page.getByRole('button', { name: 'Coloring books', exact: true })).toHaveCount(0);
  });

  test('a repeat tap where the launch button sat does not dismiss the picker just opened', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await installHeldClock(page);
    await openDrawer(page);
    const launcher = page.getByRole('button', { name: 'Coloring books', exact: true });
    const spot = await launcher.boundingBox();
    if (!spot) throw new Error('The Coloring books button is not laid out');
    const [x, y] = [spot.x + spot.width / 2, spot.y + spot.height / 2];

    await heldClock(page, 'hold');
    await launcher.click();
    const farm = page.getByRole('dialog', { name: 'Farm' });
    await expect(farm).toBeVisible();
    await heldClock(page, 'advance', REPEAT_TAP_DELAY_MS);
    await page.mouse.click(x, y);
    await page.waitForTimeout(TAP_GUARD_OBSERVATION_MS);
    await expect(farm).toBeVisible();

    await heldClock(page, 'release');
    await page.waitForTimeout(TAP_ZONE_DURATION_MS);
    await expect(async () => {
      await page.mouse.click(x, y);
      await expect(farm).toBeHidden({ timeout: LAPSED_TAP_ANSWER_TIMEOUT_MS });
    }).toPass();
  });

  test('a repeat tap on a book cover does not pick the page that lands under it', async ({
    drawingScreen,
  }) => {
    test.setTimeout(SHELF_TEST_TIMEOUT_MS);
    const { page } = drawingScreen;
    await installHeldClock(page);
    const books = await openBookShelf(page);
    const cover = books.getByRole('button', { name: 'Farm coloring book', exact: true });
    await waitUntilSettled(cover);
    const spot = await cover.boundingBox();
    if (!spot) throw new Error('The Farm cover is not laid out');
    const [x, y] = [spot.x + spot.width / 2, spot.y + spot.height / 2];

    await heldClock(page, 'hold');
    await page.mouse.click(x, y);
    const farm = page.getByRole('dialog', { name: 'Farm' });
    await expect(farm).toBeVisible();
    await heldClock(page, 'advance', REPEAT_TAP_DELAY_MS);
    await page.mouse.click(x, y);
    await page.waitForTimeout(TAP_GUARD_OBSERVATION_MS);
    await expect(farm).toBeVisible();
    await expect(statusSaying(page, 'Cat ready.')).toBeHidden();

    await heldClock(page, 'release');
    await page.waitForTimeout(TAP_ZONE_DURATION_MS);
    await expect(async () => {
      await page.mouse.click(x, y);
      await expect(farm).toBeHidden({ timeout: LAPSED_TAP_ANSWER_TIMEOUT_MS });
    }).toPass();
    await expect(statusSaying(page, 'Cat ready.')).toBeVisible();
  });
});

// The fade that hints at more pages below the fold, and how far the wheel turns to reach the end.
const SCROLL_CUE_TEST_ID = 'scroll-cue';
const WHEEL_TRAVEL_PX = 3000;
const PHONE_PORTRAIT = { width: 375, height: 812 };
const ROOMY_PORTRAIT = { width: 900, height: 1600 };

// How far the cue's foot sits above the foot of the card that clips the tiles. Zero means the fade
// meets the card's own edge, with no undimmed strip of tile below it.
function scrollCueGapToCardFoot(page: Page) {
  return page.getByTestId(SCROLL_CUE_TEST_ID).evaluate((cue) => {
    let card = cue.parentElement;
    while (card && getComputedStyle(card).overflowY === 'visible') card = card.parentElement;
    if (!card) throw new Error('Nothing clips the picker');
    const clipEdge =
      card.getBoundingClientRect().bottom -
      Number.parseFloat(getComputedStyle(card).borderBottomWidth);
    return clipEdge - cue.getBoundingClientRect().bottom;
  });
}

function scrollCueOpacity(page: Page) {
  return page
    .getByTestId(SCROLL_CUE_TEST_ID)
    .evaluate((cue) => Number(getComputedStyle(cue).opacity));
}

async function wheelOverPicker(page: Page, deltaY: number) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('The window has no size');
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.mouse.wheel(0, deltaY);
}

const SPLIT_SCREEN_HEIGHT_PX = 480;

test.describe("the picker's scroll cue", () => {
  test('the picker stays on screen when only the window height shrinks', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await page.setViewportSize(PHONE_PORTRAIT);
    await openColoringBooks(page);
    const farm = page.getByRole('dialog', { name: 'Farm' });
    await expect(farm).toBeVisible();

    await page.setViewportSize({ width: PHONE_PORTRAIT.width, height: SPLIT_SCREEN_HEIGHT_PX });

    const close = farm.getByRole('button', { name: 'Close', exact: true });
    await expect
      .poll(async () => (await close.boundingBox())?.y ?? Number.NEGATIVE_INFINITY)
      .toBeGreaterThanOrEqual(0);
    await expect
      .poll(async () => {
        const box = await farm.boundingBox();
        return (box?.y ?? 0) + (box?.height ?? Number.POSITIVE_INFINITY);
      })
      .toBeLessThanOrEqual(SPLIT_SCREEN_HEIGHT_PX);
  });

  test('on a phone it fades the cut row, and goes at the bottom and returns at the top', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await page.setViewportSize(PHONE_PORTRAIT);
    await openColoringBooks(page);
    await expect(page.getByRole('dialog', { name: 'Farm' })).toBeVisible();
    await expect.poll(() => scrollCueOpacity(page)).toBe(1);

    await wheelOverPicker(page, WHEEL_TRAVEL_PX);
    await expect.poll(() => scrollCueOpacity(page)).toBe(0);

    await wheelOverPicker(page, -WHEEL_TRAVEL_PX);
    await expect.poll(() => scrollCueOpacity(page)).toBe(1);
  });

  test('the fade runs to the foot of the card, not to a padding above it', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await page.setViewportSize(PHONE_PORTRAIT);
    await openColoringBooks(page);
    const farm = page.getByRole('dialog', { name: 'Farm' });
    await expect(farm).toBeVisible();
    await waitUntilSettled(farm.getByRole('button', { name: 'Close', exact: true }));
    await expect.poll(() => scrollCueOpacity(page)).toBe(1);

    await expect.poll(() => scrollCueGapToCardFoot(page)).toBeCloseTo(0, 0);
  });

  test('a window with room for every page shows no cue', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    await page.setViewportSize(ROOMY_PORTRAIT);
    await openColoringBooks(page);
    await expect(page.getByRole('dialog', { name: 'Farm' })).toBeVisible();

    await expect.poll(() => scrollCueOpacity(page)).toBe(0);
  });
});

// The picker's thumbnails come in a light set and a dark one, drawn in chalk on the dark paper.
const THEMED_ART = [
  {
    scheme: 'light',
    page: /cat-wide\.selector\.[0-9a-f]+\.webp$/,
    cover: /cover\.thumb\.[0-9a-f]+\.webp$/,
  },
  {
    scheme: 'dark',
    page: /cat-wide\.dark\.selector\.[0-9a-f]+\.webp$/,
    cover: /cover\.chalk\.thumb\.[0-9a-f]+\.webp$/,
  },
] as const;

for (const { scheme, page: pageArt, cover: coverArt } of THEMED_ART) {
  test.describe(`the picker's art on a ${scheme} screen`, () => {
    test.use({ colorScheme: scheme });

    test.beforeEach(async ({ drawingScreen }) => {
      await holdOnline(drawingScreen.page);
    });

    test('shows the thumbnails drawn for that theme', async ({ drawingScreen }) => {
      test.setTimeout(SHELF_TEST_TIMEOUT_MS);
      const { page } = drawingScreen;
      await openColoringBooks(page);
      const farm = page.getByRole('dialog', { name: 'Farm' });
      const catThumbnail = farm.getByRole('button', { name: 'Cat coloring page' }).locator('img');
      await expect
        .poll(() => catThumbnail.evaluate((image: HTMLImageElement) => image.currentSrc))
        .toMatch(pageArt);
      await closeDialog(farm);

      const farmCover = (await openBookShelf(page))
        .getByRole('button', { name: 'Farm coloring book', exact: true })
        .locator('img');
      await expect
        .poll(() => farmCover.evaluate((image: HTMLImageElement) => image.currentSrc))
        .toMatch(coverArt);
    });
  });
}
