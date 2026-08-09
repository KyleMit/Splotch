import { expect, test, type Page } from '@playwright/test';

import { STORAGE_KEYS } from '../src/lib/storageKeys';
import {
  POLAROID_OBSERVATION_MS,
  SCREENSHOT_COOLDOWN_MS,
} from '../src/lib/drawing/screenshotTiming';

import { draw, firstOpaquePixel, gotoApp, retryOpen } from './helpers';

import { openBrushMenu, openDrawer, pickBrush } from './flows-harness';

// How long a second screenshot save gets to show up after the first has landed,
// for the burst test's negative half. It only has to outlast the coalescing
// window the button applies to a rapid tap burst, so it is an idle-past — the
// one job a fixed sleep is right for.
const SECOND_SAVE_WINDOW_MS = 500;

// Open the stroke-width flyout robustly. Its sentinel is present whenever the
// menu is open — the label is tool-aware (issue #286).
async function openStrokeMenu(page: Page) {
  await retryOpen(
    page.locator('button[aria-label="Size 3"], button[aria-label="Eraser size 3"]'),
    () => page.locator('#strokeWidthButton').click({ timeout: 1000 }),
    { settle: 1000 }
  );
}

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
  // of history still lands and answers with the shared unavailable cue. force:
  // Playwright's actionability check refuses to click aria-disabled elements,
  // but dispatching the real pointer events is exactly the toddler tap under
  // test. The class lives only for the animation's 400ms, so retry the tap if
  // the assertion misses the window.
  await expect(async () => {
    await undo.click({ force: true });
    await expect(undo).toHaveClass(/action-unavailable/, { timeout: 350 });
    const animation = await undo.evaluate((button) => {
      const style = getComputedStyle(button);
      return { names: style.animationName.split(', '), durations: style.animationDuration };
    });
    expect(animation.names).toEqual(['action-unavailable-shake', 'action-unavailable-flash']);
    expect(new Set(animation.durations.split(', ')).size).toBe(1);
  }).toPass({ timeout: 10_000 });
  // The shake is an affordance, not an action — the canvas stayed blank.
  expect(await firstOpaquePixel(page)).toBeNull();
});

// installUndoShortcut (lib/boot/undoShortcut.ts) is wired from +page.svelte's
// onMount, not from ActionsPanel — this proves the route-level listener is
// actually installed and working, not just handleUndoClick's click path.
test('Ctrl+Z undoes the last stroke from the keyboard', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);

  const undo = page.locator('#undoButton');
  await expect(undo).toBeDisabled();

  await draw(page, [
    { x: 120, y: 120 },
    { x: 260, y: 200 },
  ]);
  await expect(undo).toBeEnabled();
  expect(await firstOpaquePixel(page)).not.toBeNull();

  await page.keyboard.press('Control+Z');

  await expect(undo).toBeDisabled();
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
    await expect(undo).toHaveClass(/action-unavailable/, { timeout: 350 });
    expect(await undo.evaluate((button) => getComputedStyle(button).animationName)).toBe(
      'action-unavailable-flash'
    );
  }).toPass({ timeout: 10_000 });
  // Reduced motion swaps the shake for the non-positional flash rather than
  // removing the cue: an animation still runs, so its animationend clears the
  // class — proving a real cue played instead of the class sitting inert.
  await expect(undo).not.toHaveClass(/action-unavailable/, { timeout: 2000 });
});

test('Ctrl+Z still undoes while the button is hidden, and plays no cue', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);

  const panel = page.locator('.actions-panel');
  const undo = page.locator('#undoButton');
  await panel.evaluate((element) => element.setAttribute('data-off-undo', ''));
  await expect(undo).toBeHidden();

  // settings.undoButtonEnabled only hides the button (data-off-undo is a CSS-only
  // toggle) — it does not disable undo history, so the keyboard shortcut
  // deliberately bypasses it too (installUndoShortcut, lib/boot/undoShortcut.ts).
  await draw(page, [
    { x: 120, y: 120 },
    { x: 260, y: 200 },
  ]);
  expect(await firstOpaquePixel(page)).not.toBeNull();

  await page.keyboard.press('Control+Z');
  // The button is hidden, so the toBeEnabled/toBeDisabled sync point the
  // sibling tests use is unavailable here — undo() resolves asynchronously
  // through queuePaperStep, so poll the canvas instead of reading it once.
  await expect.poll(() => firstOpaquePixel(page)).toBeNull();

  await panel.evaluate((element) => element.removeAttribute('data-off-undo'));
  await expect(undo).toBeVisible();
  // The shake/flash cue is panel-local (targets #undoButton directly), so the
  // keyboard path — which has no element handle while the button is hidden —
  // never plays it, even once the button reappears.
  await expect(undo).not.toHaveClass(/action-unavailable/);
  await expect.poll(() => undo.evaluate((button) => button.getAnimations().length)).toBe(0);
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

