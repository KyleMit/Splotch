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
// (brush menu, undo, screenshot, AI, coloring) aren't rendered until the chevron
// is tapped. Retrying the tap also rides out any hydration lag on the first click.
async function openDrawer(page: Page) {
  const undo = page.locator('#undoButton');
  if (await undo.isVisible().catch(() => false)) return; // already open (e.g. persisted)
  // The chevron snaps next to the palette once its width is measured on mount, so
  // it can shift position on the first frame; under parallel load the dev server
  // is also slow to hydrate. Give the click room and retry.
  await expect(async () => {
    await page.locator('button[aria-label="Expand controls"]').click({ timeout: 3000 });
    await expect(undo).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
}

async function openAiSettings(page: Page, expectedField = '#aiKeyInput') {
  const modal = page.locator('#parentHelpModal');
  await expect(async () => {
    if (!(await modal.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Parent Center' }).click({ timeout: 3000 });
    }
    await expect(modal).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 10_000 });
  // The Parent Center is a section list — a sidebar item on tablet/desktop, a
  // hub row on phone. Either way the control carries the section label; opening
  // it (sidebar select or phone drill-in) reveals the section content.
  await page.getByRole('button', { name: 'AI Art' }).click();
  await expect(page.locator(expectedField)).toBeVisible();
}

async function submitAiKey(page: Page, value: string) {
  const save = page.getByRole('button', { name: 'Save' });
  await expect(async () => {
    await page.locator('#aiKeyInput').fill(value);
    await expect(save).toBeEnabled({ timeout: 1000 });
  }).toPass({ timeout: 5000 });
  await save.click();
}

// Open the stroke-width flyout robustly. The button is a toggle, so we click
// only when the menu isn't already open, and retry — this rides out the action
// panel repositioning/re-rendering right after a reload without ever toggling a
// just-opened menu back shut.
async function openStrokeMenu(page: Page) {
  // Present whenever the menu is open — the label is tool-aware (issue #286).
  const sentinel = page.locator('button[aria-label="Size 3"], button[aria-label="Eraser size 3"]');
  await expect(async () => {
    if (!(await sentinel.isVisible().catch(() => false))) {
      await page.locator('#strokeWidthButton').click({ timeout: 1000 });
    }
    await expect(sentinel).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}

// Open the Brush Menu flyout robustly and leave it open — same retry shape as
// openStrokeMenu. The eraser and magic brush live in this flyout (they used to
// be top-level action buttons), so selecting them goes through here.
async function openBrushMenu(page: Page) {
  const sentinel = page.locator('#penBrushButton');
  await expect(async () => {
    if (!(await sentinel.isVisible().catch(() => false))) {
      await page.locator('#brushButton').click({ timeout: 1000 });
    }
    await expect(sentinel).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}

// Select a brush from the Brush Menu by its entry id (e.g. '#eraserButton',
// '#magicBrushButton'). Selecting closes the flyout.
async function pickBrush(page: Page, id: string) {
  await openBrushMenu(page);
  await page.locator(id).click();
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

test('the crayon brush lays textured strokes that build up in the full app', async ({ page }) => {
  await gotoApp(page);
  await expect(page.locator('button.color-swatch[data-color="#AB71E1"]')).toHaveClass(/active/);
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
  await expect(page.locator('button.color-swatch[data-color="#AB71E1"]')).toHaveClass(/active/);

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

test('palette colors and custom hexagons activate from the keyboard', async ({ page }) => {
  await gotoApp(page);

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Purple' })).toBeFocused();
  await page.keyboard.press('Tab');
  const blue = page.getByRole('button', { name: 'Blue' });
  await expect(blue).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(blue).toHaveClass(/active/);

  const red = page.getByRole('button', { name: 'Red' });
  await red.focus();
  await page.keyboard.press('Space');
  await expect(red).toHaveClass(/active/);

  const custom = page.getByRole('button', { name: 'Custom Color' });
  await custom.focus();
  await page.keyboard.press('Enter');
  const dialog = page.locator('#color-picker');
  await expect(dialog).toBeVisible();

  const green = dialog.locator('.grid.landscape .hexagon[data-color="#2ECC71"]');
  await green.focus();
  await page.keyboard.press('Space');
  await expect(dialog).not.toBeVisible();
  await expect(green).toHaveClass(/selected/);
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
  await page.locator('button.color-swatch[data-color="#EC534E"]').click();
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

  // The button is aria-disabled (not attribute-disabled), so a tap at the end
  // of history still lands and answers with the end-of-history shake. force:
  // Playwright's actionability check refuses to click aria-disabled elements,
  // but dispatching the real pointer events is exactly the toddler tap under
  // test. The class lives only for the animation's 400ms, so retry the tap if
  // the assertion misses the window.
  await expect(async () => {
    await undo.click({ force: true });
    await expect(undo).toHaveClass(/end-of-history/, { timeout: 350 });
  }).toPass({ timeout: 10_000 });
  // The shake is an affordance, not an action — the canvas stayed blank.
  expect(await firstOpaquePixel(page)).toBeNull();
});

test('the end-of-history cue still plays with reduced motion enabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoApp(page);
  await openDrawer(page);

  // A blank canvas already has no history, so the very first tap hits the wall.
  const undo = page.locator('#undoButton');
  await expect(undo).toBeDisabled();

  await expect(async () => {
    await undo.click({ force: true });
    await expect(undo).toHaveClass(/end-of-history/, { timeout: 350 });
  }).toPass({ timeout: 10_000 });
  // Reduced motion swaps the shake for the non-positional flash rather than
  // removing the cue: an animation still runs, so its animationend clears the
  // class — proving a real cue played instead of the class sitting inert.
  await expect(undo).not.toHaveClass(/end-of-history/, { timeout: 2000 });
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

  // Eraser → size 1 (the flyout re-labels to the eraser context).
  await pickBrush(page, '#eraserButton');
  await openStrokeMenu(page);
  await page.locator('button[aria-label="Eraser size 1"]').click();

  await page.reload();
  await expect(page.locator('#drawingCanvas')).toBeVisible();

  // The drawer-open state is persisted, so its buttons render immediately (the
  // action panel may still be repositioning — openStrokeMenu rides that out).
  // Pen is the default tool after reload, so its remembered size 5 is active.
  await openStrokeMenu(page);
  await expect(page.locator('button[aria-label="Size 5"]')).toHaveAttribute('aria-pressed', 'true');

  // Switch to the eraser — its independent size 1 is restored.
  await pickBrush(page, '#eraserButton');
  await openStrokeMenu(page);
  await expect(page.locator('button[aria-label="Eraser size 1"]')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
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
  // though it's in the DOM: opening the Brush Menu shows the other brushes but
  // never the eraser entry.
  await openBrushMenu(page);
  await expect(page.locator('#crayonBrushButton')).toBeVisible();
  await expect(page.locator('#eraserButton')).toBeHidden();
});

// The brush choice is a persisted user setting (default pen; the eraser is
// deliberately excluded). The head script in app.html stamps [data-brush] on
// <html> before paint so the Brush Button wears the right face with no flash.
test('the picked brush persists across a reload and stamps the brush face pre-paint', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);

  // Default is the pen: no data-brush attribute, pen entry selected.
  await expect(page.locator('html')).not.toHaveAttribute('data-brush');
  await openBrushMenu(page);
  await expect(page.locator('#penBrushButton')).toHaveAttribute('aria-pressed', 'true');

  await pickBrush(page, '#crayonBrushButton');
  await expect(page.locator('html')).toHaveAttribute('data-brush', 'crayon');

  await page.reload();
  await expect(page.locator('#drawingCanvas')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-brush', 'crayon');
  await openBrushMenu(page);
  await expect(page.locator('#crayonBrushButton')).toHaveAttribute('aria-pressed', 'true');
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

test('parent center sidebar switches the content pane (tablet layout)', async ({ page }) => {
  await gotoApp(page);

  await page.getByRole('button', { name: 'Parent Center' }).click();
  const modal = page.locator('#parentHelpModal');
  await expect(modal).toBeVisible();
  // The default Playwright viewport is desktop-width, so the two-pane shell with
  // a persistent sidebar renders and the first section is selected.
  await expect(modal).toHaveClass(/wide/);
  await expect(page.getByRole('button', { name: 'Appearance & Display' })).toHaveClass(/active/);

  // Selecting a section highlights it in the sidebar and swaps the pane content.
  await page.getByRole('button', { name: 'Controls & Buttons' }).click();
  await expect(page.getByRole('button', { name: 'Controls & Buttons' })).toHaveClass(/active/);
  await expect(page.locator('#advancedControlsToggle')).toBeVisible();

  // The Setup section keeps its own <details> accordions inside the pane.
  await page.getByRole('button', { name: 'Setup Guide' }).click();
  const setupDetails = page.locator('.help-section').first();
  await expect(setupDetails.locator('summary')).toBeVisible();

  // About holds the identity block — the mascot renders in full color.
  await page.getByRole('button', { name: 'About' }).click();
  const aboutMascot = page.locator('.about-brand [data-icon="splotchy"]');
  const aboutMascotImage = aboutMascot.locator('img');
  await expect(aboutMascotImage).toBeVisible();
  await expect
    .poll(() => aboutMascotImage.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await expect(aboutMascot).toHaveClass(/icon-color/);
});

test('parent center hub drills into a section and back (phone layout)', async ({ page }) => {
  await page.setViewportSize({ width: 460, height: 852 });
  await gotoApp(page);

  await page.getByRole('button', { name: 'Parent Center' }).click();
  const modal = page.locator('#parentHelpModal');
  await expect(modal).toBeVisible();
  // Below the breakpoint the hub renders instead of the sidebar.
  await expect(modal).not.toHaveClass(/wide/);
  await expect(page.locator('.hub-list')).toBeVisible();
  // Nothing is drilled in yet, so a section's own controls aren't mounted.
  await expect(page.locator('#advancedControlsToggle')).toHaveCount(0);

  // Tapping a row opens the full-page section.
  await page.getByRole('button', { name: 'Controls & Buttons' }).click();
  await expect(page.locator('#advancedControlsToggle')).toBeVisible();
  await expect(page.locator('.hub-list')).toHaveCount(0);

  // The back arrow returns to the hub.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('.hub-list')).toBeVisible();
  await expect(page.locator('#advancedControlsToggle')).toHaveCount(0);
});

// A landscape phone has the width of the tablet shell but almost none of its
// height, so the full section list is unusably cramped there. The Parent Center
// collapses to a strip of quick toggles plus a pointer to portrait; a landscape
// tablet (height ≥ 600px, e.g. the default desktop viewport above) keeps the
// two-pane shell.
test('parent center shows quick toggles on a landscape phone', async ({ page }) => {
  await page.setViewportSize({ width: 852, height: 390 });
  await gotoApp(page);

  await page.getByRole('button', { name: 'Parent Center' }).click();
  const modal = page.locator('#parentHelpModal');
  await expect(modal).toBeVisible();
  await expect(modal).toHaveClass(/compact/);

  // Quick toggles render instead of the hub list or the sidebar.
  await expect(page.locator('.hub-list')).toHaveCount(0);
  await expect(page.locator('.pc-nav')).toHaveCount(0);
  await expect(page.locator('#quickSoundToggle')).toBeVisible();
  await expect(page.locator('#quickNightToggle')).toBeVisible();
  await expect(page.locator('#quickAdvancedControlsToggle')).toBeVisible();
  // The orientation lock selector holds the device-varying bottom-right (last)
  // slot, so the other three toggles sit in the same place on lock-incapable
  // devices too.
  const orientationCell = page.locator('.quick-toggles > .setting').nth(3);
  await expect(orientationCell.locator('#quickLockPortrait')).toBeVisible();
  await expect(orientationCell.locator('#quickLockLandscape')).toBeVisible();
  await expect(page.getByText('Switch to portrait for the full settings')).toBeVisible();

  // A quick toggle drives the same persisted setting as the full section...
  await page.locator('#quickAdvancedControlsToggle').click();
  await expect(page.locator('#quickAdvancedControlsToggle')).toHaveAttribute(
    'aria-checked',
    'false'
  );

  // A phone-sized screen defaults to a portrait lock, so Portrait starts active.
  await expect(page.locator('#quickLockPortrait')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#quickLockLandscape')).toHaveAttribute('aria-pressed', 'false');

  // Choosing the other side moves the lock to it.
  await page.locator('#quickLockLandscape').click();
  await expect(page.locator('#quickLockLandscape')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#quickLockPortrait')).toHaveAttribute('aria-pressed', 'false');

  // Tapping the active side again releases the lock — neither side stays active,
  // so the phone is free to rotate again.
  await page.locator('#quickLockLandscape').click();
  await expect(page.locator('#quickLockLandscape')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#quickLockPortrait')).toHaveAttribute('aria-pressed', 'false');

  // Re-select Portrait to carry a portrait lock into the rotation check below,
  // where the full Appearance section should reflect it.
  await page.locator('#quickLockPortrait').click();
  await expect(page.locator('#quickLockPortrait')).toHaveAttribute('aria-pressed', 'true');

  // ...and rotating to portrait swaps in the full hub shell live, where the
  // Controls section reflects the change made from the quick toggle.
  await page.setViewportSize({ width: 390, height: 852 });
  await expect(page.locator('.hub-list')).toBeVisible();
  await expect(page.locator('#quickSoundToggle')).toHaveCount(0);
  await page.getByRole('button', { name: 'Controls & Buttons' }).click();
  await expect(page.locator('#advancedControlsToggle')).toHaveAttribute('aria-checked', 'false');

  // The Appearance section shows the lock we set, now forced to portrait.
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Appearance & Display' }).click();
  await expect(page.locator('#lockRotationToggle')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#forceLandscapeToggle')).toHaveAttribute('aria-checked', 'false');
});

// A lock-incapable device (tablet-class native — supportsOrientationLock) hides
// the Lock Rotation quick toggle, which used to leave a 3-cell hole in the
// compact 2×2; a mini About cell (Splotch icon + version) fills the bottom-right
// slot instead — the one device-varying cell, so the other three toggles sit in
// the same place on every device. supportsOrientationLock reads the *physical
// screen's* smaller side while COMPACT_QUERY reads the window, so the stubbed
// screen stays tablet-sized (min side ≥ 600) while the window height drops
// under 600 — the small-tablet-in-landscape combination from the report. (The
// screen getters are stubbed directly because Playwright's `screen` context
// option only takes effect in mobile emulation, where Chromium honors
// screen-size overrides.)
test('a lock-incapable device fills the empty quick-toggle slot with a mini About cell', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1133, height: 560 });
  // The web build never loads Capacitor plugins (__IS_CAPACITOR__ is false),
  // so a stub global is enough to flip isNative() without breaking anything.
  await page.addInitScript(() => {
    (globalThis as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
    };
    Object.defineProperty(Screen.prototype, 'width', { get: () => 1133 });
    Object.defineProperty(Screen.prototype, 'height', { get: () => 744 });
  });
  await gotoApp(page);

  await page.getByRole('button', { name: 'Parent Center' }).click();
  const modal = page.locator('#parentHelpModal');
  await expect(modal).toBeVisible();
  await expect(modal).toHaveClass(/compact/);

  // The orientation lock selector is gone, and the About cell keeps the grid at
  // four cells, sitting in the bottom-right (last) slot where it would be.
  await expect(page.locator('#quickLockPortrait')).toHaveCount(0);
  await expect(page.locator('#quickLockLandscape')).toHaveCount(0);
  const cells = page.locator('.quick-toggles > .setting');
  await expect(cells).toHaveCount(4);
  const aboutCell = cells.nth(3);
  await expect(aboutCell).toHaveClass(/about-cell/);
  await expect(aboutCell).toBeVisible();
  await expect(aboutCell).toContainText(/Version \d+\.\d+\.\d+/);
});

test('an API key stays locked with storage-specific feedback when secure saving fails', async ({
  page,
}) => {
  await page.route('**/api/verify-key', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    })
  );
  await gotoApp(page);
  await openAiSettings(page);

  await page.evaluate(() => {
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (storeNames, mode, options) {
      if (this.name === 'splotch-secure') throw new Error('forced secure storage failure');
      return transaction.call(this, storeNames, mode, options);
    };
  });

  await submitAiKey(page, 'AIza-storage-failure');

  await expect(page.getByRole('alert')).toContainText('could not be saved securely');
  await expect(page.locator('#aiKeyInput')).toBeVisible();
  await expect(page.locator('#aiKeyActive')).toHaveCount(0);
});

test('only the current API key verification can persist across a close and reopen', async ({
  page,
}) => {
  let requestCount = 0;
  let releaseFirst!: () => void;
  const firstResponse = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  await page.route('**/api/verify-key', async (route) => {
    requestCount += 1;
    if (requestCount === 1) await firstResponse;
    await route
      .fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
      .catch(() => undefined);
  });
  await gotoApp(page);
  await openAiSettings(page);

  await submitAiKey(page, 'AIza-credential-AAAA');
  await expect.poll(() => requestCount).toBe(1);

  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('#parentHelpModal')).toBeHidden();
  await openAiSettings(page);
  await submitAiKey(page, 'AIza-credential-BBBB');

  await expect(page.locator('#aiKeyActive')).toHaveValue(/BBBB$/);
  releaseFirst();
  await page.waitForTimeout(300);
  await expect(page.locator('#aiKeyActive')).toHaveValue(/BBBB$/);

  await page.reload();
  await expect(page.locator('#drawingCanvas')).toBeVisible();
  await openAiSettings(page, '#aiKeyActive');
  await expect(page.locator('#aiKeyActive')).toHaveValue(/BBBB$/);
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
    // The client sends the raw image bytes as the body (no multipart envelope)
    // with the credential in a header — and a WebP upload (issue #345), which
    // Chromium encodes, so the Content-Type is image/webp.
    postedImage =
      req.method() === 'POST' &&
      req.headers()['content-type'] === 'image/webp' &&
      Boolean(req.headers()['x-access-token'] ?? req.headers()['x-api-key']) &&
      Boolean(req.postDataBuffer()?.length);
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

// Open the coloring-book dialog robustly — same retry shape as openDrawer: a
// click fired right after hydration can hit the button before its handler is
// wired, so re-click until the dialog actually opens.
async function openColoringDialog(page: Page) {
  const dialog = page.locator('#coloring-book-dialog');
  await expect(async () => {
    if (!(await dialog.isVisible().catch(() => false))) {
      await page.locator('#coloringBookButton').click({ timeout: 1000 });
    }
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}

test('choosing a coloring page sets the canvas overlay', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);

  await openColoringDialog(page);
  const dialog = page.locator('#coloring-book-dialog');

  // Farm ships on web and mobile; open it and pick its first page.
  await dialog.getByRole('button', { name: /Farm coloring book/i }).click();
  await dialog
    .getByRole('button', { name: /Farm coloring page/i })
    .first()
    .click();

  await expect(dialog).toBeHidden();
  const overlay = page.locator('#coloringOverlay');
  await expect(overlay).toBeVisible();
  // The src lands once the art has decoded (the ready-gated swap), so retry.
  await expect(overlay).toHaveAttribute('src', /\/coloring\/farm\/.+-(wide|tall)\.outline\.webp$/);
});

// Apply the first Farm page and wait for its overlay + colored fill to be ready.
async function applyFarmPage(page: Page) {
  await openColoringDialog(page);
  const dialog = page.locator('#coloring-book-dialog');
  await dialog.getByRole('button', { name: /Farm coloring book/i }).click();
  await dialog
    .getByRole('button', { name: /Farm coloring page/i })
    .first()
    .click();
  await expect(dialog).toBeHidden();
  // Wait for the art itself, not just the element: the src lands only once the
  // image has decoded (the ready-gated swap in DrawingCanvas).
  await expect(page.locator('#coloringOverlay')).toHaveAttribute('src', /\.webp$/);
}

// A device rotation with ink on the canvas must NOT swap the page's tall/wide
// art out from under the child's coloring (the two variants are different
// compositions — no mapping exists): the engine locks the paper (ADR-0050) and
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
  await expect(overlay).toHaveAttribute('src', /-wide\.outline\.webp$/); // landscape viewport → wide art
  const srcBefore = await overlay.getAttribute('src');

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
  await expect(overlay).toHaveAttribute('src', /-tall\.outline\.webp$/);
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
  await openBrushMenu(page);
  await expect(magic).toBeVisible(); // available even before a page is applied

  await applyFarmPage(page);

  await pickBrush(page, '#magicBrushButton');
  await expect(magic).toHaveAttribute('aria-pressed', 'true');

  // Paint across the picture: the reveal should show many of the fill's fill
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

// Issue #187: while a stroke is live, an area-of-impact ring tracks the pointer —
// subtle grey for the pen, rainbow for the magic brush so its reveal behavior is
// legible. The ring exists only between pointerdown and pointerup.
test('drawing shows a brush impact ring, rainbow-flavored for the magic brush', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);

  const ring = page.locator('.brush-ring');
  await expect(ring).toHaveCount(0);

  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  // Pen: ring appears on pointerdown, follows the stroke, and leaves on lift.
  await page.mouse.move(box.x + 150, box.y + 120);
  await page.mouse.down();
  await expect(ring).toHaveCount(1);
  await expect(ring).not.toHaveClass(/magic/);
  await page.mouse.move(box.x + 250, box.y + 180);
  await expect(ring).toHaveCount(1);
  await page.mouse.up();
  await expect(ring).toHaveCount(0);

  // Magic brush: same ring, rainbow-flavored.
  const magic = page.locator('#magicBrushButton');
  await pickBrush(page, '#magicBrushButton');
  await expect(magic).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(box.x + 150, box.y + 120);
  await page.mouse.down();
  await expect(ring).toHaveCount(1);
  await expect(ring).toHaveClass(/magic/);
  await page.mouse.up();
  await expect(ring).toHaveCount(0);
});

// A palette press mid-stroke ends the stroke through releaseAllPointers() — the
// canvas never sees a pointerup for the drawing finger, so the ring must leave
// with the engine's capture release (lostpointercapture), not linger and stick.
test('a palette press mid-stroke removes the live brush ring', async ({ page }) => {
  await gotoApp(page);

  const ring = page.locator('.brush-ring');
  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');

  await page.mouse.move(box.x + 200, box.y + 150);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 200);
  await expect(ring).toHaveCount(1);

  // The second finger pressing a swatch, dispatched synthetically — one real
  // mouse can't press two places at once. handlePaletteDown fires on
  // pointerdown and calls releaseAllPointers().
  await page.evaluate(() => {
    const swatch = document.querySelector('button.color-swatch[data-color="#62A2E9"]')!;
    swatch.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 77,
        pointerType: 'touch',
        bubbles: true,
        cancelable: true,
      })
    );
  });
  await expect(ring).toHaveCount(0);

  await page.mouse.up();
});

// iOS/WebKit can merge a fast pen tap-then-stroke into one stream whose
// pointerdown never arrives — the engine adopts the stroke from a pointermove
// (orphan-pen recovery) and captures the pointer. The ring must grow from that
// adopted move alone. Synthetic events can't acquire real pointer capture
// (setPointerCapture rejects a fabricated pointerId), so the capture the engine
// takes on adoption is stubbed.
test('an adopted down-less pen stream still grows a brush ring', async ({ page }) => {
  await gotoApp(page);
  const ring = page.locator('.brush-ring');

  await page.evaluate(() => {
    const canvas = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    canvas.hasPointerCapture = () => true;
    canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 88,
        pointerType: 'pen',
        buttons: 1,
        clientX: 300,
        clientY: 220,
        bubbles: true,
        cancelable: true,
      })
    );
  });
  await expect(ring).toHaveCount(1);

  await page.evaluate(() => {
    document
      .getElementById('drawingCanvas')!
      .dispatchEvent(
        new PointerEvent('pointerup', { pointerId: 88, pointerType: 'pen', bubbles: true })
      );
  });
  await expect(ring).toHaveCount(0);
});

// Fraction of opaque canvas pixels that are near-black — the fill's own outlines,
// which the reveal must NOT paint. The overlay <img> (a separate element, not on
// the canvas) is the only source of line work; revealing the fill's copy on the
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

test('the magic brush reveals fills only, never the fill outlines (no double lines)', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  await applyFarmPage(page);
  await pickBrush(page, '#magicBrushButton');

  // Sweep across the picture, crossing many black outlines (clouds, cattails,
  // duck, water). Before the outline-masking fix the reveal painted the fill's
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

// Opaque pixel count within a thin band at one canvas edge — the letterbox margin.
function opaquePixelsInLeftBand(page: Page, frac = 0.04): Promise<number> {
  return page.evaluate((f) => {
    const c = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    const bandW = Math.max(1, Math.round(c.width * f));
    const { data } = c.getContext('2d')!.getImageData(0, 0, bandW, c.height);
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 200) opaque++;
    return opaque;
  }, frac);
}

// A coloring page is contain-fit, so a differently-proportioned viewport letterboxes
// it (left/right in this landscape default). The fill's edge colours are extended
// into those margins so the brush paints the whole canvas with no hard seam — before
// the fix a stroke in the margin revealed nothing (transparent sheet). ADR-0043.
test('the magic brush paints the letterbox margin by extending the edge colour', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  await applyFarmPage(page);
  await pickBrush(page, '#magicBrushButton');

  // Hug the far-left edge, well inside the letterbox band, sweeping top to bottom.
  await draw(page, [
    { x: 3, y: 40 },
    { x: 3, y: 200 },
    { x: 3, y: 360 },
    { x: 3, y: 520 },
  ]);
  // The margin now reveals the extended edge colour instead of staying transparent.
  await expect.poll(() => opaquePixelsInLeftBand(page), { timeout: 4000 }).toBeGreaterThan(500);
});

// Opaque pixel count within a thin band at the TOP canvas edge.
function opaquePixelsInTopBand(page: Page, frac = 0.05): Promise<number> {
  return page.evaluate((f) => {
    const c = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    const bandH = Math.max(1, Math.round(c.height * f));
    const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, bandH);
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 200) opaque++;
    return opaque;
  }, frac);
}

