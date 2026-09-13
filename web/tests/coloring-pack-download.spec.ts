import { expect, test, type Page } from '@playwright/test';

import {
  applyFarmPage,
  gotoAppWithAllColoringBooksInstalled,
  gotoAppWithInstalledColoringBook,
  openColoringBookGrid,
  openColoringDialog,
  openDrawer,
  openFarmPageGrid,
} from './flows-harness';
import { drawCommittedStroke, gotoApp, openSettingsModal, settleFlyIn } from './helpers';
import {
  COLORING_PACK_CACHE_FAMILY_PREFIX,
  coloringPackMarkerPath,
} from '../src/lib/coloringPacks/cacheKeys';
import type { ColoringPackManifest } from '../src/lib/coloringPacks/manifest';
import { booksForPlatform, STARTER_COLORING_BOOK_ID } from '../src/lib/state/books';
import { STORAGE_KEYS } from '../src/lib/storageKeys';

const MANIFEST_REQUEST = /\/coloring\/manifest-.+\.json$/;
const WEB_COLORING_BOOK_COUNT = booksForPlatform('web').length;
const PHONE_PORTRAIT_VIEWPORT = { width: 390, height: 844 };

// Proves a negative for longer than scheduleIdle's fallback window, so a
// download that was going to start at idle has had its chance to.
const IDLE_WORK_OBSERVATION_MS = 750;

// Every /coloring/ request path the page makes from now on, the manifest
// included.
function recordColoringRequests(page: Page): string[] {
  const paths: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/coloring/')) paths.push(pathname);
  });
  return paths;
}

// A file of a downloadable book: under /coloring/<book>/ or a responsive tier's
// /coloring/max-<n>px/<book>/, for any book but the precached starter.
function downloadedBookFiles(paths: string[]): string[] {
  return paths.filter((path) => {
    const segments = path.split('/').slice(2);
    const book = segments[0]?.startsWith('max-') ? segments[1] : segments[0];
    return (
      segments.length > 1 && !!book && !book.includes('.') && book !== STARTER_COLORING_BOOK_ID
    );
  });
}

function bookInstalled(page: Page, bookId: string): Promise<boolean> {
  return page.evaluate(
    async ({ prefix, markerPath }) => {
      for (const name of await caches.keys()) {
        if (name.startsWith(prefix) && (await (await caches.open(name)).match(markerPath))) {
          return true;
        }
      }
      return false;
    },
    { prefix: COLORING_PACK_CACHE_FAMILY_PREFIX, markerPath: coloringPackMarkerPath(bookId) }
  );
}

// The install's marker lands a microtask or two before the picker's state
// does; two frames let any re-render that change would cause reach the DOM.
function afterTwoFrames(page: Page) {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
}

async function holdRequests(page: Page, url: RegExp): Promise<() => void> {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(url, async (route) => {
    await held;
    await route.continue();
  });
  return release;
}

async function holdDinosaurDownload(page: Page): Promise<() => void> {
  let releaseDownload!: () => void;
  const downloadHeld = new Promise<void>((resolve) => {
    releaseDownload = resolve;
  });

  await page.route(/\/coloring\/manifest-.+\.json$/, async (route) => {
    const response = await route.fetch();
    const manifest = (await response.json()) as ColoringPackManifest;
    const books = manifest.books
      .filter((book) => book.id === manifest.starterBookId || book.id === 'dinosaur')
      .map((book) => {
        if (book.id !== 'dinosaur') return book;
        return {
          ...book,
          variants: Object.fromEntries(
            Object.entries(book.variants).map(([resolution, variant]) => {
              const files = variant.files.slice(0, 1);
              return [resolution, { ...variant, files, bytes: files[0].bytes }];
            })
          ),
        };
      });
    await route.fulfill({ response, json: { ...manifest, books } });
  });
  await page.route(/\/coloring\/(?:max-\d+px\/)?dinosaur\/.+\.webp$/, async (route) => {
    await downloadHeld;
    await route.continue();
  });

  return releaseDownload;
}

