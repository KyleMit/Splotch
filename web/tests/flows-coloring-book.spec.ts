import { expect, test } from '@playwright/test';

import { rotateViewportViaCdp } from './cdp';
import { draw, gotoApp, openSettingsModal } from './helpers';

import {
  applyFarmPage,
  gotoAppWithInstalledColoringBook,
  opaqueCanvasPixelCount,
  openColoringBookGrid,
  openColoringDialog,
  openDrawer,
  openFarmPageGrid,
  pickBrush,
} from './flows-harness';

// A healthy Magic fill commits well within this window; holding the next overlay for the full
// interval distinguishes no ink from an async paint that is merely late.
const PENDING_FILL_SETTLE_MS = 500;

// ── coloring book overlay ───────────────────────────────────────────────────

test('an early coloring request mounts before unrelated idle overlays', async ({ page }) => {
  await page.addInitScript(() => {
    let nextIdleHandle = 1;
    const idleCallbacks = new Map<number, IdleRequestCallback>();
    window.requestIdleCallback = (callback) => {
      const handle = nextIdleHandle;
      nextIdleHandle += 1;
      idleCallbacks.set(handle, callback);
      return handle;
    };
    window.cancelIdleCallback = (handle) => idleCallbacks.delete(handle);
  });
  await gotoApp(page);
  await openDrawer(page);

  await page.getByRole('button', { name: 'Coloring books' }).click();

  await expect(page.locator('#coloring-book-dialog')).toBeVisible();
  await expect(page.locator('#parentalGate')).toHaveCount(0);
  await expect(page.locator('#color-picker')).toHaveCount(0);
  await expect(page.locator('#settingsModal')).toHaveCount(0);
});

test('choosing a coloring page sets the canvas overlay', async ({ page }) => {
  await gotoAppWithInstalledColoringBook(page, 'dinosaur');
  await openDrawer(page);

  await openColoringBookGrid(page);
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
  const pagePreview = pageTiles.first().locator('img');
  await expect(pagePreview).toHaveAttribute('src', /\/coloring\/farm\/.+\.selector\.webp/);
  await expect(pagePreview).toHaveAttribute(
    'srcset',
    /\/coloring\/max-96px\/farm\/.+\.selector\.webp 96w, .*max-240px.* 240w, .* 400w/
  );
  await expect(pagePreview).toHaveAttribute('sizes', /min\(calc\(\(90vw - 92px\) \/ 2\), 414px\)/);
  await expect(pagePreview).toHaveCSS('mix-blend-mode', 'normal');
  await expect(pagePreview).toHaveCSS('filter', 'none');
  await pageTiles.first().click();

  await expect(dialog).toBeHidden();
  await expect
    .poll(() =>
      pageImages.evaluateAll((images) => ({
        count: images.length,
        allDetached: images.every((image) => !image.hasAttribute('src')),
      }))
    )
    .toEqual({ count: 6, allDetached: true });
  const overlay = page.locator('#coloringOverlay');
  await expect(overlay).toBeVisible();
  // The src lands once the art has decoded (the ready-gated swap), so retry.
  await expect(overlay).toHaveAttribute('src', /\/coloring\/farm\/.+-(wide|tall)\.overlay\.svg$/);
  await expect(overlay).toHaveAttribute(
    'data-canonical-url',
    /\/coloring\/farm\/.+-(wide|tall)\.overlay\.svg$/
  );
  await expect(overlay).not.toHaveAttribute('srcset');
  await expect(overlay).not.toHaveAttribute('sizes');

  await openColoringBookGrid(page);
  const activePagePreview = dialog
    .getByRole('button', { name: /Clear active coloring page:/ })
    .locator('img');
  await expect(activePagePreview).toHaveAttribute('srcset', /max-96px.* 96w, .*max-240px.* 240w/);
  await expect(activePagePreview).toHaveAttribute('sizes', '36px');
  const remountedPageTiles = await openFarmPageGrid(page);
  await expect(remountedPageTiles.first().locator('img')).toHaveAttribute(
    'src',
    /\/coloring\/farm\/.+\.selector\.webp/
  );
});

