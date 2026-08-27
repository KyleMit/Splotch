import { expect, test, type Page } from '@playwright/test';

import { invokeAiGeneration, prepareAiGeneration } from './ai-harness';
import {
  drawCommittedStroke,
  firstOpaquePixel,
  gotoApp,
  registerServiceWorkerAndControl,
  spaNavigate,
} from './helpers';
import { openDrawer } from './flows-harness';

async function drawingHistory(page: Page) {
  return page.evaluate(() => {
    const history = window.__drawingDebug?.getUndoDebug();
    if (!history) throw new Error('drawing history is unavailable');
    return history;
  });
}

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
  const beforeOffline = await drawingHistory(page);
  expect(beforeOffline.snapshots).toBe(1);

  await page.context().setOffline(true);
  await spaNavigate(page, '/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __spa?: boolean }).__spa)).toBe(true);

  await page.goBack();
  await expect(page.locator('#drawingCanvas')).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __spa?: boolean }).__spa)).toBe(true);
  await expect.poll(() => drawingHistory(page)).toMatchObject({ snapshots: 1 });
  expect(await firstOpaquePixel(page)).not.toBeNull();

  await drawCommittedStroke(page, [
    { x: 110, y: 260 },
    { x: 280, y: 320 },
  ]);
  await openDrawer(page);
  const undo = page.locator('#undoButton');
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect.poll(() => drawingHistory(page)).toMatchObject({ snapshots: 1 });
  expect(await firstOpaquePixel(page)).not.toBeNull();
});

test('a stalled provider lets the child keep drawing, then recovers after failure', async ({
  page,
}) => {
  const endpoint = await prepareAiGeneration(page);
  const beforeRequest = await drawingHistory(page);
  expect(beforeRequest.snapshots).toBe(1);

  await invokeAiGeneration(page);
  await endpoint.waitForFirstRequest();
  await expect(page.locator('dialog.ai-result-modal')).toBeVisible();
  await page.getByLabel('Keep drawing while this is made').click();
  await expect(page.locator('.ai-waiting-polaroid')).toBeVisible();

  await drawCommittedStroke(page, [
    { x: 80, y: 260 },
    { x: 300, y: 320 },
  ]);
  await expect.poll(() => drawingHistory(page)).toMatchObject({ snapshots: 2 });
  expect(await firstOpaquePixel(page)).not.toBeNull();

  await endpoint.fail(502);
  await expect(page.locator('.ai-waiting-polaroid')).toContainText('Oh no');
  await page.locator('.ai-waiting-polaroid').click();
  await expect(page.getByText(/didn't work/i)).toBeVisible();

  await invokeAiGeneration(page);
  await expect.poll(() => endpoint.requests.length).toBe(2);
  await endpoint.succeed();
  await expect(page.locator('.stage-img.result.shown')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Close' }).click();

  await expect.poll(() => drawingHistory(page)).toMatchObject({ snapshots: 2 });
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
