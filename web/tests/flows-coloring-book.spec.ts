import { expect, test, type Locator } from '@playwright/test';

import { rotateViewportViaCdp } from './cdp';
import { draw, gotoApp, openSettingsModal, settleFlyIn } from './helpers';
import {
  COLORING_IMAGE_SIZES,
  booksForPlatform,
  coloringBookGridLayout,
} from '../src/lib/state/books';

import {
  applyFarmPage,
  gotoAppWithAllColoringBooksInstalled,
  gotoAppWithInstalledColoringBook,
  opaqueCanvasPixelCount,
  openColoringDialog,
  openDrawer,
  openFarmPageGrid,
  pickBrush,
  settleTapGuard,
} from './flows-harness';

// A healthy Magic fill commits well within this window; holding the next overlay for the full
// interval distinguishes no ink from an async paint that is merely late.
const PENDING_FILL_SETTLE_MS = 500;
const WHOLE_PIXEL_TOLERANCE_PX = 1;
const STANDARD_LAPTOP_VIEWPORT_HEIGHT_PX = 800;
const BOOK_GRID_VIEWPORTS = [
  { width: 1200, columns: 4 },
  { width: 700, columns: 3 },
  { width: 500, columns: 2 },
] as const;
const SMALL_VIEWPORT = { width: 320, height: 568 };
const MINIMUM_TOUCH_TARGET_PX = 44;
const MAX_CHIP_CLOSE_GAP_PX = 8;
const WEB_COLORING_BOOK_COUNT = booksForPlatform('web').length;

async function tileGeometry(grid: Locator) {
  return grid.locator(':scope > .coloring-tile').evaluateAll((tiles) =>
    tiles.map((tile) => {
      const { left, top, width, height } = tile.getBoundingClientRect();
      return {
        label: tile.getAttribute('aria-label'),
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(width),
        height: Math.round(height),
      };
    })
  );
}

// ── coloring book overlay ───────────────────────────────────────────────────

test('choosing a coloring page sets the canvas overlay', async ({ page }) => {
  await gotoAppWithInstalledColoringBook(page, 'dinosaur');
  await openDrawer(page);

  await openColoringDialog(page);
  const dialog = page.locator('#coloring-book-dialog');

  // Farm ships on web and mobile; open it and pick its first page.
  const cover = dialog.getByRole('button', { name: 'Farm coloring book' }).locator('img');
  await expect(cover).toHaveAttribute('srcset', /\/coloring\/max-240px\/farm\/cover\.thumb\.webp/);
  await expect(cover).toHaveAttribute('sizes', /px/);
  const pageTiles = await openFarmPageGrid(page);
  await expect(
    dialog.getByRole('button', { name: 'Cat coloring page', exact: true })
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Cow coloring page', exact: true })
  ).toBeVisible();
  const pageImages = dialog.locator('.coloring-pages-grid img');
  const pageThumb = pageTiles.first().locator('img');
  await expect(pageThumb).toHaveAttribute('srcset', /\/coloring\/max-240px\/farm\/.+\.thumb\.webp/);
  await expect(pageThumb).toHaveAttribute('sizes', COLORING_IMAGE_SIZES.pageThumbnail.landscape);
  await pageTiles.first().click();

  await expect(dialog).toBeHidden();
  await expect
    .poll(() =>
      pageImages.evaluateAll((images) => ({
        count: images.length,
        allCleared: images.every(
          (image) => !image.hasAttribute('src') && !image.hasAttribute('srcset')
        ),
      }))
    )
    .toEqual({ count: 6, allCleared: true });
  const overlay = page.locator('#coloringOverlay');
  await expect(overlay).toBeVisible();
  // The src lands once the art has decoded (the ready-gated swap), so retry.
  await expect(overlay).toHaveAttribute('src', /\/coloring\/farm\/.+-(wide|tall)\.overlay\.webp$/);
  await expect(overlay).toHaveAttribute(
    'srcset',
    /\/coloring\/max-1152px\/farm\/.+-(wide|tall)\.overlay\.webp/
  );
  await expect
    .poll(() =>
      overlay.evaluate((image) => {
        const sizesPx = Number.parseFloat(image.getAttribute('sizes') ?? '');
        const paperWidth = image.parentElement?.getBoundingClientRect().width ?? 0;
        return Math.abs(sizesPx - paperWidth);
      })
    )
    .toBeLessThanOrEqual(WHOLE_PIXEL_TOLERANCE_PX);
});

