import { expect, test } from '@playwright/test';
import { ACCEPT_RADIUS_FACTOR } from '../src/lib/actions/dragToClearGeometry';
import { gotoApp } from './helpers';

const INSIDE_THRESHOLD = 0.7;
const OUTSIDE_THRESHOLD = 1.1;

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`the pen ring changes state without redrawing at ${viewport.width}px in ${colorScheme}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme });
      await gotoApp(page);
      const button = page.locator('#clearButton');
      const box = await button.boundingBox();
      if (!box) throw new Error('Clear Button is missing');
      const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const diagonalRadius =
        (Math.min(viewport.width, viewport.height) * ACCEPT_RADIUS_FACTOR) / Math.SQRT2;
      const ring = page.locator('#clearAcceptZone');
      const dashes = ring.locator('.dashes');
      const solid = ring.locator('.solid');
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(
        start.x - diagonalRadius * INSIDE_THRESHOLD,
        start.y + diagonalRadius * INSIDE_THRESHOLD
      );
      await expect(ring).toHaveClass(/visible/);
      await expect(dashes).toHaveCSS('opacity', '1');
      await expect(solid).toHaveCSS('opacity', '0');
      await expect(dashes).toHaveCSS('stroke-linecap', 'round');
      await expect(dashes).toHaveCSS('stroke-width', '4px');
      await expect(dashes).toHaveAttribute('vector-effect', 'non-scaling-stroke');
      const contours = await ring
        .locator('path')
        .evaluateAll((paths) => paths.map((path) => path.getAttribute('d')));
      await page.mouse.move(
        start.x - diagonalRadius * OUTSIDE_THRESHOLD,
        start.y + diagonalRadius * OUTSIDE_THRESHOLD
      );
      await expect(button).toHaveClass(/delete-ready/);
      await expect(dashes).toHaveCSS('opacity', '0');
      await expect(solid).toHaveCSS('opacity', '1');
      await ring.evaluate((element) =>
        Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished))
      );
      expect(
        await ring.evaluate((element) => element.getAnimations({ subtree: true }).length)
      ).toBe(0);
      await page.mouse.move(
        start.x - diagonalRadius * INSIDE_THRESHOLD,
        start.y + diagonalRadius * INSIDE_THRESHOLD
      );
      await expect(dashes).toHaveCSS('opacity', '1');
      await expect(solid).toHaveCSS('opacity', '0');
      expect(
        await ring
          .locator('path')
          .evaluateAll((paths) => paths.map((path) => path.getAttribute('d')))
      ).toEqual(contours);
      await page.mouse.up();
      await expect(ring).toHaveCSS('display', 'none');
    });
  }
}

test('the reduced-motion tutorial shows the same continuous pen contour', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoApp(page);
  const button = page.locator('#clearButton');
  const coachmark = page.locator('.clear-coachmark');
  await expect(async () => {
    await button.click({ clickCount: 3 });
    await expect(coachmark).toHaveClass(/\bvisible\b/, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  const tutorialRing = coachmark.locator('.coachmark-ring');
  await expect(tutorialRing.locator('.dashes')).toHaveCSS('opacity', '0');
  await expect(tutorialRing.locator('.solid')).toHaveCSS('opacity', '1');
  const liveContour = await page.locator('#clearAcceptZone .solid').getAttribute('d');
  if (!liveContour) throw new Error('The live ring contour is missing');
  await expect(tutorialRing.locator('.solid')).toHaveAttribute('d', liveContour);
  expect(
    await tutorialRing.evaluate((element) => element.getAnimations({ subtree: true }).length)
  ).toBe(0);
});
