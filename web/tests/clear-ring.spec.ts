import { expect, test } from '@playwright/test';
import { ACCEPT_RADIUS_FACTOR } from '../src/lib/actions/dragToClearGeometry';
import { gotoApp } from './helpers';

const INSIDE_THRESHOLD = 0.7;
const OUTSIDE_THRESHOLD = 1.1;

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
  { width: 1366, height: 1024 },
]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`the pen ring stays aligned across clear states at ${viewport.width}px in ${colorScheme}`, async ({
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
      await expect(solid).toHaveCSS('stroke-width', '4px');
      await expect(solid).toHaveAttribute('vector-effect', 'non-scaling-stroke');
      await ring.evaluate((element) =>
        Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished))
      );
      const alignment = await ring.evaluate((element) => {
        const zone = element.getBoundingClientRect();
        const svg = element.querySelector('svg')!.getBoundingClientRect();
        return {
          left: svg.left - zone.left,
          top: svg.top - zone.top,
          width: zone.width - svg.width,
          height: zone.height - svg.height,
        };
      });
      expect(alignment.left).toBeCloseTo(2, 1);
      expect(alignment.top).toBeCloseTo(2, 1);
      expect(alignment.width).toBeCloseTo(4, 1);
      expect(alignment.height).toBeCloseTo(4, 1);
      const contourMetrics = (element: SVGElement) => {
        if (!(element instanceof SVGPathElement)) throw new Error('Pen path is missing');
        const svg = element.ownerSVGElement!;
        const radius = svg.viewBox.baseVal.width / 2;
        const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
        const segments = element.getAttribute('d')!.split('M').filter(Boolean);
        const lengths: number[] = [];
        let maxDeviation = 0;
        for (const segment of segments) {
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', `M${segment}`);
          const length = path.getTotalLength();
          lengths.push(length * scale);
          for (let sample = 0; sample <= 100; sample++) {
            const point = path.getPointAtLength((length * sample) / 100);
            maxDeviation = Math.max(
              maxDeviation,
              Math.abs(Math.hypot(point.x - radius, point.y - radius) - radius) * scale
            );
          }
        }
        return {
          pitch: (svg.getBoundingClientRect().width * Math.PI) / segments.length,
          shortest: Math.min(...lengths),
          longest: Math.max(...lengths),
          maxDeviation,
        };
      };
      const marks = await dashes.evaluate(contourMetrics);
      expect(marks.pitch).toBeGreaterThan(24);
      expect(marks.pitch).toBeLessThan(26);
      expect(marks.shortest).toBeGreaterThan(8);
      expect(marks.longest).toBeLessThan(21);
      expect(marks.maxDeviation).toBeGreaterThan(0.5);
      expect(marks.maxDeviation).toBeLessThan(1.5);
      // Chromium draws each quarter arc as one cubic Bézier, whose radial error is a
      // fixed fraction of the radius: about 0.12px at the largest ring covered here.
      expect((await solid.evaluate(contourMetrics)).maxDeviation).toBeLessThan(0.25);
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
  await expect
    .poll(() =>
      tutorialRing.locator('svg').evaluate((svg) => {
        if (!(svg instanceof SVGSVGElement)) throw new Error('Tutorial SVG is missing');
        return Math.abs(svg.viewBox.baseVal.width - svg.getBoundingClientRect().width);
      })
    )
    .toBeLessThan(0.1);
  const tutorialContour = await tutorialRing.locator('.solid').getAttribute('d');
  if (!tutorialContour) throw new Error('The tutorial contour is missing');
  const box = await button.boundingBox();
  if (!box) throw new Error('Clear Button is missing');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 50, box.y + 70);
  await expect(page.locator('#clearAcceptZone .solid')).toHaveAttribute('d', tutorialContour);
  await page.mouse.up();
  expect(
    await tutorialRing.evaluate((element) => element.getAnimations({ subtree: true }).length)
  ).toBe(0);
});

test('the animated tutorial switches the pen contour at its ready phase', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoApp(page);
  const button = page.locator('#clearButton');
  const coachmark = page.locator('.clear-coachmark');
  await expect(async () => {
    await button.click({ clickCount: 3 });
    await expect(coachmark).toHaveClass(/\bvisible\b/, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  const ring = coachmark.locator('.coachmark-ring');
  for (const phase of [
    { progress: 0.4, dashes: '1', solid: '0' },
    { progress: 0.78, dashes: '0', solid: '1' },
  ]) {
    await ring.evaluate((element, progress) => {
      const animation = element.getAnimations()[0];
      const duration = animation.effect?.getTiming().duration;
      if (typeof duration !== 'number') throw new Error('The tutorial has no timed animation');
      animation.pause();
      animation.currentTime = duration * progress;
    }, phase.progress);
    await expect(ring.locator('.dashes')).toHaveCSS('opacity', phase.dashes);
    await expect(ring.locator('.solid')).toHaveCSS('opacity', phase.solid);
  }
});