test.describe('responsive coloring selection at DPR 1', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

  test('selects the smaller cover, page, and overlay candidates', async ({ page }) => {
    await gotoAppWithInstalledColoringBook(page, 'dinosaur');
    await openDrawer(page);
    await openColoringDialog(page);
    const dialog = page.locator('#coloring-book-dialog');
    const cover = dialog.getByRole('button', { name: 'Farm coloring book' }).locator('img');
    await expect
      .poll(() => cover.evaluate((image: HTMLImageElement) => image.currentSrc))
      .toMatch(/\/coloring\/max-240px\/farm\/cover\.thumb\.webp$/);

    const pageTiles = await openFarmPageGrid(page);
    const pageThumb = pageTiles.first().locator('img');
    await expect
      .poll(() => pageThumb.evaluate((image: HTMLImageElement) => image.currentSrc))
      .toMatch(/\/coloring\/max-240px\/farm\/cat-tall\.thumb\.webp$/);
    await pageTiles.first().click();

    const overlay = page.locator('#coloringOverlay');
    await expect(overlay).toHaveAttribute('src', /\/coloring\/farm\/cat-tall\.overlay\.webp$/);
    await expect
      .poll(() => overlay.evaluate((image: HTMLImageElement) => image.currentSrc))
      .toMatch(/\/coloring\/max-1152px\/farm\/cat-tall\.overlay\.webp$/);
  });

  test('loads the canonical overlay only when exporting the responsive presentation', async ({
    page,
  }) => {
    await gotoApp(page);
    await openDrawer(page);
    await applyFarmPage(page);
    const overlay = page.locator('#coloringOverlay');
    await expect
      .poll(() => overlay.evaluate((image: HTMLImageElement) => image.currentSrc))
      .toMatch(/\/coloring\/max-1152px\/farm\/cat-tall\.overlay\.webp$/);
    await draw(page, [
      { x: 100, y: 180 },
      { x: 260, y: 260 },
    ]);

    let canonicalOverlayRequests = 0;
    await page.route(/\/coloring\/farm\/cat-tall\.overlay\.webp$/, async (route) => {
      canonicalOverlayRequests += 1;
      await route.continue();
    });
    const download = page.waitForEvent('download');
    await page.locator('#screenshotButton').click();
    expect(await (await download).failure()).toBeNull();

    expect(canonicalOverlayRequests).toBe(1);
  });

  test('prefetches against the locked paper width after rotation', async ({ page }) => {
    await gotoApp(page);
    await openDrawer(page);
    await applyFarmPage(page);
    await draw(page, [
      { x: 100, y: 180 },
      { x: 260, y: 260 },
    ]);

    await rotateViewportViaCdp(page, { width: 1000, height: 390, angle: 90 });
    const overlay = page.locator('#coloringOverlay');
    await expect(page.locator('.paper-sheet.paper-lifted')).toBeVisible();
    await expect(overlay).toHaveAttribute('sizes', '390px');
    await expect
      .poll(() =>
        page.locator('#drawingCanvas').evaluate((canvas) => canvas.getBoundingClientRect().width)
      )
      .toBeGreaterThan(768);

    const cowOverlayRequests: string[] = [];
    page.on('request', (request) => {
      if (/\/coloring\/(?:max-1152px\/)?farm\/cow-tall\.overlay\.webp$/.test(request.url())) {
        cowOverlayRequests.push(request.url());
      }
    });
    await openColoringDialog(page);
    const cow = (await openFarmPageGrid(page)).nth(1);
    await cow.dispatchEvent('pointerenter', { pointerType: 'mouse' });

    await expect
      .poll(() => cowOverlayRequests.some((url) => url.includes('/coloring/max-1152px/')))
      .toBe(true);
    expect(cowOverlayRequests.some((url) => /\/coloring\/farm\//.test(url))).toBe(false);
  });
});

test.describe('responsive coloring selection at DPR 3', () => {
  test.use({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });

  test('keeps the canonical cover, page, and overlay sources', async ({ page }) => {
    await gotoAppWithInstalledColoringBook(page, 'dinosaur');
    await openDrawer(page);
    await openColoringDialog(page);
    const dialog = page.locator('#coloring-book-dialog');
    const cover = dialog.getByRole('button', { name: 'Farm coloring book' }).locator('img');
    await expect
      .poll(() => cover.evaluate((image: HTMLImageElement) => image.currentSrc))
      .toMatch(/\/coloring\/farm\/cover\.thumb\.webp$/);

    const pageTiles = await openFarmPageGrid(page);
    const pageThumb = pageTiles.first().locator('img');
    await expect
      .poll(() => pageThumb.evaluate((image: HTMLImageElement) => image.currentSrc))
      .toMatch(/\/coloring\/farm\/cat-tall\.thumb\.webp$/);
    await pageTiles.first().click();

    const overlay = page.locator('#coloringOverlay');
    await expect(overlay).toHaveAttribute('src', /\/coloring\/farm\/cat-tall\.overlay\.webp$/);
    await expect
      .poll(() => overlay.evaluate((image: HTMLImageElement) => image.currentSrc))
      .toMatch(/\/coloring\/farm\/cat-tall\.overlay\.webp$/);
  });
});

test('an active page leaves the book grid geometry unchanged', async ({ page }) => {
  await page.setViewportSize({
    width: BOOK_GRID_VIEWPORTS[0].width,
    height: STANDARD_LAPTOP_VIEWPORT_HEIGHT_PX,
  });
  await gotoAppWithAllColoringBooksInstalled(page);
  await openDrawer(page);
  await openColoringDialog(page);

  const dialog = page.locator('#coloring-book-dialog');
  await settleFlyIn(dialog);
  const grid = dialog.locator('.coloring-books-grid');
  await expect(grid.locator(':scope > .coloring-tile')).toHaveCount(WEB_COLORING_BOOK_COUNT, {
    timeout: 30_000,
  });
  const geometryBefore = await tileGeometry(grid);
  await expect(dialog.locator('.active-page-chip')).toHaveCount(0);

  await (await openFarmPageGrid(page)).first().click();
  await expect(dialog).toBeHidden();
  await openColoringDialog(page);
  await settleFlyIn(dialog);

  await expect(grid.locator(':scope > .coloring-tile')).toHaveCount(WEB_COLORING_BOOK_COUNT);
  expect(await tileGeometry(grid)).toEqual(geometryBefore);
  await expect(grid.locator('img').first()).toHaveAttribute(
    'sizes',
    coloringBookGridLayout(WEB_COLORING_BOOK_COUNT).imageSizes
  );
  await expect
    .poll(() => dialog.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeLessThanOrEqual(WHOLE_PIXEL_TOLERANCE_PX);

  for (const { width, columns } of BOOK_GRID_VIEWPORTS) {
    await page.setViewportSize({ width, height: STANDARD_LAPTOP_VIEWPORT_HEIGHT_PX });
    await expect
      .poll(() =>
        grid.evaluate((element) => {
          const tracks = getComputedStyle(element).gridTemplateColumns.trim();
          return tracks === 'none' ? 0 : tracks.split(/\s+/).length;
        })
      )
      .toBe(columns);
  }
});

test('the active-page chip identifies the page in both picker views', async ({ page }) => {
  await gotoAppWithInstalledColoringBook(page, 'dinosaur');
  await openDrawer(page);
  await applyFarmPage(page);
  await openColoringDialog(page);

  const dialog = page.locator('#coloring-book-dialog');
  const chip = dialog.getByRole('button', { name: 'Clear active coloring page: Cat' });
  await expect(dialog.getByRole('heading', { name: 'Coloring Books' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Clear Page' })).toHaveCount(0);
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('Cat');
  await expect(chip.locator('[data-icon="close"]')).toBeVisible();
  await expect(chip.locator('img')).toHaveAttribute('src', /\/farm\/cat-wide\.thumb\.webp$/);
  await expect(chip.locator('img')).toHaveAttribute(
    'sizes',
    COLORING_IMAGE_SIZES.activePageThumbnail
  );

  await openFarmPageGrid(page);
  await expect(dialog.getByRole('heading', { name: 'Farm', exact: true })).toBeVisible();
  await expect(chip).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Clear Page' })).toHaveCount(0);
});

test.describe('active-page chip on a small viewport', () => {
  test.use({ viewport: SMALL_VIEWPORT });

  test('keeps book-picker and page-grid headings readable', async ({ page }) => {
    await gotoAppWithAllColoringBooksInstalled(page);
    await openDrawer(page);
    await applyFarmPage(page);
    await openColoringDialog(page);

    const dialog = page.locator('#coloring-book-dialog');
    await settleFlyIn(dialog);
    const chip = dialog.getByRole('button', { name: 'Clear active coloring page: Cat' });
    await expect(chip.locator('.active-page-name')).toBeHidden();

    const booksHeading = dialog.getByRole('heading', { name: 'Coloring Books' });
    await expect
      .poll(() => booksHeading.evaluate((heading) => heading.scrollWidth <= heading.clientWidth))
      .toBe(true);

    await dialog.getByRole('button', { name: 'Dinosaurs coloring book' }).click();
    const pagesHeading = dialog.getByRole('heading', { name: 'Dinosaurs' });
    await expect(pagesHeading).toBeVisible();
    await expect
      .poll(() => pagesHeading.evaluate((heading) => heading.scrollWidth <= heading.clientWidth))
      .toBe(true);
  });

  test('is a full-size right-aligned keyboard action before the close button', async ({ page }) => {
    await gotoApp(page);
    await openDrawer(page);
    await applyFarmPage(page);
    await openColoringDialog(page);

    const dialog = page.locator('#coloring-book-dialog');
    await settleFlyIn(dialog);
    const close = dialog.getByRole('button', { name: 'Close' });
    const chip = dialog.getByRole('button', { name: 'Clear active coloring page: Cat' });
    const [chipBox, closeBox] = await Promise.all([chip.boundingBox(), close.boundingBox()]);
    expect(chipBox?.width).toBeGreaterThanOrEqual(MINIMUM_TOUCH_TARGET_PX);
    expect(chipBox?.height).toBeGreaterThanOrEqual(MINIMUM_TOUCH_TARGET_PX);
    const chipCloseGap = closeBox!.x - (chipBox!.x + chipBox!.width);
    expect(chipCloseGap).toBeGreaterThanOrEqual(0);
    expect(chipCloseGap).toBeLessThanOrEqual(MAX_CHIP_CLOSE_GAP_PX);

    await chip.focus();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(chip).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(dialog).toBeHidden();
    await expect(page.locator('#coloringOverlay')).toBeHidden();
  });
});

test('a selected page stays hidden while browser-selected art decodes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  let releaseFullImage!: () => void;
  const fullImageHeld = new Promise<void>((resolve) => {
    releaseFullImage = resolve;
  });
  await page.route(/\/coloring\/(?:max-1152px\/)?farm\/cat-wide\.overlay\.webp$/, async (route) => {
    await fullImageHeld;
    await route.continue();
  });

  try {
    await gotoAppWithInstalledColoringBook(page, 'dinosaur');
    await openDrawer(page);
    await openColoringDialog(page);
    const dialog = page.locator('#coloring-book-dialog');
    const cat = (await openFarmPageGrid(page)).first();
    await expect
      .poll(() => cat.locator('img').evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await cat.click();

    await expect(dialog).toBeHidden();
    const overlay = page.locator('#coloringOverlay');
    await expect(overlay).toHaveAttribute('src', '');
    await expect(overlay).not.toHaveClass(/overlay-ready/);
    await expect(overlay).toHaveCSS('opacity', '0');
    const [overlayBox, canvasBox] = await Promise.all([
      overlay.boundingBox(),
      page.locator('#drawingCanvas').boundingBox(),
    ]);
    expect(overlayBox).toEqual(canvasBox);

    releaseFullImage();
    await expect(overlay).toHaveAttribute('src', /\/cat-wide\.overlay\.webp$/);
    await expect(overlay).toHaveClass(/overlay-ready/);
    await expect(overlay).toHaveCSS('opacity', '1');

    await openColoringDialog(page);
    await expect(dialog.getByRole('heading', { name: 'Coloring Books' })).toBeVisible();
    await expect(dialog.locator('.coloring-books-grid img').first()).toHaveAttribute(
      'src',
      /\.thumb\.webp$/
    );
  } finally {
    releaseFullImage();
  }
});

test('a save during overlay decode omits the overlay instead of capturing a thumbnail', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  let releaseFullImage!: () => void;
  const fullImageHeld = new Promise<void>((resolve) => {
    releaseFullImage = resolve;
  });
  await page.route(/\/coloring\/(?:max-1152px\/)?farm\/cat-wide\.overlay\.webp$/, async (route) => {
    await fullImageHeld;
    await route.continue();
  });

  try {
    await gotoApp(page);
    await openDrawer(page);
    await draw(page, [
      { x: 180, y: 160 },
      { x: 420, y: 240 },
    ]);
    await openColoringDialog(page);
    const dialog = page.locator('#coloring-book-dialog');
    await (await openFarmPageGrid(page)).first().click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('#coloringOverlay')).toHaveAttribute('src', '');

    await page.evaluate(() => {
      const probeDrawImage = (prototype: Pick<CanvasRenderingContext2D, 'drawImage'>) => {
        prototype.drawImage = new Proxy(prototype.drawImage, {
          apply(target, thisArg, args) {
            const source = args[0];
            if (source instanceof HTMLImageElement && source.id === 'coloringOverlay') {
              document.documentElement.dataset.overlayCompositedIntoExport = 'true';
            }
            return Reflect.apply(target, thisArg, args);
          },
        });
      };
      probeDrawImage(CanvasRenderingContext2D.prototype);
      if (typeof OffscreenCanvasRenderingContext2D !== 'undefined') {
        probeDrawImage(OffscreenCanvasRenderingContext2D.prototype);
      }
    });
    const download = page.waitForEvent('download');
    await page.locator('#screenshotButton').click();
    await download;

    await expect(page.locator('html')).not.toHaveAttribute('data-overlay-composited-into-export');
  } finally {
    releaseFullImage();
  }
});

test('a newly applied page cannot paint the previous page fill while its art decodes', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  let releaseNextOverlay!: () => void;
  const nextOverlayHeld = new Promise<void>((resolve) => {
    releaseNextOverlay = resolve;
  });
  await page.route(/\/coloring\/(?:max-1152px\/)?farm\/cow-wide\.overlay\.webp$/, async (route) => {
    await nextOverlayHeld;
    await route.continue();
  });

  try {
    await gotoApp(page);
    await openDrawer(page);
    await applyFarmPage(page);
    await pickBrush(page, '#magicBrushButton');
    await draw(page, [
      { x: 180, y: 160 },
      { x: 420, y: 240 },
    ]);
    await expect.poll(() => opaqueCanvasPixelCount(page)).toBeGreaterThan(0);
    await page.locator('#undoButton').click();
    await expect.poll(() => opaqueCanvasPixelCount(page)).toBe(0);

    await openColoringDialog(page);
    const dialog = page.locator('#coloring-book-dialog');
    const cow = (await openFarmPageGrid(page)).nth(1);
    await cow.click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('#coloringOverlay')).toHaveAttribute('src', '');

    await draw(page, [
      { x: 240, y: 180 },
      { x: 480, y: 260 },
    ]);
    await page.waitForTimeout(PENDING_FILL_SETTLE_MS);
    expect(await opaqueCanvasPixelCount(page)).toBe(0);

    releaseNextOverlay();
    await expect(page.locator('#coloringOverlay')).toHaveAttribute(
      'src',
      /\/cow-wide\.overlay\.webp$/
    );
    await expect.poll(() => opaqueCanvasPixelCount(page), { timeout: 15_000 }).toBeGreaterThan(0);
  } finally {
    releaseNextOverlay();
  }
});

test('a theme sibling keeps the registered coloring art visible while it decodes', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  await applyFarmPage(page);

  await pickBrush(page, '#magicBrushButton');
  await draw(page, [
    { x: 180, y: 160 },
    { x: 420, y: 240 },
  ]);
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBeGreaterThan(0);
  const pixelsBeforeTheme = await opaqueCanvasPixelCount(page);

  const overlay = page.locator('#coloringOverlay');
  await expect(overlay).toHaveAttribute('src', /(?<!\.dark)\.overlay\.webp$/);
  await page.evaluate(() => {
    const originalDecode = HTMLImageElement.prototype.decode;
    let release!: () => void;
    const pendingChalk = new Promise<void>((resolve) => {
      release = resolve;
    });
    const controlledWindow = window as Window & { __releaseChalkDecode?: () => void };
    controlledWindow.__releaseChalkDecode = release;
    HTMLImageElement.prototype.decode = function () {
      if (this.src.endsWith('.dark.overlay.webp')) {
        return pendingChalk.then(() => originalDecode.call(this));
      }
      return originalDecode.call(this);
    };
  });

  await openSettingsModal(page);
  await page.locator('#themeOption-dark').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(overlay).toHaveAttribute('src', /(?<!\.dark)\.overlay\.webp$/);
  await expect(overlay).toHaveAttribute('srcset', /(?<!\.dark)\.overlay\.webp/);
  await expect(overlay).toHaveClass(/overlay-ready/);
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBeGreaterThanOrEqual(pixelsBeforeTheme);

  await page.evaluate(() => {
    (window as Window & { __releaseChalkDecode?: () => void }).__releaseChalkDecode?.();
  });
  await expect(overlay).toHaveAttribute('src', /\.dark\.overlay\.webp$/);
  await expect(overlay).toHaveAttribute('srcset', /\.dark\.overlay\.webp/);
});

