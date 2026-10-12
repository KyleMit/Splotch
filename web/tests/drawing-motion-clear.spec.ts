import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { drawCommittedStroke, gotoApp } from './helpers';

test.use({ viewport: { width: 1000, height: 650 }, deviceScaleFactor: 2 });

test('drag-clear sheet stays visible above the paper wash', async ({ page }) => {
  await gotoApp(page);
  await drawCommittedStroke(page, [
    { x: 300, y: 300 },
    { x: 500, y: 300 },
  ]);
  const button = page.locator('#clearButton');
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(650, 300, { steps: 20 });
  await expect(page.locator('.clear-preview')).toHaveClass(/committed/);
  await button.evaluate((element) => {
    element.addEventListener(
      'pointerup',
      () => {
        for (const animation of document.getAnimations()) {
          animation.pause();
          animation.currentTime = 30;
        }
      },
      { once: true }
    );
  });
  await page.mouse.up();
  const snapshot = page.locator('.clear-sheet-motion');
  const sample = await snapshot.evaluate((canvas: HTMLCanvasElement) => {
    const x = Math.round(canvas.width * 0.4);
    const y = Math.round((canvas.height * 300) / 650);
    const rgba = Array.from(canvas.getContext('2d')!.getImageData(x, y, 1, 1).data);
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.floor(rect.left + ((x + 0.5) * rect.width) / canvas.width),
      y: Math.floor(rect.top + ((y + 0.5) * rect.height) / canvas.height),
      rgba,
      opacity: Number(getComputedStyle(canvas).opacity),
    };
  });
  expect(sample.rgba[3]).toBe(255);
  const shown = await sharp(await page.screenshot({ scale: 'css' }))
    .extract({ left: sample.x, top: sample.y, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();
  await snapshot.evaluate((canvas: HTMLCanvasElement) => {
    canvas.style.visibility = 'hidden';
  });
  const background = await sharp(await page.screenshot({ scale: 'css' }))
    .extract({ left: sample.x, top: sample.y, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();
  const errors = [0, 1, 2].map((channel) =>
    Math.abs(
      shown[channel] -
        (sample.rgba[channel] * sample.opacity + background[channel] * (1 - sample.opacity))
    )
  );
  expect(Math.max(...errors)).toBeLessThan(15);
});

// The page scales about a point pulled from the Clear Button's docked centre
// toward its top-right corner, so that point lies on the segment between the
// two. A drag that outlives an orientation change must aim at the new dock.
test('a clear committed across an orientation change flies into the new dock', async ({ page }) => {
  await gotoApp(page);
  await drawCommittedStroke(page, [
    { x: 300, y: 300 },
    { x: 500, y: 300 },
  ]);
  const button = page.locator('#clearButton');
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.setViewportSize({ width: 650, height: 1000 });
  await page.mouse.move(300, 700, { steps: 10 });
  await page.mouse.up();

  const sheet = page.locator('.clear-sheet-motion');
  await expect(sheet).toBeVisible();
  await sheet.evaluate((canvas) => {
    for (const animation of canvas.getAnimations()) animation.pause();
  });
  await page
    .locator('#clearContainer')
    .evaluate((container) =>
      Promise.all(container.getAnimations().map((animation) => animation.finished))
    );
  const geometry = await sheet.evaluate((canvas) => {
    const [originX, originY] = getComputedStyle(canvas)
      .transformOrigin.split(' ')
      .map(Number.parseFloat);
    const layer = canvas.parentElement!.getBoundingClientRect();
    const dock = document.querySelector('#clearButton')!.getBoundingClientRect();
    return {
      origin: { x: originX, y: originY },
      home: {
        x: dock.left + dock.width / 2 - layer.left,
        y: dock.top + dock.height / 2 - layer.top,
      },
      corner: { x: layer.width, y: 0 },
    };
  });
  const { origin, home, corner } = geometry;
  const along = { x: corner.x - home.x, y: corner.y - home.y };
  const offset = { x: origin.x - home.x, y: origin.y - home.y };
  const length = Math.hypot(along.x, along.y);
  expect(Math.abs(along.x * offset.y - along.y * offset.x) / length).toBeLessThan(2);
  const progress = (along.x * offset.x + along.y * offset.y) / (length * length);
  expect(progress).toBeGreaterThan(0);
  expect(progress).toBeLessThan(1);
});
