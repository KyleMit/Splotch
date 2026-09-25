import { readFile } from 'node:fs/promises';

import { expect, test, type Download } from '@playwright/test';

import {
  POLAROID_OBSERVATION_MS,
  SCREENSHOT_COOLDOWN_MS,
} from '../src/lib/drawing/screenshotTiming';

import { draw, gotoApp } from './helpers';

import { openDrawer } from './flows-harness';

// How long a second screenshot save gets to show up after the first has landed,
// for the burst test's negative half. It only has to outlast the coalescing
// window the button applies to a rapid tap burst, so it is an idle-past — the
// one job a fixed sleep is right for.
const SECOND_SAVE_WINDOW_MS = 500;

async function downloadedPngWidth(download: Download) {
  const path = await download.path();
  if (!path) throw new Error('Downloaded screenshot has no local path');
  return (await readFile(path)).readUInt32BE(16);
}

// ── screenshot export ───────────────────────────────────────────────────────

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
  const [shake, flash] = (animation.durations ?? '').split(', ').map(Number.parseFloat);
  expect(flash).toBeGreaterThan(shake);
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
    const canvasBox = await page.locator('#drawingCanvas').boundingBox();
    expect(canvasBox).not.toBeNull();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#screenshotButton').click();
    const polaroid = page.locator('.polaroid-frame');
    await expect(polaroid).toBeVisible();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^splotch-.+\.png$/);
    expect(await download.failure()).toBeNull();
    expect(await downloadedPngWidth(download)).toBe(Math.round(canvasBox!.width * 2));
    await expect(polaroid).toHaveCount(0, { timeout: POLAROID_OBSERVATION_MS });
  });
});
