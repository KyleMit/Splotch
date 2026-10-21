import { expect, test } from '../fixtures.ts';
import type { DrawingScreen } from '../support/drawing.ts';
import {
  expectSettled,
  inkInSavedPicture,
  openDrawer,
  pixelsInkedBetween,
  regionOf,
  regionPixels,
  savePicture,
} from '../support/group-a.ts';

// A window that changes shape under a drawing, as a rotated tablet or a resized browser does: the
// paper takes the new window's measure, a stroke drawn after lands under the pointer, and a stroke
// drawn before is still on the paper and in the saved picture.
const SHAPES = [
  { name: 'a smaller window', width: 700, height: 520 },
  { name: 'a tall phone', width: 390, height: 844 },
  { name: 'a wide tablet', width: 1180, height: 820 },
] as const;

const AFTER_RESHAPE = SHAPES[1];

async function drawThenReshape(drawingScreen: DrawingScreen) {
  const { page, paper } = drawingScreen;
  await drawingScreen.pickColor('Black');
  const stroke = await drawingScreen.drawStroke();
  await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);
  await page.setViewportSize({ width: AFTER_RESHAPE.width, height: AFTER_RESHAPE.height });
  await expectSettled(paper);
  return stroke;
}

test.describe('after the window changes shape', () => {
  for (const shape of SHAPES) {
    test(`a stroke lands under the pointer in ${shape.name}`, async ({ drawingScreen }) => {
      const { page, paper } = drawingScreen;

      await page.setViewportSize({ width: shape.width, height: shape.height });
      await expectSettled(paper);
      const box = await paper.boundingBox();
      expect(box?.width).toBeLessThanOrEqual(shape.width);
      expect(box?.height).toBeLessThanOrEqual(shape.height);

      const stroke = await drawingScreen.drawStroke();
      await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);
      await drawingScreen.undo();
      await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBe(0);
    });
  }

  test('a stroke drawn before the change stays on the paper until Undo takes it off', async ({
    drawingScreen,
  }) => {
    const { page, paper } = drawingScreen;
    const stroke = await drawThenReshape(drawingScreen);
    await openDrawer(page);
    const region = await regionOf(paper);
    const withStroke = await regionPixels(page, region);

    await drawingScreen.undo();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();

    // The stroke's old place on screen is no longer where it is, so the paper is read whole: what
    // Undo takes off is what the child could see.
    await expect
      .poll(async () => pixelsInkedBetween(await regionPixels(page, region), withStroke))
      .toBeGreaterThan(stroke.lengthPx);
  });

  test('a stroke drawn before the change is in the picture that is saved', async ({
    drawingScreen,
  }) => {
    const stroke = await drawThenReshape(drawingScreen);

    expect(await inkInSavedPicture(await savePicture(drawingScreen.page))).toBeGreaterThan(
      stroke.lengthPx
    );
  });
});
