import { expect, test } from '../fixtures.ts';
import { openDocument, waitForDrawingScreen } from '../support/app.ts';
import { blackInkInCentralBand } from '../support/group-b.ts';

test.use({ colorScheme: 'light', viewport: { width: 1280, height: 720 } });

const MISSING_PATH = '/no-such-page';

test.describe('the page a lost link lands on', () => {
  for (const { label, path, heading } of [
    { label: 'Changelog', path: '/changelog', heading: 'Changelog' },
    { label: 'Privacy', path: '/privacy', heading: 'Privacy policy' },
  ]) {
    test(`recovers through ${label}`, async ({ page }) => {
      await openDocument(page, MISSING_PATH);

      await page
        .getByRole('main')
        .getByRole('list')
        .first()
        .getByRole('link', { name: label })
        .click();

      await expect(page).toHaveURL(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    });
  }

  test('recovers through Start drawing into a drawing screen that works', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await openDocument(page, MISSING_PATH);

    await page
      .getByRole('main')
      .getByRole('list')
      .first()
      .getByRole('link', { name: 'Start drawing' })
      .click();

    await expect(page).toHaveURL('/');
    await waitForDrawingScreen(page);
    await drawingScreen.pickColor('Black');
    await drawingScreen.drawStroke();
    await expect.poll(() => blackInkInCentralBand(page)).toBeGreaterThan(0);
  });

  test('a missing path under the privacy policy keeps every sibling link in its footer', async ({
    page,
  }) => {
    const response = await openDocument(page, '/privacy/missing');
    expect(response.status()).toBe(404);

    const footer = page.getByRole('navigation', { name: 'Splotch pages' });
    await expect(footer.getByRole('link', { name: 'Privacy', exact: true })).toHaveAttribute(
      'href',
      '/privacy'
    );
    await expect(footer.getByRole('link', { name: 'Changelog', exact: true })).toHaveAttribute(
      'href',
      '/changelog'
    );
    await expect(footer.getByRole('link', { name: 'Send feedback', exact: true })).toHaveAttribute(
      'href',
      '/feedback'
    );
  });
});
