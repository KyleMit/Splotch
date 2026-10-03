import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import type { Download, Page } from '@playwright/test';
import { draw, gotoApp, renderedCanvasHandle } from './helpers';
import {
  applyFarmPage,
  openColoringDialog,
  openDrawer,
  openFarmPageGrid,
  pickBrush,
} from './flows-harness';
import { SCREENSHOT_COOLDOWN_MS } from '../src/lib/drawing/screenshotTiming';
import { count, drawStroke, expect, test } from './engine-harness';

async function measurePreparedExportOwnership(page: Page) {
  return page.evaluate(async () => {
    const originalCreateImageBitmap = window.createImageBitmap.bind(window);
    let closeCount = 0;
    const bitmapOwnership: Array<{ bitmap: ImageBitmap; closes: number }> = [];
    let pendingBitmapCount = 0;
    window.createImageBitmap = (async (source: ImageBitmapSource) => {
      pendingBitmapCount++;
      try {
        const bitmap = await originalCreateImageBitmap(source);
        const ownership = { bitmap, closes: 0 };
        bitmapOwnership.push(ownership);
        const originalClose = bitmap.close.bind(bitmap);
        Object.defineProperty(bitmap, 'close', {
          value() {
            closeCount++;
            ownership.closes++;
            originalClose();
          },
        });
        return bitmap;
      } finally {
        pendingBitmapCount--;
      }
    }) as typeof createImageBitmap;

    const waitForBitmapRequestsToSettle = async () => {
      do {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      } while (pendingBitmapCount > 0);
    };

    try {
      const cancelled = window.__engine.prepareCanvasExport();
      if (!cancelled) throw new Error('Expected a canvas export preparation');
      cancelled.cancel();
      await waitForBitmapRequestsToSettle();
      const closedAfterCancel = closeCount;
      const cancelledBitmapCloses = bitmapOwnership.map(({ closes }) => closes);
      const completionAfterCancel = await cancelled.complete();
      const closedAfterCompletionAttempt = closeCount;

      const completed = window.__engine.prepareCanvasExport();
      if (!completed) throw new Error('Expected a second canvas export preparation');
      const completion = completed.complete();
      const closedBeforeLateCancel = closeCount;
      completed.cancel();
      const closedAfterLateCancel = closeCount;
      await completion;
      await waitForBitmapRequestsToSettle();
      const closedAfterCompletion = closeCount;

      return {
        closedAfterCancel,
        completionAfterCancel,
        closedAfterCompletionAttempt,
        closedBeforeLateCancel,
        closedAfterLateCancel,
        closedAfterCompletion,
        cancelledBitmapCloses,
        finalBitmapOwnership: bitmapOwnership.map(({ bitmap, closes }) => ({
          closes,
          released: closes === 1 || bitmap.width === 0,
        })),
      };
    } finally {
      window.createImageBitmap = originalCreateImageBitmap;
    }
  });
}

test('an export started just before a clear still captures the drawing (save-on-delete race)', async ({
  page,
}) => {
  const box = await page.locator('#drawingCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 60, y: 60 },
    { x: 200, y: 200 },
  ]);
  expect(await count(page)).toBeGreaterThan(0);

  // Mirrors ClearButton's onClear: saveDrawingIfEnabled() fire-and-forgets the
  // export, then clearCanvas() runs synchronously — before the export's first
  // internal await (the paper-texture load) resolves. The exported blob must
  // contain the stroke, not the post-clear blank canvas.
  const redPixels = await page.evaluate(async () => {
    const blobPromise = window.__engine.exportCanvasBlob();
    window.__engine.clearCanvas();
    return window.__engine.blobRedPixelCount(await blobPromise);
  });

  expect(redPixels).toBeGreaterThan(0);
  expect(await count(page)).toBe(0); // the clear itself still landed
});

async function drawExportableStroke(page: Page) {
  const box = await page.locator('#drawingCanvas').boundingBox();
  await drawStroke(page, box, [
    { x: 60, y: 60 },
    { x: 200, y: 200 },
  ]);
}

test('prepared export cancellation releases its bitmap ownership exactly once', async ({
  page,
}) => {
  await drawExportableStroke(page);
  const result = await measurePreparedExportOwnership(page);

  expect(result.closedAfterCancel).toBeGreaterThan(0);
  expect(result.completionAfterCancel).toBeNull();
  expect(result.closedAfterCompletionAttempt).toBe(result.closedAfterCancel);
  expect(result.closedAfterLateCancel).toBe(result.closedBeforeLateCancel);
  expect(result.cancelledBitmapCloses.every((closes) => closes === 1)).toBe(true);
  expect(result.finalBitmapOwnership.every(({ closes, released }) => closes <= 1 && released)).toBe(
    true
  );
});

