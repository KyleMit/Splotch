import { expect, test, type Page } from '@playwright/test';

// Layer 3 — full-UI end-to-end flows on the real app page. These exercise the
// Svelte component wiring (palette, action drawer, tool/stroke state, AI fetch,
// coloring overlay) that the engine-level spec (engine.spec.js) deliberately
// bypasses. Interactions go through the real buttons; we drive the canvas with
// real pointer input and read back canvas pixels / reactive button state.

// ── helpers ────────────────────────────────────────────────────────────────

async function gotoApp(page: Page, path = '/') {
  await page.goto(path);
  // The canvas mounts on the client; once it's visible the app has hydrated.
  await expect(page.locator('#drawingCanvas')).toBeVisible();
}

// The action drawer is collapsed by default (drawerOpen=false), so its buttons
// (undo, eraser, screenshot, AI, coloring) aren't rendered until the chevron is
// tapped. Retrying the tap also rides out any hydration lag on the first click.
async function openDrawer(page: Page) {
  const undo = page.locator('#undoButton');
  if (await undo.isVisible().catch(() => false)) return; // already open (e.g. persisted)
  // The chevron rides the panel's `left` transition (it repositions next to the
  // palette on mount), so it can be briefly non-stable; under parallel load the
  // dev server is also slow to hydrate. Give the click room and retry.
  await expect(async () => {
    await page.locator('button[aria-label="Expand controls"]').click({ timeout: 3000 });
    await expect(undo).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
}

// Open the stroke-width flyout robustly. The button is a toggle, so we click
// only when the menu isn't already open, and retry — this rides out the action
// panel repositioning/re-rendering right after a reload without ever toggling a
// just-opened menu back shut.
async function openStrokeMenu(page: Page) {
  const sentinel = page.locator('button[aria-label="Size 3"]'); // present whenever the menu is open
  await expect(async () => {
    if (!(await sentinel.isVisible().catch(() => false))) {
      await page.locator('#strokeWidthButton').click({ timeout: 1000 });
    }
    await expect(sentinel).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}

/** Drag a stroke through canvas-relative points with real mouse input. */
async function draw(page: Page, points: { x: number; y: number }[]) {
  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  await page.mouse.move(box.x + points[0].x, box.y + points[0].y);
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(box.x + p.x, box.y + p.y);
  await page.mouse.up();
}

/** Perform the drag-to-clear gesture: pull the clear button past its accept
 *  threshold (0.4 × min viewport) toward the screen center and release. */
async function clearViaGesture(page: Page) {
  const box = await page.locator('#clearButton').boundingBox();
  const vp = page.viewportSize();
  if (!box || !vp) throw new Error('missing clear button box or viewport');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(
      cx + ((vp.width / 2 - cx) * i) / 12,
      cy + ((vp.height / 2 - cy) * i) / 12
    );
  }
  await page.mouse.up();
}

/** First non-transparent pixel on the canvas as [r,g,b,a], or null if blank. */
function firstOpaquePixel(page: Page): Promise<number[] | null> {
  return page.evaluate(() => {
    const c = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return [data[i - 3], data[i - 2], data[i - 1], data[i]];
    }
    return null;
  });
}

// ── palette ──────────────────────────────────────────────────────────────--

test('selecting a palette color activates it and paints in that color', async ({ page }) => {
  await gotoApp(page);

  const blue = page.locator('button.color-swatch[data-color="#62A2E9"]');
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

// Recorded on-device (perf-profiles/recordings/pencil-color-tap.json): an Apple
// Pencil tap on a sidebar swatch followed ~440ms later by a stroke lost the
// whole stroke, while identical strokes ~900ms+ after the tap painted fine. The
// recording shows WebKit delivered every event of the lost stroke to the canvas
// (pointerdown + gotpointercapture + moves + up), so the eater is app logic —
// this replays the recorded anatomy with the recorded timings.
test('a pen stroke shortly after a pen tap on a swatch still paints', async ({ page }) => {
  await gotoApp(page);

  const painted = await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const swatch = document.querySelector(
      'button.color-swatch[data-color="#62A2E9"]'
    ) as HTMLElement;
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

    const s = swatch.getBoundingClientRect();
    const sx = s.left + s.width / 2;
    const sy = s.top + s.height / 2;
    fire(swatch, 'pointerdown', sx, sy, 1);
    await sleep(45);
    fire(swatch, 'pointerup', sx, sy, 0);
    swatch.dispatchEvent(
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

  const fingerPrevented = await page.evaluate(() => {
    const swatch = document.querySelector(
      'button.color-swatch[data-color="#62A2E9"]'
    ) as HTMLElement;
    const touch = new Touch({ identifier: 1, target: swatch, clientX: 10, clientY: 10 });
    const e = new TouchEvent('touchstart', {
      touches: [touch],
      changedTouches: [touch],
      cancelable: true,
      bubbles: true,
    });
    swatch.dispatchEvent(e);
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

  const customSwatch = page.locator('button.color-swatch[data-color="custom"]');
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

  expect(await stylusTouchStartPrevented(page, '#eraserButton')).toBe(true);
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
  await expect(async () => {
    await eraser.click({ timeout: 1000 });
    await expect(eraser).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await expect(page.locator('#drawingCanvas')).toHaveClass(/erasing/);

  // Tapping a swatch should switch back to the pen (selectPen in handleSwatchUp).
  await page.locator('button.color-swatch[data-color="#EC534E"]').click();
  await expect(eraser).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#drawingCanvas')).not.toHaveClass(/erasing/);
});

// ── undo / empty-state gating ───────────────────────────────────────────────

test('the undo button enables on a stroke and reverts it', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);

  const undo = page.locator('#undoButton');
  await expect(undo).toBeDisabled();

  await draw(page, [
    { x: 120, y: 120 },
    { x: 260, y: 200 },
  ]);
  await expect(undo).toBeEnabled();

  await undo.click();
  // The single pre-stroke snapshot is consumed, so the canvas is blank again.
  await expect(undo).toBeDisabled();
  expect(await firstOpaquePixel(page)).toBeNull();
});

test('the screenshot button is gated on the canvas being non-empty', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);

  const shot = page.locator('#screenshotButton');
  await expect(shot).toBeDisabled();

  await draw(page, [
    { x: 140, y: 140 },
    { x: 240, y: 200 },
  ]);
  await expect(shot).toBeEnabled();

  // Undo back to empty re-disables it.
  await page.locator('#undoButton').click();
  await expect(shot).toBeDisabled();
});

// ── tool/stroke state + persistence ─────────────────────────────────────────

test('pen and eraser keep independent stroke sizes that persist across reload', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);

  // Pen → size 5.
  await openStrokeMenu(page);
  await page.locator('button[aria-label="Size 5"]').click();

  // Eraser → size 1.
  await page.locator('#eraserButton').click();
  await openStrokeMenu(page);
  await page.locator('button[aria-label="Size 1"]').click();

  await page.reload();
  await expect(page.locator('#drawingCanvas')).toBeVisible();

  // The drawer-open state is persisted, so its buttons render immediately (the
  // action panel may still be repositioning — openStrokeMenu rides that out).
  // Pen is the default tool after reload, so its remembered size 5 is active.
  await openStrokeMenu(page);
  await expect(page.locator('button[aria-label="Size 5"]')).toHaveAttribute('aria-pressed', 'true');

  // Switch to the eraser — its independent size 1 is restored.
  await page.locator('#eraserButton').click();
  await openStrokeMenu(page);
  await expect(page.locator('button[aria-label="Size 1"]')).toHaveAttribute('aria-pressed', 'true');
});

// The home route is prerendered (ADR-0040), so its static HTML renders from
// default settings. A returning user who left the drawer open — and turned a
// control off — must still see that reflected at first paint: the inline head
// script in app.html stamps <html> before paint and the drawer/controls are
// shown/hidden purely by CSS, no chevron tap. This asserts that first-paint
// state directly (note: no openDrawer()).
test('a persisted-open drawer, with a control toggled off, is correct at first paint', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('splotch-drawer-open', 'true');
    localStorage.setItem('splotch-eraser-enabled', 'false');
  });
  await gotoApp(page);

  // The <html> stamp the CSS keys off is present before hydration.
  await expect(page.locator('html')).toHaveAttribute('data-drawer-open', '');
  // Drawer open: its buttons are visible without tapping the chevron.
  await expect(page.locator('#undoButton')).toBeVisible();
  await expect(page.locator('#coloringBookButton')).toBeVisible();
  // The control the parent switched off is fully hidden (display:none), even
  // though it's in the DOM, and not focusable.
  await expect(page.locator('#eraserButton')).toBeHidden();
});

