// The stress tests in this file are the suite's heaviest by an order of
// magnitude, and irreducibly so: each draws up to MAX_UNDO_DEPTH real strokes
// and steps back through every one, because depth-at-the-cap under the patch
// budget is the claim under test. The loop count is the assertion — it cannot
// shrink without weakening the claim, faster pointer pacing trips the engine's
// dropped-pointer threshold (.claude/rules/testing.md), and CI sharding cannot
// split below a single test, so the slowest test here bounds the longest e2e
// shard. The one legitimate diet is per-stroke point density, and only with
// proof the patch budget still trips plus a --repeat-each flake check.
import { expect, test, type Page } from '@playwright/test';
import { LIVE_TILE_COLUMNS, LIVE_TILE_COUNT } from '../src/lib/drawing/liveTiles';
import {
  MIN_TILED_UNDO_COMMANDS,
  TILED_UNDO_PATCH_BUDGET_PAPER_MULTIPLE,
  TILE_HISTORY_FOLD_IDLE_MS,
} from '../src/lib/drawing/tiledRenderer';
import { MAX_UNDO_DEPTH } from '../src/lib/drawing/undoHistory';
import { STORAGE_KEYS } from '../src/lib/storageKeys';
import { openDrawer, pickBrush } from './flows-harness';
import {
  draw,
  drawCommittedStroke,
  firstOpaquePixel,
  gotoApp,
  renderedCanvasHandle,
} from './helpers';

async function alphaAt(page: Page, xFraction: number, yFraction: number) {
  const rendered = await renderedCanvasHandle(page);
  try {
    return await rendered.evaluate(
      (canvas, { xFraction, yFraction }) =>
        canvas
          .getContext('2d')!
          .getImageData(
            Math.floor(canvas.width * xFraction),
            Math.floor(canvas.height * yFraction),
            1,
            1
          )
          .data.at(3),
      { xFraction, yFraction }
    );
  } finally {
    await rendered.dispose();
  }
}

async function opaquePixelsInBand(page: Page, leftFraction: number, rightFraction: number) {
  const rendered = await renderedCanvasHandle(page);
  try {
    return await rendered.evaluate(
      (canvas, { leftFraction, rightFraction }) => {
        const x = Math.floor(canvas.width * leftFraction);
        const y = Math.floor(canvas.height * 0.38);
        const width = Math.ceil(canvas.width * (rightFraction - leftFraction));
        const height = Math.ceil(canvas.height * 0.04);
        const data = canvas.getContext('2d')!.getImageData(x, y, width, height).data;
        let opaque = 0;
        for (let index = 3; index < data.length; index += 4) {
          if (data[index] > 0) opaque++;
        }
        return opaque;
      },
      { leftFraction, rightFraction }
    );
  } finally {
    await rendered.dispose();
  }
}

async function dispatchPenEdgeReturn(page: Page) {
  await page.locator('#drawingCanvas').evaluate((canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const fire = (type: string, xFraction: number, buttons: number) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          pointerType: 'pen',
          buttons,
          clientX: rect.left + rect.width * xFraction,
          clientY: rect.top + rect.height * 0.4,
          bubbles: true,
          cancelable: true,
        })
      );
    fire('pointerdown', 0.1, 1);
    fire('pointermove', 0.25, 1);
    fire('pointerout', 0.99, 1);
    fire('pointermove', 0.65, 1);
    fire('pointermove', 0.8, 1);
    fire('pointerup', 0.8, 0);
  });
}

for (const brush of ['pen', 'crayon'] as const) {
  test(`a tiled ${brush} edge return keeps fresh geometry in one undo command`, async ({
    page,
  }) => {
    await gotoApp(page);
    await openDrawer(page);
    if (brush === 'crayon') await pickBrush(page, '#crayonBrushButton');

    await dispatchPenEdgeReturn(page);

    expect(await page.evaluate(() => window.__drawingDebug?.getUndoDebug().snapshots)).toBe(1);
    expect(await page.evaluate(() => window.__drawingDebug?.getUndoDebug().pendingCommands)).toBe(
      0
    );
    expect(await opaquePixelsInBand(page, 0.08, 0.3)).toBeGreaterThan(50);
    expect(await opaquePixelsInBand(page, 0.35, 0.55)).toBe(0);
    expect(await opaquePixelsInBand(page, 0.62, 0.82)).toBeGreaterThan(50);

    await page.locator('#undoButton').click();
    await expect(page.locator('#undoButton')).toBeDisabled();
    await expect.poll(() => firstOpaquePixel(page)).toBeNull();
  });
}

