import { expect, test } from '../fixtures.ts';
import { openDocument } from '../support/app.ts';
import { SMOKE_TAG } from '../tags.ts';

test.describe('the web app in every engine', { tag: SMOKE_TAG }, () => {
  test('a stroke lands on the drawing screen and Undo takes it back', async ({ drawingScreen }) => {
    await drawingScreen.pickColor('Black');
    const stroke = await drawingScreen.drawStroke();
    await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);

    await drawingScreen.undo();
    await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBe(0);
  });

  test('the privacy page renders on its own', async ({ page }) => {
    const response = await openDocument(page, '/privacy');

    expect(response.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What stays on your device' })).toBeVisible();
  });
});
