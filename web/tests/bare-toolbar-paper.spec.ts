import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { drawCommittedStroke, gotoApp, openHubSection, openSettingsModal } from './helpers';
import { applyFarmPage, openDrawer } from './flows-harness';
import { STORAGE_KEYS } from '../src/lib/storageKeys';
import { RESIZE_SETTLE_MS } from '../src/lib/drawing/engineListeners';

async function screenPixel(page: Page, x: number, y: number) {
  const image = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  return Array.from(await sharp(image).removeAlpha().raw().toBuffer());
}

for (const layout of [
  { width: 1180, height: 820 },
  { width: 390, height: 844 },
]) {
  for (const initial of ['buttons', 'bare']) {
    test(`switching from ${initial} at ${layout.width}px preserves ink and coloring art on screen`, async ({
      page,
    }) => {
      await page.setViewportSize(layout);
      await page.addInitScript(({ key, initial }) => localStorage.setItem(key, initial), {
        key: STORAGE_KEYS.toolbarStyle,
        initial,
      });
      await gotoApp(page);
      await openDrawer(page);
      await applyFarmPage(page);
      await drawCommittedStroke(page, [
        { x: 170, y: 250 },
        { x: 190, y: 250 },
        { x: 210, y: 250 },
        { x: 230, y: 250 },
      ]);
      await page.mouse.move(layout.width - 30, 120);
      const canvas = (await page.locator('#drawingCanvas').boundingBox())!;
      const x = canvas.x + 200;
      const y = canvas.y + 250;
      const ink = await screenPixel(page, x, y);
      expect(Math.max(...ink) - Math.min(...ink)).toBeGreaterThan(40);
      const paper = await page.locator('.paper-sheet').boundingBox();
      const overlay = page.locator('#coloringOverlay');
      const art = await overlay.boundingBox();
      const source = await overlay.getAttribute('src');
      await page.clock.install();
      for (const target of [
        initial === 'bare' ? 'Buttons' : 'Bare',
        initial === 'bare' ? 'Bare' : 'Buttons',
      ]) {
        await openSettingsModal(page);
        if (layout.width < 600) await openHubSection(page, 'appearance', '[aria-label="Toolbar"]');
        await page
          .getByRole('radiogroup', { name: 'Toolbar', exact: true })
          .getByRole('radio', { name: target, exact: true })
          .click();
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        await expect(page.locator('#settingsModal')).toBeHidden();
        await page.evaluate(() => window.dispatchEvent(new Event('resize')));
        await page.clock.runFor(RESIZE_SETTLE_MS + 1);
        await page.setViewportSize({ width: layout.width + 1, height: layout.height });
        await page.clock.runFor(RESIZE_SETTLE_MS + 1);
        await page.mouse.move(layout.width - 30, 120);
        await expect.poll(() => page.locator('.paper-sheet').boundingBox()).toEqual(paper);
        await expect.poll(() => overlay.boundingBox()).toEqual(art);
        await expect(overlay).toHaveAttribute('src', source!);
        await expect.poll(() => screenPixel(page, x, y)).toEqual(ink);
        await expect(page.locator('#undoButton')).toHaveAttribute('aria-disabled', 'false');
        const clear = (await page.locator('#clearButton').boundingBox())!;
        await page.mouse.move(clear.x + clear.width / 2, clear.y + clear.height / 2);
        await page.mouse.down();
        await page.mouse.move(layout.width / 2, layout.height / 2, { steps: 12 });
        await page.mouse.up();
        await expect.poll(() => screenPixel(page, x, y)).not.toEqual(ink);
        await page.locator('#undoButton').click();
        await page.setViewportSize(layout);
        await page.clock.runFor(RESIZE_SETTLE_MS + 1);
        await expect.poll(() => page.locator('.paper-sheet').boundingBox()).toEqual(paper);
        await expect.poll(() => overlay.boundingBox()).toEqual(art);
        await expect.poll(() => screenPixel(page, x, y)).toEqual(ink);
      }
    });
  }
}

for (const layout of [
  { width: 390, height: 844 },
  { width: 1180, height: 820 },
]) {
  test(`bare rail glass at ${layout.width}px covers the clear accept zone like the buttons palette`, async ({
    page,
  }) => {
    await page.setViewportSize(layout);
    await page.addInitScript(({ key }) => localStorage.setItem(key, 'bare'), {
      key: STORAGE_KEYS.toolbarStyle,
    });
    await gotoApp(page);
    const layers = await page.evaluate(() => {
      const glass = document.querySelector('.rail-glass')!;
      const ring = document.getElementById('clearAcceptZone')!;
      return {
        siblings: glass.parentElement === ring.parentElement,
        glass: Number(getComputedStyle(glass).zIndex),
        ring: Number(getComputedStyle(ring).zIndex),
      };
    });
    expect(layers.siblings).toBe(true);
    expect(layers.glass).toBeGreaterThan(layers.ring);
  });
}
