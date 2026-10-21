import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { openDocument } from '../support/app.ts';
import { openDrawingScreen } from '../support/drawing.ts';
import { drawRowStroke } from '../support/group-c.ts';

// Installing the service worker does real offline work, so the export registers it only once a few
// strokes show a visit is settled (install/installPolicy.ts SETTLED_IN_STROKES), at the next idle
// after the drawing paints. A repeat visit does not wait: the worker from the earlier session
// controls the page from load. Once it controls, the app opens offline.

const SETTLED_STROKES = 3;
const SERVICE_WORKER_SCRIPT = '/sw.js';

// The first visit's install fetches the app shell and the bundled starter book from the suite's
// server before the worker can activate, which a starved CI runner stretches.
const INSTALL_BUDGET_MS = 120_000;
// Longer than the idle deferral between the gate opening and the registration, so a registration
// that fired early would show before this ends.
const EARLY_REGISTRATION_WINDOW_MS = 3_000;

function hasRegistration(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    navigator.serviceWorker.getRegistration().then((registration) => !!registration)
  );
}

function hasController(page: Page): Promise<boolean> {
  return page.evaluate(() => !!navigator.serviceWorker.controller);
}

async function settleVisit(page: Page, paper: ReturnType<Page['locator']>) {
  for (let row = 0; row < SETTLED_STROKES; row++) await drawRowStroke(page, paper, row);
}

test('the service worker registers only after the stroke-count gate passes', async ({
  page,
  context,
}) => {
  const scriptRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === SERVICE_WORKER_SCRIPT)
      scriptRequests.push(request.url());
  });
  const { paper } = await openDrawingScreen(page);
  await page.waitForLoadState('networkidle');

  expect(context.serviceWorkers()).toEqual([]);
  expect(await hasRegistration(page)).toBe(false);
  expect(scriptRequests).toEqual([]);

  for (let row = 0; row < SETTLED_STROKES - 1; row++) await drawRowStroke(page, paper, row);
  await page.waitForTimeout(EARLY_REGISTRATION_WINDOW_MS);
  expect(await hasRegistration(page)).toBe(false);
  expect(scriptRequests).toEqual([]);

  const worker = context.waitForEvent('serviceworker');
  await drawRowStroke(page, paper, SETTLED_STROKES - 1);
  expect(new URL((await worker).url()).pathname).toBe(SERVICE_WORKER_SCRIPT);
  await expect.poll(() => hasRegistration(page)).toBe(true);
});

test('a repeat visit is controlled by the service worker with no stroke gate', async ({ page }) => {
  test.setTimeout(INSTALL_BUDGET_MS);
  const { paper } = await openDrawingScreen(page);
  await settleVisit(page, paper);
  await expect.poll(() => hasRegistration(page), { timeout: INSTALL_BUDGET_MS }).toBe(true);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

  await openDrawingScreen(page);

  expect(await hasController(page)).toBe(true);
  expect(await hasRegistration(page)).toBe(true);
});

test('a controlled visit opens the drawing screen and a page offline', async ({
  page,
  context,
}) => {
  test.setTimeout(INSTALL_BUDGET_MS);
  const { paper } = await openDrawingScreen(page);
  await settleVisit(page, paper);
  await expect.poll(() => hasRegistration(page), { timeout: INSTALL_BUDGET_MS }).toBe(true);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await openDrawingScreen(page);
  expect(await hasController(page)).toBe(true);

  await context.setOffline(true);

  await openDrawingScreen(page);
  const response = await openDocument(page, '/privacy');
  expect(response.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();
});
