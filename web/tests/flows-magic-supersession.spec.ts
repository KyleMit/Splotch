import { expect, test, type Page } from '@playwright/test';
import { draw, gotoApp, renderedCanvasHandle } from './helpers';
import {
  applyFarmPage,
  openColoringDialog,
  openDrawer,
  openFarmPageGrid,
  pickBrush,
} from './flows-harness';

const SUPERSESSION_TEST_TIMEOUT_MS = 60_000;
const MAGIC_PUBLICATION_TIMEOUT_MS = 15_000;
const MAGIC_POINTS = [
  { x: 100, y: 120 },
  { x: 240, y: 260 },
  { x: 400, y: 120 },
  { x: 560, y: 280 },
];

async function magicWitness(page: Page) {
  const canvas = await renderedCanvasHandle(page);
  try {
    return await canvas.evaluate(async (surface) => {
      const context = surface.getContext('2d');
      if (!context) throw new Error('Missing live Magic pixel context');
      const pixels = context.getImageData(0, 0, surface.width, surface.height).data;
      let opaquePixels = 0;
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) opaquePixels++;
      const digest = await crypto.subtle.digest('SHA-256', pixels);
      return {
        width: surface.width,
        height: surface.height,
        opaquePixels,
        sha256: Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, '0')
        ).join(''),
      };
    });
  } finally {
    await canvas.dispose();
  }
}

async function pickFarmPage(page: Page, index: number) {
  await openColoringDialog(page);
  await (await openFarmPageGrid(page)).nth(index).click();
  await expect(page.locator('#coloring-book-dialog')).toBeHidden();
}

test('superseding a pending Magic page preserves both page Undo pixel owners', async ({ page }) => {
  test.setTimeout(SUPERSESSION_TEST_TIMEOUT_MS);
  await page.addInitScript(() => {
    const nativeDecode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      const source = this.src;
      const decoded = nativeDecode.call(this);
      void decoded.then(
        () => {
          if (/\/cow-(?:wide|tall)\.overlay\.svg(?:\?.*)?$/.test(source)) {
            const root = document.documentElement;
            root.dataset.supersededCowDecodes = String(
              Number(root.dataset.supersededCowDecodes ?? 0) + 1
            );
          }
        },
        () => undefined
      );
      return decoded;
    };
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await gotoApp(page);
  await openDrawer(page);
  await applyFarmPage(page);
  await pickBrush(page, '#magicBrushButton');
  await draw(page, MAGIC_POINTS);
  await expect
    .poll(async () => (await magicWitness(page)).opaquePixels, {
      timeout: MAGIC_PUBLICATION_TIMEOUT_MS,
    })
    .toBeGreaterThan(0);
  const first = await magicWitness(page);
  const overlay = page.locator('#coloringOverlay');
  const firstCanonical = await overlay.getAttribute('data-canonical-url');
  if (!firstCanonical) throw new Error('Missing first canonical page identity');
  expect(firstCanonical).toMatch(/cat-(?:wide|tall)\.overlay\.svg$/);

  let releasePendingOverlay: () => void = () => {};
  let releasePendingFill: () => void = () => {};
  const pendingOverlay = new Promise<void>((resolve) => {
    releasePendingOverlay = resolve;
  });
  const pendingFill = new Promise<void>((resolve) => {
    releasePendingFill = resolve;
  });
  let overlayRequests = 0;
  let fillRequests = 0;
  await page.route(/\/cow-(?:wide|tall)\.overlay\.svg(?:\?.*)?$/, async (route) => {
    overlayRequests++;
    await pendingOverlay;
    await route.continue();
  });
  await page.route(/\/cow-(?:wide|tall)\.light\.webp(?:\?.*)?$/, async (route) => {
    fillRequests++;
    await pendingFill;
    await route.continue();
  });
  const evidence: Record<string, unknown> = { first, firstCanonical };
  try {
    await pickFarmPage(page, 1);
    await expect(overlay).toHaveAttribute('data-canonical-url', /cow-(?:wide|tall)\.overlay\.svg$/);
    await expect.poll(() => overlayRequests).toBeGreaterThan(0);
    const pendingSecond = await magicWitness(page);
    evidence.pendingSecond = pendingSecond;
    expect(pendingSecond).toEqual(first);

    await pickFarmPage(page, 2);
    await expect(overlay).toHaveAttribute('data-canonical-url', /dog-(?:wide|tall)\.overlay\.svg$/);
    await expect(overlay).toHaveAttribute('src', /dog-(?:wide|tall)\.overlay\.svg$/);
    await expect
      .poll(async () => (await magicWitness(page)).sha256, {
        timeout: MAGIC_PUBLICATION_TIMEOUT_MS,
      })
      .not.toBe(first.sha256);
    const third = await magicWitness(page);
    evidence.third = third;
    releasePendingOverlay();
    await expect
      .poll(() => page.locator('html').getAttribute('data-superseded-cow-decodes'), {
        timeout: MAGIC_PUBLICATION_TIMEOUT_MS,
      })
      .not.toBeNull();
    await overlay.evaluate((image: HTMLImageElement) =>
      Promise.all(
        image.getAnimations().map((animation) => animation.finished.catch(() => undefined))
      )
    );
    await expect(overlay).toHaveAttribute('src', /dog-(?:wide|tall)\.overlay\.svg$/);
    expect(await magicWitness(page)).toEqual(third);

    await page.locator('#undoButton').click();
    await expect(overlay).toHaveAttribute('data-canonical-url', /cow-(?:wide|tall)\.overlay\.svg$/);
    await expect(overlay).toHaveAttribute('src', /cow-(?:wide|tall)\.overlay\.svg$/);
    await expect
      .poll(() => fillRequests, { timeout: MAGIC_PUBLICATION_TIMEOUT_MS })
      .toBeGreaterThan(0);
    const undoToPendingSecond = await magicWitness(page);
    evidence.undoToPendingSecond = undoToPendingSecond;
    expect(undoToPendingSecond).toEqual(first);
    releasePendingFill();
    await expect
      .poll(async () => (await magicWitness(page)).sha256, {
        timeout: MAGIC_PUBLICATION_TIMEOUT_MS,
      })
      .not.toBe(first.sha256);
    const second = await magicWitness(page);
    evidence.second = second;
    expect(second.sha256).not.toBe(third.sha256);

    await page.locator('#undoButton').click();
    await expect(overlay).toHaveAttribute('data-canonical-url', firstCanonical);
    await expect(overlay).toHaveAttribute('src', firstCanonical);
    await expect
      .poll(async () => magicWitness(page), { timeout: MAGIC_PUBLICATION_TIMEOUT_MS })
      .toEqual(first);
    evidence.undoToFirst = await magicWitness(page);
  } finally {
    releasePendingOverlay();
    releasePendingFill();
    await test
      .info()
      .attach('magic-page-supersession-live-owners', {
        body: JSON.stringify(evidence),
        contentType: 'application/json',
      });
  }
});
