import { expect, type Locator, type Page } from '@playwright/test';
import sharp from 'sharp';
import { PAPER_INPUT_TEST_ID } from '../../experiments/native-architecture/src/platform/firstFrameContract.ts';
import { COLOR_CHANGE_DEBOUNCE_MS } from '../../web/src/lib/drawing/strokeMath.ts';
import { openDocument, waitForDrawingScreen } from './app.ts';

/** A point on the paper as fractions of its width and height, so a stroke fits any viewport. */
type PaperPoint = { x: number; y: number };
type Region = { x: number; y: number; width: number; height: number };

/** A stroke the helpers drew: the region it crosses, and that region's pixels before it. */
type DrawnStroke = { region: Region; before: Buffer; lengthPx: number };

const ACROSS_THE_MIDDLE: readonly [PaperPoint, PaperPoint] = [
  { x: 0.35, y: 0.4 },
  { x: 0.65, y: 0.6 },
];
// Pointer moves between a stroke's ends: enough for the engine to smooth a line through.
const STROKE_MOVE_STEPS = 12;
// The measured region reaches past the stroke's centreline by more than any brush's half width.
const STROKE_REGION_PADDING_PX = 24;
// A channel must move this far for a pixel to count as inked. The paper's grain and antialiasing
// stay well under it; every palette colour on either paper clears it.
const INK_CHANNEL_DELTA = 48;
const RGBA_CHANNELS = 4;

async function regionPixels(page: Page, region: Region): Promise<Buffer> {
  const png = await page.screenshot({ clip: region });
  return sharp(png).ensureAlpha().raw().toBuffer();
}

function inkedPixelCount(before: Buffer, after: Buffer): number {
  let count = 0;
  for (let offset = 0; offset < before.length; offset += RGBA_CHANNELS) {
    const delta = Math.max(
      Math.abs(before[offset] - after[offset]),
      Math.abs(before[offset + 1] - after[offset + 1]),
      Math.abs(before[offset + 2] - after[offset + 2])
    );
    if (delta > INK_CHANNEL_DELTA) count++;
  }
  return count;
}

export type DrawingScreen = {
  page: Page;
  paper: Locator;
  /** Picks a palette colour by its swatch's name, then waits out the engine's colour debounce. */
  pickColor: (name: string) => Promise<void>;
  /** Drags the mouse across the paper, from the first point to the last. */
  drawStroke: (points?: readonly PaperPoint[]) => Promise<DrawnStroke>;
  /** How many pixels of the stroke's region differ from before it was drawn. */
  inkedPixels: (stroke: DrawnStroke) => Promise<number>;
  /** Presses the drawer's Undo, opening the drawer first if it is closed. */
  undo: () => Promise<void>;
};

function drawingScreenOn(page: Page): DrawingScreen {
  const paper = page.getByTestId(PAPER_INPUT_TEST_ID);
  return {
    page,
    paper,
    async pickColor(name) {
      const swatch = page.getByRole('button', { name, exact: true });
      await swatch.click();
      // The engine ignores a mouse or finger that lands this soon after a colour change, so the
      // tap that picked the colour never starts a stroke (strokeMath.ts).
      await page.waitForTimeout(COLOR_CHANGE_DEBOUNCE_MS);
    },
    async drawStroke(points = ACROSS_THE_MIDDLE) {
      const box = await paper.boundingBox();
      if (!box) throw new Error('The drawing paper is not laid out');
      const at = ({ x, y }: PaperPoint) => ({
        x: box.x + box.width * x,
        y: box.y + box.height * y,
      });
      const path = points.map(at);
      const xs = path.map(({ x }) => x);
      const ys = path.map(({ y }) => y);
      const left = Math.max(box.x, Math.min(...xs) - STROKE_REGION_PADDING_PX);
      const top = Math.max(box.y, Math.min(...ys) - STROKE_REGION_PADDING_PX);
      const region = {
        x: left,
        y: top,
        width: Math.min(box.x + box.width, Math.max(...xs) + STROKE_REGION_PADDING_PX) - left,
        height: Math.min(box.y + box.height, Math.max(...ys) + STROKE_REGION_PADDING_PX) - top,
      };
      const before = await regionPixels(page, region);
      const [start, ...rest] = path;
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      for (const point of rest)
        await page.mouse.move(point.x, point.y, { steps: STROKE_MOVE_STEPS });
      await page.mouse.up();
      const lengthPx = rest.reduce(
        (total, point, index) =>
          total + Math.hypot(point.x - path[index].x, point.y - path[index].y),
        0
      );
      return { region, before, lengthPx };
    },
    async inkedPixels(stroke) {
      return inkedPixelCount(stroke.before, await regionPixels(page, stroke.region));
    },
    async undo() {
      const expand = page.getByRole('button', { name: 'Expand controls' });
      if (await expand.isVisible()) await expand.click();
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
    },
  };
}

/** Opens the drawing screen at `/` and waits until it answers input. */
export async function openDrawingScreen(page: Page): Promise<DrawingScreen> {
  const response = await openDocument(page, '/');
  expect(response.status()).toBe(200);
  await waitForDrawingScreen(page);
  return drawingScreenOn(page);
}