// On a phone-width portrait screen the stroke-width flyout used to open as a
// horizontal row that ran under the bottom-right Parent Center button. Tapping
// the rightmost size closed the menu on pointerup, and the trailing click then
// fell through to the now-unobscured Parent Center button and launched its
// modal. The flyout must clear that button so a size tap can't open it. 460px
// sits in the range where the row would still reach the parent button, so it
// pins the column breakpoint high enough for the current button sizes.
test('the stroke flyout clears the Parent Center button on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 460, height: 852 });
  await gotoApp(page);
  await openDrawer(page);
  await openStrokeMenu(page);

  const parentModal = page.locator('#parentHelpModal');
  await expect(parentModal).toBeHidden();

  const parent = (await page.locator('#parentHelpButton').boundingBox())!;
  const size5 = (await page.locator('button[aria-label="Size 5"]').boundingBox())!;
  const overlaps =
    size5.x < parent.x + parent.width &&
    size5.x + size5.width > parent.x &&
    size5.y < parent.y + parent.height &&
    size5.y + size5.height > parent.y;
  expect(overlaps, 'stroke flyout overlaps the Parent Center button').toBe(false);

  // Tapping the rightmost size selects it and leaves the Parent Center closed.
  await page.locator('button[aria-label="Size 5"]').click();
  await expect(page.locator('button[aria-label="Size 5"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(parentModal).toBeHidden();
});

// Landscape counterpart: the action panel hugs the bottom with little height to
// spare, so the flyout popping up as a tall vertical column ran off the top of a
// short landscape screen. It must pop up as a short horizontal row that fits —
// checked after a real rotation so the orientation switch is exercised too.
test('the stroke flyout stays on-screen after rotating to landscape', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 740 });
  await gotoApp(page);
  await openDrawer(page);

  await page.setViewportSize({ width: 740, height: 360 });
  await openStrokeMenu(page);

  const menu = (await page.locator('.stroke-width-menu').boundingBox())!;
  expect(menu.y, 'stroke flyout runs off the top of the screen').toBeGreaterThanOrEqual(0);
  expect(menu.y + menu.height).toBeLessThanOrEqual(360);
  // A short horizontal row, not the tall column that overflowed.
  expect(menu.height).toBeLessThan(120);
});

