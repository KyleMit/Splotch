import { expect, test } from '@playwright/test';
import { draw, firstOpaquePixel, spaNavigate, expectNoReload } from './helpers';
import { openDrawer } from './flows-harness';

test.skip(
  !!process.env.DEV_SERVER,
  'guards prerendered-page hydration; the dev server does not prerender'
);

for (const replaceCanvas of [false, true]) {
  test(`pre-hydration ink and undo state, forced replacement=${replaceCanvas}`, async ({
    page,
  }) => {
    let releaseLayout!: () => void;
    const layoutHeld = new Promise<void>((resolve) => (releaseLayout = resolve));
    await page.route('**/_app/immutable/nodes/0.*.js', async (route) => {
      await layoutHeld;
      await route.continue();
    });
    const messages: string[] = [];
    page.on('console', (message) => messages.push(message.text()));
    await page.goto('/', { waitUntil: 'commit' });
    await expect
      .poll(() =>
        page.locator('#drawingCanvas').evaluate((canvas: HTMLCanvasElement) => canvas.width)
      )
      .toBe(1);
    expect(await page.evaluate(() => Boolean(window.__drawingDebug))).toBe(false);
    const earlyCanvas = await page.locator('#drawingCanvas').elementHandle();
    await draw(page, [
      { x: 300, y: 300 },
      { x: 550, y: 400 },
    ]);
    await expect.poll(() => firstOpaquePixel(page)).not.toBeNull();
    expect(await page.evaluate(() => Boolean(window.__drawingDebug))).toBe(false);
    if (replaceCanvas) {
      await page
        .locator('#drawingCanvas')
        .evaluate((canvas) => canvas.replaceWith(canvas.cloneNode(true)));
    }
    releaseLayout();
    await expect.poll(() => page.evaluate(() => Boolean(window.__drawingDebug))).toBe(true);
    expect(
      await earlyCanvas!.evaluate((canvas) => canvas === document.getElementById('drawingCanvas'))
    ).toBe(!replaceCanvas);
    await openDrawer(page);
    console.log(
      JSON.stringify({
        replaceCanvas,
        history: await page.evaluate(() => window.__drawingDebug!.getUndoDebug()),
        pixel: await firstOpaquePixel(page),
        undoDisabled: await page.locator('#undoButton').getAttribute('aria-disabled'),
        saveDisabled: await page.locator('#screenshotButton').isDisabled(),
        hydrationWarnings: messages.filter((message) => /hydration/i.test(message)),
      })
    );
    await expect(page.locator('#undoButton')).toBeEnabled();
    await expect(page.locator('#screenshotButton')).toBeEnabled();
    await spaNavigate(page, '/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
    await spaNavigate(page, '/');
    await expect.poll(() => page.evaluate(() => Boolean(window.__drawingDebug))).toBe(true);
    await expectNoReload(page);
    expect(await earlyCanvas!.evaluate((canvas) => canvas.isConnected)).toBe(false);
    await openDrawer(page);
    await expect(page.locator('#undoButton')).toBeEnabled();
    await expect(page.locator('#screenshotButton')).toBeEnabled();
    await expect.poll(() => firstOpaquePixel(page)).not.toBeNull();
    console.log(
      JSON.stringify({
        history: await page.evaluate(() => window.__drawingDebug!.getUndoDebug()),
        hydrationWarnings: messages.filter((message) => /hydration/i.test(message)),
      })
    );
    await page.locator('#undoButton').click();
    await expect(page.locator('#undoButton')).toBeDisabled();
    await expect.poll(() => firstOpaquePixel(page)).toBeNull();
    expect(messages.filter((message) => /hydration/i.test(message))).toEqual([]);
  });
}
