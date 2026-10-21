import { expect, test } from '../fixtures.ts';
import { openDocument, waitForDrawingScreen } from '../support/app.ts';
import { blackInkInCentralBand } from '../support/group-b.ts';
import type { Page } from '@playwright/test';

test.use({ colorScheme: 'light', viewport: { width: 1280, height: 720 } });

// The export's worker, which the app registers once the child has had a quiet moment. A spec that
// cannot wait for that registers it directly, so the offline cases do not depend on idle timing.
const WORKER_SCRIPT = '/sw.js';

async function putWorkerInControl(page: Page) {
  await page.evaluate(async (script) => {
    await navigator.serviceWorker.register(script);
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
    });
  }, WORKER_SCRIPT);
}

test.describe('with the worker in control and no network', () => {
  test('a launch still opens a drawing screen that draws and takes a stroke back', async ({
    drawingScreen,
    context,
  }) => {
    const { page } = drawingScreen;
    await putWorkerInControl(page);
    await context.setOffline(true);

    await page.reload();
    await waitForDrawingScreen(page);
    await drawingScreen.pickColor('Black');
    await drawingScreen.drawStroke();
    await expect.poll(() => blackInkInCentralBand(page)).toBeGreaterThan(0);

    await drawingScreen.undo();
    await expect.poll(() => blackInkInCentralBand(page)).toBe(0);
  });

  test('the privacy policy and the changelog still open', async ({ drawingScreen, context }) => {
    const { page } = drawingScreen;
    await putWorkerInControl(page);
    await context.setOffline(true);

    const privacy = await openDocument(page, '/privacy');
    expect(privacy.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();

    const changelog = await openDocument(page, '/changelog');
    expect(changelog.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'Changelog' })).toBeVisible();
  });
});
