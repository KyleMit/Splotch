import { expect, test, type Page } from '@playwright/test';

import { drawCommittedStroke, firstOpaquePixel, gotoApp, readDrawingHistory } from './helpers';
import { openSettingsSection } from './flows-harness';

// The history an undo rewinds; the byte counters also move with idle compaction.
async function readUndoPosition(page: Page) {
  const history = await readDrawingHistory(page);
  return { strokeRevision: history?.strokeRevision, historyLength: history?.historyLength };
}

test('Ctrl/Cmd+Z edits report text without undoing the drawing behind the dialog', async ({
  page,
}) => {
  await gotoApp(page);
  await drawCommittedStroke(page, [
    { x: 120, y: 120 },
    { x: 260, y: 200 },
  ]);
  const committed = await readUndoPosition(page);
  expect(committed.historyLength).toBeGreaterThan(0);

  await openSettingsSection(page, 'Feedback', '#reportMessage');
  const message = page.locator('#reportMessage');
  await message.fill('The brush is');
  await message.pressSequentially(' missing');
  await expect(message).toHaveValue('The brush is missing');

  await message.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z');

  await expect(message).toHaveValue('The brush is');
  // The keydown has been handled, and a routed undo runs synchronously inside it.
  expect(await readUndoPosition(page)).toEqual(committed);
  expect(await firstOpaquePixel(page)).not.toBeNull();
});
