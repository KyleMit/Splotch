import { expect, test, type Page } from '@playwright/test';

import { rotateViewportViaCdp } from './cdp';
import { draw, gotoApp, openSettingsModal, renderedCanvasHandle } from './helpers';
import { COLORING_IMAGE_SIZES } from '../src/lib/state/books';

import {
  applyFarmPage,
  openColoringDialog,
  openDrawer,
  openFarmPageGrid,
  pickBrush,
} from './flows-harness';

// A healthy Magic fill commits well within this window; holding the next overlay for the full
// interval distinguishes no ink from an async paint that is merely late.
const PENDING_FILL_SETTLE_MS = 500;
const WHOLE_PIXEL_TOLERANCE_PX = 1;
const STANDARD_LAPTOP_VIEWPORT_HEIGHT_PX = 800;
const CLEAR_PAGE_GRID_VIEWPORTS = [
  { width: 1200, columns: 3 },
  { width: 700, columns: 3 },
  { width: 500, columns: 2 },
] as const;

async function opaquePixelCount(page: Page) {
  const canvas = await renderedCanvasHandle(page);
  try {
    return canvas.evaluate((element) => {
      const pixels = element
        .getContext('2d')!
        .getImageData(0, 0, element.width, element.height).data;
      let opaque = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > 0) opaque++;
      }
      return opaque;
    });
  } finally {
    await canvas.dispose();
  }
}

// ── coloring book overlay ───────────────────────────────────────────────────

test('choosing a coloring page sets the canvas overlay', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);

  await openColoringDialog(page);
  const dialog = page.locator('#coloring-book-dialog');

  // Farm ships on web and mobile; open it and pick its first page.
  const cover = dialog.getByRole('button', { name: 'Farm coloring book' }).locator('img');
  await expect(cover).toHaveAttribute('srcset', /\/coloring\/max-240px\/farm\/cover\.thumb\.webp/);
  await expect(cover).toHaveAttribute('sizes', COLORING_IMAGE_SIZES.coverThumbnail.withoutClear);
  const pageTiles = await openFarmPageGrid(page);
  const pageThumb = pageTiles.first().locator('img');
  await expect(pageThumb).toHaveAttribute('srcset', /\/coloring\/max-240px\/farm\/.+\.thumb\.webp/);
  await expect(pageThumb).toHaveAttribute('sizes', COLORING_IMAGE_SIZES.pageThumbnail.landscape);
  await pageTiles.first().click();

  await expect(dialog).toBeHidden();
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
    await gotoApp(page);
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
});

test.describe('responsive coloring selection at DPR 3', () => {
  test.use({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });

  test('keeps the canonical cover, page, and overlay sources', async ({ page }) => {
    await gotoApp(page);
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

test('the Clear Page book grid stays responsive and fits a standard laptop modal', async ({
  page,
}) => {
  await page.setViewportSize({
    width: CLEAR_PAGE_GRID_VIEWPORTS[0].width,
    height: STANDARD_LAPTOP_VIEWPORT_HEIGHT_PX,
  });
  await gotoApp(page);
  await openDrawer(page);
  await applyFarmPage(page);
  await openColoringDialog(page);

  const dialog = page.locator('#coloring-book-dialog');
  const grid = dialog.locator('.coloring-books-grid');
  await expect(grid.locator(':scope > .coloring-tile')).toHaveCount(9);
  await expect
    .poll(() => dialog.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeLessThanOrEqual(WHOLE_PIXEL_TOLERANCE_PX);

  for (const { width, columns } of CLEAR_PAGE_GRID_VIEWPORTS) {
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
    await gotoApp(page);
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
    await expect.poll(() => opaquePixelCount(page)).toBeGreaterThan(0);
    await page.locator('#undoButton').click();
    await expect.poll(() => opaquePixelCount(page)).toBe(0);

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
    expect(await opaquePixelCount(page)).toBe(0);

    releaseNextOverlay();
    await expect(page.locator('#coloringOverlay')).toHaveAttribute(
      'src',
      /\/cow-wide\.overlay\.webp$/
    );
    await expect.poll(() => opaquePixelCount(page), { timeout: 15_000 }).toBeGreaterThan(0);
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
  await expect.poll(() => opaquePixelCount(page)).toBeGreaterThan(0);
  const pixelsBeforeTheme = await opaquePixelCount(page);

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
  await expect.poll(() => opaquePixelCount(page)).toBeGreaterThanOrEqual(pixelsBeforeTheme);

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
    await gotoApp(page);
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
