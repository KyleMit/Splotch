import { expect, test } from '../fixtures.ts';
import { expectSettled, inkInSavedPicture, savePicture } from '../support/group-a.ts';

// A window that changes shape under a drawing, as a rotated tablet or a resized browser does: the
// paper takes the new window's measure, a stroke drawn after lands under the pointer, and a stroke
// drawn before is still on the paper (read from the saved picture, since the stroke's old place on
// screen is no longer where it is).
const SHAPES = [
  { name: 'a smaller window', width: 700, height: 520 },
  { name: 'a tall phone', width: 390, height: 844 },
  { name: 'a wide tablet', width: 1180, height: 820 },
] as const;

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

  test('a stroke drawn before the change is not lost to it', async ({ drawingScreen }) => {
    const { page, paper } = drawingScreen;
    await drawingScreen.pickColor('Black');
    const stroke = await drawingScreen.drawStroke();
    await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);

    await page.setViewportSize({ width: SHAPES[1].width, height: SHAPES[1].height });
    await expectSettled(paper);

    expect(await inkInSavedPicture(await savePicture(page))).toBeGreaterThan(stroke.lengthPx);
    await drawingScreen.undo();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save screenshot', exact: true })).toBeDisabled();
  });
});
