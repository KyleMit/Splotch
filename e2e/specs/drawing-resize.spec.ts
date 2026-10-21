import { expect, test } from '../fixtures.ts';
import { blackInkInCentralBand } from '../support/group-b.ts';

// The window is resized, or the screen turned on its side, with a drawing on the paper. Black ink
// is read as near-black pixels, so these specs pin the light theme.
test.use({ colorScheme: 'light', viewport: { width: 1280, height: 720 } });

const SHRUNK_WINDOW = { width: 900, height: 600 };
const PORTRAIT_SCREEN = { width: 720, height: 1280 };
const LOWER_STROKE = [
  { x: 0.3, y: 0.6 },
  { x: 0.6, y: 0.7 },
] as const;

test.describe('a drawing through a change of window shape', () => {
  test('survives the window being resized, and the next stroke still lands', async ({
    drawingScreen,
    page,
  }) => {
    await drawingScreen.pickColor('Black');
    await drawingScreen.drawStroke();
    await expect.poll(() => blackInkInCentralBand(page)).toBeGreaterThan(0);

    await page.setViewportSize(SHRUNK_WINDOW);
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(900);
    const inkAfterResize = await blackInkInCentralBand(page);
    expect(inkAfterResize).toBeGreaterThan(0);

    await drawingScreen.drawStroke(LOWER_STROKE);
    await expect.poll(() => blackInkInCentralBand(page)).toBeGreaterThan(inkAfterResize);
  });

  test('turning the screen keeps the drawing on its own paper until Undo empties it', async ({
    drawingScreen,
    page,
  }) => {
    await drawingScreen.pickColor('Black');
    await drawingScreen.drawStroke();
    await expect.poll(() => blackInkInCentralBand(page)).toBeGreaterThan(0);
    const landscape = await drawingScreen.paper.boundingBox();
    expect(landscape?.width).toBeGreaterThan(landscape?.height ?? Infinity);

    await page.setViewportSize(PORTRAIT_SCREEN);
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(PORTRAIT_SCREEN.width);
    await expect.poll(async () => (await drawingScreen.paper.boundingBox())?.width).toBe(720);
    const keptSheet = await drawingScreen.paper.boundingBox();
    expect(keptSheet?.height).toBeLessThan(keptSheet?.width ?? 0);
    expect(await blackInkInCentralBand(page)).toBeGreaterThan(0);

    await drawingScreen.undo();
    await expect.poll(() => blackInkInCentralBand(page)).toBe(0);
    await expect
      .poll(async () => {
        const adopted = await drawingScreen.paper.boundingBox();
        return (adopted?.height ?? 0) > (adopted?.width ?? Infinity);
      })
      .toBe(true);
  });

  test('turning the screen over an empty paper adopts the new shape with no margin', async ({
    drawingScreen,
    page,
  }) => {
    await page.setViewportSize(PORTRAIT_SCREEN);

    await expect
      .poll(async () => {
        const paper = await drawingScreen.paper.boundingBox();
        return paper && { x: paper.x, width: paper.width, bottom: paper.y + paper.height };
      })
      .toEqual({ x: 0, width: PORTRAIT_SCREEN.width, bottom: PORTRAIT_SCREEN.height });
  });
});
