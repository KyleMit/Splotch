import { expect, test } from '../fixtures.ts';
import { chooseBrush, openDrawer } from '../support/group-a.ts';

const ACROSS_THE_MIDDLE = [
  { x: 0.35, y: 0.4 },
  { x: 0.65, y: 0.4 },
] as const;
const ABOVE_THE_MIDDLE = [
  { x: 0.35, y: 0.25 },
  { x: 0.65, y: 0.25 },
] as const;
const BELOW_THE_MIDDLE = [
  { x: 0.35, y: 0.7 },
  { x: 0.65, y: 0.7 },
] as const;
// The eraser sweeps a little past both ends of the stroke it takes off.
const ERASER_OVERSHOOT = 0.05;

function sweepOver(stroke: readonly { x: number; y: number }[]) {
  const [first, last] = [stroke[0], stroke[stroke.length - 1]];
  return [
    { x: first.x - ERASER_OVERSHOOT, y: first.y },
    { x: last.x + ERASER_OVERSHOOT, y: last.y },
  ];
}

test.describe('the eraser', () => {
  test.beforeEach(async ({ drawingScreen }) => {
    await drawingScreen.pickColor('Black');
  });

  test('takes a stroke back off the paper', async ({ drawingScreen }) => {
    const stroke = await drawingScreen.drawStroke(ACROSS_THE_MIDDLE);
    await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);

    await chooseBrush(drawingScreen.page, 'Eraser');
    await drawingScreen.drawStroke(sweepOver(ACROSS_THE_MIDDLE));

    await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBe(0);
  });

  test('leaves the strokes it does not cross', async ({ drawingScreen }) => {
    const top = await drawingScreen.drawStroke(ABOVE_THE_MIDDLE);
    const bottom = await drawingScreen.drawStroke(BELOW_THE_MIDDLE);
    await expect.poll(() => drawingScreen.inkedPixels(top)).toBeGreaterThan(top.lengthPx);
    await expect.poll(() => drawingScreen.inkedPixels(bottom)).toBeGreaterThan(bottom.lengthPx);

    await chooseBrush(drawingScreen.page, 'Eraser');
    await drawingScreen.drawStroke(sweepOver(ABOVE_THE_MIDDLE));

    await expect.poll(() => drawingScreen.inkedPixels(top)).toBe(0);
    expect(await drawingScreen.inkedPixels(bottom)).toBeGreaterThan(bottom.lengthPx);
  });

  test('is taken back by Undo, one step at a time', async ({ drawingScreen }) => {
    const stroke = await drawingScreen.drawStroke(ACROSS_THE_MIDDLE);
    await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);
    await chooseBrush(drawingScreen.page, 'Eraser');
    await drawingScreen.drawStroke(sweepOver(ACROSS_THE_MIDDLE));
    await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBe(0);

    await drawingScreen.undo();
    await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);

    await openDrawer(drawingScreen.page);
    await drawingScreen.undo();
    await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBe(0);
  });
});
