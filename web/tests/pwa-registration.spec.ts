import { expect, test, type Page } from '@playwright/test';

// Issue #462: the service worker precaches the full offline bundle (~39 MB of
// coloring-page variants), so registration no longer happens at load — it
// waits behind the same "a few strokes drawn" signal the Install Banner uses
// (STROKES_BEFORE_SW_REGISTER), then lands at idle. This pins both sides of
// the gate: no sw.js request or registration before the third stroke, and the
// third stroke arms it. A repeat visit must not wait for strokes — the SW from
// the previous session keeps controlling the page from load.

test.skip(!!process.env.DEV_SERVER, 'the dev server neither emits nor registers sw.js');

async function gotoApp(page: Page) {
  await page.goto('/');
  await expect(page.locator('#drawingCanvas')).toBeVisible();
}

async function draw(page: Page, points: { x: number; y: number }[]) {
  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  await page.mouse.move(box.x + points[0].x, box.y + points[0].y);
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(box.x + p.x, box.y + p.y);
  await page.mouse.up();
}

function hasRegistration(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    navigator.serviceWorker.getRegistration().then((registration) => !!registration)
  );
}

test('the service worker registers only after the stroke-count gate passes', async ({ page }) => {
  const swScriptRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/sw.js') swScriptRequests.push(request.url());
  });
  const context = page.context();

  await gotoApp(page);
  await page.waitForLoadState('networkidle');

  // Load settled with no registration and no sw.js fetch.
  expect(context.serviceWorkers()).toEqual([]);
  expect(await hasRegistration(page)).toBe(false);
  expect(swScriptRequests).toEqual([]);

  // Two strokes stay below the gate; the wait outlasts the 200 ms idle
  // fallback, so a premature registration would be visible here.
  await draw(page, [
    { x: 120, y: 120 },
    { x: 220, y: 160 },
  ]);
  await draw(page, [
    { x: 140, y: 200 },
    { x: 260, y: 240 },
  ]);
  await page.waitForTimeout(750);
  expect(await hasRegistration(page)).toBe(false);
  expect(swScriptRequests).toEqual([]);

  // The third stroke passes the gate — registration lands at the next idle.
  const workerPromise = context.waitForEvent('serviceworker');
  await draw(page, [
    { x: 160, y: 280 },
    { x: 300, y: 320 },
  ]);
  const worker = await workerPromise;
  expect(new URL(worker.url()).pathname).toBe('/sw.js');
  await expect.poll(() => hasRegistration(page)).toBe(true);
});

test('a repeat visit is controlled by the service worker with no stroke gate', async ({ page }) => {
  // The first visit's precache install pulls the full offline bundle from the
  // local preview server before the SW can activate.
  test.setTimeout(120_000);
  await gotoApp(page);
  for (const offset of [0, 60, 120]) {
    await draw(page, [
      { x: 140, y: 140 + offset },
      { x: 280, y: 180 + offset },
    ]);
  }
  await expect.poll(() => hasRegistration(page), { timeout: 15_000 }).toBe(true);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

  // Second visit: no strokes drawn, yet the SW controls the page from load
  // (clientsClaim already ran on the first visit, so this navigation is
  // SW-served) — deferral is a first-visit-only behavior.
  await gotoApp(page);
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  expect(await hasRegistration(page)).toBe(true);
});
