import type { CDPSession, Locator, Page } from '@playwright/test';
import sharp from 'sharp';
import { expect, test } from '../fixtures.ts';
import type { DrawingScreen } from '../support/drawing.ts';

// Several fingers paint at once: the paper keys its contacts by pointer, so each finger lays its
// own line, one Undo takes the whole gesture back, and a spread never zooms the page. Chromium's
// touch input dispatches the five contacts in one event, which no mouse can.

test.use({ hasTouch: true });

// Lines sit this far apart as a share of the paper's height, so no two strokes overlap.
const LINE_SPACING = 0.12;
const FIRST_LINE = 0.2;
// Each finger's x positions, as shares of the paper's width, from touch down to the last move.
const PARALLEL_PATH = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
// The last two fingers start together at the middle and travel apart: the classic zoom-in pinch.
const SPREAD_LEFT_PATH = [0.5, 0.42, 0.34, 0.26, 0.2];
const SPREAD_RIGHT_PATH = [0.5, 0.58, 0.66, 0.74, 0.8];
const PARALLEL_FINGERS = [
  PARALLEL_PATH,
  PARALLEL_PATH,
  PARALLEL_PATH,
  PARALLEL_PATH,
  PARALLEL_PATH,
];
const SPREAD_FINGERS = [
  PARALLEL_PATH,
  PARALLEL_PATH,
  PARALLEL_PATH,
  SPREAD_LEFT_PATH,
  SPREAD_RIGHT_PATH,
];
// How far either side of a line, and of the midpoint between two, a sampled band reaches.
const LINE_BAND_PX = 16;
const GAP_BAND_PX = 8;
// A channel must move this far from the blank paper to count as ink, the way drawing.ts reads it.
const INK_CHANNEL_DELTA = 48;
const MIN_LINE_INK_PX = 100;
const RGBA_CHANNELS = 4;

type PaperBox = { x: number; y: number; width: number; height: number };
type Pixels = Awaited<ReturnType<typeof paperPixels>>;
type FingerPaths = readonly (readonly number[])[];

async function paperBox(paper: Locator): Promise<PaperBox> {
  const box = await paper.boundingBox();
  if (!box) throw new Error('The drawing paper is not laid out');
  return box;
}

function lineY(box: PaperBox, finger: number) {
  return box.height * (FIRST_LINE + LINE_SPACING * finger);
}

// One touchStart with every finger down, a touchMove per step, then every finger up together.
async function touchDrag(cdp: CDPSession, box: PaperBox, paths: FingerPaths) {
  const fingersAt = (step: number) =>
    paths.map((path, id) => ({
      x: box.x + box.width * path[Math.min(step, path.length - 1)],
      y: box.y + lineY(box, id),
      id,
    }));
  const steps = Math.max(...paths.map((path) => path.length));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingersAt(0) });
  for (let step = 1; step < steps; step++)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingersAt(step) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function paperPixels(page: Page, box: PaperBox) {
  const png = await page.screenshot({ clip: box });
  return sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function inkInBand(before: Pixels, after: Pixels, centreY: number, halfBandPx: number) {
  const { width, height } = before.info;
  const top = Math.max(0, Math.round(centreY - halfBandPx));
  const bottom = Math.min(height, Math.round(centreY + halfBandPx));
  let count = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * RGBA_CHANNELS;
      const delta = Math.max(
        Math.abs(before.data[offset] - after.data[offset]),
        Math.abs(before.data[offset + 1] - after.data[offset + 1]),
        Math.abs(before.data[offset + 2] - after.data[offset + 2])
      );
      if (delta > INK_CHANNEL_DELTA) count++;
    }
  }
  return count;
}

async function drawWithFingers({ page, paper, pickColor }: DrawingScreen, paths: FingerPaths) {
  await pickColor('Black');
  const box = await paperBox(paper);
  const before = await paperPixels(page, box);
  await touchDrag(await page.context().newCDPSession(page), box, paths);
  return { box, before };
}

async function inkPerLine(page: Page, box: PaperBox, before: Pixels, fingers: number) {
  const after = await paperPixels(page, box);
  return Array.from({ length: fingers }, (_, finger) =>
    inkInBand(before, after, lineY(box, finger), LINE_BAND_PX)
  );
}

test('five touch pointers each paint an independent line', async ({ drawingScreen }) => {
  const { page } = drawingScreen;
  const { box, before } = await drawWithFingers(drawingScreen, PARALLEL_FINGERS);

  await expect
    .poll(async () => Math.min(...(await inkPerLine(page, box, before, PARALLEL_FINGERS.length))))
    .toBeGreaterThan(MIN_LINE_INK_PX);

  const after = await paperPixels(page, box);
  for (let finger = 0; finger < PARALLEL_FINGERS.length - 1; finger++) {
    const between = (lineY(box, finger) + lineY(box, finger + 1)) / 2;
    expect(inkInBand(before, after, between, GAP_BAND_PX), `gap ${finger + 1} ink`).toBe(0);
  }
});

test('a five-finger gesture undoes as a single unit', async ({ drawingScreen }) => {
  const { page } = drawingScreen;
  const { box, before } = await drawWithFingers(drawingScreen, PARALLEL_FINGERS);
  await expect
    .poll(async () => Math.min(...(await inkPerLine(page, box, before, PARALLEL_FINGERS.length))))
    .toBeGreaterThan(MIN_LINE_INK_PX);

  await drawingScreen.undo();

  await expect
    .poll(() => inkPerLine(page, box, before, PARALLEL_FINGERS.length))
    .toEqual(Array(PARALLEL_FINGERS.length).fill(0));
});

test('a five-finger spread paints under each finger and never zooms or moves the page', async ({
  drawingScreen,
}) => {
  const { page, paper } = drawingScreen;
  const viewport = () =>
    page.evaluate(() => ({
      scale: window.visualViewport?.scale ?? 1,
      width: window.innerWidth,
      height: window.innerHeight,
    }));
  const boxBefore = await paperBox(paper);
  const viewportBefore = await viewport();

  const { box, before } = await drawWithFingers(drawingScreen, SPREAD_FINGERS);

  await expect
    .poll(async () => Math.min(...(await inkPerLine(page, box, before, SPREAD_FINGERS.length))))
    .toBeGreaterThan(MIN_LINE_INK_PX);
  expect((await viewport()).scale).toBe(1);
  expect(await viewport()).toEqual(viewportBefore);
  expect(await paperBox(paper)).toEqual(boxBefore);
});