test('the drawer open state persists across a reload', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);

  await page.reload();
  await expect(page.locator('#drawingCanvas')).toBeVisible();
  // No chevron tap this time — the drawer should reopen from persisted state.
  await expect(page.locator('#undoButton')).toBeVisible();
});

test('parent center panels can be changed by tab buttons and native scrolling', async ({
  page,
}) => {
  await gotoApp(page);

  await page.getByRole('button', { name: 'Parent Center' }).click();
  await expect(page.locator('#parentHelpModal')).toBeVisible();
  await expect(page.locator('.tab-button.active')).toContainText('Settings');
  await page.waitForTimeout(400); // let the fly-in transform finish before measuring coordinates

  const panels = page.locator('.tab-panels');

  // The panels are a horizontal CSS scroll-snap container (TabPager): swiping is
  // native momentum scrolling, and the active tab is derived from scroll position.
  // Mouse-button drags don't scroll such containers, so we drive the scroll the
  // same way a touch/trackpad fling ultimately does — by moving scrollLeft to a
  // snap point — and assert the wiring updates the active tab.
  const scrollToPanel = (index: number) =>
    panels.evaluate((el, i) => {
      el.scrollTo({ left: i * el.clientWidth, behavior: 'instant' as ScrollBehavior });
    }, index);

  // Tab buttons scroll the active panel into view.
  await page.getByRole('button', { name: /AI/ }).click();
  await expect(page.locator('.tab-button.active')).toContainText('AI');
  await expect
    .poll(() => panels.evaluate((el) => Math.round(el.scrollLeft / el.clientWidth)))
    .toBe(1);

  // Scrolling the container (as a swipe does) drives the active tab back.
  await scrollToPanel(0);
  await expect(page.locator('.tab-button.active')).toContainText('Settings');

  // Scrolling forward to the third panel commits to that tab.
  await scrollToPanel(2);
  await expect(page.locator('.tab-button.active')).toContainText('Setup');

  // An open <details> in a panel keeps its state across tab changes.
  const setupDetails = page.locator('.help-section').first();
  const setupSummary = setupDetails.locator('summary');
  await expect(setupSummary).toBeVisible();
  await setupSummary.click();
  await expect(setupDetails).toHaveAttribute('open', '');

  await scrollToPanel(3);
  await expect(page.locator('.tab-button.active')).toContainText('About');

  await page.getByRole('button', { name: /Setup/ }).click();
  await expect(page.locator('.tab-button.active')).toContainText('Setup');
  await expect(setupDetails).toHaveAttribute('open', '');
});