test('a fresh install opens the Farm pages directly before packs arrive', async ({ page }) => {
  await page.route(/\/coloring\/manifest-.+\.json$/, (route) => route.abort());
  await gotoApp(page);
  await openDrawer(page);
  await openColoringDialog(page);

  const dialog = page.locator('#coloring-book-dialog');
  await expect(dialog.getByRole('heading', { name: 'Farm', exact: true })).toBeVisible();
  await expect(dialog.locator('.coloring-books-grid')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Farm coloring book' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /Dinosaur coloring book/i })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Back' })).toHaveCount(0);
  const pages = dialog.getByRole('button', { name: / coloring page$/i });
  await expect(pages).toHaveCount(6);

  await pages.first().click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#coloringOverlay')).toBeVisible();

  await openColoringDialog(page);
  await expect(dialog.getByRole('button', { name: 'Back' })).toHaveCount(0);
  await expect
    .poll(() =>
      dialog
        .locator('.coloring-pages-grid img')
        .first()
        .evaluate((image: HTMLImageElement) => image.naturalWidth)
    )
    .toBeGreaterThan(0);
  await expect(dialog.locator('.coloring-pages-grid > .coloring-tile')).toHaveCount(6);
  await expect(dialog.getByRole('button', { name: 'Clear Page' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Clear active coloring page: Cat' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#coloringOverlay')).toBeHidden();
});

test('removing downloaded books restores single-book page previews', async ({ page }) => {
  await gotoAppWithInstalledColoringBook(page, 'dinosaur');
  await openDrawer(page);
  await openColoringDialog(page);

  const dialog = page.locator('#coloring-book-dialog');
  const pages = await openFarmPageGrid(page);
  await expect
    .poll(() =>
      pages
        .first()
        .locator('img')
        .evaluate((image: HTMLImageElement) => image.naturalWidth)
    )
    .toBeGreaterThan(0);
  await pages.first().click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(() =>
      pages
        .locator('img')
        .evaluateAll((images) =>
          images.every((image) => !image.hasAttribute('src') && !image.hasAttribute('srcset'))
        )
    )
    .toBe(true);

  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'Coloring', exact: true }).click();
  await settings.getByRole('button', { name: 'Remove downloaded pictures' }).click();
  await expect(settings.getByRole('button', { name: 'Remove downloaded pictures' })).toBeDisabled();
  await settings.getByRole('button', { name: 'Close' }).click();

  await openColoringDialog(page);
  await expect(dialog.getByRole('heading', { name: 'Farm', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Back' })).toHaveCount(0);
  await expect
    .poll(() =>
      dialog
        .locator('.coloring-pages-grid img')
        .first()
        .evaluate((image: HTMLImageElement) => image.naturalWidth)
    )
    .toBeGreaterThan(0);
});

test('the Coloring section toggle clears the page but keeps downloaded books', async ({ page }) => {
  await gotoAppWithInstalledColoringBook(page, 'dinosaur');
  await openDrawer(page);
  await openColoringDialog(page);

  const dialog = page.locator('#coloring-book-dialog');
  const pages = await openFarmPageGrid(page);
  await pages.first().click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#coloringOverlay')).toBeVisible();

  const settings = await openSettingsModal(page);
  // The wide shell stacks every section in one scrolling pane, so the table of
  // contents moves the scroll position rather than swapping the pane's content:
  // the toggle is mounted throughout, and "the first card of the first group"
  // has to be read inside the Coloring section rather than across the whole card.
  await settings.getByRole('button', { name: 'Coloring', exact: true }).click();
  const coloring = settings.locator('.settings-section[data-section="coloring"]');
  const toggle = coloring.locator('#coloringBookToggle');
  await expect(
    coloring.locator('.setting-group > .setting').first().locator('#coloringBookToggle')
  ).toBeVisible();
  const removeDownloads = settings.getByRole('button', { name: 'Remove downloaded pictures' });
  await expect(removeDownloads).toBeEnabled();
  await expect(removeDownloads).toBeInViewport();

  await toggle.click();

  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#coloringOverlay')).toBeHidden();
  await expect(page.locator('#coloringBookButton')).toBeHidden();
  await expect(settings.getByRole('button', { name: 'Remove downloaded pictures' })).toBeEnabled();
});

test('a saved disabled setting blocks pack boot until coloring books are enabled', async ({
  page,
}) => {
  let manifestRequests = 0;
  page.on('request', (request) => {
    if (/\/coloring\/manifest-.+\.json$/.test(request.url())) manifestRequests++;
  });
  await gotoAppWithInstalledColoringBook(page, 'dinosaur');
  await page.evaluate(
    (key) => localStorage.setItem(key, 'false'),
    STORAGE_KEYS.coloringBookEnabled
  );
  // Leave the enabled document before counting so its already-scheduled downloader
  // cannot be mistaken for work started by the disabled cold boot.
  await page.goto('about:blank');
  manifestRequests = 0;

  await gotoApp(page);
  await openDrawer(page);

  await expect(page.locator('html')).toHaveAttribute('data-off-coloring', '');
  await expect(page.locator('html')).toHaveCSS('--action-btn-first-paint-count', '4');
  await expect(page.locator('#coloringBookButton')).toBeHidden();

  // This proves a negative over longer than scheduleIdle's fallback window: a
  // slower worker only lengthens the observation and cannot create a false pass.
  await page.waitForTimeout(500);
  expect(manifestRequests).toBe(0);

  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'Coloring', exact: true }).click();
  await expect(
    settings.getByText('Storage details are unavailable while coloring books are off')
  ).toBeVisible();
  await expect(settings.locator('#coloringPacksMeteredToggle')).toBeDisabled();
  await expect(settings.getByRole('button', { name: 'Remove downloaded pictures' })).toBeEnabled();
  await settings.locator('#coloringBookToggle').click();

  await expect(page.locator('#coloringBookButton')).toBeVisible();
  await expect.poll(() => manifestRequests).toBeGreaterThan(0);
});

