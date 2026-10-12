import { expect, test, type Page } from '@playwright/test';

import {
  COLOR_CHANGE_DEBOUNCE_SETTLE_MS,
  draw,
  drawCommittedStroke,
  firstOpaquePixel,
  gotoApp,
  isBlueDominant,
  openSettingsModal,
  renderedCanvasHandle,
  swatch,
  TEST_PALETTE,
} from './helpers';

import { openDrawer, pickBrush } from './flows-harness';

const STROKE_SETTLE_TIMEOUT_MS = 10_000;

interface CanvasInkStats {
  count: number;
  strong: number;
  alphaSum: number;
  r: number;
  g: number;
  b: number;
}

async function canvasInkStats(
  page: Page,
  region: { x: number; y: number; width: number; height: number }
): Promise<CanvasInkStats> {
  const canvas = await renderedCanvasHandle(page);
  try {
    return await canvas.evaluate((rendered, { x, y, width, height }) => {
      const input = document.getElementById('drawingCanvas') as HTMLCanvasElement;
      const rect = input.getBoundingClientRect();
      const scaleX = rendered.width / rect.width;
      const scaleY = rendered.height / rect.height;
      const pixels = rendered
        .getContext('2d')!
        .getImageData(x * scaleX, y * scaleY, width * scaleX, height * scaleY).data;
      let count = 0;
      let strong = 0;
      let alphaSum = 0;
      let redSum = 0;
      let greenSum = 0;
      let blueSum = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const alpha = pixels[i + 3];
        if (alpha <= 8) continue;
        count++;
        if (alpha >= 220) strong++;
        alphaSum += alpha;
        redSum += pixels[i] * alpha;
        greenSum += pixels[i + 1] * alpha;
        blueSum += pixels[i + 2] * alpha;
      }
      return {
        count,
        strong,
        alphaSum,
        r: redSum / alphaSum,
        g: greenSum / alphaSum,
        b: blueSum / alphaSum,
      };
    }, region);
  } finally {
    await canvas.dispose();
  }
}

async function waitForStableCanvasInkStats(
  page: Page,
  region: { x: number; y: number; width: number; height: number }
): Promise<CanvasInkStats> {
  let previousCount = 0;
  let previousAlphaSum = 0;
  let settled: CanvasInkStats | undefined;
  await expect
    .poll(
      async () => {
        const current = await canvasInkStats(page, region);
        const stable =
          current.count > 0 &&
          current.count === previousCount &&
          current.alphaSum === previousAlphaSum;
        previousCount = current.count;
        previousAlphaSum = current.alphaSum;
        if (stable) settled = current;
        return stable;
      },
      { timeout: STROKE_SETTLE_TIMEOUT_MS }
    )
    .toBe(true);
  if (!settled) throw new Error('canvas ink never settled');
  return settled;
}