// ── AI generation flow (mocked endpoint) ────────────────────────────────────

test('the AI button posts the drawing and reveals the generated result', async ({ page }) => {
  // Skip the style picker so the button generates directly.
  await page.addInitScript(() => localStorage.setItem('splotch-ai-customization-enabled', 'false'));

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
  );
  let postedImage = false;
  await page.route('**/api/generate-image', async (route) => {
    const req = route.request();
    postedImage = req.method() === 'POST' && (req.postData() ?? '').includes('drawing.png');
    await route.fulfill({ status: 200, contentType: 'image/png', body: png });
  });

  // The access-code param unlocks the AI feature (captured + persisted on mount).
  await gotoApp(page, '/?ai_access_token=test-token');
  await openDrawer(page);
  await draw(page, [
    { x: 120, y: 120 },
    { x: 260, y: 200 },
  ]);

  const ai = page.locator('#aiImageButton');
  await expect(ai).toBeVisible();
  await expect(ai).toBeEnabled();
  await ai.click();

  await expect(page.locator('dialog.ai-result-modal')).toBeVisible();
  await expect(page.locator('.stage-img.result.shown')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: /download/i })).toBeVisible();
  expect(postedImage).toBe(true);
});

// ── coloring book overlay ───────────────────────────────────────────────────

test('choosing a coloring page sets the canvas overlay', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);

  await page.locator('#coloringBookButton').click();
  const dialog = page.locator('#coloring-book-dialog');
  await expect(dialog).toBeVisible();

  // Farm ships on web and mobile; open it and pick its first page.
  await dialog.getByRole('button', { name: /Farm coloring book/i }).click();
  await dialog
    .getByRole('button', { name: /Farm coloring page/i })
    .first()
    .click();

  await expect(dialog).toBeHidden();
  const overlay = page.locator('#coloringOverlay');
  await expect(overlay).toBeVisible();
  expect(await overlay.getAttribute('src')).toMatch(/\/coloring\/farm\/.+-(wide|tall)\.webp$/);
});

// Apply the first Farm page and wait for its overlay + colored twin to be ready.
async function applyFarmPage(page: Page) {
  await page.locator('#coloringBookButton').click();
  const dialog = page.locator('#coloring-book-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Farm coloring book/i }).click();
  await dialog
    .getByRole('button', { name: /Farm coloring page/i })
    .first()
    .click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#coloringOverlay')).toBeVisible();
}

// A device rotation with ink on the canvas must NOT swap the page's tall/wide
// art out from under the child's coloring (the two variants are different
// compositions — no mapping exists): the engine locks the paper (ADR-0048) and
// the same art stays applied, presented through the paper-view wrapper. Once
// the canvas is blank again the paper re-adopts and the art swaps normally.
// Rotation is emulated via CDP: new viewport dimensions + a changed Screen
// Orientation angle (a plain resize keeps angle 0 and wouldn't rotate).
test('rotating with ink keeps the same coloring page art until the canvas is blank', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  await applyFarmPage(page);

  const overlay = page.locator('#coloringOverlay');
  const srcBefore = await overlay.getAttribute('src');
  expect(srcBefore).toMatch(/-wide\.webp$/); // landscape viewport → wide art

  await draw(page, [
    { x: 200, y: 200 },
    { x: 400, y: 260 },
  ]);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 720,
    height: 1280,
    deviceScaleFactor: 1,
    mobile: true,
    screenOrientation: { type: 'portraitPrimary', angle: 90 },
  });

  // The ink locks the paper: the wide art stays applied, lifted into the
  // letterboxed paper sheet instead of being swapped for the tall variant.
  await expect(page.locator('.paper-sheet.paper-lifted')).toBeVisible();
  await expect(overlay).toHaveAttribute('src', srcBefore!);

  // Undo the only stroke → blank canvas → the paper re-adopts the portrait
  // viewport and the art swaps to the tall variant.
  await page.locator('#undoButton').click();
  await expect(overlay).toHaveAttribute('src', /-tall\.webp$/);
  await expect(page.locator('.paper-sheet.paper-lifted')).toHaveCount(0);
});