test('finishing a download keeps the open page grid stable', async ({ page }) => {
  const releaseDinosaurDownload = await holdDinosaurDownload(page);

  try {
    await gotoApp(page);
    await openDrawer(page);
    await openColoringDialog(page);

    const dialog = page.locator('#coloring-book-dialog');
    await (await openFarmPageGrid(page)).first().click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('#coloringOverlay')).toBeVisible();

    await openColoringDialog(page);
    const gridTiles = dialog.locator('.coloring-pages-grid > .coloring-tile');
    await expect(gridTiles).toHaveCount(6);
    const labelsBeforeDownload = await gridTiles.evaluateAll((tiles) =>
      tiles.map((tile) => tile.getAttribute('aria-label'))
    );

    const header = dialog.locator('.coloring-book-header');
    await settleFlyIn(dialog);
    const headerBeforeDownload = await header.boundingBox();

    releaseDinosaurDownload();
    await expect.poll(() => bookInstalled(page, 'dinosaur'), { timeout: 30_000 }).toBe(true);
    await afterTwoFrames(page);
    // No Back button joins the header and pushes the title aside mid-view.
    await expect(dialog.getByRole('heading', { name: 'Farm', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Back' })).toHaveCount(0);
    expect(await header.boundingBox()).toEqual(headerBeforeDownload);
    expect(
      await gridTiles.evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute('aria-label')))
    ).toEqual(labelsBeforeDownload);
  } finally {
    releaseDinosaurDownload();
  }
});

