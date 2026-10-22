import { expect, test } from '../fixtures.ts';
import { openSettingsSection } from '../support/group-a.ts';

// A parent checking the privacy policy must not wipe the child's drawing: the policy opens over
// the drawing from Settings, and coming back finds the paper as it was.
test.describe('the drawing while a parent reads the privacy policy', () => {
  test('is as it was after the browser’s Back button', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    await drawingScreen.pickColor('Black');
    const stroke = await drawingScreen.drawStroke();
    await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);

    const about = await openSettingsSection(page, 'About');
    await about.getByRole('link', { name: 'Privacy Policy' }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await drawingScreen.inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);
    await drawingScreen.undo();
    await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBe(0);
  });

  test('is as it was after the page’s own Back to drawing link', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    await drawingScreen.pickColor('Black');
    const stroke = await drawingScreen.drawStroke();
    await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);
    const about = await openSettingsSection(page, 'About');
    await about.getByRole('link', { name: 'Privacy Policy' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();

    await page.getByRole('link', { name: 'Back to drawing' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await drawingScreen.inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);
  });
});
