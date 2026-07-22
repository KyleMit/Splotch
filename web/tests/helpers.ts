import { expect, type Page } from '@playwright/test';

// Shared E2E helpers used across specs. Keep this module WebKit-portable — no
// CDP sessions or dev-harness routes — because webkit-smoke.spec.ts imports it
// (see web/tests/CLAUDE.md).

/** Navigate to the app and wait for hydration: the canvas mounts on the client,
 *  so once it's visible the app has hydrated. */
export async function gotoApp(page: Page, path = '/') {
  await page.goto(path);
  await expect(page.locator('#drawingCanvas')).toBeVisible();
}

/** Drag a stroke through canvas-relative points with real mouse input. */
export async function draw(page: Page, points: { x: number; y: number }[]) {
  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  await page.mouse.move(box.x + points[0].x, box.y + points[0].y);
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(box.x + p.x, box.y + p.y);
  await page.mouse.up();
}

/** First non-transparent pixel on the canvas as [r,g,b,a], or null if blank. */
export function firstOpaquePixel(page: Page): Promise<number[] | null> {
  return page.evaluate(() => {
    const c = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return [data[i - 3], data[i - 2], data[i - 1], data[i]];
    }
    return null;
  });
}
