import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  CUSTOM_SWATCH_COLOR,
  gotoApp,
  isBlueDominant,
  PICKER_GREEN,
  retryOpen,
  settleFlyIn,
  swatch,
  TEST_PALETTE,
  touchEventPrevented,
  type Rgba,
} from './helpers';

import { openBrushMenu, openDrawer, openStrokeMenu, pickBrush } from './flows-harness';

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

// How far left of a hexagon's center the gap probe sits. The picker's swatches
// are clip-path hexagons, so a point beside the first column's center is over
// the picker background rather than any swatch, while 39px stays inside
// ColorPicker's 40px snap radius (half the 69px hexagon height plus slop) and
// nearer that hexagon than any other — the pencil-tip miss the snap exists for.
const PICKER_GAP_PROBE_PX = 39;

// The gap point beside `target`, plus whether an element hit-test still finds a
// hexagon there, so a caller can prove the point really is in a gap.
async function pickerGapBeside(page: Page, target: Locator) {
  const box = (await target.boundingBox())!;
  const point = {
    x: box.x + box.width / 2 - PICKER_GAP_PROBE_PX,
    y: box.y + box.height / 2,
  };
  const overHexagon = await page.evaluate(
    ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.hexagon'),
    point
  );
  return { ...point, overHexagon };
}

test('pointer exploration still snaps a hexagon gap and commits the highlighted color', async ({
  page,
}) => {
  await gotoApp(page);

  // gotoApp returns on the PRERENDERED canvas, which is visible before the route
  // hydrates, and this swatch opens the picker through a Svelte action
  // (scribbleTap) that only exists once it has. So the first click can land on a
  // button with no handler yet and be lost outright — retryOpen re-clicks until
  // the dialog is really up, and skips the click when it already is (the same
  // reason the keyboard-activation test above opens the picker this way).
  const dialog = page.locator('#color-picker');
  await retryOpen(dialog, () =>
    page.getByRole('button', { name: 'Custom Color' }).click({ timeout: 1000 })
  );
  const start = dialog.locator('.grid.landscape .row.r5 .hexagon.c3');
  const target = dialog.locator('.grid.landscape .row.r5 .hexagon.c1');

  await expect(async () => {
    await page.mouse.up();
    await start.hover();
    await page.mouse.down();
    await target.hover();
    await expect(target).toHaveClass(/hover/);
  }).toPass();

  const gap = await pickerGapBeside(page, target);
  expect(gap.overHexagon).toBe(false);
  await page.mouse.move(gap.x, gap.y);
  await expect(target).toHaveClass(/hover/);
  await page.mouse.up();

  await expect(dialog).not.toBeVisible();
  await expect(target).toHaveClass(/selected/);
});

// The gesture the snap radius is really for: a tap — down and up at the same
// point — that lands in the picker background between hexagons. It only resolves
// if the opening pointerdown itself falls back to the snap; gate the snap behind
// a direct clip-path hit and this tap selects nothing at all (issue #777).
test('a tap that lands in a hexagon gap snaps to the nearest swatch', async ({ page }) => {
  await gotoApp(page);

  const dialog = page.locator('#color-picker');
  await retryOpen(dialog, () =>
    page.getByRole('button', { name: 'Custom Color' }).click({ timeout: 1000 })
  );
  // The tap dispatches at a measured coordinate rather than through an
  // actionability-checked click, so the dialog has to have landed first.
  await settleFlyIn(dialog);

  const target = dialog.locator('.grid.landscape .row.r5 .hexagon.c1');
  await expect(target).not.toHaveClass(/selected/);

  const gap = await pickerGapBeside(page, target);
  expect(gap.overHexagon).toBe(false);

  // A tap swallowed by the launch dead zone guarding the opening swatch changes
  // nothing at all, so retry the whole down+up until the picker commits and
  // closes — and skip re-tapping once it has, since that would land on the canvas.
  await expect(async () => {
    if (await dialog.isVisible()) {
      await page.mouse.move(gap.x, gap.y);
      await page.mouse.down();
      await page.mouse.up();
    }
    await expect(dialog).not.toBeVisible({ timeout: 1000 });
  }).toPass();

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

  const painted = await swatch(page, TEST_PALETTE.blue).evaluate(
    async (paletteSwatch): Promise<Rgba | null> => {
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

      const tiles = Array.from(
        document.querySelectorAll<HTMLCanvasElement>('canvas[data-live-tile]')
      );
      for (const rendered of tiles.length > 0 ? tiles : [canvas]) {
        const { data } = rendered
          .getContext('2d')!
          .getImageData(0, 0, rendered.width, rendered.height);
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 0) return [data[i - 3], data[i - 2], data[i - 1], data[i]];
        }
      }
      return null;
    }
  );

  expect(painted).not.toBeNull();
  // The selected blue is blue-dominant, so the stroke painted in the just-picked color.
  expect(isBlueDominant(painted!)).toBe(true);
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

  const fingerPrevented = await touchEventPrevented(
    page,
    `button.color-swatch[data-color="${TEST_PALETTE.blue}"]`,
    'touchstart'
  );

  expect(fingerPrevented).toBe(false);
});

