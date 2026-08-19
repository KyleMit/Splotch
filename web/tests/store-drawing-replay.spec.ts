import { expect, test } from '@playwright/test';

import { gotoApp } from './helpers';

test('the store replay seam commits an engine-rendered stroke without a live pointer', async ({
  page,
}) => {
  await gotoApp(page);
  const before = await page.evaluate(() => window.__drawingDebug?.getUndoDebug().snapshots ?? -1);

  await page.evaluate(() => {
    if (!window.__replayStroke) throw new Error('Store drawing replay seam is unavailable');
    window.__replayStroke({
      color: { kind: 'picker', hex: '#E63946' },
      points: [
        { x: 100, y: 100 },
        { x: 140, y: 140 },
        { x: 180, y: 100 },
      ],
      size: 3,
    });
  });

  await expect
    .poll(() => page.evaluate(() => window.__drawingDebug?.getUndoDebug().snapshots ?? -1))
    .toBe(before + 1);
  const command = await page.evaluate(
    () => window.__drawingDebug?.getDrawingWorkDebug()?.lastCommand ?? null
  );
  expect(command?.inputOps).toBe(3);
  await expect(page.locator('.brush-ring')).toHaveCount(0);
});