test('tiled history folds its old prefix and retains twenty undo steps', async ({ page }) => {
  // The same irreducible max-depth traversal as the two stress tests below,
  // on the budget they declare.
  test.slow();
  await gotoApp(page);
  const foldedPrefix = 3;
  const strokeCount = MAX_UNDO_DEPTH + foldedPrefix;
  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) throw new Error('drawing canvas has no bounds');
  const pointsForStroke = (index: number) => {
    const y = 80 + index * 20;
    return [
      { x: 20, y },
      { x: box.width - 20, y },
    ];
  };
  for (let index = 0; index < MAX_UNDO_DEPTH; index++) {
    await draw(page, pointsForStroke(index));
  }

  const revisionAtDepthCap = await page.evaluate(
    () => window.__drawingDebug?.getUndoDebug().strokeRevision
  );
  if (revisionAtDepthCap === undefined) throw new Error('drawing stroke revision is unavailable');
  await drawCommittedStroke(page, pointsForStroke(MAX_UNDO_DEPTH));
  expect(await page.evaluate(() => window.__drawingDebug?.getUndoDebug())).toMatchObject({
    strokeRevision: revisionAtDepthCap + 1,
    snapshots: MAX_UNDO_DEPTH,
  });

  for (let index = MAX_UNDO_DEPTH + 1; index < strokeCount; index++) {
    await draw(page, pointsForStroke(index));
  }

  expect(await page.evaluate(() => window.__drawingDebug?.getUndoDebug().snapshots)).toBe(
    MAX_UNDO_DEPTH
  );
  await expect
    .poll(() => page.evaluate(() => window.__drawingDebug?.getUndoDebug().historyLength), {
      timeout: (foldedPrefix + 1) * TILE_HISTORY_FOLD_IDLE_MS,
    })
    .toBe(MAX_UNDO_DEPTH);
  expect(await page.evaluate(() => window.__drawingDebug?.getUndoDebug().baseRasters)).toBe(
    LIVE_TILE_COUNT
  );

  await openDrawer(page);
  for (let index = 0; index < MAX_UNDO_DEPTH; index++) {
    await page.locator('#undoButton').click();
  }
  await expect(page.locator('#undoButton')).toBeDisabled();

  const rendered = await renderedCanvasHandle(page);
  try {
    const alphaByStroke = await rendered.evaluate(
      (canvas, { count, columns }) => {
        const input = document.getElementById('drawingCanvas') as HTMLCanvasElement;
        const scale = canvas.width / input.getBoundingClientRect().width;
        const g = canvas.getContext('2d')!;
        const firstBoundary = canvas.width / columns;
        return Array.from({ length: count }, (_, index) => [
          g.getImageData(firstBoundary - 2 * scale, (80 + index * 20) * scale, 1, 1).data[3],
          g.getImageData(firstBoundary + 2 * scale, (80 + index * 20) * scale, 1, 1).data[3],
        ]);
      },
      { count: strokeCount, columns: LIVE_TILE_COLUMNS }
    );
    expect(
      alphaByStroke.slice(0, foldedPrefix).every((pair) => pair.every((alpha) => alpha > 0))
    ).toBe(true);
    expect(
      alphaByStroke.slice(foldedPrefix).every((pair) => pair.every((alpha) => alpha === 0))
    ).toBe(true);
  } finally {
    await rendered.dispose();
  }
});

test('tiled undo patches rebuild after the live canvas resizes', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await gotoApp(page);
  await draw(page, [
    { x: 120, y: 120 },
    { x: 280, y: 180 },
  ]);
  await draw(page, [
    { x: 180, y: 240 },
    { x: 340, y: 300 },
  ]);

  const originalBytes = await page.evaluate(
    () => window.__drawingDebug?.getUndoDebug().rasterBytes
  );
  // A rotation CSS-presents the locked paper without resizing its tile
  // backings (ADR-0089), and a bar-sized shrink windows it without resizing
  // them either (ADR-0099). Use a same-orientation resize far larger than a
  // system-bar occlusion, so the paper is genuinely re-adopted and the backing
  // and undo-patch rebuild path itself is exercised.
  await page.setViewportSize({ width: 700, height: 450 });
  await expect
    .poll(() => page.evaluate(() => window.__drawingDebug?.getUndoDebug().rasterBytes))
    .not.toBe(originalBytes);

  await openDrawer(page);
  await page.locator('#undoButton').click();
  await expect.poll(() => firstOpaquePixel(page)).not.toBeNull();
  await page.locator('#undoButton').click();
  await expect.poll(() => firstOpaquePixel(page)).toBeNull();
});

