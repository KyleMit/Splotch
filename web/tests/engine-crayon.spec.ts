import type { Page } from '@playwright/test';

import { count, expect, test } from './engine-harness';
import { TEST_PALETTE } from './helpers';

async function crayonBuildup(page: Page) {
  return page.evaluate(() => {
    const engine = window.__engine;
    const canvas = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    const width = canvas.clientWidth;
    const y = Math.round(canvas.clientHeight / 2);
    const line = (x0: number, x1: number) =>
      Array.from({ length: 41 }, (_, index) => ({
        x: x0 + ((x1 - x0) * index) / 40,
        y,
      }));
    const region = (x0: number, x1: number) => {
      const data = engine.pixelsIn(Math.round(x0), y - 15, Math.round(x1 - x0), 30);
      let opaque = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] <= 128) continue;
        opaque++;
        red += data[index];
        green += data[index + 1];
        blue += data[index + 2];
      }
      return {
        coverage: opaque / (data.length / 4),
        rgb: opaque
          ? [Math.round(red / opaque), Math.round(green / opaque), Math.round(blue / opaque)]
          : null,
      };
    };

    engine.clearCanvas();
    engine.setCrayonMode(true);
    engine.setColor('#e23b36');
    engine.setStrokeWidth(30);
    engine.strokeSync(line(width * 0.2, width * 0.8), 'pen');
    const leftOnce = region(width * 0.25, width * 0.45);
    const rightOnce = region(width * 0.55, width * 0.75);
    engine.strokeSync(line(width * 0.2, width * 0.5), 'pen');
    return {
      leftOnce,
      rightOnce,
      leftTwice: region(width * 0.25, width * 0.45),
      rightTwice: region(width * 0.55, width * 0.75),
    };
  });
}

test('crayon strokes keep paper tooth and build up without muddying', async ({ page }) => {
  const result = await crayonBuildup(page);

  expect(result.leftOnce.coverage).toBeGreaterThan(0.3);
  expect(result.leftOnce.coverage).toBeLessThan(0.85);
  expect(result.leftTwice.coverage).toBeGreaterThan(result.leftOnce.coverage + 0.03);
  expect(Math.abs(result.rightTwice.coverage - result.rightOnce.coverage)).toBeLessThan(0.02);
  for (let channel = 0; channel < 3; channel++) {
    expect(
      Math.abs(
        (result.leftTwice.rgb as number[])[channel] - (result.leftOnce.rgb as number[])[channel]
      )
    ).toBeLessThan(10);
  }
});

test('crossing crayon colours mix subtractively', async ({ page }) => {
  const result = await page.evaluate((blue) => {
    const engine = window.__engine;
    const canvas = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    const centerX = Math.round(canvas.clientWidth / 2);
    const centerY = Math.round(canvas.clientHeight / 2);
    const segment = (x0: number, y0: number, x1: number, y1: number) =>
      Array.from({ length: 41 }, (_, index) => ({
        x: x0 + ((x1 - x0) * index) / 40,
        y: y0 + ((y1 - y0) * index) / 40,
      }));

    engine.clearCanvas();
    engine.setCrayonMode(true);
    engine.setStrokeWidth(36);
    engine.setColor('#f7d64b');
    engine.strokeSync(segment(centerX - 120, centerY, centerX + 120, centerY), 'pen');
    engine.setColor(blue);
    engine.strokeSync(segment(centerX, centerY - 120, centerX, centerY + 120), 'pen');

    const data = engine.pixelsIn(centerX - 12, centerY - 12, 24, 24);
    let wax = 0;
    let mixed = 0;
    let greenLeaning = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] < 200 || data[index] >= 150) continue;
      wax++;
      if (data[index + 2] >= 128 && data[index + 2] <= 168) mixed++;
      if (data[index + 1] > data[index + 2]) greenLeaning++;
    }
    return { wax, mixed, greenLeaning };
  }, TEST_PALETTE.blue);

  expect(result.wax).toBeGreaterThan(100);
  expect(result.mixed).toBeGreaterThan(result.wax * 0.3);
  expect(result.greenLeaning).toBeGreaterThan(result.wax * 0.25);
});