// A device rotation with ink on the canvas must NOT swap the page's tall/wide
// art out from under the child's coloring (the two variants are different
// compositions — no mapping exists): the engine locks the paper (ADR-0050) and
// the same art stays applied, presented through the paper-view wrapper. Once
// the canvas is blank again the paper re-adopts and the art swaps normally.
// Rotation is emulated via CDP: new viewport dimensions + a changed Screen
// Orientation angle (a plain resize keeps angle 0 and wouldn't rotate).
test('rotating with ink keeps the same coloring page art until the canvas is blank', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  await applyFarmPage(page);

  const overlay = page.locator('#coloringOverlay');
  await expect(overlay).toHaveAttribute('src', /-wide\.overlay\.webp$/); // landscape viewport → wide art
  const srcBefore = await overlay.getAttribute('src');

  await draw(page, [
    { x: 200, y: 200 },
    { x: 400, y: 260 },
  ]);

  await rotateViewportViaCdp(page, { width: 720, height: 1280, angle: 90 });

  // The ink locks the paper: the wide art stays applied, lifted into the
  // letterboxed paper sheet instead of being swapped for the tall variant.
  await expect(page.locator('.paper-sheet.paper-lifted')).toBeVisible();
  await expect(overlay).toHaveAttribute('src', srcBefore!);

  // Undo the only stroke → blank canvas → the paper re-adopts the portrait
  // viewport and the art swaps to the tall variant.
  await page.locator('#undoButton').click();
  await expect(overlay).toHaveAttribute('src', /-tall\.overlay\.webp$/);
  await expect(page.locator('.paper-sheet.paper-lifted')).toHaveCount(0);
});

