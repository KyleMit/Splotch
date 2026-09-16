import { expect, test, type Page } from '@playwright/test';
import { draw, gotoApp, registerServiceWorkerAndControl } from './helpers';
import { openColoringDialog, openDrawer, openFarmPageGrid } from './flows-harness';
import {
  LEGACY_PAGES_CACHE_NAME,
  PAGE_CACHE_CLEANUP_SCRIPT_PREFIX,
  PAGES_CACHE_NAME,
} from '../src/lib/pwa/pageCacheCleanup';
import { CACHE_BUST_VERSION_PARAM } from '../src/lib/pwa/versionEndpoint';

// Issue #462: service-worker installation does meaningful offline work, so registration no longer
// happens at load — it
// waits behind the same "a few strokes drawn" signal the Install Banner uses
// (SETTLED_IN_STROKES), then lands at idle. This pins both sides of
// the gate: no sw.js request or registration before the third stroke, and the
// third stroke arms it. A repeat visit must not wait for strokes — the SW from
// the previous session keeps controlling the page from load.

test.skip(!!process.env.DEV_SERVER, 'the dev server neither emits nor registers sw.js');

function hasRegistration(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    navigator.serviceWorker.getRegistration().then((registration) => !!registration)
  );
}

async function selectFarmImages(page: Page) {
  await openDrawer(page);
  await openColoringDialog(page);
  const pages = await openFarmPageGrid(page);
  const pagePreview = pages.first().locator('img');
  await expect
    .poll(() => pagePreview.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .not.toBe(0);
  const pagePreviewSource = await imageSourceAndDecodedWidth(pagePreview);
  await pages.first().click();
  const overlay = page.locator('#coloringOverlay');
  await expect(overlay).toBeVisible();
  await expect
    .poll(() => overlay.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .not.toBe(0);
  return {
    pagePreview: pagePreviewSource,
    overlay: await imageSourceAndDecodedWidth(overlay),
  };
}

async function imageSourceAndDecodedWidth(image: ReturnType<Page['locator']>) {
  return image.evaluate(async (element: HTMLImageElement) => {
    const response = await fetch(element.currentSrc);
    const blob = await response.blob();
    if (blob.type === 'image/svg+xml') {
      const document = new DOMParser().parseFromString(await blob.text(), 'image/svg+xml');
      return {
        currentSrc: new URL(element.currentSrc).pathname,
        decodedWidth: Number(document.documentElement.getAttribute('width')),
      };
    }
    const bitmap = await createImageBitmap(blob);
    const result = {
      currentSrc: new URL(element.currentSrc).pathname,
      decodedWidth: bitmap.width,
    };
    bitmap.close();
    return result;
  });
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
  // The first visit's precache install pulls the app shell and starter book from the
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

// The page cache an earlier worker wrote holds the drawing app's own entries,
// which the app shell replaced, and entries Workbox's expiration never counted,
// so activation deletes it whole and navigations fill the capped cache instead.
test('activating the service worker deletes the page cache earlier workers wrote', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await gotoApp(page);
  const legacyPaths = [
    '/',
    '/index.html',
    `/?${CACHE_BUST_VERSION_PARAM}=0.0.0-earlier`,
    ...Array.from({ length: 25 }, (_, index) => `/privacy?earlier=${index}`),
  ];
  await page.evaluate(
    async ({ cacheName, paths }) => {
      const cache = await caches.open(cacheName);
      for (const path of paths) {
        await cache.put(
          path,
          new Response('earlier page', { headers: { 'Content-Type': 'text/html' } })
        );
      }
    },
    { cacheName: LEGACY_PAGES_CACHE_NAME, paths: legacyPaths }
  );

  await registerServiceWorkerAndControl(page);

  await expect
    .poll(() => page.evaluate((name) => caches.has(name), LEGACY_PAGES_CACHE_NAME), {
      timeout: 15_000,
    })
    .toBe(false);
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async (name) => {
        const keys = await (await caches.open(name)).keys();
        return keys.map((request) => new URL(request.url).pathname);
      }, PAGES_CACHE_NAME)
    )
    .toEqual(['/privacy']);
});

// Root-level scripts are served immutable, so a stable name would let a later
// worker import an earlier build's cleanup from the HTTP cache.
test('the service worker imports its page-cache cleanup under a content-hashed name', async ({
  page,
}) => {
  await gotoApp(page);
  const hashedName = new RegExp(`${PAGE_CACHE_CLEANUP_SCRIPT_PREFIX}[0-9a-f]{8}\\.js`).source;
  const imported = await page.evaluate(async (pattern) => {
    const worker = await (await fetch('/sw.js')).text();
    const name = new RegExp(pattern).exec(worker)?.[0];
    return { name, status: name ? (await fetch(`/${name}`)).status : 0 };
  }, hashedName);
  expect(imported).toEqual({ name: expect.any(String), status: 200 });
});

// NetworkFirst answers an offline navigation from the page cache however old
// the copy is: an age limit would refuse it and leave the page unreachable.
test('an old cached page still opens offline', async ({ page }) => {
  test.setTimeout(120_000);
  await gotoApp(page);
  await registerServiceWorkerAndControl(page);
  await page.evaluate(async (cacheName) => {
    const response = await fetch('/privacy');
    const headers = new Headers(response.headers);
    const yearMs = 365 * 24 * 60 * 60 * 1000;
    headers.set('Date', new Date(Date.now() - yearMs).toUTCString());
    const cache = await caches.open(cacheName);
    await cache.put('/privacy', new Response(await response.text(), { headers }));
  }, PAGES_CACHE_NAME);

  await page.context().setOffline(true);
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
});

test.describe('responsive coloring offline fallback', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

  test('serves canonical precache bytes for offline DPR 1 and DPR 3 page previews', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await gotoApp(page);
    await registerServiceWorkerAndControl(page);
    await gotoApp(page);
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    const cachedPaths = await page.evaluate(async () => {
      const paths: string[] = [];
      for (const cacheName of await caches.keys()) {
        for (const request of await (await caches.open(cacheName)).keys()) {
          paths.push(new URL(request.url).pathname);
        }
      }
      return paths;
    });
    expect(cachedPaths.some((path) => /^\/coloring\/max-\d+px\//.test(path))).toBe(false);
    expect(cachedPaths).toEqual(
      expect.arrayContaining([
        '/coloring/farm/cover.thumb.webp',
        '/coloring/farm/cat-tall.overlay.svg',
        '/coloring/farm/cat-tall.selector.webp',
      ])
    );

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.clearBrowserCache');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.context().setOffline(true);
    await gotoApp(page);

    const dprOne = await selectFarmImages(page);
    expect(dprOne.pagePreview).toEqual({
      currentSrc: '/coloring/max-240px/farm/cat-tall.selector.webp',
      decodedWidth: 267,
    });
    expect(dprOne.overlay).toEqual({
      currentSrc: '/coloring/farm/cat-tall.overlay.svg',
      decodedWidth: 1024,
    });

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 393,
      height: 852,
      deviceScaleFactor: 3,
      mobile: true,
    });
    await gotoApp(page);
    const dprThree = await selectFarmImages(page);
    expect(dprThree.pagePreview).toEqual({
      currentSrc: '/coloring/farm/cat-tall.selector.webp',
      decodedWidth: 267,
    });
    expect(dprThree.overlay).toEqual({
      currentSrc: '/coloring/farm/cat-tall.overlay.svg',
      decodedWidth: 1024,
    });
  });
});
