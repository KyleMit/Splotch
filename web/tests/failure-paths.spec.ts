import { expect, test } from '@playwright/test';

import { invokeAiGeneration, prepareAiGeneration } from './ai-harness';
import {
  drawCommittedStroke,
  expectNoReload,
  firstOpaquePixel,
  gotoApp,
  readDrawingHistory,
  registerServiceWorkerAndControl,
  spaNavigate,
} from './helpers';
import { openDrawer } from './flows-harness';
import { PAGES_CACHE_NAME } from '../src/lib/pwa/pageCacheCleanup';
import { CACHE_BUST_VERSION_PARAM } from '../src/lib/pwa/versionEndpoint';

test('an offline PWA session preserves the drawing through supported client navigation', async ({
  page,
}) => {
  test.skip(!!process.env.DEV_SERVER, 'the dev server neither emits nor registers sw.js');
  test.setTimeout(120_000);

  await gotoApp(page);
  await registerServiceWorkerAndControl(page);
  await gotoApp(page);
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await drawCommittedStroke(page, [
    { x: 90, y: 120 },
    { x: 260, y: 190 },
  ]);
  await expect.poll(() => readDrawingHistory(page)).toMatchObject({ snapshots: 1 });

  await page.context().setOffline(true);
  await spaNavigate(page, '/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
  await expectNoReload(page);

  await page.goBack();
  await expect(page.locator('#drawingCanvas')).toBeVisible();
  await expectNoReload(page);
  await expect.poll(() => readDrawingHistory(page)).toMatchObject({ snapshots: 1 });
  expect(await firstOpaquePixel(page)).not.toBeNull();

  await drawCommittedStroke(page, [
    { x: 110, y: 260 },
    { x: 280, y: 320 },
  ]);
  await openDrawer(page);
  const undo = page.locator('#undoButton');
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect.poll(() => readDrawingHistory(page)).toMatchObject({ snapshots: 1 });
  expect(await firstOpaquePixel(page)).not.toBeNull();
});

// A deploy can leave the navigation cache holding HTML whose hashed chunks the active
// worker never precached. Renaming every chunk reference plants that page without a
// second build; the stale-hash URLs are unreachable offline just as evicted chunks are.
// The stale-page recovery URL takes a different fallback path in the worker, so both
// launch URLs are covered.
for (const launch of [
  { name: 'launch', path: '/' },
  { name: 'index document launch', path: '/index.html' },
  { name: 'stale-page recovery', path: `/?${CACHE_BUST_VERSION_PARAM}=0.0.0-other-build` },
]) {
  test(`an offline ${launch.name} boots even when the cached page is from a different build`, async ({
    page,
  }) => {
    test.skip(!!process.env.DEV_SERVER, 'the dev server neither emits nor registers sw.js');
    test.setTimeout(120_000);

    await gotoApp(page);
    await registerServiceWorkerAndControl(page);
    await gotoApp(page);
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    const plantedChunkReferences = await page.evaluate(
      async ({ launchPath, pagesCacheName }) => {
        const html = await (await fetch('/', { cache: 'no-store' })).text();
        const chunkReference = /(_app\/immutable\/[\w./-]+?)\.js/g;
        const otherBuildHtml = html.replace(chunkReference, '$1-other-build.js');
        const pages = await caches.open(pagesCacheName);
        await pages.put(
          launchPath,
          new Response(otherBuildHtml, { headers: { 'Content-Type': 'text/html' } })
        );
        return html.match(chunkReference)?.length ?? 0;
      },
      { launchPath: launch.path, pagesCacheName: PAGES_CACHE_NAME }
    );
    expect(plantedChunkReferences).toBeGreaterThan(0);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.clearBrowserCache');
    await page.context().setOffline(true);
    await gotoApp(page, launch.path);

    await drawCommittedStroke(page, [
      { x: 90, y: 120 },
      { x: 260, y: 190 },
    ]);
    expect(await firstOpaquePixel(page)).not.toBeNull();
  });
}

test('a stalled provider lets the child keep drawing, then recovers after failure', async ({
  page,
}) => {
  const endpoint = await prepareAiGeneration(page);
  await expect.poll(() => readDrawingHistory(page)).toMatchObject({ snapshots: 1 });

  await invokeAiGeneration(page);
  await endpoint.waitForFirstRequest();
  await expect(page.locator('dialog.ai-result-modal')).toBeVisible();
  await page.getByLabel('Keep drawing while this is made').click();
  await expect(page.locator('.ai-waiting-polaroid')).toBeVisible();

  await drawCommittedStroke(page, [
    { x: 80, y: 260 },
    { x: 300, y: 320 },
  ]);
  await expect.poll(() => readDrawingHistory(page)).toMatchObject({ snapshots: 2 });
  expect(await firstOpaquePixel(page)).not.toBeNull();

  await endpoint.fail(502);
  await expect(page.locator('.ai-waiting-polaroid')).toContainText('Oh no');
  await page.locator('.ai-waiting-polaroid').click();
  await expect(page.getByRole('heading', { name: /didn't work/i })).toBeVisible();

  const resultDialog = page.locator('dialog.ai-result-modal');
  await resultDialog.evaluate((dialog) => {
    dialog.addEventListener('close', () => (dialog.dataset.closeSettled = ''), { once: true });
  });
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(resultDialog).toHaveAttribute('data-close-settled', '');
  await expect(resultDialog).toBeHidden();

  await openDrawer(page);
  const aiButton = page.locator('#aiImageButton');
  await expect(aiButton).toBeEnabled();
  await aiButton.click();
  const magicalStyle = page.getByRole('button', { name: 'Magical' });
  await expect(magicalStyle).toBeEnabled();
  await magicalStyle.click();
  await expect.poll(() => endpoint.requests.length).toBe(2);
  await endpoint.succeed();
  await expect(page.locator('.stage-img.result.shown')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Close' }).click();

  await expect.poll(() => readDrawingHistory(page)).toMatchObject({ snapshots: 2 });
  expect(await firstOpaquePixel(page)).not.toBeNull();
});

test('denied browser storage still leaves drawing and undo usable', async ({ page }) => {
  await page.addInitScript(() => {
    const denied = () => {
      throw new DOMException('Storage is disabled', 'SecurityError');
    };
    Storage.prototype.getItem = denied;
    Storage.prototype.setItem = denied;
    Storage.prototype.removeItem = denied;
  });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await gotoApp(page, '/', { gates: 'default' });
  await drawCommittedStroke(page, [
    { x: 100, y: 120 },
    { x: 280, y: 220 },
  ]);
  await openDrawer(page);
  const undo = page.locator('#undoButton');
  await expect(undo).toBeEnabled();
  await undo.click();

  await expect.poll(() => firstOpaquePixel(page)).toBeNull();
  await expect(undo).toBeDisabled();
  expect(pageErrors).toEqual([]);
});

// SvelteKit eagerly imports the root error node at startup and ErrorScreen shares
// its chunk, so the boundary's lazy import reuses that fetch. One dropped request
// at startup therefore leaves the crash fallback with nothing to render. The
// chunk is found by its markup because its hashed name changes every build.
test('a render crash still offers a restart when the error screen chunk cannot load', async ({
  page,
}) => {
  test.skip(!!process.env.DEV_SERVER, 'the dev server serves unbundled modules, not chunks');

  await page.route('**/_app/immutable/**/*.js', async (route) => {
    const response = await route.fetch();
    if ((await response.text()).includes('class="error-screen')) return route.abort();
    return route.fulfill({ response });
  });
  await gotoApp(page);
  await page.evaluate(() => {
    const showModal = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function () {
      HTMLDialogElement.prototype.showModal = showModal;
      throw new Error('injected render crash');
    };
  });

  await expect(async () => {
    await page.getByRole('button', { name: 'Settings' }).click({ timeout: 1000 });
    await expect(page.locator('#drawingCanvas')).toHaveCount(0, { timeout: 1000 });
  }).toPass();

  const alert = page.getByRole('alert');
  await expect(alert.getByRole('heading', { name: 'Oops!' })).toBeVisible();
  await expect(page).toHaveTitle('Oops! · Splotch');

  await alert.getByRole('button', { name: 'Start over' }).click();
  await expect(page.locator('#drawingCanvas')).toBeVisible();
});