test.describe('responsive coloring selection at DPR 1', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

  test('selects responsive raster picker art and uses canonical canvas SVG', async ({ page }) => {
    await gotoAppWithInstalledColoringBook(page, 'dinosaur');
    await openDrawer(page);
    await openColoringBookGrid(page);
    const dialog = page.locator('#coloring-book-dialog');
    const cover = dialog.getByRole('button', { name: 'Farm coloring book' }).locator('img');
    await expect
      .poll(() => cover.evaluate((image: HTMLImageElement) => image.currentSrc))
      .toMatch(/\/coloring\/max-240px\/farm\/cover\.thumb\.webp$/);

    const pageTiles = await openFarmPageGrid(page);
    const pagePreview = pageTiles.first().locator('img');
    await expect
      .poll(() => pagePreview.evaluate((image: HTMLImageElement) => image.currentSrc))
      .toMatch(/\/coloring\/max-240px\/farm\/cat-tall\.selector\.webp$/);
    await pageTiles.first().click();

    const overlay = page.locator('#coloringOverlay');
    await expect(overlay).toHaveAttribute('src', /\/coloring\/farm\/cat-tall\.overlay\.svg$/);
    await expect(overlay).toHaveAttribute(
      'data-canonical-url',
      /\/coloring\/farm\/cat-tall\.overlay\.svg$/
    );
    await expect
      .poll(() => overlay.evaluate((image: HTMLImageElement) => image.currentSrc))
      .toMatch(/\/coloring\/farm\/cat-tall\.overlay\.svg$/);
  });

  test('does not refetch the canonical SVG when exporting the displayed page', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await gotoApp(page);
    await openDrawer(page);
    await applyFarmPage(page);
    const overlay = page.locator('#coloringOverlay');
    await expect
      .poll(() => overlay.evaluate((image: HTMLImageElement) => image.currentSrc))
      .toMatch(/\/coloring\/farm\/cat-tall\.dark\.overlay\.svg$/);
    await draw(page, [
      { x: 100, y: 180 },
      { x: 260, y: 260 },
    ]);

    let exportOverlayRequests = 0;
    await page.route(/\/coloring\/farm\/cat-tall\.dark\.overlay\.svg$/, async (route) => {
      exportOverlayRequests += 1;
      await route.continue();
    });
    const download = page.waitForEvent('download');
    await page.locator('#screenshotButton').click();
    expect(await (await download).failure()).toBeNull();

    expect(exportOverlayRequests).toBe(0);
  });

  test('prefetches the canonical SVG for the locked orientation after rotation', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await gotoApp(page);
    await openDrawer(page);
    await applyFarmPage(page);
    await draw(page, [
      { x: 100, y: 180 },
      { x: 260, y: 260 },
    ]);

    await rotateViewportViaCdp(page, { width: 1000, height: 390, angle: 90 });
    const expectedPrefetch = /\/coloring\/farm\/cow-tall\.dark\.overlay\.svg$/;
    const cowPrefetch = page.waitForRequest(expectedPrefetch);
    await page.emulateMedia({ colorScheme: 'dark' });
    const overlay = page.locator('#coloringOverlay');
    await expect(page.locator('.paper-sheet.paper-lifted')).toBeVisible();
    await expect(overlay).toHaveAttribute('src', /\/coloring\/farm\/cat-tall\.dark\.overlay\.svg$/);
    await expect(overlay).not.toHaveAttribute('sizes');
    await expect(overlay).not.toHaveAttribute('srcset');
    await expect
      .poll(() =>
        page.locator('#drawingCanvas').evaluate((canvas) => canvas.getBoundingClientRect().width)
      )
      .toBeGreaterThan(768);

    await openColoringDialog(page);
    const cow = (await openFarmPageGrid(page)).nth(1);
    await cow.dispatchEvent('pointerenter', { pointerType: 'mouse' });

    expect((await cowPrefetch).url()).toMatch(expectedPrefetch);
  });
});

