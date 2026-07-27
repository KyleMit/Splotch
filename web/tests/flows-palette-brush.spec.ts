import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  CUSTOM_SWATCH_COLOR,
  draw,
  firstOpaquePixel,
  gotoApp,
  PICKER_GREEN,
  retryOpen,
  swatch,
  TEST_PALETTE,
} from './helpers';

import { openBrushMenu, openDrawer, pickBrush } from './flows-harness';

function canvasInkStats(
  page: Page,
  region: { x: number; y: number; width: number; height: number }
): Promise<{ count: number; strong: number; alphaSum: number; r: number; g: number; b: number }> {
  return page.evaluate(({ x, y, width, height }) => {
    const canvas = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const pixels = canvas
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
}

// ── palette ──────────────────────────────────────────────────────────────--

test('selecting a palette color activates it and paints in that color', async ({ page }) => {
  await gotoApp(page);

  const blue = swatch(page, TEST_PALETTE.blue);
  await expect(async () => {
    await blue.click({ timeout: 1000 });
    await expect(blue).toHaveClass(/active/, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });

  await page.waitForTimeout(150); // clear the post-color-change draw debounce
  await draw(page, [
    { x: 120, y: 120 },
    { x: 260, y: 120 },
  ]);

  const px = await firstOpaquePixel(page);
  expect(px).not.toBeNull();
  // #62A2E9 is blue-dominant — the painted pixel should be more blue than red.
  expect(px![2]).toBeGreaterThan(px![0]);
});

test('the crayon brush lays textured strokes that build up in the full app', async ({ page }) => {
  await gotoApp(page);
  await expect(swatch(page, TEST_PALETTE.purple)).toHaveClass(/active/);
  await openDrawer(page);
  await pickBrush(page, '#crayonBrushButton');

  const line = Array.from({ length: 15 }, (_, index) => ({ x: 240 + index * 20, y: 320 }));
  const region = { x: 220, y: 280, width: 320, height: 80 };
  await draw(page, line);
  const first = await canvasInkStats(page, region);
  await draw(page, line);
  const second = await canvasInkStats(page, region);

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
  await draw(page, line);
  const first = await canvasInkStats(page, region);
  await draw(page, line);
  const second = await canvasInkStats(page, region);

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
    return { isolation: getComputedStyle(stack).isolation, children: stack.children.length };
  });
  expect(isolation.isolation).toBe('isolate');
  expect(isolation.children).toBeGreaterThanOrEqual(3); // canvas + two overlays

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

// Focus a control and fire an activation key, retrying the whole gesture until
// the expected reactive class lands. A lone press-then-assert flakes under a
// starved parallel worker: the keydown can land before the swatch's handler is
// wired, so nothing activates and the class never appears — a single
// toHaveClass then times out (issue #502). Activation is idempotent, so
// re-focusing and re-pressing is safe. `press` focuses the target first.
async function activateWithKey(target: Locator, key: string, className: RegExp) {
  await expect(async () => {
    await target.press(key);
    await expect(target).toHaveClass(className, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}

test('palette colors and custom hexagons activate from the keyboard', async ({ page }) => {
  await gotoApp(page);

  // Tab lands focus on the first two swatches in order; toBeFocused retries, so
  // the navigation itself is stable.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Purple' })).toBeFocused();
  await page.keyboard.press('Tab');
  const blue = page.getByRole('button', { name: 'Blue' });
  await expect(blue).toBeFocused();

  // Enter/Space activation drives a reactive class update that can race the
  // keydown under load — retry the whole press-then-assert (see activateWithKey).
  await activateWithKey(blue, 'Enter', /active/);
  await activateWithKey(page.getByRole('button', { name: 'Red' }), 'Space', /active/);

  // Opening the picker via the keyboard: retryOpen skips the re-press once the
  // dialog is up, so a slow first open can't be toggled shut by a retry.
  const dialog = page.locator('#color-picker');
  await retryOpen(dialog, () => page.getByRole('button', { name: 'Custom Color' }).press('Enter'));

  // Space both selects the hexagon and closes the picker; the retry rides out a
  // dropped keydown, then the dialog closes once the selection lands.
  const green = dialog.locator(`.grid.landscape .hexagon[data-color="${PICKER_GREEN}"]`);
  await activateWithKey(green, 'Space', /selected/);
  await expect(dialog).not.toBeVisible();
});

test('pointer exploration still snaps a hexagon gap and commits the highlighted color', async ({
  page,
}) => {
  await gotoApp(page);
  await page.getByRole('button', { name: 'Custom Color' }).click();

  const dialog = page.locator('#color-picker');
  await expect(dialog).toBeVisible();
  const start = dialog.locator('.grid.landscape .row.r5 .hexagon.c3');
  const target = dialog.locator('.grid.landscape .row.r5 .hexagon.c1');

  await start.hover();
  await page.mouse.down();
  await target.hover();
  await expect(target).toHaveClass(/hover/);

  const targetBox = (await target.boundingBox())!;
  const gap = {
    x: targetBox.x + targetBox.width / 2 - 39,
    y: targetBox.y + targetBox.height / 2,
  };
  expect(
    await page.evaluate(({ x, y }) => !document.elementFromPoint(x, y)?.closest('.hexagon'), gap)
  ).toBe(true);
  await page.mouse.move(gap.x, gap.y);
  await expect(target).toHaveClass(/hover/);
  await page.mouse.up();

  await expect(dialog).not.toBeVisible();
  await expect(target).toHaveClass(/selected/);
});

// Recorded on-device (perf-profiles/recordings/pencil-color-tap.json): an Apple
// Pencil tap on a sidebar swatch followed ~440ms later by a stroke lost the
// whole stroke, while identical strokes ~900ms+ after the tap painted fine. The
// recording shows WebKit delivered every event of the lost stroke to the canvas
// (pointerdown + gotpointercapture + moves + up), so the eater is app logic —
// this replays the recorded anatomy with the recorded timings.
test('a pen stroke shortly after a pen tap on a swatch still paints', async ({ page }) => {
  await gotoApp(page);

  const painted = await swatch(page, TEST_PALETTE.blue).evaluate(async (paletteSwatch) => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const selectedSwatch = paletteSwatch as HTMLElement;
    const canvas = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const fire = (target: Element, type: string, x: number, y: number, buttons: number) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 99,
          pointerType: 'pen',
          buttons,
          pressure: buttons ? 0.1 : 0,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        })
      );

    const s = selectedSwatch.getBoundingClientRect();
    const sx = s.left + s.width / 2;
    const sy = s.top + s.height / 2;
    fire(selectedSwatch, 'pointerdown', sx, sy, 1);
    await sleep(45);
    fire(selectedSwatch, 'pointerup', sx, sy, 0);
    selectedSwatch.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, clientX: sx, clientY: sy })
    );

    await sleep(440);

    fire(canvas, 'pointerdown', rect.left + 112, rect.top + 221, 1);
    for (let i = 1; i <= 10; i++) {
      await sleep(36);
      fire(canvas, 'pointermove', rect.left + 112 + i * 35, rect.top + 221 + i * 5, 1);
    }
    fire(canvas, 'pointerup', rect.left + 462, rect.top + 271, 0);
    await new Promise(requestAnimationFrame);

    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return [data[i - 3], data[i - 2], data[i - 1], data[i]];
    }
    return null;
  });

  expect(painted).not.toBeNull();
  // #62A2E9 is blue-dominant — the stroke painted in the just-picked color.
  expect(painted![2]).toBeGreaterThan(painted![0]);
});