// Distinct strongly-opaque canvas colors, quantized to `bits` per channel. A
// solid stroke yields ~one bucket; a magic reveal spanning several fill regions
// yields many — the signal that the brush painted the sheet, not a flat color.
function distinctOpaqueColors(page: Page, bits = 4): Promise<number> {
  return page.evaluate((b) => {
    const c = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
    const shift = 8 - b;
    const seen = new Set<number>();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 200) continue;
      const key =
        ((data[i] >> shift) << (2 * b)) | ((data[i + 1] >> shift) << b) | (data[i + 2] >> shift);
      seen.add(key);
    }
    return seen.size;
  }, bits);
}

test('the magic brush is always available and paints the coloring page colors', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);

  const magic = page.locator('#magicBrushButton');
  await expect(magic).toBeVisible(); // available even before a page is applied

  await applyFarmPage(page);
  await expect(magic).toBeVisible();

  await magic.click();
  await expect(magic).toHaveAttribute('aria-pressed', 'true');

  // Paint across the picture: the reveal should show many of the twin's fill
  // colors, not one flat pen color.
  await draw(page, [
    { x: 120, y: 120 },
    { x: 260, y: 200 },
    { x: 400, y: 140 },
    { x: 520, y: 260 },
  ]);
  await expect.poll(() => distinctOpaqueColors(page), { timeout: 4000 }).toBeGreaterThan(4);

  // Undo reverts the magic stroke.
  await page.locator('#undoButton').click();
  await expect.poll(() => distinctOpaqueColors(page)).toBe(0);
});

// Fraction of opaque canvas pixels that are near-black — the twin's own outlines,
// which the reveal must NOT paint. The overlay <img> (a separate element, not on
// the canvas) is the only source of line work; revealing the twin's copy on the
// canvas would double every line under the overlay and ghost on any drift
// (ADR-0043). So the fills-only reveal leaves the canvas essentially black-free.
function revealedNearBlackFraction(page: Page): Promise<number> {
  return page.evaluate(() => {
    const c = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
    let opaque = 0;
    let nearBlack = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 200) continue;
      opaque++;
      if (data[i] < 40 && data[i + 1] < 40 && data[i + 2] < 40) nearBlack++;
    }
    return opaque === 0 ? 0 : nearBlack / opaque;
  });
}

test('the magic brush reveals fills only, never the twin outlines (no double lines)', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  await applyFarmPage(page);
  await page.locator('#magicBrushButton').click();

  // Sweep across the picture, crossing many black outlines (clouds, cattails,
  // duck, water). Before the outline-masking fix the reveal painted the twin's
  // own black lines onto the canvas here (~2.8% of opaque pixels); the overlay
  // then drew those same lines again, so any drift doubled them. Now the reveal
  // is flat fills, so the canvas stays effectively black-free.
  await draw(page, [
    { x: 120, y: 120 },
    { x: 260, y: 200 },
    { x: 400, y: 140 },
    { x: 520, y: 260 },
    { x: 200, y: 320 },
    { x: 480, y: 360 },
  ]);
  await expect.poll(() => distinctOpaqueColors(page), { timeout: 4000 }).toBeGreaterThan(4);
  expect(await revealedNearBlackFraction(page)).toBeLessThan(0.005);
});

test('the magic brush reveals a rainbow gradient when no coloring page is applied', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);

  const magic = page.locator('#magicBrushButton');
  await expect(magic).toBeVisible();
  await magic.click();
  await expect(magic).toHaveAttribute('aria-pressed', 'true');

  // Drawing across the blank canvas reveals the pre-generated rainbow — a long
  // stroke crosses many hues, so it lays down many distinct colors, not one.
  await draw(page, [
    { x: 100, y: 140 },
    { x: 260, y: 240 },
    { x: 420, y: 160 },
    { x: 560, y: 280 },
  ]);
  await expect.poll(() => distinctOpaqueColors(page), { timeout: 4000 }).toBeGreaterThan(4);

  // Clearing releases the rainbow; the brush stays selected and a fresh stroke
  // still reveals colors (a newly picked gradient).
  await clearViaGesture(page);
  await expect.poll(() => distinctOpaqueColors(page)).toBe(0);
  await draw(page, [
    { x: 120, y: 160 },
    { x: 300, y: 260 },
    { x: 500, y: 180 },
  ]);
  await expect.poll(() => distinctOpaqueColors(page), { timeout: 4000 }).toBeGreaterThan(4);
});

