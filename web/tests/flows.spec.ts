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
  await draw(page, [{ x: 120, y: 120 }, { x: 260, y: 120 }]);

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

  await draw(page, [{ x: 120, y: 120 }, { x: 260, y: 200 }]);
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

  await draw(page, [{ x: 140, y: 140 }, { x: 240, y: 200 }]);
  await expect(shot).toBeEnabled();

  // Undo back to empty re-disables it.
  await page.locator('#undoButton').click();
  await expect(shot).toBeDisabled();
});

// ── tool/stroke state + persistence ─────────────────────────────────────────

test('pen and eraser keep independent stroke sizes that persist across reload', async ({ page }) => {
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

test('the drawer open state persists across a reload', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);

  await page.reload();
  await expect(page.locator('#drawingCanvas')).toBeVisible();
  // No chevron tap this time — the drawer should reopen from persisted state.
  await expect(page.locator('#undoButton')).toBeVisible();
});

test('parent center panels can be changed by tab buttons and native scrolling', async ({
  page
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
  await page.addInitScript(() =>
    localStorage.setItem('splotch-ai-customization-enabled', 'false')
  );

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
  await draw(page, [{ x: 120, y: 120 }, { x: 260, y: 200 }]);

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
  await dialog.getByRole('button', { name: /Farm coloring page/i }).first().click();

  await expect(dialog).toBeHidden();
  const overlay = page.locator('#coloringOverlay');
  await expect(overlay).toBeVisible();
  expect(await overlay.getAttribute('src')).toMatch(/\/coloring\/farm\/.+-(wide|tall)\.webp$/);
});