// A pen TAP on a swatch arms iPadOS Scribble: the pen stroke started within
// ~450ms after it paints into the canvas but is never presented on screen. The
// palette cancels the tap's parallel touch stream for STYLUS touches (which
// releases the following stroke) — Touch.touchType is Safari-only, so that
// side lives in scribbleGuard.test.ts. What Chromium can verify: finger taps
// pass through uncancelled, so click synthesis survives for touch users.
test('the palette leaves finger touch taps uncancelled (Scribble guard scope)', async ({
  page,
}) => {
  await gotoApp(page);

  const fingerPrevented = await swatch(page, TEST_PALETTE.blue).evaluate((paletteSwatch) => {
    const selectedSwatch = paletteSwatch as HTMLElement;
    const touch = new Touch({ identifier: 1, target: selectedSwatch, clientX: 10, clientY: 10 });
    const e = new TouchEvent('touchstart', {
      touches: [touch],
      changedTouches: [touch],
      cancelable: true,
      bubbles: true,
    });
    selectedSwatch.dispatchEvent(e);
    return e.defaultPrevented;
  });

  expect(fingerPrevented).toBe(false);
});

// Chromium cannot construct a Touch with touchType (Safari-only), so these
// stub changedTouches exactly like scribbleGuard.test.ts. The guard's
// discrimination logic is unit-tested; what e2e pins down is that the guard is
// ATTACHED to each surface a pen taps right before drawing — the gap that
// shipped the picker unguarded. The real Scribble swallowing needs trusted
// on-device input (ADR-0038), so guard attachment is the automatable proxy.
function stylusTouchStartPrevented(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const target = document.querySelector(sel) as HTMLElement;
    const e = new Event('touchstart', { cancelable: true, bubbles: true });
    Object.defineProperty(e, 'changedTouches', { value: [{ touchType: 'stylus' }] });
    target.dispatchEvent(e);
    return e.defaultPrevented;
  }, selector);
}