// Chromium cannot construct a Touch with touchType (Safari-only), so these
// stub changedTouches exactly like scribbleGuard.test.ts. The guard's
// discrimination logic is unit-tested; what e2e pins down is that the guard is
// ATTACHED to each surface a pen taps right before drawing — the gap that
// shipped the picker unguarded. The real Scribble swallowing needs trusted
// on-device input (ADR-0038), so guard attachment is the automatable proxy.
test('a stylus tap on a color-picker hexagon has its touch stream cancelled (Scribble guard)', async ({
  page,
}) => {
  await gotoApp(page);

  const customSwatch = swatch(page, CUSTOM_SWATCH_COLOR);
  await expect(async () => {
    await customSwatch.click({ timeout: 1000 });
    await expect(page.locator('#color-picker')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });

  expect(await touchEventPrevented(page, '#color-picker .hexagon', 'touchstart', true)).toBe(true);
});

test('a stylus tap on an action button has its touch stream cancelled (Scribble guard)', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);

  expect(await touchEventPrevented(page, '#brushButton', 'touchstart', true)).toBe(true);
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
    const rect = btn.getBoundingClientRect();
    const opts = {
      pointerId: 42,
      pointerType: 'pen',
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      bubbles: true,
      cancelable: true,
    };
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

// PointerHalos attaches its own pointer listeners to the canvas element in an
// $effect (extracted from DrawingCanvas) rather than through template handlers
// — a silent failure to attach would leave the bubble permanently invisible
// with the rest of the suite still green, so pin the whole lifecycle here.
test('the eraser bubble tracks the pointer and hides on leave or brush switch', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  await pickBrush(page, '#eraserButton');
  await expect(page.locator('#drawingCanvas')).toHaveClass(/erasing/);

  const bubble = page.locator('.eraser-bubble');
  const canvas = page.locator('#drawingCanvas');

  // pointerleave doesn't bubble, so dispatch it straight at the canvas rather
  // than relying on a real mouse move landing outside its box (the
  // surrounding chrome varies with viewport size). This also gives the test a
  // known starting state: picking the eraser can close the flyout right under
  // the cursor, exposing the canvas beneath it and legitimately showing the
  // bubble before any deliberate move.
  const leaveCanvas = () =>
    canvas.evaluate((el) =>
      el.dispatchEvent(new PointerEvent('pointerleave', { cancelable: true }))
    );
  await leaveCanvas();
  await expect(bubble).toHaveCount(0);

  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 150, box.y + 120);
  await expect(bubble).toHaveCount(1);
  const first = await bubble.evaluate((el) => (el as HTMLElement).style.transform);

  await page.mouse.move(box.x + 250, box.y + 220);
  await expect
    .poll(() => bubble.evaluate((el) => (el as HTMLElement).style.transform))
    .not.toBe(first);

  await leaveCanvas();
  await expect(bubble).toHaveCount(0);

  // Re-enter, then switch to a drawing brush: the bubble must disappear even
  // though the pointer never left the canvas.
  await page.mouse.move(box.x + 150, box.y + 120);
  await expect(bubble).toHaveCount(1);
  await pickBrush(page, '#penBrushButton');
  await expect(bubble).toHaveCount(0);
});

