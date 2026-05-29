import { expect, test } from '@playwright/test';

test('home page renders the drawing canvas', async ({ page }) => {
  await page.goto('/');

  // Title comes through from app.html
  await expect(page).toHaveTitle(/Splotch/);

  // The drawing surface mounts on the client
  await expect(page.locator('#drawingCanvas')).toBeVisible();
});
