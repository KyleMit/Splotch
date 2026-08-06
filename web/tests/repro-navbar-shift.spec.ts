import { expect, test, type Page } from '@playwright/test';

import { draw, gotoApp, renderedCanvasHandle } from './helpers';
import { applyFarmPage, openDrawer } from './flows-harness';

// Executable repro of the Android fullscreen nav-bar reveal: an immersive-mode
// swipe shows the system bars, the WebView shrinks by their height, and the
// engine re-adopts the paper (48px is far past smallViewportDrift's 8px
// tolerance, and neither the angle nor the orientation changed). The ink then
// repaints top-left-anchored from the paper raster while the contain-fit
// coloring art re-centers in the shorter wrapper — the art slides up half the
// height delta, out from under the child's strokes.
const FULLSCREEN_VIEWPORT = { width: 412, height: 915 };
const SYSTEM_BARS_HEIGHT_PX = 48;

// Alignment slack for antialiased stroke-edge sampling; the bug's misalignment
// is half the system-bar height, an order of magnitude larger.
const ALIGNMENT_TOLERANCE_ART_PX = 3;

// Comfortably past the engine's RESIZE_SETTLE_MS debounce (150ms), after which
// the backing-store rebuild and repaint have run.
const RESIZE_REBUILD_SETTLE_MS = 500;

test.use({ viewport: FULLSCREEN_VIEWPORT, deviceScaleFactor: 1 });

async function inkBoundsCss(page: Page) {
  const canvas = await renderedCanvasHandle(page);
  try {
    return await canvas.evaluate((rendered) => {
      const displayed = document.getElementById('drawingCanvas') as HTMLCanvasElement;
      const rect = displayed.getBoundingClientRect();
      const scale = rendered.width / Math.max(rect.width, 1);
      const { data, width, height } = rendered
        .getContext('2d')!
        .getImageData(0, 0, rendered.width, rendered.height);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4 + 3] > 0) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return null;
      return {
        left: rect.left + minX / scale,
        top: rect.top + minY / scale,
        right: rect.left + maxX / scale,
        bottom: rect.top + maxY / scale,
      };
    });
  } finally {
    await canvas.dispose();
  }
}

// The art's contain-fit box inside the overlay <img>, in viewport CSS px.
function artRect(page: Page) {
  return page.locator('#coloringOverlay').evaluate((el) => {
    const img = el as HTMLImageElement;
    const box = img.getBoundingClientRect();
    const scale = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
    const width = img.naturalWidth * scale;
    const height = img.naturalHeight * scale;
    return {
      left: box.left + (box.width - width) / 2,
      top: box.top + (box.height - height) / 2,
      width,
      height,
      scale,
    };
  });
}

test('coloring art stays under the ink when the viewport shrinks by the system bars', async ({
  page,
}) => {
  // Known bug (Android fullscreen nav-bar reveal): the art shifts up while the
  // ink stays put. Remove this annotation when the fix lands.
  test.fail();

  await gotoApp(page);
  await openDrawer(page);
  await applyFarmPage(page);
  await expect(page.locator('#coloringOverlay')).toHaveClass(/overlay-ready/);

  await draw(page, [
    { x: 80, y: 420 },
    { x: 330, y: 420 },
  ]);

  const inkBefore = await inkBoundsCss(page);
  expect(inkBefore).not.toBeNull();
  const artBefore = await artRect(page);

  // The nav-bar reveal: same width, height shrinks by the system bars.
  await page.setViewportSize({
    width: FULLSCREEN_VIEWPORT.width,
    height: FULLSCREEN_VIEWPORT.height - SYSTEM_BARS_HEIGHT_PX,
  });
  // Wait for the new layout to land, then idle past the web resize debounce
  // (RESIZE_SETTLE_MS + settle slack) so the engine rebuild has run — a fixed
  // sleep past a known threshold, per the testing rules; polling for movement
  // instead would deadlock once the fix keeps the art anchored.
  await expect
    .poll(() => page.locator('#drawingCanvas').evaluate((el) => el.getBoundingClientRect().height))
    .toBeLessThan(FULLSCREEN_VIEWPORT.height - SYSTEM_BARS_HEIGHT_PX + 1);
  await page.waitForTimeout(RESIZE_REBUILD_SETTLE_MS);

  const artAfter = await artRect(page);
  await expect
    .poll(async () => {
      const ink = await inkBoundsCss(page);
      if (!ink) return Number.NaN;
      // The stroke sits at a fixed offset from the art's top edge in art
      // pixels; alignment holds only if that offset survives the resize.
      const before = (inkBefore!.top - artBefore.top) / artBefore.scale;
      const after = (ink.top - artAfter.top) / artAfter.scale;
      return Math.abs(after - before);
    })
    .toBeLessThanOrEqual(ALIGNMENT_TOLERANCE_ART_PX);
});
