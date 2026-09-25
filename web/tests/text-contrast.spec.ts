import { expect, test } from '@playwright/test';
import { expectTextContrast } from './text-contrast';

// The contrast helper's sibling handling, on fixtures small enough to know the
// right answer: a fill painted beneath a label is its ground, and one painted
// over it cannot be read as a ground at all.

test('a translucent overlay painted over the text fails as unmeasurable', async ({ page }) => {
  await page.setContent(`
    <div id="root" style="position: relative; width: 220px; height: 60px; background: white">
      <span style="color: black">Washed-out label</span>
      <div style="position: absolute; inset: 0; background: rgb(255 255 255 / 85%)"></div>
    </div>
  `);

  await expect(expectTextContrast(page.locator('#root'))).rejects.toThrow(/paints over the text/);
});

test('a fill positioned beneath a label is measured as its ground', async ({ page }) => {
  await page.setContent(`
    <div id="root" style="position: relative; width: 220px; height: 60px; background: #e9e9e9">
      <span style="position: absolute; inset: 0; background: #5b2f99"></span>
      <label style="position: relative; color: white">Selected</label>
    </div>
  `);

  await expectTextContrast(page.locator('#root'));
});
