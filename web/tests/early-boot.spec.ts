import { expect, test } from '@playwright/test';
import { LIVE_TILE_COUNT } from '../src/lib/drawing/liveTiles';

// ADR-0072: the engine boots at module evaluation against the prerendered
// canvas, and hydration must ADOPT that element — not bail and re-render the
// route client-side. The bail is the silent failure mode of this design (any
// pre-hydration DOM write into the prerendered subtree triggers it): the app
// still works, but the live canvas gets replaced and the early boot is wasted.
// This spec pins the invariants: the post-hydration canvas is the same element
// the prerendered HTML shipped, the console carries no hydration warnings, and
// the complete shared tile topology survives hydration without duplication.

test.skip(
  !!process.env.DEV_SERVER,
  'guards prerendered-page hydration; the dev server does not prerender'
);

test('hydration adopts the pre-hydration canvas instead of replacing it', async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on('console', (msg) => consoleMessages.push(msg.text()));

  // Tag the prerendered canvas before any module script can run, so element
  // identity is checkable after hydration settles.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const canvas = document.getElementById('drawingCanvas') as
        (HTMLCanvasElement & { __preHydration?: boolean }) | null;
      if (canvas) canvas.__preHydration = true;
    });
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const adopted = await page.evaluate(() => {
    const canvas = document.getElementById('drawingCanvas') as
      (HTMLCanvasElement & { __preHydration?: boolean }) | null;
    return canvas?.__preHydration === true;
  });
  expect(adopted, 'hydration replaced the prerendered canvas — the adopt contract broke').toBe(
    true
  );

  await expect(page.locator('#drawingCanvas')).toHaveCount(1);
  await expect(page.locator('canvas[data-live-tile]')).toHaveCount(LIVE_TILE_COUNT);
  await expect(page.locator('canvas[data-live-crayon-bottom]')).toHaveCount(LIVE_TILE_COUNT);
  await expect(page.locator('canvas[data-live-crayon-top]')).toHaveCount(LIVE_TILE_COUNT);
  await expect
    .poll(() =>
      page
        .locator('#drawingCanvas')
        .evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height])
    )
    .toEqual([1, 1]);

  const hydrationWarnings = consoleMessages.filter((m) => /hydration/i.test(m));
  expect(hydrationWarnings, 'console must carry no hydration mismatch output').toEqual([]);
});