test.describe('responsive coloring selection at DPR 3', () => {
  test.use({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });

  test('keeps canonical cover and canvas SVG sources with responsive picker art', async ({
    page,
  }) => {
    await gotoAppWithInstalledColoringBook(page, 'dinosaur');
    await openDrawer(page);
    await openColoringBookGrid(page);
    const dialog = page.locator('#coloring-book-dialog');
    const cover = dialog.getByRole('button', { name: 'Farm coloring book' }).locator('img');
    await expect
      .poll(() => cover.evaluate((image: HTMLImageElement) => image.currentSrc))
      .toMatch(/\/coloring\/farm\/cover\.thumb\.webp$/);

    const pageTiles = await openFarmPageGrid(page);
    const pagePreview = pageTiles.first().locator('img');
    await expect
      .poll(() => pagePreview.evaluate((image: HTMLImageElement) => image.currentSrc))
      .toMatch(/\/coloring\/farm\/cat-tall\.selector\.webp$/);
    await pageTiles.first().click();

    const overlay = page.locator('#coloringOverlay');
    await expect(overlay).toHaveAttribute('src', /\/coloring\/farm\/cat-tall\.overlay\.svg$/);
    await expect
      .poll(() => overlay.evaluate((image: HTMLImageElement) => image.currentSrc))
      .toMatch(/\/coloring\/farm\/cat-tall\.overlay\.svg$/);
  });
});

test('a selected page stays hidden while browser-selected art decodes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  let releaseFullImage!: () => void;
  const fullImageHeld = new Promise<void>((resolve) => {
    releaseFullImage = resolve;
  });
  await page.route(/\/coloring\/farm\/cat-wide\.overlay\.svg$/, async (route) => {
    await fullImageHeld;
    await route.continue();
  });

  try {
    await gotoAppWithInstalledColoringBook(page, 'dinosaur');
    await openDrawer(page);
    await openColoringBookGrid(page);
    const dialog = page.locator('#coloring-book-dialog');
    const cat = (await openFarmPageGrid(page)).first();
    await expect(cat.locator('img')).toHaveAttribute('src', /cat-wide\.selector\.webp$/);
    await expect
      .poll(() => cat.locator('img').evaluate((image: HTMLImageElement) => image.currentSrc))
      .toMatch(/\/coloring\/farm\/cat-wide\.selector\.webp$/);
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
    await expect(overlay).toHaveAttribute('src', /\/cat-wide\.overlay\.svg$/);
    await expect(overlay).toHaveClass(/overlay-ready/);
    await expect(overlay).toHaveCSS('opacity', '1');
    await expect(overlay).toHaveCSS('transition-duration', '0s');

    await openColoringBookGrid(page);
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
  await page.route(/\/coloring\/farm\/cat-wide\.overlay\.svg$/, async (route) => {
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
  await page.route(/\/coloring\/farm\/cow-wide\.overlay\.svg$/, async (route) => {
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
      /\/cow-wide\.overlay\.svg$/
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
  await expect(overlay).toHaveAttribute('src', /(?<!\.dark)\.overlay\.svg$/);
  await page.evaluate(() => {
    const originalDecode = HTMLImageElement.prototype.decode;
    let release!: () => void;
    const pendingChalk = new Promise<void>((resolve) => {
      release = resolve;
    });
    const controlledWindow = window as Window & { __releaseChalkDecode?: () => void };
    controlledWindow.__releaseChalkDecode = release;
    HTMLImageElement.prototype.decode = function () {
      if (this.src.endsWith('.dark.overlay.svg')) {
        return pendingChalk.then(() => originalDecode.call(this));
      }
      return originalDecode.call(this);
    };
  });

  await openSettingsModal(page);
  await page.locator('#themeOption-dark').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(overlay).toHaveAttribute('src', /(?<!\.dark)\.overlay\.svg$/);
  await expect(overlay).toHaveClass(/overlay-ready/);
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBeGreaterThanOrEqual(pixelsBeforeTheme);

  await page.evaluate(() => {
    (window as Window & { __releaseChalkDecode?: () => void }).__releaseChalkDecode?.();
  });
  await expect(overlay).toHaveAttribute('src', /\.dark\.overlay\.svg$/);
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
  await expect(overlay).toHaveAttribute('src', /-wide\.overlay\.svg$/); // landscape viewport → wide art
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
  await expect(overlay).toHaveAttribute('src', /-tall\.overlay\.svg$/);
  await expect(page.locator('.paper-sheet.paper-lifted')).toHaveCount(0);
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
  await expect(overlay).toHaveAttribute('src', /-wide\.overlay\.svg$/);

  await page.setViewportSize({ width: 600, height: 900 });
  await expect(overlay).toHaveAttribute('src', /-tall\.overlay\.svg$/);

  await page.setViewportSize({ width: 900, height: 600 });
  await expect(overlay).toHaveAttribute('src', /-wide\.overlay\.svg$/);
});