// The case the user hit: after a rotation-with-ink the paper LOCKS (ADR-0050) and is
// contain-fit into the new viewport, leaving letterbox margins around the whole page
// (not just inside it). The magic sheet now covers the mapped viewport, so the brush
// paints those margins too — before, they revealed nothing even though a pen could
// draw there. Rotation is emulated via CDP (new metrics + a changed orientation angle).
test('the magic brush paints the rotation-lock letterbox margin', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);
  await applyFarmPage(page); // landscape viewport → wide art

  // Ink locks the paper on rotation (a blank canvas would just re-adopt).
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
  // The wide paper stays, lifted into the letterboxed sheet with top/bottom margins.
  await expect(page.locator('.paper-sheet.paper-lifted')).toBeVisible();

  await pickBrush(page, '#magicBrushButton');
  // Sweep along the very top of the canvas — inside the rotation-lock top margin.
  await draw(page, [
    { x: 40, y: 6 },
    { x: 240, y: 6 },
    { x: 440, y: 6 },
    { x: 660, y: 6 },
  ]);
  await expect.poll(() => opaquePixelsInTopBand(page), { timeout: 4000 }).toBeGreaterThan(500);
});

test('the magic brush reveals a rainbow gradient when no coloring page is applied', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);

  const magic = page.locator('#magicBrushButton');
  await pickBrush(page, '#magicBrushButton');
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

  // Clearing releases the held rainbow but keeps the magic brush selected (#309)
  // — it draws on a fresh page too, so the child picks up right where they were.
  await clearViaGesture(page);
  await expect(magic).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => distinctOpaqueColors(page)).toBe(0);

  // Drawing again still reveals colors (a newly picked gradient).
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

  await pickBrush(page, '#magicBrushButton');
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
  await pickBrush(page, '#eraserButton');
  await draw(page, line);
  await expect.poll(() => opaqueCount(page)).toBeLessThan(revealed / 2);

  // A solid color drawn afterward overrides the reveal: paint magic, then a
  // single palette color on top, and confirm that flat color is present.
  await pickBrush(page, '#magicBrushButton'); // re-select magic (clears eraser)
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

