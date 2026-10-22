import { expect, test } from '../fixtures.ts';
import { openDrawer, openSettingsSection } from '../support/group-a.ts';

const UNDO_SHORTCUT = 'ControlOrMeta+z';
const TYPED_BEFORE = 'The brush is';
const TYPED_AFTER = ' missing';

// The undo shortcut belongs to whatever has the keyboard: in a text box it takes back typing, and
// the drawing behind the dialog is not a thing the person at the box can see or meant to undo.
test('the undo shortcut in a feedback box edits its text and leaves the drawing alone', async ({
  drawingScreen,
}) => {
  const { page } = drawingScreen;
  await drawingScreen.pickColor('Black');
  const stroke = await drawingScreen.drawStroke();
  await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);

  const feedback = await openSettingsSection(page, 'Feedback');
  const message = feedback.getByRole('textbox', { name: 'What went wrong?' });
  await message.fill(TYPED_BEFORE);
  await message.pressSequentially(TYPED_AFTER);
  await expect(message).toHaveValue(`${TYPED_BEFORE}${TYPED_AFTER}`);

  await message.press(UNDO_SHORTCUT);

  // The browser takes back as much typing as it groups into one step.
  await expect(message).not.toHaveValue(`${TYPED_BEFORE}${TYPED_AFTER}`);
  await expect(message).toHaveValue(new RegExp(`^${TYPED_BEFORE}`));
  await feedback.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(feedback).toBeHidden();
  expect(await drawingScreen.inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);
  await openDrawer(page);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
});

test('the undo shortcut on the drawing takes the last stroke back', async ({ drawingScreen }) => {
  const { page } = drawingScreen;
  await drawingScreen.pickColor('Black');
  const stroke = await drawingScreen.drawStroke();
  await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);

  await page.keyboard.press(UNDO_SHORTCUT);

  await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBe(0);
});