// A toddler mashes a launch button several times before noticing the modal
// opened; the follow-up taps land on the fresh backdrop right where the button
// was and would dismiss it. modalDialog arms a short-lived dead zone around the
// launching button (launchGuard) that swallows those taps without dismissing,
// while a tap elsewhere on the backdrop still closes as usual.
test('a repeat tap where the launch button sat does not dismiss the just-opened modal', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);

  const btn = page.locator('#coloringBookButton');
  const box = (await btn.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await btn.click();
  const dialog = page.locator('#coloring-book-dialog');
  await expect(dialog).toBeVisible();

  // Repeat tap on the vacated button spot (now backdrop) — swallowed, stays open.
  await page.mouse.click(cx, cy);
  await expect(dialog).toBeVisible();

  // A backdrop tap away from the launch point still dismisses; only the
  // button's own region is guarded.
  const vp = page.viewportSize()!;
  await page.mouse.click(vp.width - 10, 10);
  await expect(dialog).toBeHidden();
});

// The same tap burst, one level into the picker. Tapping a book cover swaps the
// grid for that book's pages, so the follow-up taps land on whichever page tile
// painted where the cover was and apply it — the picker closes on a page nobody
// chose, before the child ever saw the pages. ColoringBook arms the same
// short-lived dead zone at the tap point (launchGuard.guardTapZone).
test('a repeat tap on a book cover does not pick the page that lands under it', async ({
  page,
}) => {
  await gotoAppWithInstalledColoringBook(page, 'dinosaur');
  await openDrawer(page);
  await openColoringDialog(page);

  const dialog = page.locator('#coloring-book-dialog');
  // This spec dispatches raw input at a remembered coordinate, so the fly-in has
  // to land before the tile is measured — mid-animation the whole grid sits
  // scaled down onto the launcher and the box belongs to a different book.
  await settleFlyIn(dialog);
  const coverBox = (await dialog
    .getByRole('button', { name: 'Farm coloring book' })
    .boundingBox())!;
  const cx = coverBox.x + coverBox.width / 2;
  const cy = coverBox.y + coverBox.height / 2;

  // Establish the hazard before testing the guard: drill in once and confirm a
  // page tile really does occupy the spot the cover just vacated, so the
  // guarded taps below can't pass by landing on nothing.
  const pageTiles = await openFarmPageGrid(page);
  const tileBoxes = await pageTiles.evaluateAll((tiles) =>
    tiles.map((tile) => {
      const { left, top, right, bottom } = tile.getBoundingClientRect();
      return { left, top, right, bottom };
    })
  );
  expect(
    tileBoxes.filter((b) => cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom)
  ).toHaveLength(1);

  await dialog.getByRole('button', { name: 'Back' }).click();
  await expect(dialog.getByRole('heading', { name: 'Coloring Books' })).toBeVisible();
  await settleTapGuard(page);

  // The double tap. The second click has the whole guard window to land in, and
  // back-to-back CDP input is orders of magnitude inside it.
  await page.mouse.click(cx, cy);
  await page.mouse.click(cx, cy);

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Farm', exact: true })).toBeVisible();

  // Once the guard lapses that same spot picks the page as usual.
  await settleTapGuard(page);
  await page.mouse.click(cx, cy);
  await expect(dialog).toBeHidden();
  await expect(page.locator('#coloringOverlay')).toBeVisible();
});

