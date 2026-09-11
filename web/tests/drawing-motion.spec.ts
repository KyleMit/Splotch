import { test, expect } from '@playwright/test';
import { gotoApp, drawCommittedStroke } from './helpers';
import { openDrawer, opaqueCanvasPixelCount, pickBrush } from './flows-harness';

for (const viewport of [
  { width: 1000, height: 650 },
  { width: 460, height: 852 },
]) {
  test(`flyout origin follows the trigger at ${viewport.width} by ${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await gotoApp(page);
    await openDrawer(page);
    await page
      .locator('.actions-panel')
      .evaluate((panel: HTMLElement) => panel.style.setProperty('--action-btn-size', '80px'));
    await page.locator('#brushButton').click();
    const origin = await page
      .locator('.flyout-menu')
      .evaluate((menu) => parseFloat(getComputedStyle(menu).transformOrigin));
    const trigger = (await page.locator('#brushButton').boundingBox())!;
    expect(origin).toBe(viewport.width > viewport.height ? trigger.width / 2 : 0);
  });
}

test('flyouts replay staggered arrivals and unmount immediately on close', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);
  for (const trigger of ['#brushButton', '#strokeWidthButton']) {
    await page.locator(trigger).click();
    const menu = page.locator('.flyout-menu');
    await expect(menu).toBeVisible();
    await expect(menu).toHaveCSS('animation-name', 'flyout-shell');
    await expect(menu.locator('button').nth(1)).toHaveCSS('animation-delay', '0.065s');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await page.locator(trigger).click();
    await expect(menu).toHaveCSS('animation-name', 'flyout-shell');
    await page.keyboard.press('Escape');
  }
});

test('reduced motion skips all five effects', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoApp(page);
  await openDrawer(page);
  await expect(page.locator('.actions-drawer')).not.toHaveClass(/opening/);
  await page.locator('#brushButton').click();
  await expect(page.locator('.flyout-menu')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('#penBrushButton')).toHaveCSS('animation-name', 'none');
  await page.locator('#crayonBrushButton').click();
  await expect(page.locator('.brush-button-faces')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('#undoButton')).toHaveCSS('animation-name', 'none');
  await drawCommittedStroke(page, [
    { x: 250, y: 200 },
    { x: 440, y: 240 },
  ]);
  await page.locator('#undoButton').click();
  await expect(page.locator('#undoButton .action-icon')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.ink-motion')).toHaveCount(0);
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBe(0);
  await drawCommittedStroke(page, [
    { x: 300, y: 300 },
    { x: 450, y: 330 },
  ]);
  await page.locator('#clearButton').evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator('.ink-motion')).toHaveCount(0);
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBe(0);
});

test('brush face rolls only for a changed explicit menu pick', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);
  const face = page.locator('.brush-button-faces');
  await expect(face).toHaveCSS('animation-name', 'none');
  await page.locator('#brushButton').click();
  await page.locator('#crayonBrushButton').click();
  await expect(face).toHaveCSS('animation-name', /face-roll/);
  const original = await face.elementHandle();
  await page.locator('#brushButton').click();
  await page.locator('#crayonBrushButton').click();
  expect(await original!.evaluate((element) => element.isConnected)).toBe(true);
});

test('undo retires ink immediately beneath a shrinking overlay and drawing cancels it', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  await drawCommittedStroke(page, [
    { x: 250, y: 200 },
    { x: 440, y: 240 },
  ]);
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBeGreaterThan(0);
  await page.locator('#undoButton').evaluate((button: HTMLButtonElement) => {
    button.click();
    for (const animation of document
      .querySelector('.ink-motion')
      ?.getAnimations({ subtree: true }) ?? [])
      animation.pause();
  });
  const overlay = page.locator('.undo-ink-motion');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveCSS('animation-name', 'undo-ink');
  await expect(page.locator('#undoButton .action-icon')).toHaveCSS('animation-name', 'undo-spin');
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBe(0);
  expect(
    await overlay.evaluate((canvas: HTMLCanvasElement) =>
      canvas
        .getContext('2d')!
        .getImageData(0, 0, canvas.width, canvas.height)
        .data.some((value, index) => index % 4 === 3 && value > 0)
    )
  ).toBe(true);
  await drawCommittedStroke(page, [
    { x: 300, y: 300 },
    { x: 450, y: 330 },
  ]);
  await expect(overlay).toHaveCount(0);
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBeGreaterThan(0);
});

test('crayon undo ghost reads the tiles and is masked to the footprint', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);
  await pickBrush(page, '#crayonBrushButton');
  await drawCommittedStroke(page, [
    { x: 250, y: 200 },
    { x: 440, y: 240 },
  ]);
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBeGreaterThan(0);
  await page.locator('#undoButton').evaluate((button: HTMLButtonElement) => {
    button.click();
    for (const animation of document
      .querySelector('.ink-motion')
      ?.getAnimations({ subtree: true }) ?? [])
      animation.pause();
  });
  const overlay = page.locator('.undo-ink-motion');
  await expect(overlay).toBeVisible();
  const { inked, transparent } = await overlay.evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let inked = 0;
    for (let index = 3; index < data.length; index += 4) if (data[index] > 0) inked++;
    return { inked, transparent: data.length / 4 - inked };
  });
  expect(inked).toBeGreaterThan(0);
  expect(transparent).toBeGreaterThan(0);
});

test('clear snapshots ink while clearing history and still permits undo', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);
  await drawCommittedStroke(page, [
    { x: 250, y: 200 },
    { x: 440, y: 240 },
  ]);
  const inkBefore = await opaqueCanvasPixelCount(page);
  await page.locator('#clearButton').evaluate((button: HTMLButtonElement) => {
    button.click();
    for (const animation of document
      .querySelector('.ink-motion')
      ?.getAnimations({ subtree: true }) ?? [])
      animation.pause();
  });
  const snapshot = page.locator('.clear-ink-motion');
  await expect(snapshot).toBeVisible();
  await expect(snapshot).toHaveCSS('animation-name', 'clear-ink');
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBe(0);
  expect(
    await snapshot.evaluate((canvas: HTMLCanvasElement) =>
      canvas
        .getContext('2d')!
        .getImageData(0, 0, canvas.width, canvas.height)
        .data.some((value, index) => index % 4 === 3 && value > 0)
    )
  ).toBe(true);
  await page.locator('#undoButton').click();
  await expect(snapshot).toHaveCount(0);
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBe(inkBefore);
});

test('drawer buttons cascade only on open and retain disabled styling', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);
  const drawer = page.locator('.actions-drawer');
  await expect(drawer).not.toHaveClass(/opening/);
  await expect(page.locator('#undoButton')).toHaveCSS('opacity', '0.3');
  await page.getByRole('button', { name: 'Collapse controls' }).click();
  await expect(page.locator('#undoButton')).toBeHidden();
  await expect(page.locator('#undoButton')).toHaveCSS('animation-name', 'none');
  const cascades = await page
    .getByRole('button', { name: 'Expand controls' })
    .evaluate(async (button: HTMLButtonElement) => {
      button.click();
      await Promise.resolve();
      return document
        .querySelector('.actions-drawer')!
        .getAnimations({ subtree: true })
        .some(
          (animation) =>
            animation instanceof CSSAnimation && animation.animationName === 'btn-cascade'
        );
    });
  expect(cascades).toBe(true);
  await expect(drawer).not.toHaveClass(/opening/);
});

test('enabling reduced motion retires an open drawer cascade without replaying it', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  await page.getByRole('button', { name: 'Collapse controls' }).click();
  await page
    .getByRole('button', { name: 'Expand controls' })
    .evaluate(async (button: HTMLButtonElement) => {
      button.click();
      await Promise.resolve();
      document
        .querySelector('.actions-drawer')!
        .getAnimations({ subtree: true })
        .forEach((animation) => animation.pause());
    });
  await expect(page.locator('.actions-drawer')).toHaveClass(/opening/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.actions-drawer')).not.toHaveClass(/opening/);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('#undoButton')).toHaveCSS('animation-name', 'none');
});

test('an automatic eraser reset cancels the face roll and does not replay it', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);
  await page.locator('#brushButton').click();
  await page.locator('#eraserButton').click();
  const face = page.locator('.brush-button-faces');
  await face.evaluate((element) =>
    element.getAnimations().forEach((animation) => animation.pause())
  );
  await page.locator('.color-swatch').first().click();
  await expect(page.locator('#drawingCanvas')).not.toHaveClass(/erasing/);
  await expect(face).toHaveCSS('animation-name', 'none');
});

test('live strokes suppress new flyout, face, and undo motion', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);
  await drawCommittedStroke(page, [
    { x: 250, y: 200 },
    { x: 440, y: 240 },
  ]);
  await page.mouse.move(300, 300);
  await page.mouse.down();
  await page.locator('#brushButton').evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator('.brush-menu')).toHaveCSS('animation-name', 'none');
  await page.locator('#crayonBrushButton').evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator('.brush-button-faces')).toHaveCSS('animation-name', 'none');
  await page.locator('#undoButton').evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator('.ink-motion')).toHaveCount(0);
  await expect(page.locator('#undoButton .action-icon')).toHaveCSS('animation-name', 'none');
  await page.mouse.up();
});