test('selecting a palette color activates it and paints in that color', async ({ page }) => {
  await gotoApp(page);

  const blue = swatch(page, TEST_PALETTE.blue);
  await expect(async () => {
    await blue.click({ timeout: 1000 });
    await expect(blue).toHaveClass(/active/, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });

  await page.waitForTimeout(COLOR_CHANGE_DEBOUNCE_SETTLE_MS); // clear the post-color-change draw debounce
  await draw(page, [
    { x: 120, y: 120 },
    { x: 260, y: 120 },
  ]);

  const px = await firstOpaquePixel(page);
  expect(px).not.toBeNull();
  // The selected blue is blue-dominant, so the painted pixel should be more blue than red.
  expect(isBlueDominant(px!)).toBe(true);
});

test('selected Black ink follows live theme changes without changing swatches', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await gotoApp(page);

  const black = swatch(page, TEST_PALETTE.black);
  await expect(async () => {
    await black.click({ timeout: 1000 });
    await expect(black).toHaveClass(/active/, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });

  let settings = await openSettingsModal(page);
  await settings.locator('#themeOption-dark').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(black).toHaveClass(/active/);
  await settings.getByRole('button', { name: 'Close' }).click();
  await expect(settings).not.toBeVisible();
  await page.waitForTimeout(COLOR_CHANGE_DEBOUNCE_SETTLE_MS);

  await draw(page, [
    { x: 120, y: 180 },
    { x: 260, y: 180 },
  ]);
  const darkThemeInk = await canvasInkStats(page, { x: 100, y: 150, width: 180, height: 60 });
  expect(darkThemeInk.count).toBeGreaterThan(0);
  expect(darkThemeInk.r).toBeGreaterThan(240);
  expect(darkThemeInk.g).toBeGreaterThan(240);
  expect(darkThemeInk.b).toBeGreaterThan(240);

  settings = await openSettingsModal(page);
  await settings.locator('#themeOption-light').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(black).toHaveClass(/active/);
  await settings.getByRole('button', { name: 'Close' }).click();
  await expect(settings).not.toBeVisible();
  await page.waitForTimeout(COLOR_CHANGE_DEBOUNCE_SETTLE_MS);

  await draw(page, [
    { x: 120, y: 300 },
    { x: 260, y: 300 },
  ]);
  const lightThemeInk = await canvasInkStats(page, { x: 100, y: 270, width: 180, height: 60 });
  expect(lightThemeInk.count).toBeGreaterThan(0);
  expect(lightThemeInk.r).toBeLessThan(30);
  expect(lightThemeInk.g).toBeLessThan(30);
  expect(lightThemeInk.b).toBeLessThan(30);
});

test('the crayon brush lays textured strokes that build up in the full app', async ({ page }) => {
  await gotoApp(page);
  await expect(swatch(page, TEST_PALETTE.purple)).toHaveClass(/active/);
  await openDrawer(page);
  await pickBrush(page, '#crayonBrushButton');

  const line = Array.from({ length: 15 }, (_, index) => ({ x: 240 + index * 20, y: 320 }));
  const region = { x: 220, y: 280, width: 320, height: 80 };
  await drawCommittedStroke(page, line);
  const first = await waitForStableCanvasInkStats(page, region);
  await drawCommittedStroke(page, line);
  const second = await waitForStableCanvasInkStats(page, region);

  expect(first.count).toBeGreaterThan(200);
  expect(first.r).toBeGreaterThan(first.g);
  expect(first.b).toBeGreaterThan(first.g);
  expect(second.alphaSum).toBeGreaterThan(first.alphaSum * 1.01);
  expect(second.strong).toBeGreaterThan(first.strong * 1.01);
  // The redraw fills bare tooth INSIDE the stroke, so the inked footprint may
  // grow up to ~2-coverage of the light first pass — but never past the stroke
  // silhouette. A spray/bloom regression would blow well past this bound.
  expect(second.count).toBeLessThan(first.count * 1.4);
});

// The pen is the default brush: solid ink, no wax texture, no color mixing.
// Its strokes are fully opaque on the first pass (no tooth to fill), so an
// identical redraw changes nothing — the opposite signature of the crayon
// buildup asserted above.
test('the default pen lays solid ink with no crayon buildup', async ({ page }) => {
  await gotoApp(page);
  await expect(swatch(page, TEST_PALETTE.purple)).toHaveClass(/active/);
  const line = Array.from({ length: 15 }, (_, index) => ({ x: 240 + index * 20, y: 320 }));
  const region = { x: 220, y: 280, width: 320, height: 80 };
  await drawCommittedStroke(page, line);
  const first = await waitForStableCanvasInkStats(page, region);
  await drawCommittedStroke(page, line);
  const second = await waitForStableCanvasInkStats(page, region);

  expect(first.count).toBeGreaterThan(200);
  // Solid fill: nearly every inked pixel is at full strength (only AA edges dip).
  expect(first.strong).toBeGreaterThan(first.count * 0.6);
  // Redrawing the same line adds no coverage and no buildup.
  expect(second.alphaSum).toBeLessThan(first.alphaSum * 1.01);
  expect(second.count).toBeLessThan(first.count * 1.01);
});

test('a crayon stroke previews at its true colour MID-stroke in dark mode', async ({ page }) => {
  // The open pass lives on the engine's overlay canvases until it stamps. The
  // bottom overlay previews the darken mix via mix-blend-mode, which composites
  // against everything behind it — and on the DARK paper min(colour, near-black)
  // erased the blend layer, leaving only the 45%-opacity top layer: strokes
  // looked faint until pass close. The canvas + overlays are now isolated into
  // one blending group, so the preview mixes against the canvas's own pixels
  // (transparent where virgin → pure colour). Screenshot mid-drag (pointer
  // still down — nothing stamped) and assert full-strength purple is on screen.
  await page.emulateMedia({ colorScheme: 'dark' });
  await gotoApp(page);
  await openDrawer(page);
  await pickBrush(page, '#crayonBrushButton');

  // Structural pin: the overlays and canvas share an isolated stacking group.
  const isolation = await page.evaluate(() => {
    const stack = document.getElementById('drawingCanvas')!.parentElement!;
    return {
      isolation: getComputedStyle(stack).isolation,
      layers: stack.querySelector('.live-paper-view')?.children.length ?? 0,
    };
  });
  expect(isolation.isolation).toBe('isolate');
  expect(isolation.layers).toBeGreaterThanOrEqual(3);

  const box = (await page.locator('#drawingCanvas').boundingBox())!;
  const y = box.y + 260;
  await page.mouse.move(box.x + 200, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(box.x + 200 + i * 12, y, { steps: 2 });
  }
  // Pointer still down: the whole stroke is an open pass on the overlays.
  const shot = await page.screenshot({
    clip: { x: box.x + 210, y: y - 12, width: 100, height: 24 },
  });
  const fullColour = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    // Full default purple is (171,113,225); the faint pre-fix preview over the
    // dark paper peaked near (95,68,124) — b>190 cleanly separates them.
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 2] > 190 && d[i] > 130) n++;
    }
    return n;
  }, shot.toString('base64'));
  await page.mouse.up();
  expect(fullColour).toBeGreaterThan(150);
});
