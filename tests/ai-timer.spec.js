import { expect, test } from '@playwright/test';

// Exercises the AI render timer animation via the dev-only debug harness at
// /dev/ai-timer, which feeds AiImageResult.svelte the sample artifacts through
// the real generation state seam — no Gemini call. Watch it run with:
//   npm run test:headed -- ai-timer

// Playwright waits for elements but not for Svelte to hydrate, so a click fired
// right after navigation can hit the SSR'd button before its handler is wired.
// Retry the trigger until the modal actually opens.
async function trigger(page, name) {
  await expect(async () => {
    await page.getByRole('button', { name }).click({ timeout: 1000 });
    await expect(page.locator('dialog.ai-result-modal')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10000 });
}

test.describe('AI render timer', () => {
  test('plays the dial and reveals the result image', async ({ page }) => {
    await page.goto('/dev/ai-timer');

    await trigger(page, /fast/i);

    // Loading state: the progress dial sits over the blurred drawing preview.
    await expect(page.locator('.dial')).toBeVisible();
    await expect(page.locator('.stage-img.preview')).toBeVisible();

    // When the (mock) image arrives the dial races to full, then the result
    // cross-fades in and the download button pops in.
    await expect(page.locator('.stage-img.result.shown')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /download/i })).toBeVisible();

    // The dial is torn down after the reveal.
    await expect(page.locator('.dial')).toHaveCount(0);
  });

  test('shows the error state', async ({ page }) => {
    await page.goto('/dev/ai-timer');

    await trigger(page, /error/i);

    await expect(page.getByText(/didn't work/i)).toBeVisible();
    await expect(page.locator('.dial')).toHaveCount(0);
  });
});
