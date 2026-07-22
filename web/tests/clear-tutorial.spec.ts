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
  const coachmark = page.locator('.clear-coachmark');

  // The coachmark only reveals when three taps land inside dragToClear's 1000ms
  // multi-click window; on a starved worker three separate Playwright clicks can
  // straddle that window and reset the count, so retry the whole burst until one
  // set lands in time rather than assuming a single burst always makes it.
  await expect(async () => {
    await button.click();
    await button.click();
    await button.click();
    await expect(coachmark).toHaveClass(/\bvisible\b/, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });

  await expect(coachmark).not.toHaveClass(/\bfade-out\b/);
  // It stays up rather than being torn down a tick later (the regression this
  // guards): the opacity poll settling above 0 confirms it survived the reveal
  // tick instead of being dismissed in the same one.
  await expect
    .poll(() => coachmark.evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBeGreaterThan(0);
  await expect(coachmark).toHaveClass(/\bvisible\b/);
});