test('a burst of screenshot taps shares one save before allowing the next', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);
  await draw(page, [
    { x: 140, y: 140 },
    { x: 240, y: 200 },
  ]);

  const shot = page.locator('#screenshotButton');
  const downloads: string[] = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));

  await shot.evaluate((button) => {
    const panel = button.closest('.actions-panel');
    if (!panel) throw new Error('Screenshot button has no actions panel');
    const observer = new MutationObserver(() => {
      if (!button.classList.contains('action-unavailable')) return;
      const style = getComputedStyle(button);
      button.dataset.observedUnavailableNames = style.animationName;
      button.dataset.observedUnavailableDurations = style.animationDuration;
      button.dataset.observedUnavailableRunningCount = String(
        button.getAnimations().filter((animation) => animation.playState === 'running').length
      );
      panel.setAttribute('data-off-screenshot', '');
      observer.disconnect();
    });
    observer.observe(button, { attributes: true, attributeFilter: ['class'] });

    const rect = button.getBoundingClientRect();
    const coordinates = {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
    for (let pointerId = 1; pointerId <= 3; pointerId++) {
      button.dispatchEvent(
        new PointerEvent('pointerdown', { ...coordinates, bubbles: true, pointerId })
      );
      button.dispatchEvent(
        new PointerEvent('pointerup', { ...coordinates, bubbles: true, pointerId })
      );
    }
  });

  // Two different waits, because this asserts two different things and one fixed
  // sleep cannot do both. Wait for the save that MUST happen (a starved worker
  // takes longer than any sleep sized on an idle one — this is what failed 3 of
  // 12 CI reps at 4 workers, issue #653)…
  await expect.poll(() => downloads.length).toBe(1);
  const animation = {
    names: (await shot.getAttribute('data-observed-unavailable-names'))?.split(', '),
    durations: await shot.getAttribute('data-observed-unavailable-durations'),
    runningCount: Number(await shot.getAttribute('data-observed-unavailable-running-count')),
  };
  expect(animation.names).toEqual(['action-unavailable-shake', 'action-unavailable-flash']);
  expect(new Set(animation.durations?.split(', ')).size).toBe(1);
  expect(animation.runningCount).toBeGreaterThanOrEqual(2);

  const panel = page.locator('.actions-panel');
  await expect(shot).toBeHidden();
  await panel.evaluate((element) => element.removeAttribute('data-off-screenshot'));
  await expect(shot).toBeVisible();
  await expect(shot).not.toHaveClass(/action-unavailable/);
  await expect
    .poll(() =>
      shot.evaluate(
        (button) =>
          button
            .getAnimations()
            .filter(
              (candidate) =>
                'animationName' in candidate &&
                typeof candidate.animationName === 'string' &&
                candidate.animationName.startsWith('action-unavailable-')
            ).length
      )
    )
    .toBe(0);

  // …then idle past the window a second save would have arrived in, which is
  // what proves the burst was coalesced rather than merely slow.
  await page.waitForTimeout(SECOND_SAVE_WINDOW_MS);
  expect(downloads).toHaveLength(1);

  await page.waitForTimeout(SCREENSHOT_COOLDOWN_MS);
  const nextDownload = page.waitForEvent('download');
  await shot.click();
  await nextDownload;
  await expect.poll(() => downloads.length).toBe(2);
});

test.describe('tiled screenshot export', () => {
  test.use({ deviceScaleFactor: 2 });

  test('downloads a PNG through the matched-scale worker path', async ({ page }) => {
    await gotoApp(page);
    await openDrawer(page);
    await draw(page, [
      { x: 140, y: 140 },
      { x: 240, y: 200 },
    ]);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#screenshotButton').click();
    const polaroid = page.locator('.polaroid-frame');
    await expect(polaroid).toBeVisible();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^splotch-.+\.png$/);
    expect(await download.failure()).toBeNull();
    await expect(polaroid).toHaveCount(0, { timeout: POLAROID_OBSERVATION_MS });
  });

  test('suppresses the polaroid flash for reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoApp(page);
    await openDrawer(page);
    await draw(page, [
      { x: 140, y: 140 },
      { x: 240, y: 200 },
    ]);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#screenshotButton').click();
    const flash = page.locator('.polaroid-flash');
    await expect(flash).toHaveCount(1);
    await expect(flash).toHaveCSS('animation-name', 'none');
    await expect(flash).toHaveCSS('opacity', '0');
    await downloadPromise;
  });
});