// A touch tap activates the launcher on pointerup (scribbleTap), so the dialog
// is already open and painted when the tap's trailing synthesized click
// dispatches — and that click is hit-tested at dispatch time, landing on
// whatever book tile sits under the finger. Unless the launch dead zone also
// guards dialog *content*, the picker opens pre-drilled into a "random" book
// (issue #308). Mouse clicks can't reproduce this (a click targets the common
// ancestor of its down/up targets, which is never inside the dialog), so this
// spec taps with a real touchscreen.
test.describe('coloring book picker via touch', () => {
  test.use({ hasTouch: true });

  test('a touch tap on the launcher opens the picker at the root book list', async ({ page }) => {
    await gotoAppWithInstalledColoringBook(page, 'dinosaur');
    await openDrawer(page);

    await page.locator('#coloringBookButton').tap();

    const dialog = page.locator('#coloring-book-dialog');
    await expect(dialog).toBeVisible();
    // A book tile paints exactly where the finger was (that's what makes the
    // ghost click land); the picker must still show the root book list, not a
    // drilled-in page grid.
    await expect(dialog.getByRole('heading', { name: 'Coloring Books' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Back' })).toHaveCount(0);
  });
});

test('rotating the viewport swaps the coloring overlay to the matching art', async ({ page }) => {
  // Rotation reaches the overlay through the shared layout module (one
  // resize/orientationchange listener pair feeding every component), so this
  // also guards that viewport tracking stays live after rotation settles.
  await page.setViewportSize({ width: 900, height: 600 });
  await gotoApp(page);
  await openDrawer(page);
  await applyFarmPage(page);

  const overlay = page.locator('#coloringOverlay');
  await expect(overlay).toHaveAttribute('src', /-wide\.overlay\.webp$/);

  await page.setViewportSize({ width: 600, height: 900 });
  await expect(overlay).toHaveAttribute('src', /-tall\.overlay\.webp$/);

  await page.setViewportSize({ width: 900, height: 600 });
  await expect(overlay).toHaveAttribute('src', /-wide\.overlay\.webp$/);
});