test('one back-and-forth gesture builds up like separate crayon strokes', async ({ page }) => {
  const result = await page.evaluate(() => {
    const engine = window.__engine;
    const canvas = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    const width = canvas.clientWidth;
    const y = Math.round(canvas.clientHeight / 2);
    const points = (x0: number, x1: number) =>
      Array.from({ length: 41 }, (_, index) => ({
        x: x0 + ((x1 - x0) * index) / 40,
        y,
      }));
    const coverage = () => {
      const data = engine.pixelsIn(Math.round(width * 0.2), y - 12, Math.round(width * 0.6), 24);
      let opaque = 0;
      for (let index = 3; index < data.length; index += 4) {
        if (data[index] > 128) opaque++;
      }
      return opaque / (data.length / 4);
    };

    engine.clearCanvas();
    engine.setCrayonMode(true);
    engine.setColor('#2c5faa');
    engine.setStrokeWidth(30);
    const forward = points(width * 0.1, width * 0.9);
    const backward = points(width * 0.9, width * 0.1);
    engine.strokeSync(forward, 'pen');
    const single = coverage();
    engine.clearCanvas();
    engine.strokeSync([...forward, ...backward.slice(1), ...forward.slice(1)], 'pen');
    return { single, scribble: coverage() };
  });

  expect(result.scribble).toBeGreaterThan(result.single + 0.08);
  expect(result.scribble).toBeLessThan(0.995);
});

test('a crayon stroke survives remount exactly and undoes cleanly', async ({ page }) => {
  await page.evaluate(() => {
    const engine = window.__engine;
    const canvas = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    const width = canvas.clientWidth;
    const y = Math.round(canvas.clientHeight / 2);
    const points = Array.from({ length: 41 }, (_, index) => ({
      x: 20 + ((width - 40) * index) / 40,
      y,
    }));
    engine.clearCanvas();
    engine.setCrayonMode(true);
    engine.setColor('#2c5faa');
    engine.setStrokeWidth(24);
    engine.strokeSync(points, 'pen');
  });
  const before = await count(page);
  expect(before).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.remount());
  expect(await count(page)).toBe(before);

  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
});

test('an eraser interleaved mid-gesture cannot resurrect erased wax', async ({ page }) => {
  const result = await page.evaluate(() => {
    const engine = window.__engine;
    const canvas = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const width = canvas.clientWidth;
    const y = Math.round(canvas.clientHeight / 2);
    const centerX = Math.round(width / 2);
    const fire = (type: string, pointerId: number, x: number, eventY: number) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId,
          pointerType: 'pen',
          isPrimary: pointerId === 1,
          clientX: rect.left + x,
          clientY: rect.top + eventY,
          bubbles: true,
          cancelable: true,
        })
      );
    const inkedAt = (x: number) => {
      const data = engine.pixelsIn(x - 8, y - 8, 16, 16);
      let opaque = 0;
      for (let index = 3; index < data.length; index += 4) if (data[index] > 0) opaque++;
      return opaque;
    };

    engine.clearCanvas();
    engine.setCrayonMode(true);
    engine.setColor('#2c5faa');
    engine.setStrokeWidth(24);

    fire('pointerdown', 1, 40, y);
    for (let index = 1; index <= 40; index++) {
      fire('pointermove', 1, 40 + ((width - 80) * index) / 40, y);
    }

    engine.setEraserMode(true);
    fire('pointerdown', 2, centerX, y - 50);
    for (let index = 1; index <= 20; index++) {
      fire('pointermove', 2, centerX, y - 50 + (100 * index) / 20);
    }
    fire('pointerup', 2, centerX, y + 50);
    engine.setEraserMode(false);
    const afterErase = { erased: inkedAt(centerX), control: inkedAt(centerX - 120) };

    for (let index = 1; index <= 5; index++) fire('pointermove', 1, width - 40, y + index * 3);
    fire('pointerup', 1, width - 40, y + 15);
    return {
      afterErase,
      afterCommit: { erased: inkedAt(centerX), control: inkedAt(centerX - 120) },
    };
  });

  expect(result.afterErase.control).toBeGreaterThan(0);
  expect(result.afterErase.erased).toBe(0);
  expect(result.afterCommit.erased).toBe(0);
  expect(result.afterCommit.control).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
});
