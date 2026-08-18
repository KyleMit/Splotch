import type { Page } from '@playwright/test';
import { count, drawStroke, expect, test } from './engine-harness';

async function measurePreparedExportOwnership(page: Page) {
  return page.evaluate(async () => {
    const originalCreateImageBitmap = window.createImageBitmap.bind(window);
    let closeCount = 0;
    let pendingBitmapCount = 0;
    window.createImageBitmap = (async (source: ImageBitmapSource) => {
      pendingBitmapCount++;
      try {
        const bitmap = await originalCreateImageBitmap(source);
        const originalClose = bitmap.close.bind(bitmap);
        Object.defineProperty(bitmap, 'close', {
          value() {
            closeCount++;
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
      const completionAfterCancel = await cancelled.complete();
      const closedAfterCompletionAttempt = closeCount;

      const completed = window.__engine.prepareCanvasExport();
      if (!completed) throw new Error('Expected a second canvas export preparation');
      const completion = completed.complete();
      const closedBeforeLateCancel = closeCount;
      completed.cancel();
      const closedAfterLateCancel = closeCount;
      await completion;
      const closedAfterCompletion = closeCount;

      return {
        closedAfterCancel,
        completionAfterCancel,
        closedAfterCompletionAttempt,
        closedBeforeLateCancel,
        closedAfterLateCancel,
        closedAfterCompletion,
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
  expect(result.closedAfterCompletion).toBeGreaterThan(result.closedAfterLateCancel);
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
  });
});
