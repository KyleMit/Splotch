import { expect, test, type Page } from '@playwright/test';

import { draw, gotoApp, renderedCanvasHandle } from './helpers';
import { applyFarmPage, openDrawer } from './flows-harness';

// Swiping the system bars back over an immersive-mode app (Android's nav bar;
// a mobile URL bar reappearing has the same shape) shrinks the WebView by their
// height at an unchanged screen angle. The paper must be WINDOWED, not
// re-adopted: ink is anchored at the paper origin while the coloring art and
// the magic fill contain-fit WITHIN the paper, so a re-adopted paper slides the
// art up by half the height delta, out from under the child's strokes
// (ADR-0099).
const FULLSCREEN_VIEWPORT = { width: 412, height: 915 };
const SYSTEM_BARS_HEIGHT_PX = 48;
const BARS_SHOWN_VIEWPORT = {
  width: FULLSCREEN_VIEWPORT.width,
  height: FULLSCREEN_VIEWPORT.height - SYSTEM_BARS_HEIGHT_PX,
};

// Slack for antialiased stroke-edge sampling. The regression this pins was half
// the system-bar height — an order of magnitude larger.
const ALIGNMENT_TOLERANCE_PX = 3;

// Comfortably past the engine's RESIZE_SETTLE_MS debounce, after which the
// backing-store rebuild and repaint have run.
const RESIZE_REBUILD_SETTLE_MS = 500;

test.use({ viewport: FULLSCREEN_VIEWPORT, deviceScaleFactor: 1 });

async function inkTopCss(page: Page) {
  const canvas = await renderedCanvasHandle(page);
  try {
    return await canvas.evaluate((rendered) => {
      const displayed = document.getElementById('drawingCanvas') as HTMLCanvasElement;
      const rect = displayed.getBoundingClientRect();
      const scale = rendered.width / Math.max(rect.width, 1);
      const { data, width, height } = rendered
        .getContext('2d')!
        .getImageData(0, 0, rendered.width, rendered.height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4 + 3] > 0) return rect.top + y / scale;
        }
      }
      return Number.NaN;
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
    return {
      top: box.top + (box.height - img.naturalHeight * scale) / 2,
      scale,
    };
  });
}

// The stroke's offset from the art's top edge, in ART pixels so a scaled
// presentation is compared on equal terms. Alignment holds only if this
// survives the resize — the single number the whole bug is about.
async function inkOffsetInArtPx(page: Page) {
  const [inkTop, art] = await Promise.all([inkTopCss(page), artRect(page)]);
  return (inkTop - art.top) / art.scale;
}

// How far the coloring page's wrapper overhangs the canvas container: 0 while
// the paper matches the viewport, the occluded band's height while it is
// windowed.
function paperOverhangPx(page: Page) {
  return page.locator('.paper-view').evaluate((wrapper) => {
    const container = wrapper.parentElement as HTMLElement;
    return wrapper.clientHeight - container.clientHeight;
  });
}

async function colorInAPage(page: Page) {
  await gotoApp(page);
  await openDrawer(page);
  await applyFarmPage(page);
  await expect(page.locator('#coloringOverlay')).toHaveClass(/overlay-ready/);
  await draw(page, [
    { x: 80, y: 420 },
    { x: 330, y: 420 },
  ]);
}

async function resizeViewport(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await expect.poll(() => page.evaluate(() => window.innerHeight)).toBe(size.height);
  // A fixed sleep past a known threshold: the debounce exposes no state to
  // poll, and polling for movement would deadlock now that nothing moves.
  await page.waitForTimeout(RESIZE_REBUILD_SETTLE_MS);
}

test('revealing the system bars crops the page instead of shifting it under the ink', async ({
  page,
}) => {
  await colorInAPage(page);
  const offsetBefore = await inkOffsetInArtPx(page);
  const artTopBefore = (await artRect(page)).top;

  await resizeViewport(page, BARS_SHOWN_VIEWPORT);

  // Nothing moved on the glass; the covered band is cropped by the container.
  expect(Math.abs((await artRect(page)).top - artTopBefore)).toBeLessThanOrEqual(
    ALIGNMENT_TOLERANCE_PX
  );
  await expect
    .poll(async () => Math.abs((await inkOffsetInArtPx(page)) - offsetBefore))
    .toBeLessThanOrEqual(ALIGNMENT_TOLERANCE_PX);
  expect(await paperOverhangPx(page)).toBe(SYSTEM_BARS_HEIGHT_PX);
});

test('hiding the system bars again restores the page exactly', async ({ page }) => {
  await colorInAPage(page);
  const offsetBefore = await inkOffsetInArtPx(page);
  const artTopBefore = (await artRect(page)).top;

  await resizeViewport(page, BARS_SHOWN_VIEWPORT);
  await resizeViewport(page, FULLSCREEN_VIEWPORT);

  expect(Math.abs((await artRect(page)).top - artTopBefore)).toBeLessThanOrEqual(
    ALIGNMENT_TOLERANCE_PX
  );
  await expect
    .poll(async () => Math.abs((await inkOffsetInArtPx(page)) - offsetBefore))
    .toBeLessThanOrEqual(ALIGNMENT_TOLERANCE_PX);
  expect(await paperOverhangPx(page)).toBe(0);
});

test('clearing the canvas frees the windowed paper to the visible viewport', async ({ page }) => {
  await colorInAPage(page);
  await resizeViewport(page, BARS_SHOWN_VIEWPORT);
  expect(await paperOverhangPx(page)).toBe(SYSTEM_BARS_HEIGHT_PX);

  // Undo to blank: the paper is held only while a drawing needs it, so the next
  // page lays out against what the child can actually see.
  await page.locator('#undoButton').click();
  await expect.poll(() => paperOverhangPx(page)).toBe(0);
});