test('twenty large sweeping strokes retain the advertised undo depth within budget', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 1366, height: 915 });
  await gotoApp(page);
  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) throw new Error('drawing canvas has no bounds');

  for (let stroke = 0; stroke < MAX_UNDO_DEPTH; stroke++) {
    const phase = stroke % 2 === 0 ? 0 : Math.PI;
    const points = Array.from({ length: 9 }, (_, segment) => {
      const progress = segment / 8;
      return {
        x: box.width * (0.12 + progress * 0.76),
        y:
          segment === 0
            ? box.height * (stroke % 2 === 0 ? 0.22 : 0.78)
            : box.height * (0.5 + Math.sin(progress * Math.PI * 5 + phase) * 0.32),
      };
    });
    await draw(page, points);
  }

  const debug = await page.evaluate(() => window.__drawingDebug?.getUndoDebug());
  const paperBytes = await page
    .locator('canvas[data-live-tile]')
    .evaluateAll((tiles: HTMLCanvasElement[]) =>
      tiles.reduce((bytes, canvas) => bytes + canvas.width * canvas.height * 4, 0)
    );
  expect(debug?.snapshots).toBe(MAX_UNDO_DEPTH);
  expect(debug?.rasterBytes).toBeLessThanOrEqual(
    paperBytes * TILED_UNDO_PATCH_BUDGET_PAPER_MULTIPLE
  );

  await openDrawer(page);
  for (let index = 0; index < MAX_UNDO_DEPTH; index++) {
    await page.locator('#undoButton').click();
  }
  await expect(page.locator('#undoButton')).toBeDisabled();
  await expect.poll(() => firstOpaquePixel(page)).toBeNull();
});

test('pathological strokes shorten undo depth before exceeding the patch budget', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 900, height: 600 });
  await page.addInitScript(({ key, size }) => localStorage.setItem(key, String(size)), {
    key: STORAGE_KEYS.strokeWidthSize,
    size: 5,
  });
  await gotoApp(page);
  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) throw new Error('drawing canvas has no bounds');

  await drawCommittedStroke(page, [
    { x: box.width * 0.1, y: box.height * 0.1 },
    { x: box.width * 0.12, y: box.height * 0.1 },
  ]);
  await expect.poll(() => alphaAt(page, 0.11, 0.1)).toBeGreaterThan(0);
  for (let stroke = 1; stroke < MAX_UNDO_DEPTH; stroke++) {
    const phase = stroke % 2 === 0 ? 0 : Math.PI;
    const points = Array.from({ length: 9 }, (_, segment) => {
      const progress = segment / 8;
      return {
        x: box.width * (0.3 + progress * 0.65),
        y:
          segment === 0
            ? box.height * (stroke % 2 === 0 ? 0.05 : 0.95)
            : box.height * (0.5 + Math.sin(progress * Math.PI * 5 + phase) * 0.45),
      };
    });
    await draw(page, points);
  }
  expect(await alphaAt(page, 0.11, 0.1), 'marker after pathological strokes').toBeGreaterThan(0);

  const debug = await page.evaluate(() => window.__drawingDebug?.getUndoDebug());
  const paperBytes = await page
    .locator('canvas[data-live-tile]')
    .evaluateAll((tiles: HTMLCanvasElement[]) =>
      tiles.reduce((bytes, canvas) => bytes + canvas.width * canvas.height * 4, 0)
    );
  expect(debug?.snapshots).toBeGreaterThanOrEqual(MIN_TILED_UNDO_COMMANDS);
  expect(debug?.snapshots).toBeLessThan(MAX_UNDO_DEPTH);
  expect(debug?.rasterBytes).toBeLessThanOrEqual(
    paperBytes * TILED_UNDO_PATCH_BUDGET_PAPER_MULTIPLE
  );

  await openDrawer(page);
  expect(await firstOpaquePixel(page), 'ink after opening drawer').not.toBeNull();
  for (let index = 0; index < debug!.snapshots; index++) {
    await page.locator('#undoButton').click();
    expect(await firstOpaquePixel(page), `ink immediately after undo ${index + 1}`).not.toBeNull();
  }
  expect(await firstOpaquePixel(page), 'ink before Undo disables').not.toBeNull();
  await expect(page.locator('#undoButton')).toBeDisabled();
  expect(await firstOpaquePixel(page), 'ink after Undo disables').not.toBeNull();
});