test.describe('compatibility screenshot export', () => {
  test.use({ deviceScaleFactor: 1 });

  test('shows the polaroid on the 1x path', async ({ page }) => {
    await gotoApp(page);
    await openDrawer(page);
    await draw(page, [
      { x: 140, y: 140 },
      { x: 240, y: 200 },
    ]);

    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(1);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#screenshotButton').click();
    await expect(page.locator('.polaroid-frame')).toBeVisible();
    await downloadPromise;
  });
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
  await page.addInitScript(
    ({ drawerOpen, eraserEnabled }) => {
      localStorage.setItem(drawerOpen, 'true');
      localStorage.setItem(eraserEnabled, 'false');
    },
    {
      drawerOpen: STORAGE_KEYS.drawerOpen,
      eraserEnabled: STORAGE_KEYS.eraserEnabled,
    }
  );
  await gotoApp(page);

  // The <html> stamp the CSS keys off is present before hydration.
  await expect(page.locator('html')).toHaveAttribute('data-drawer-open', '');
  await expect(page.locator('.actions-panel')).toHaveAttribute('data-action-panel-live', '');
  await expect(page.locator('.actions-panel')).toHaveAttribute('data-drawer-open', '');
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

test('a corrupt default-on setting stays enabled before and after hydration', async ({ page }) => {
  await page.addInitScript(
    ({ eraserEnabled }) => {
      localStorage.setItem(eraserEnabled, 'garbage');
      const toggleAttribute = HTMLElement.prototype.toggleAttribute;
      HTMLElement.prototype.toggleAttribute = function (name, force) {
        if (this === document.documentElement && name === 'data-off-eraser') {
          (window as Window & { preHydrationEraserOff?: boolean }).preHydrationEraserOff ??= force;
        }
        return toggleAttribute.call(this, name, force);
      };
    },
    { eraserEnabled: STORAGE_KEYS.eraserEnabled }
  );
  await page.goto('/');

  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { preHydrationEraserOff?: boolean }).preHydrationEraserOff
      )
    )
    .toBe(false);

  await expect(page.locator('#drawingCanvas')).toBeVisible();
  await openDrawer(page);
  await openBrushMenu(page);
  await expect(page.locator('#eraserButton')).toBeVisible();
});

// The brush choice is a persisted user setting (default pen; the eraser is
// deliberately excluded). The head script in app.html stamps [data-brush] on
// <html> before paint so the Brush Button wears the right face with no flash.
test('the picked brush persists across a reload and stamps the brush face pre-paint', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);

  const panel = page.locator('.actions-panel');

  // Default is the pen: no data-brush attribute, pen entry selected.
  await expect(page.locator('html')).not.toHaveAttribute('data-brush');
  await expect(panel).not.toHaveAttribute('data-brush');
  await openBrushMenu(page);
  await expect(page.locator('#penBrushButton')).toHaveAttribute('aria-pressed', 'true');

  await pickBrush(page, '#crayonBrushButton');
  await expect(panel).toHaveAttribute('data-brush', 'crayon');
  await expect(page.locator('html')).not.toHaveAttribute('data-brush');

  await page.reload();
  await expect(page.locator('#drawingCanvas')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-brush', 'crayon');
  await expect(panel).toHaveAttribute('data-brush', 'crayon');
  await openBrushMenu(page);
  await expect(page.locator('#crayonBrushButton')).toHaveAttribute('aria-pressed', 'true');
});

// On a phone-width portrait screen the stroke-width flyout used to open as a
// horizontal row that ran under the bottom-right Settings Button. Tapping
// the rightmost size closed the menu on pointerup, and the trailing click then
// fell through to the now-unobscured Settings Button and launched its
// modal. The flyout must clear that button so a size tap can't open it. 460px
// sits in the range where the row would still reach the Settings Button, so it
// pins the column breakpoint high enough for the current button sizes.
test('the stroke flyout clears the Settings Button on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 460, height: 852 });
  await gotoApp(page);
  await openDrawer(page);
  await openStrokeMenu(page);

  const settingsDialog = page.locator('#settingsModal');
  await expect(settingsDialog).toBeHidden();

  const parent = (await page.locator('#settingsButton').boundingBox())!;
  const size5 = (await page.locator('button[aria-label="Size 5"]').boundingBox())!;
  const overlaps =
    size5.x < parent.x + parent.width &&
    size5.x + size5.width > parent.x &&
    size5.y < parent.y + parent.height &&
    size5.y + size5.height > parent.y;
  expect(overlaps, 'stroke flyout overlaps the Settings Button').toBe(false);

  // Tapping the rightmost size selects it and leaves Settings closed.
  await page.locator('button[aria-label="Size 5"]').click();
  await expect(page.locator('button[aria-label="Size 5"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(settingsDialog).toBeHidden();
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
