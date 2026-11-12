import type { Page } from '@playwright/test';
import { drawStroke, expect, test } from './engine-harness';
import { COLOR_CHANGE_DEBOUNCE_SETTLE_MS } from './helpers';

// A phone screen above the live render cap: the engine draws at 2× and saves at 3×, so every export
// replays the history (ADR-0088). The replay worker's CPU surfaces must save the same picture the
// page's own replay does, within the line the 2026-11 campaign set for a saved image: under 1% of
// pixels off by more than 8 levels in any channel, and a mean difference under one level.
const DEVICE_SCALE_FACTOR = 3;
const PIXEL_TOLERANCE_LEVELS = 8;
const MAX_DIFFERING_PIXEL_FRACTION = 0.01;
const MAX_MEAN_CHANNEL_DIFFERENCE = 1;
// More strokes than the undo depth, so the oldest fold into the history base and the replay draws
// both base tiles and retained ops.
const STROKE_COUNT = 26;
// Each fold runs one command per TILE_HISTORY_FOLD_IDLE_MS of idle.
const FOLD_DEADLINE_MS = 20_000;
const STROKE_INSET_PX = 120;

test.use({ deviceScaleFactor: DEVICE_SCALE_FACTOR });

type Brush = 'pen' | 'crayon' | 'magic' | 'eraser';

const BRUSH_CYCLE: readonly Brush[] = ['pen', 'crayon', 'crayon', 'magic', 'pen', 'eraser'];
const COLORS = ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#8e24aa'];

async function useBrush(page: Page, brush: Brush, color: string) {
  await page.evaluate(
    ([nextBrush, nextColor]) => {
      const engine = window.__engine;
      engine.setCrayonMode(nextBrush === 'crayon');
      engine.setMagicMode(nextBrush === 'magic');
      engine.setEraserMode(nextBrush === 'eraser');
      engine.setColor(nextColor);
      engine.setStrokeWidth(nextBrush === 'eraser' ? 18 : 12);
    },
    [brush, color] as const
  );
  // A colour change swallows the strokes that begin inside its debounce (the swatch tap itself).
  await page.waitForTimeout(COLOR_CHANGE_DEBOUNCE_SETTLE_MS);
}

async function drawDensePicture(page: Page) {
  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  for (let i = 0; i < STROKE_COUNT; i++) {
    await useBrush(page, BRUSH_CYCLE[i % BRUSH_CYCLE.length], COLORS[i % COLORS.length]);
    // Inset from every edge, so no stroke reads as an OS edge swipe and is discarded.
    const y = STROKE_INSET_PX + ((i * 37) % Math.max(1, box.height - 2 * STROKE_INSET_PX));
    const points = Array.from({ length: 9 }, (_, step) => ({
      x: STROKE_INSET_PX + step * ((box.width - 2 * STROKE_INSET_PX) / 8),
      y: y + (step % 2 === 0 ? -24 : 24),
    }));
    await drawStroke(page, box, points);
  }
}

async function compareReplayExports(page: Page) {
  return page.evaluate(async (tolerance) => {
    const spawned: string[] = [];
    const NativeWorker = window.Worker;
    class RecordingWorker extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        spawned.push(String(url));
      }
    }
    const setWorker = (value: typeof Worker | undefined) =>
      Object.defineProperty(window, 'Worker', { value, configurable: true, writable: true });

    const decode = async (blob: Blob | null) => {
      if (!blob) throw new Error('export produced no PNG');
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('no 2D context to decode the export');
      context.drawImage(bitmap, 0, 0);
      return context.getImageData(0, 0, bitmap.width, bitmap.height);
    };

    let workerBlob: Blob | null;
    let pageBlob: Blob | null;
    try {
      setWorker(RecordingWorker);
      workerBlob = await window.__engine.exportCanvasBlob();
      // Without Worker the export takes the page's own replay, the reference picture.
      setWorker(undefined);
      pageBlob = await window.__engine.exportCanvasBlob();
    } finally {
      setWorker(NativeWorker);
    }
    const [fromWorker, fromPage] = await Promise.all([decode(workerBlob), decode(pageBlob)]);
    let differing = 0;
    let channelDifference = 0;
    for (let i = 0; i < fromWorker.data.length; i += 4) {
      let worst = 0;
      for (let channel = 0; channel < 4; channel++) {
        const difference = Math.abs(fromWorker.data[i + channel] - fromPage.data[i + channel]);
        channelDifference += difference;
        worst = Math.max(worst, difference);
      }
      if (worst > tolerance) differing++;
    }
    const pixels = fromWorker.width * fromWorker.height;
    return {
      replayWorkerSpawned: spawned.some((url) => url.includes('exportReplay')),
      size: [fromWorker.width, fromWorker.height],
      referenceSize: [fromPage.width, fromPage.height],
      differingFraction: differing / pixels,
      meanChannelDifference: channelDifference / (pixels * 4),
    };
  }, PIXEL_TOLERANCE_LEVELS);
}

test('the replay worker saves the picture the page replay does', async ({ page }) => {
  await drawDensePicture(page);
  await expect
    .poll(() => page.evaluate(() => window.__engine.getUndoDebug().baseRasters), {
      timeout: FOLD_DEADLINE_MS,
    })
    .toBeGreaterThan(0);

  const result = await compareReplayExports(page);
  await test.info().attach('export-replay-comparison', {
    body: JSON.stringify(result),
    contentType: 'application/json',
  });

  expect(result.replayWorkerSpawned).toBe(true);
  expect(result.size).toEqual(result.referenceSize);
  expect(result.differingFraction).toBeLessThan(MAX_DIFFERING_PIXEL_FRACTION);
  expect(result.meanChannelDifference).toBeLessThan(MAX_MEAN_CHANNEL_DIFFERENCE);
});