test('a book that finishes downloading while the picker is open joins at the next open', async ({
  page,
}) => {
  const releaseDinosaurDownload = await holdDinosaurDownload(page);

  try {
    await gotoApp(page);
    await openDrawer(page);
    await openColoringDialog(page);

    const dialog = page.locator('#coloring-book-dialog');
    await expect(dialog.getByRole('heading', { name: 'Farm', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Back' })).toHaveCount(0);

    releaseDinosaurDownload();
    await expect.poll(() => bookInstalled(page, 'dinosaur'), { timeout: 30_000 }).toBe(true);
    await afterTwoFrames(page);
    await expect(dialog.getByRole('button', { name: 'Back' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();

    await openColoringDialog(page);
    await expect(dialog.getByRole('heading', { name: 'Coloring Books' })).toBeVisible();
    await expect(dialog.locator('.coloring-books-grid .coloring-book-tile')).toHaveCount(2);
    await expect(dialog.getByRole('button', { name: 'Farm coloring book' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Dinosaurs coloring book' })).toBeVisible();
  } finally {
    releaseDinosaurDownload();
  }
});

// A held press on the header's chip spans books landing: on the book grid a
// cover joining mid-grid would shift the covers after it and grow the centred
// dialog, lifting the header out from under the pointer so the release misses
// the chip. The open picker holds its books, so nothing moves.
test('books landing during a held press move neither the header nor the chip', async ({ page }) => {
  test.setTimeout(90_000);
  // Two cover columns, so the first book to land starts a new row.
  await page.setViewportSize(PHONE_PORTRAIT_VIEWPORT);
  const releaseCreaturesDownload = await holdRequests(
    page,
    /\/coloring\/(?:max-\d+px\/)?creatures\//
  );

  try {
    await gotoAppWithInstalledColoringBook(page, 'dinosaur');
    await openDrawer(page);
    await applyFarmPage(page);
    await openColoringBookGrid(page);

    const dialog = page.locator('#coloring-book-dialog');
    await settleFlyIn(dialog);
    const covers = dialog.locator('.coloring-books-grid > .coloring-tile');
    await expect(covers).toHaveCount(2);
    const header = dialog.locator('.coloring-book-header');
    const chip = dialog.getByRole('button', { name: 'Clear active coloring page: Cat' });
    await chip.hover();
    await page.mouse.down();
    await chip.evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished))
    );
    const [headerWhilePressed, chipWhilePressed, coversWhilePressed] = await Promise.all([
      header.boundingBox(),
      chip.boundingBox(),
      dialog.locator('.coloring-books-grid').boundingBox(),
    ]);

    releaseCreaturesDownload();
    await expect.poll(() => bookInstalled(page, 'creatures'), { timeout: 60_000 }).toBe(true);
    await afterTwoFrames(page);

    expect(await header.boundingBox()).toEqual(headerWhilePressed);
    expect(await chip.boundingBox()).toEqual(chipWhilePressed);
    expect(await dialog.locator('.coloring-books-grid').boundingBox()).toEqual(coversWhilePressed);
    await expect(covers).toHaveCount(2);

    await page.mouse.up();
    await expect(dialog).toBeHidden();
    await expect(page.locator('#coloringOverlay')).toBeHidden();

    await openColoringBookGrid(page);
    await expect(dialog.getByRole('button', { name: 'Creatures coloring book' })).toBeVisible();
  } finally {
    releaseCreaturesDownload();
  }
});

// A returning child can open the picker before the installed-book scan lands
// (issue #936's cold start). That open shows the book list, not the starter
// book's pages, with a slot reserved for every catalog book, and the scan's
// covers fill the slots without moving the header, the starter book's cover, or
// the grid, whichever column count the viewport lays out.
const COLD_START_VIEWPORTS = [
  { name: 'phone portrait', ...PHONE_PORTRAIT_VIEWPORT },
  { name: 'phone landscape', width: 844, height: 390 },
  { name: 'tablet portrait', width: 820, height: 1180 },
  { name: 'tablet landscape', width: 1180, height: 820 },
];
for (const viewport of COLD_START_VIEWPORTS) {
  test(`an open that beats the installed-book scan fills the book list in place (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await coldStartFillsBookListInPlace(page);
  });
}

async function coldStartFillsBookListInPlace(page: Page) {
  await gotoAppWithAllColoringBooksInstalled(page);
  const releaseManifest = await holdRequests(page, MANIFEST_REQUEST);

  try {
    await gotoApp(page);
    await openDrawer(page);
    await openColoringDialog(page);

    const dialog = page.locator('#coloring-book-dialog');
    await expect(dialog.getByRole('heading', { name: 'Coloring Books' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Back' })).toHaveCount(0);
    const covers = dialog.locator('.coloring-books-grid > .coloring-tile');
    await expect(covers).toHaveCount(1);
    await expect(dialog.locator('.coloring-books-grid > .coloring-book-slot')).toHaveCount(
      WEB_COLORING_BOOK_COUNT - 1
    );
    await settleFlyIn(dialog);
    const header = dialog.locator('.coloring-book-header');
    const farm = dialog.getByRole('button', { name: 'Farm coloring book' });
    const grid = dialog.locator('.coloring-books-grid');
    const [headerBeforeScan, farmBeforeScan, gridBeforeScan] = await Promise.all([
      header.boundingBox(),
      farm.boundingBox(),
      grid.boundingBox(),
    ]);

    releaseManifest();
    await expect(covers).toHaveCount(WEB_COLORING_BOOK_COUNT, { timeout: 30_000 });
    await expect(dialog.locator('.coloring-book-slot')).toHaveCount(0);
    await afterTwoFrames(page);
    expect(await header.boundingBox()).toEqual(headerBeforeScan);
    expect(await farm.boundingBox()).toEqual(farmBeforeScan);
    expect(await grid.boundingBox()).toEqual(gridBeforeScan);
  } finally {
    releaseManifest();
  }
}

test('a visit nobody engages with downloads no coloring packs', async ({ page }) => {
  const coloringRequests = recordColoringRequests(page);
  await gotoApp(page);

  // The boot publishes "nothing downloaded" from Cache Storage alone, before any
  // manifest request, so the Coloring section reading it is the positive
  // signal that the gate has already decided.
  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'Coloring', exact: true }).click();
  await expect(
    settings.getByText(new RegExp(`^0 of ${WEB_COLORING_BOOK_COUNT - 1} extra books`))
  ).toBeVisible();
  await page.waitForTimeout(IDLE_WORK_OBSERVATION_MS);

  expect(coloringRequests).toEqual([]);
});

test('the stroke that settles the child in starts the downloads', async ({ page }) => {
  const coloringRequests = recordColoringRequests(page);
  await gotoApp(page);

  // SETTLED_IN_STROKES (lib/state/canvas.svelte.ts) is three; its module runs
  // runes at load, so the count is spelled out here as pwa-registration.spec.ts
  // spells it for the service worker's gate.
  for (const offset of [0, 60]) {
    await drawCommittedStroke(page, [
      { x: 140, y: 140 + offset },
      { x: 280, y: 180 + offset },
    ]);
  }
  await page.waitForTimeout(IDLE_WORK_OBSERVATION_MS);
  expect(downloadedBookFiles(coloringRequests)).toEqual([]);

  await drawCommittedStroke(page, [
    { x: 140, y: 260 },
    { x: 280, y: 300 },
  ]);
  await expect
    .poll(() => downloadedBookFiles(coloringRequests).length, { timeout: 15_000 })
    .toBeGreaterThan(0);
});

test('opening the coloring picker starts the downloads', async ({ page }) => {
  const coloringRequests = recordColoringRequests(page);
  await gotoApp(page);
  await openDrawer(page);
  await page.waitForTimeout(IDLE_WORK_OBSERVATION_MS);
  expect(downloadedBookFiles(coloringRequests)).toEqual([]);

  await openColoringDialog(page);
  await expect
    .poll(() => downloadedBookFiles(coloringRequests).length, { timeout: 15_000 })
    .toBeGreaterThan(0);
});