test.describe('matched-scale prepared export ownership', () => {
  test.use({ deviceScaleFactor: 2 });

  test('cancellation closes tiled export bitmap ownership exactly once', async ({ page }) => {
    await drawExportableStroke(page);
    const result = await measurePreparedExportOwnership(page);

    expect(result.closedAfterCancel).toBeGreaterThan(0);
    expect(result.completionAfterCancel).toBeNull();
    expect(result.closedAfterCompletionAttempt).toBe(result.closedAfterCancel);
    expect(result.closedAfterLateCancel).toBe(result.closedBeforeLateCancel);
    expect(result.cancelledBitmapCloses.every((closes) => closes === 1)).toBe(true);
    expect(
      result.finalBitmapOwnership.every(({ closes, released }) => closes <= 1 && released)
    ).toBe(true);
  });
});

const APPEARANCE_EXPORT_TIMEOUT_MS = 10_000;
const APPEARANCE_EXPORT_TEST_TIMEOUT_MS = 60_000;
const DEFERRED_APPEARANCE_OBSERVATION_MS = 16_000;
const RESIZED_APPEARANCE_VIEWPORT = { width: 1000, height: 720 };
const APPEARANCE_MAGIC_POINTS = [
  { x: 100, y: 120 },
  { x: 240, y: 260 },
  { x: 400, y: 120 },
  { x: 560, y: 280 },
];

async function screenshotPixels(download: Download) {
  const path = await download.path();
  if (!path) throw new Error('Screenshot download has no path');
  const png = await readFile(path);
  await test.info().attach(`camera-png-${test.info().attachments.length + 1}`, {
    body: png,
    contentType: 'image/png',
  });
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    pixels: data,
    sha256: createHash('sha256').update(data).digest('hex'),
  };
}

function exactPixelDifference(
  actual: Awaited<ReturnType<typeof screenshotPixels>>,
  expected: Awaited<ReturnType<typeof screenshotPixels>>
) {
  if (actual.width !== expected.width || actual.height !== expected.height)
    throw new Error('Screenshot dimensions changed');
  let differentPixels = 0;
  let firstDifference: { x: number; y: number; actual: number[]; expected: number[] } | null = null;
  for (let index = 0; index < actual.pixels.length; index += 4) {
    if (
      actual.pixels[index] === expected.pixels[index] &&
      actual.pixels[index + 1] === expected.pixels[index + 1] &&
      actual.pixels[index + 2] === expected.pixels[index + 2] &&
      actual.pixels[index + 3] === expected.pixels[index + 3]
    )
      continue;
    differentPixels++;
    firstDifference ??= {
      x: (index / 4) % actual.width,
      y: Math.floor(index / 4 / actual.width),
      actual: Array.from(actual.pixels.subarray(index, index + 4)),
      expected: Array.from(expected.pixels.subarray(index, index + 4)),
    };
  }
  return { differentPixels, firstDifference };
}

async function liveMagicWitness(page: Page) {
  const canvas = await renderedCanvasHandle(page);
  try {
    return await canvas.evaluate(async (surface) => {
      const context = surface.getContext('2d');
      if (!context) throw new Error('Missing live pixel context');
      const pixels = context.getImageData(0, 0, surface.width, surface.height).data;
      let opaquePixels = 0;
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) opaquePixels++;
      const digest = await crypto.subtle.digest('SHA-256', pixels);
      return {
        opaquePixels,
        width: surface.width,
        height: surface.height,
        sha256: Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, '0')
        ).join(''),
      };
    });
  } finally {
    await canvas.dispose();
  }
}

async function cameraDownload(page: Page) {
  const downloading = page.waitForEvent('download', { timeout: APPEARANCE_EXPORT_TIMEOUT_MS });
  await page.locator('#screenshotButton').click();
  return screenshotPixels(await downloading);
}

async function prepareAppearanceMagicDrawing(page: Page) {
  await page.emulateMedia({ colorScheme: 'light' });
  await gotoApp(page);
  await openDrawer(page);
  await applyFarmPage(page);
  await pickBrush(page, '#magicBrushButton');
  await draw(page, APPEARANCE_MAGIC_POINTS);
  await expect
    .poll(async () => (await liveMagicWitness(page)).opaquePixels, {
      timeout: APPEARANCE_EXPORT_TIMEOUT_MS,
    })
    .toBeGreaterThan(0);
  await expect(page.locator('#screenshotButton')).toBeEnabled();
  return cameraDownload(page);
}