test('a stylus tap on a color-picker hexagon has its touch stream cancelled (Scribble guard)', async ({
  page,
}) => {
  await gotoApp(page);

  const customSwatch = swatch(page, CUSTOM_SWATCH_COLOR);
  await expect(async () => {
    await customSwatch.click({ timeout: 1000 });
    await expect(page.locator('#color-picker')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });

  expect(await stylusTouchStartPrevented(page, '#color-picker .hexagon')).toBe(true);
});

test('a stylus tap on an action button has its touch stream cancelled (Scribble guard)', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);

  expect(await stylusTouchStartPrevented(page, '#brushButton')).toBe(true);
});

// On iPadOS the guard's cancelled touchstart suppresses the tap's synthesized
// click, so a stylus tap reaches a button only as pointerdown+pointerup. The
// buttons must activate from that alone (scribbleTap) — click-driven buttons
// would sit dead under the pen.
test('action buttons activate on a pointer press alone, without a synthesized click (Scribble guard)', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  await openBrushMenu(page);

  const eraser = page.locator('#eraserButton');
  await expect(eraser).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() => {
    const btn = document.getElementById('eraserButton')!;
    const opts = { pointerId: 42, pointerType: 'pen', bubbles: true, cancelable: true };
    btn.dispatchEvent(new PointerEvent('pointerdown', opts));
    btn.dispatchEvent(new PointerEvent('pointerup', opts));
  });
  await expect(eraser).toHaveAttribute('aria-pressed', 'true');
});

test('picking a color exits eraser mode', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);

  const eraser = page.locator('#eraserButton');
  await pickBrush(page, '#eraserButton');
  await expect(page.locator('#drawingCanvas')).toHaveClass(/erasing/);

  // Tapping a swatch should switch back to the ink brush (selectInkBrush in
  // handleSwatchUp).
  await swatch(page, TEST_PALETTE.red).click();
  await expect(eraser).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#drawingCanvas')).not.toHaveClass(/erasing/);
});

// Issue #276: a toddler mashing the eraser entry should keep erasing, not toggle
// the tool off and on. Repeated selections are idempotent — you leave the eraser
// by picking another brush or a color, not by tapping the eraser again.
test('selecting the eraser repeatedly keeps it selected', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);

  const eraser = page.locator('#eraserButton');
  await pickBrush(page, '#eraserButton');
  await expect(page.locator('#drawingCanvas')).toHaveClass(/erasing/);

  await pickBrush(page, '#eraserButton');
  await expect(eraser).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#drawingCanvas')).toHaveClass(/erasing/);
});