// A flyout closing under a keyboard user's focus has to hand that focus back to
// the trigger: the focused option is about to be display:none, which drops focus
// on <body>. Both close paths that can fire from inside the menu get their own
// test — the two flyouts share one open-state slot but have separate triggers,
// so each is checked in both.
test('Escape closes an Actions Panel flyout and restores focus to its trigger', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);

  await openBrushMenu(page);
  await page.locator('#penBrushButton').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.brush-menu')).toBeHidden();
  await expect(page.locator('#brushButton')).toBeFocused();

  await openStrokeMenu(page);
  await page.locator('button[aria-label="Size 3"]').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.stroke-width-menu')).toBeHidden();
  await expect(page.locator('#strokeWidthButton')).toBeFocused();
});

test('a keyboard pick closes the flyout and restores focus to its trigger', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);

  await openBrushMenu(page);
  await page.locator('#crayonBrushButton').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.brush-menu')).toBeHidden();
  await expect(page.locator('#brushButton')).toBeFocused();

  await openStrokeMenu(page);
  await page.locator('button[aria-label="Size 1"], button[aria-label="Eraser size 1"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.stroke-width-menu')).toBeHidden();
  await expect(page.locator('#strokeWidthButton')).toBeFocused();
});

// Tapping the trigger again is the third path that closes a flyout, and the
// only one whose focus handling a real Chromium click hides: the click focuses
// the trigger before the handler runs, so focus has already left the menu.
// Where activation does not focus the button — Safari's behavior, and the whole
// reason scribbleTap activates on pointerup (ADR-0038) — the app has to hand
// focus back itself. Focus can then be lost again before the trailing trusted
// click, which is the ordering this synthetic sequence keeps.
async function tapTriggerLikeSafari(page: Page, triggerId: string) {
  const panel = page.locator('.actions-panel');
  await expect(panel).toHaveAttribute('data-action-panel-live', '');
  await expect(panel).not.toHaveAttribute('data-drawer-motion', '');
  await page.locator(triggerId).evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const init = {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      bubbles: true,
      clientX: rect.x + rect.width / 2,
      clientY: rect.y + rect.height / 2,
    };
    node.dispatchEvent(new PointerEvent('pointerdown', init));
    window.dispatchEvent(new PointerEvent('pointerup', init));
    (node as HTMLElement).blur();
    node.dispatchEvent(new MouseEvent('click', { ...init, detail: 1 }));
  });
}

test('a trigger tap that opens a flyout focuses it for Escape restoration', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);

  await tapTriggerLikeSafari(page, '#brushButton');
  await expect(page.locator('.brush-menu')).toBeVisible();
  await expect(page.locator('#brushButton')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.brush-menu')).toBeHidden();
  await expect(page.locator('#brushButton')).toBeFocused();

  await tapTriggerLikeSafari(page, '#strokeWidthButton');
  await expect(page.locator('.stroke-width-menu')).toBeVisible();
  await expect(page.locator('#strokeWidthButton')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.stroke-width-menu')).toBeHidden();
  await expect(page.locator('#strokeWidthButton')).toBeFocused();
});

test('a second tap on the trigger closes the flyout and restores focus to it', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);

  await openBrushMenu(page);
  await page.locator('#penBrushButton').focus();
  await tapTriggerLikeSafari(page, '#brushButton');
  await expect(page.locator('.brush-menu')).toBeHidden();
  await expect(page.locator('#brushButton')).toBeFocused();

  await openStrokeMenu(page);
  await page.locator('button[aria-label="Size 3"], button[aria-label="Eraser size 3"]').focus();
  await tapTriggerLikeSafari(page, '#strokeWidthButton');
  await expect(page.locator('.stroke-width-menu')).toBeHidden();
  await expect(page.locator('#strokeWidthButton')).toBeFocused();
});
