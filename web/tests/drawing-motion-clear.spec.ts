import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { drawCommittedStroke, gotoApp } from './helpers';

test.use({ viewport: { width: 1000, height: 650 }, deviceScaleFactor: 2 });

test('drag-clear ink stays visible above the paper wash and ripple', async ({ page }) => {
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
  const snapshot = page.locator('.clear-ink-motion');
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
