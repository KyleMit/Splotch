import { expect, test } from '../fixtures.ts';
import { chooseBrush } from '../support/group-a.ts';

// Measured on the paper: one pass of crayon covers about three quarters of what pen ink does over the
// same path, and a second pass fills in about a fifth more. Pen ink gains nothing from a second pass.
const TOOTH_MAX_RATIO_TO_PEN = 0.9;
const BUILD_UP_MIN_RATIO = 1.1;
const ROW_A = 0.3;
const ROW_B = 0.5;
const ROW_C = 0.7;

function rowAt(y: number) {
  return [
    { x: 0.3, y },
    { x: 0.7, y },
  ] as const;
}

// A crayon is wax on paper: a pass leaves the paper's tooth showing, and going over it fills the
// tooth in. Pen ink, by contrast, is solid, so the same path in the same colour at the same width
// covers more of the paper than one pass of crayon does.
test.describe('the crayon brush', () => {
  test.beforeEach(async ({ drawingScreen }) => {
    await drawingScreen.pickColor('Red');
  });

  test('leaves the paper’s tooth showing through a single pass', async ({ drawingScreen }) => {
    const pen = await drawingScreen.drawStroke(rowAt(ROW_A));
    await chooseBrush(drawingScreen.page, 'Crayon');
    const crayon = await drawingScreen.drawStroke(rowAt(ROW_B));

    await expect.poll(() => drawingScreen.inkedPixels(crayon)).toBeGreaterThan(crayon.lengthPx);
    expect(await drawingScreen.inkedPixels(crayon)).toBeLessThan(
      (await drawingScreen.inkedPixels(pen)) * TOOTH_MAX_RATIO_TO_PEN
    );
  });

  test('builds up when the same path is gone over again', async ({ drawingScreen }) => {
    await chooseBrush(drawingScreen.page, 'Crayon');
    const once = await drawingScreen.drawStroke(rowAt(ROW_A));
    // Measured against the paper as it was before the first pass, so it counts both passes.
    const twice = await drawingScreen.drawStroke(rowAt(ROW_B));
    await drawingScreen.drawStroke(rowAt(ROW_B));
    await expect.poll(() => drawingScreen.inkedPixels(once)).toBeGreaterThan(once.lengthPx);

    expect(await drawingScreen.inkedPixels(twice)).toBeGreaterThan(
      (await drawingScreen.inkedPixels(once)) * BUILD_UP_MIN_RATIO
    );
  });

  test('is taken back cleanly by Undo, stroke by stroke', async ({ drawingScreen }) => {
    await chooseBrush(drawingScreen.page, 'Crayon');
    const first = await drawingScreen.drawStroke(rowAt(ROW_A));
    const second = await drawingScreen.drawStroke(rowAt(ROW_C));
    await expect.poll(() => drawingScreen.inkedPixels(second)).toBeGreaterThan(second.lengthPx);

    await drawingScreen.undo();
    await expect.poll(() => drawingScreen.inkedPixels(second)).toBe(0);
    expect(await drawingScreen.inkedPixels(first)).toBeGreaterThan(first.lengthPx);

    await drawingScreen.undo();
    await expect.poll(() => drawingScreen.inkedPixels(first)).toBe(0);
  });
});
