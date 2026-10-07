import { expect, test } from '@playwright/test';
import { draw, firstOpaquePixel, renderedCanvasHandle } from '../../../../web/tests/helpers';
import { WEB_HOST_ENV } from '../host/contract';

const mechanism = process.env[WEB_HOST_ENV.artifact] === 'mechanism';

// cSpell:ignore prehydration

test('retained release paper accepts visible ink', async ({ page }) => {
  test.skip(mechanism, 'release-only outside observation');
  await page.goto('/');
  await expect(page.locator('#drawingCanvas')).toBeVisible();
  await expect
    .poll(() =>
      page.locator('#drawingCanvas').evaluate((canvas: HTMLCanvasElement) => {
        const bounds = canvas.getBoundingClientRect();
        return {
          width: canvas.width,
          height: canvas.height,
          hasArea: bounds.width > 0 && bounds.height > 0,
        };
      })
    )
    .toEqual({ width: 1, height: 1, hasArea: true });
  await expect
    .poll(async () => {
      const canvas = await renderedCanvasHandle(page);
      try {
        return await canvas.evaluate((element) => element.width > 0 && element.height > 0);
      } finally {
        await canvas.dispose();
      }
    })
    .toBe(true);
  expect(await page.evaluate(() => Boolean(window.__drawingDebug))).toBe(false);
  await draw(page, [
    { x: 300, y: 300 },
    { x: 550, y: 400 },
  ]);
  await expect.poll(() => firstOpaquePixel(page)).not.toBeNull();
  await page.screenshot({ path: test.info().outputPath('retained-release-ink.png') });
});

test('retained mechanism adopts prehydration paper and visible ink', async ({ page }) => {
  test.skip(!mechanism, 'private seam belongs only to the mechanism artifact');
  let heldRequests = 0;
  let releaseLayout: (() => void) | undefined;
  const layoutHeld = new Promise<void>((resolve) => {
    releaseLayout = resolve;
  });
  await page.route('**/_app/immutable/nodes/0.*.js', async (route) => {
    heldRequests += 1;
    await layoutHeld;
    await route.continue();
  });
  try {
    await page.goto('/', { waitUntil: 'commit' });
    await expect
      .poll(() =>
        page.locator('#drawingCanvas').evaluate((canvas: HTMLCanvasElement) => canvas.width)
      )
      .toBe(1);
    await expect.poll(() => heldRequests).toBeGreaterThan(0);
    expect(await page.evaluate(() => Boolean(window.__drawingDebug))).toBe(false);
    const earlyCanvas = await page.locator('#drawingCanvas').elementHandle();
    expect(earlyCanvas).not.toBeNull();
    await draw(page, [
      { x: 300, y: 300 },
      { x: 550, y: 400 },
    ]);
    await expect.poll(() => firstOpaquePixel(page)).not.toBeNull();
    expect(heldRequests).toBeGreaterThan(0);
    expect(await page.evaluate(() => Boolean(window.__drawingDebug))).toBe(false);
    releaseLayout?.();
    await expect.poll(() => page.evaluate(() => Boolean(window.__drawingDebug))).toBe(true);
    expect(
      await earlyCanvas!.evaluate((canvas) => canvas === document.getElementById('drawingCanvas'))
    ).toBe(true);
    await expect.poll(() => firstOpaquePixel(page)).not.toBeNull();
    await page.screenshot({ path: test.info().outputPath('retained-mechanism-adoption.png') });
  } finally {
    releaseLayout?.();
  }
});
