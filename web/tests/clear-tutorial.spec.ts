import { expect, test, type Page } from '@playwright/test';

// The drag-to-clear coachmark demos the gesture when a child taps the clear
// button repeatedly (or holds it) instead of dragging. Regression guard: the
// coachmark's own visibility ($state) was being read inside the
// orientation-reset $effect, so revealing it re-ran the effect and dismissed it
// in the same tick — the tutorial never actually appeared.

async function gotoApp(page: Page) {
  await page.goto('/');
  await expect(page.locator('#drawingCanvas')).toBeVisible();
}

test('triple-tapping the clear button reveals the coachmark', async ({ page }) => {
  await gotoApp(page);

  const button = page.locator('#clearButton');
  await button.click();
  await button.click();
  await button.click();

  const coachmark = page.locator('.clear-coachmark');
  await expect(coachmark).toHaveClass(/\bvisible\b/);
  await expect(coachmark).not.toHaveClass(/\bfade-out\b/);
  // It stays up rather than being torn down a tick later.
  await page.waitForTimeout(300);
  await expect(coachmark).toHaveClass(/\bvisible\b/);
  await expect
    .poll(() => coachmark.evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBeGreaterThan(0);
});
