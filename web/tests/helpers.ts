import { expect, type Locator, type Page } from '@playwright/test';

// Shared E2E helpers used across specs. Keep this module WebKit-portable — no
// CDP sessions or dev-harness routes — because webkit-smoke.spec.ts imports it
// (see web/tests/CLAUDE.md).

/** Navigate to the app and wait for hydration: the canvas mounts on the client,
 *  so once it's visible the app has hydrated. */
export async function gotoApp(page: Page, path = '/') {
  await page.goto(path);
  await expect(page.locator('#drawingCanvas')).toBeVisible();
}

// Open an overlay/flyout/dialog robustly and leave it open. Several of these
// controls idle-mount (ADR-0049) or reposition on the first frame, so the first
// click can land before the handler is wired and be dropped; a flyout toggle
// must also not be re-clicked when it's already open (that would toggle it
// shut). Retry the whole open until `ready` — the control's presence sentinel —
// is visible, skipping the click whenever it already is. `open` owns the click
// (and its own per-click timeout); `settle` is the per-attempt wait for `ready`.
export async function retryOpen(
  ready: Locator,
  open: () => Promise<void>,
  { timeout = 10_000, settle = 1500 }: { timeout?: number; settle?: number } = {}
) {
  await expect(async () => {
    if (!(await ready.isVisible().catch(() => false))) await open();
    await expect(ready).toBeVisible({ timeout: settle });
  }).toPass({ timeout });
}

// Open the Parent Center robustly and return its modal locator. It idle-mounts
// on first open (ADR-0049), so the first click can be lost before its handler is
// wired — retryOpen rides that out and skips the click when it's already open.
export async function openParentCenter(page: Page) {
  const modal = page.locator('#parentHelpModal');
  await retryOpen(modal, () =>
    page.getByRole('button', { name: 'Parent Center' }).click({ timeout: 3000 })
  );
  return modal;
}

/** Drag a stroke through the given canvas-space points using real mouse input. */
export async function dragStroke(
  page: Page,
  box: { x: number; y: number } | null,
  points: { x: number; y: number }[]
) {
  if (!box) throw new Error('canvas has no bounding box');
  await page.mouse.move(box.x + points[0].x, box.y + points[0].y);
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(box.x + p.x, box.y + p.y);
  await page.mouse.up();
}

/** Drag a stroke through canvas-relative points with real mouse input. */
export async function draw(page: Page, points: { x: number; y: number }[]) {
  const box = await page.locator('#drawingCanvas').boundingBox();
  await dragStroke(page, box, points);
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