async function observeCameraPreparation(page: Page) {
  await page.evaluate(() => {
    const original = window.createImageBitmap.bind(window);
    window.createImageBitmap = ((...args: Parameters<typeof createImageBitmap>) => {
      const button = document.getElementById('screenshotButton');
      if (button && args[0] instanceof HTMLCanvasElement && args[0].hasAttribute('data-live-tile'))
        button.dataset.bitmapRequests = String(Number(button.dataset.bitmapRequests ?? 0) + 1);
      return original(...args);
    }) as typeof createImageBitmap;
  });
}

async function pressPreparedCamera(page: Page) {
  const button = page.locator('#screenshotButton');
  await button.hover();
  await page.mouse.down();
  await expect.poll(() => button.getAttribute('data-bitmap-requests')).not.toBeNull();
}

test.describe('appearance-coherent actual camera export', () => {
  test.use({ deviceScaleFactor: 2 });
  test.setTimeout(APPEARANCE_EXPORT_TEST_TIMEOUT_MS);

  test('a held camera press preserves the complete appearance captured before an OS switch', async ({
    page,
  }) => {
    const light = await prepareAppearanceMagicDrawing(page);
    await page.waitForTimeout(SCREENSHOT_COOLDOWN_MS);
    await observeCameraPreparation(page);
    await pressPreparedCamera(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('#coloringOverlay')).toHaveAttribute(
      'data-canonical-url',
      /\.dark\.overlay\.svg$/
    );
    const downloading = page.waitForEvent('download', { timeout: APPEARANCE_EXPORT_TIMEOUT_MS });
    await page.mouse.up();
    const held = await screenshotPixels(await downloading);
    expect(exactPixelDifference(held, light)).toEqual({
      differentPixels: 0,
      firstDifference: null,
    });
  });

  test('a camera press during pending themed art retains coherent Magic ink and overlay', async ({
    page,
  }) => {
    const light = await prepareAppearanceMagicDrawing(page);
    await page.waitForTimeout(SCREENSHOT_COOLDOWN_MS);
    const lightInk = await liveMagicWitness(page);
    let releaseOverlay: () => void = () => {};
    const overlayGate = new Promise<void>((resolve) => {
      releaseOverlay = resolve;
    });
    let pendingRequests = 0;
    await page.route('**/*.dark.overlay.svg', async (route) => {
      pendingRequests++;
      await overlayGate;
      await route.continue();
    });
    await page.emulateMedia({ colorScheme: 'dark' });
    const overlay = page.locator('#coloringOverlay');
    await expect(overlay).toHaveAttribute('data-canonical-url', /\.dark\.overlay\.svg$/);
    await expect(overlay).toHaveAttribute('src', /(?<!\.dark)\.overlay\.svg$/);
    const pendingInk = await liveMagicWitness(page);
    await observeCameraPreparation(page);
    await pressPreparedCamera(page);
    const downloading = page.waitForEvent('download', { timeout: APPEARANCE_EXPORT_TIMEOUT_MS });
    await page.mouse.up();
    await expect.poll(() => pendingRequests).toBeGreaterThanOrEqual(1);
    releaseOverlay();
    const transitioning = await screenshotPixels(await downloading);
    await expect
      .poll(async () => (await liveMagicWitness(page)).sha256, {
        timeout: APPEARANCE_EXPORT_TIMEOUT_MS,
      })
      .not.toBe(lightInk.sha256);
    const darkInk = await liveMagicWitness(page);
    await page.waitForTimeout(SCREENSHOT_COOLDOWN_MS);
    const dark = await cameraDownload(page);
    const evidence = {
      lightInk,
      pendingInk,
      darkInk,
      lightPng: light.sha256,
      transitioningPng: transitioning.sha256,
      darkPng: dark.sha256,
      comparedToLight: exactPixelDifference(transitioning, light),
      comparedToDark: exactPixelDifference(transitioning, dark),
    };
    await test.info().attach('appearance-boundary-pixels', {
      body: JSON.stringify(evidence),
      contentType: 'application/json',
    });
    expect(pendingInk).toEqual(lightInk);
    expect(evidence.comparedToLight).toEqual({ differentPixels: 0, firstDifference: null });
  });

  test('a deferred page fill fallback captures the incoming page appearance before its overlay settles', async ({
    page,
  }) => {
    await prepareAppearanceMagicDrawing(page);
    const originalInk = await liveMagicWitness(page);
    await page.waitForTimeout(SCREENSHOT_COOLDOWN_MS);
    await page.clock.install();
    let releaseOverlay: () => void = () => {};
    const overlayGate = new Promise<void>((resolve) => {
      releaseOverlay = resolve;
    });
    await page.route('**/cow-*.overlay.svg', async (route) => {
      await overlayGate;
      await route.continue();
    });
    await openColoringDialog(page);
    await (await openFarmPageGrid(page)).nth(1).click();
    await expect(page.locator('#coloring-book-dialog')).toBeHidden();
    await expect(page.locator('#coloringOverlay')).toHaveAttribute(
      'data-canonical-url',
      /cow-(?:wide|tall)\.overlay\.svg$/
    );
    await page.clock.fastForward(DEFERRED_APPEARANCE_OBSERVATION_MS);
    await expect
      .poll(async () => (await liveMagicWitness(page)).sha256, {
        timeout: APPEARANCE_EXPORT_TIMEOUT_MS,
      })
      .not.toBe(originalInk.sha256);
    const fallbackInk = await liveMagicWitness(page);
    await observeCameraPreparation(page);
    await pressPreparedCamera(page);
    const downloading = page.waitForEvent('download', { timeout: APPEARANCE_EXPORT_TIMEOUT_MS });
    await page.mouse.up();
    releaseOverlay();
    const fallback = await screenshotPixels(await downloading);
    await expect(page.locator('#coloringOverlay')).toHaveAttribute(
      'src',
      /cow-(?:wide|tall)\.overlay\.svg$/
    );
    await page.waitForTimeout(SCREENSHOT_COOLDOWN_MS);
    const settledInk = await liveMagicWitness(page);
    const settled = await cameraDownload(page);
    await test.info().attach('deferred-fill-appearance-pixels', {
      body: JSON.stringify({
        originalInk,
        fallbackInk,
        settledInk,
        fallbackDimensions: { width: fallback.width, height: fallback.height },
        settledDimensions: { width: settled.width, height: settled.height },
        comparedToSettled: exactPixelDifference(fallback, settled),
      }),
      contentType: 'application/json',
    });
    expect(settledInk).toEqual(fallbackInk);
    expect(exactPixelDifference(fallback, settled)).toEqual({
      differentPixels: 0,
      firstDifference: null,
    });
  });

  for (const idleBrush of ['magic', 'pen'] as const) {
    test(`a new Magic stroke after a ${idleBrush} empty-paper material resize retains export appearance ownership`, async ({
      page,
    }) => {
      await prepareAppearanceMagicDrawing(page);
      await page.waitForTimeout(SCREENSHOT_COOLDOWN_MS);
      const before = await page.locator('#drawingCanvas').boundingBox();
      await page.locator('#clearButton').focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#screenshotButton')).toBeDisabled();
      await pickBrush(page, idleBrush === 'pen' ? '#penBrushButton' : '#magicBrushButton');
      await page.setViewportSize(RESIZED_APPEARANCE_VIEWPORT);
      await expect
        .poll(async () => (await page.locator('#drawingCanvas').boundingBox())?.width)
        .not.toBe(before?.width);
      await expect
        .poll(
          async () =>
            page.evaluate(() => {
              const input = document.querySelector<HTMLCanvasElement>('#drawingCanvas');
              const sheet = document.querySelector<HTMLElement>('.paper-sheet');
              if (!input || !sheet) return false;
              const bounds = input.getBoundingClientRect();
              return (
                Number.parseFloat(sheet.style.width) === bounds.width &&
                Number.parseFloat(sheet.style.height) === bounds.height
              );
            }),
          { timeout: APPEARANCE_EXPORT_TIMEOUT_MS }
        )
        .toBe(true);
      const dimensions = await page.locator('#drawingCanvas').evaluate((input) => {
        const bounds = input.getBoundingClientRect();
        return {
          width: Math.round(bounds.width * devicePixelRatio),
          height: Math.round(bounds.height * devicePixelRatio),
        };
      });
      await expect
        .poll(
          async () => {
            const witness = await liveMagicWitness(page);
            return { width: witness.width, height: witness.height };
          },
          { timeout: APPEARANCE_EXPORT_TIMEOUT_MS }
        )
        .toEqual(dimensions);
      await pickBrush(page, '#magicBrushButton');
      await draw(page, APPEARANCE_MAGIC_POINTS);
      await expect
        .poll(async () => (await liveMagicWitness(page)).opaquePixels, {
          timeout: APPEARANCE_EXPORT_TIMEOUT_MS,
        })
        .toBeGreaterThan(0);
      const preparedInk = await liveMagicWitness(page);
      expect({ width: preparedInk.width, height: preparedInk.height }).toEqual(dimensions);
      const resized = await cameraDownload(page);
      expect({ width: resized.width, height: resized.height }).toEqual(dimensions);
    });
  }
});
