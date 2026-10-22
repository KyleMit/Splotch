import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import {
  inkInSavedPicture,
  openDrawer,
  openSettingsSection,
  savePicture,
} from '../support/group-a.ts';

type ButtonStyle = 'Raised' | 'Flat';

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 1180, height: 820 };

async function chooseButtonStyle(page: Page, style: ButtonStyle) {
  const section = await openSettingsSection(page, 'Appearance');
  const picker = section.getByRole('radiogroup', { name: 'Button style', exact: true });
  await picker.getByRole('radio', { name: style, exact: true }).click();
  await expect(picker.getByRole('radio', { name: style, exact: true })).toBeChecked();
  await section.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(section).toBeHidden();
}

// The drawing and the page it sits on belong to the screen, not to how its buttons are dressed: a
// parent trying the other style halfway through a picture must find the picture as they left it.
for (const layout of [PHONE, TABLET]) {
  test.describe(`the button style at ${layout.width}px`, () => {
    test.use({ viewport: layout });

    test('keeps an existing drawing when it is switched, and is remembered across a reload', async ({
      drawingScreen,
    }) => {
      const { page } = drawingScreen;
      await drawingScreen.pickColor('Black');
      const stroke = await drawingScreen.drawStroke();
      await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);

      await chooseButtonStyle(page, 'Flat');

      await openDrawer(page);
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
      expect(await inkInSavedPicture(await savePicture(page))).toBeGreaterThan(stroke.lengthPx);

      await page.reload();
      const section = await openSettingsSection(page, 'Appearance');
      await expect(
        section
          .getByRole('radiogroup', { name: 'Button style', exact: true })
          .getByRole('radio', { name: 'Flat', exact: true })
      ).toBeChecked();
    });

    test('keeps the ink and the chosen coloring page through a switch there and back', async ({
      drawingScreen,
    }) => {
      const { page } = drawingScreen;
      await openDrawer(page);
      await page.getByRole('button', { name: 'Coloring books', exact: true }).click();
      await page.getByRole('button', { name: 'Cat coloring page' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Cat ready.' })).toBeVisible();
      await drawingScreen.pickColor('Black');
      const stroke = await drawingScreen.drawStroke();
      await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);

      await chooseButtonStyle(page, 'Flat');
      await chooseButtonStyle(page, 'Raised');

      await openDrawer(page);
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
      expect(await inkInSavedPicture(await savePicture(page))).toBeGreaterThan(stroke.lengthPx);
      await page.getByRole('button', { name: 'Coloring books', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Clear active coloring page: Cat' })
      ).toBeVisible();
    });
  });
}