// A touch tap activates the launcher on pointerup (scribbleTap), so the dialog
// is already open and painted when the tap's trailing synthesized click
// dispatches — and that click is hit-tested at dispatch time, landing on
// whatever book tile sits under the finger. Unless the launch dead zone also
// guards dialog *content*, the picker opens pre-drilled into a "random" book
// (issue #308). Mouse clicks can't reproduce this (a click targets the common
// ancestor of its down/up targets, which is never inside the dialog), so this
// spec taps with a real touchscreen.
test.describe('coloring book picker via touch', () => {
  test.use({ hasTouch: true });

  test('a touch tap on the launcher opens the picker at the root book list', async ({ page }) => {
    await gotoApp(page);
    await openDrawer(page);

    await page.locator('#coloringBookButton').tap();

    const dialog = page.locator('#coloring-book-dialog');
    await expect(dialog).toBeVisible();
    // A book tile paints exactly where the finger was (that's what makes the
    // ghost click land); the picker must still show the root book list, not a
    // drilled-in page grid.
    await expect(dialog.getByRole('heading', { name: 'Coloring Books' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Back' })).toHaveCount(0);
  });
});

test('rotating the viewport swaps the coloring overlay to the matching art', async ({ page }) => {
  // Rotation reaches the overlay through the shared layout module (one
  // resize/orientationchange listener pair feeding every component), so this
  // also guards that viewport tracking stays live after rotation settles.
  await page.setViewportSize({ width: 900, height: 600 });
  await gotoApp(page);
  await openDrawer(page);

  await openColoringDialog(page);
  const dialog = page.locator('#coloring-book-dialog');
  await dialog.getByRole('button', { name: /Farm coloring book/i }).click();
  await dialog
    .getByRole('button', { name: /Farm coloring page/i })
    .first()
    .click();

  const overlay = page.locator('#coloringOverlay');
  await expect(overlay).toHaveAttribute('src', /-wide\.outline\.webp$/);

  await page.setViewportSize({ width: 600, height: 900 });
  await expect(overlay).toHaveAttribute('src', /-tall\.outline\.webp$/);

  await page.setViewportSize({ width: 900, height: 600 });
  await expect(overlay).toHaveAttribute('src', /-wide\.outline\.webp$/);
});
