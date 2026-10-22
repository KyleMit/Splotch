import type { CDPSession, Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { inkedPixelsSince, openDrawer, regionBetween, regionPixels } from '../support/group-a.ts';

type Spot = { x: number; y: number };
type PointerKind = 'mouse' | 'pen';

const FROM: Spot = { x: 0.35, y: 0.4 };
const TO: Spot = { x: 0.65, y: 0.6 };
const MOVE_STEPS = 10;
const LEFT_BUTTON_MASK = 1;

async function paperPoints(page: Page) {
  const box = await page.getByTestId('drawing-paper').boundingBox();
  if (!box) throw new Error('The drawing paper is not laid out');
  const at = ({ x, y }: Spot) => ({ x: box.x + box.width * x, y: box.y + box.height * y });
  return { start: at(FROM), end: at(TO) };
}

// Input from the browser's own pipeline, reporting the pointer a stylus or a mouse would be:
// Playwright's own mouse always reports itself as a mouse. `touching` is a stroke; without it the
// pointer only hovers over the paper.
async function pointerAcross(
  page: Page,
  session: CDPSession,
  kind: PointerKind,
  touching: boolean
) {
  const { start, end } = await paperPoints(page);
  const send = (type: 'mousePressed' | 'mouseMoved' | 'mouseReleased', point: Spot) =>
    session.send('Input.dispatchMouseEvent', {
      type,
      x: point.x,
      y: point.y,
      pointerType: kind,
      button: touching ? 'left' : 'none',
      buttons: touching && type !== 'mouseReleased' ? LEFT_BUTTON_MASK : 0,
      clickCount: touching ? 1 : 0,
    });
  await send('mouseMoved', start);
  if (touching) await send('mousePressed', start);
  for (let step = 1; step <= MOVE_STEPS; step++)
    await send('mouseMoved', {
      x: start.x + ((end.x - start.x) * step) / MOVE_STEPS,
      y: start.y + ((end.y - start.y) * step) / MOVE_STEPS,
    });
  if (touching) await send('mouseReleased', end);
}

test.describe('a stylus on the paper', () => {
  test('paints, and Undo takes the stroke back', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    const session = await page.context().newCDPSession(page);
    await drawingScreen.pickColor('Black');
    const { start, end } = await paperPoints(page);
    const region = regionBetween(start, end);
    const blank = await regionPixels(page, region);

    await pointerAcross(page, session, 'pen', true);

    await expect.poll(() => inkedPixelsSince(page, region, blank)).toBeGreaterThan(0);
    await drawingScreen.undo();
    await expect.poll(() => inkedPixelsSince(page, region, blank)).toBe(0);
  });

  test('paints nothing while it only hovers over the paper', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    const session = await page.context().newCDPSession(page);
    await drawingScreen.pickColor('Black');
    const { start, end } = await paperPoints(page);
    const region = regionBetween(start, end);
    const blank = await regionPixels(page, region);

    await pointerAcross(page, session, 'pen', false);

    expect(await inkedPixelsSince(page, region, blank)).toBe(0);
    await openDrawer(page);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  });

  // A touch or mouse that lands the instant after a colour is picked is the pick's own tap
  // bleeding through, so the engine ignores it (strokeMath.ts). A stylus is never that tap, so a
  // child drawing fast with one must not lose the stroke. The clock is held still so "the instant
  // after" is exactly that, whatever the machine's speed.
  for (const [kind, painted] of [
    ['mouse', false],
    ['pen', true],
  ] as const) {
    test(`a ${kind} stroke right after a colour is picked ${painted ? 'paints' : 'is ignored'}`, async ({
      drawingScreen,
    }) => {
      const { page } = drawingScreen;
      const session = await page.context().newCDPSession(page);
      const { start, end } = await paperPoints(page);
      const region = regionBetween(start, end);
      const blank = await regionPixels(page, region);
      await page.evaluate(() => {
        const frozen = Date.now();
        Date.now = () => frozen;
      });

      await page.getByRole('button', { name: 'Black', exact: true }).click();
      await pointerAcross(page, session, kind, true);

      await expect
        .poll(async () => (await inkedPixelsSince(page, region, blank)) > 0)
        .toBe(painted);
    });
  }
});