// Count of strongly-opaque canvas pixels.
function opaqueCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const c = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 200) n++;
    return n;
  });
}

test('the eraser removes magic-brush strokes and later colors override them', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);
  await applyFarmPage(page);

  await page.locator('#magicBrushButton').click();
  // A diagonal that crosses several fill regions, so the reveal is real ink.
  const line = [
    { x: 120, y: 120 },
    { x: 300, y: 240 },
    { x: 500, y: 160 },
  ];
  await draw(page, line);
  const revealed = await opaqueCount(page);
  expect(revealed).toBeGreaterThan(0);

  // Eraser wipes magic pixels like any other — dragging back along the stroke
  // removes most of it.
  await page.locator('#eraserButton').click();
  await draw(page, line);
  await expect.poll(() => opaqueCount(page)).toBeLessThan(revealed / 2);

  // A solid color drawn afterward overrides the reveal: paint magic, then a
  // single palette color on top, and confirm that flat color is present.
  await page.locator('#magicBrushButton').click(); // re-select magic (clears eraser)
  await draw(page, line);
  const red = page.locator('.color-swatch[data-color="#EC534E"]');
  await red.click();
  await page.waitForTimeout(150); // color-change debounce
  // Crosses the magic diagonal (~x=300, y=240), so it paints on top of it.
  await draw(page, [
    { x: 200, y: 240 },
    { x: 400, y: 240 },
  ]);
  const hasRed = await page.evaluate(() => {
    const c = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 200 && data[i] > 200 && data[i + 1] < 120 && data[i + 2] < 120) return true;
    }
    return false;
  });
  expect(hasRed).toBe(true);
});

// A toddler mashes a launch button several times before noticing the modal
// opened; the follow-up taps land on the fresh backdrop right where the button
// was and would dismiss it. modalDialog arms a short-lived dead zone around the
// launching button (launchGuard) that swallows those taps without dismissing,
// while a tap elsewhere on the backdrop still closes as usual.
test('a repeat tap where the launch button sat does not dismiss the just-opened modal', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);

  const btn = page.locator('#coloringBookButton');
  const box = (await btn.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await btn.click();
  const dialog = page.locator('#coloring-book-dialog');
  await expect(dialog).toBeVisible();

  // Repeat tap on the vacated button spot (now backdrop) — swallowed, stays open.
  await page.mouse.click(cx, cy);
  await expect(dialog).toBeVisible();

  // A backdrop tap away from the launch point still dismisses; only the
  // button's own region is guarded.
  const vp = page.viewportSize()!;
  await page.mouse.click(vp.width - 10, 10);
  await expect(dialog).toBeHidden();
});

test('rotating the viewport swaps the coloring overlay to the matching art', async ({ page }) => {
  // Rotation reaches the overlay through the shared layout module (one
  // resize/orientationchange listener pair feeding every component), so this
  // also guards that viewport tracking stays live after rotation settles.
  await page.setViewportSize({ width: 900, height: 600 });
  await gotoApp(page);
  await openDrawer(page);

  await page.locator('#coloringBookButton').click();
  const dialog = page.locator('#coloring-book-dialog');
  await dialog.getByRole('button', { name: /Farm coloring book/i }).click();
  await dialog
    .getByRole('button', { name: /Farm coloring page/i })
    .first()
    .click();

  const overlay = page.locator('#coloringOverlay');
  await expect(overlay).toHaveAttribute('src', /-wide\.webp$/);

  await page.setViewportSize({ width: 600, height: 900 });
  await expect(overlay).toHaveAttribute('src', /-tall\.webp$/);

  await page.setViewportSize({ width: 900, height: 600 });
  await expect(overlay).toHaveAttribute('src', /-wide\.webp$/);
});
