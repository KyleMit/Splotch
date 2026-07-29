import { expect, test } from '@playwright/test';

import { tinyPngBuffer } from './fixtures';
import { draw, gotoApp } from './helpers';

import { openDrawer } from './flows-harness';

// ── AI generation flow (mocked endpoint) ────────────────────────────────────

test('the AI button posts the drawing and reveals the generated result', async ({ page }) => {
  const png = tinyPngBuffer();
  let postedImage = false;
  await page.route('**/api/generate-image', async (route) => {
    const req = route.request();
    // The client sends the raw image bytes as the body (no multipart envelope)
    // with the credential in a header — and a WebP upload (issue #345), which
    // Chromium encodes, so the Content-Type is image/webp.
    postedImage =
      req.method() === 'POST' &&
      req.headers()['content-type'] === 'image/webp' &&
      Boolean(req.headers()['x-access-token'] ?? req.headers()['x-api-key']) &&
      Boolean(req.postDataBuffer()?.length);
    await route.fulfill({ status: 200, contentType: 'image/png', body: png });
  });

  // The access-code param unlocks the AI feature (captured + persisted on mount).
  await gotoApp(page, '/?ai_access_token=test-token');
  await openDrawer(page);
  await draw(page, [
    { x: 120, y: 120 },
    { x: 260, y: 200 },
  ]);

  const ai = page.locator('#aiImageButton');
  await expect(ai).toBeVisible();
  await expect(ai).toBeEnabled();
  await ai.click();

  const style = page.getByRole('button', { name: 'Magical' });
  await expect(style).toBeEnabled();
  await style.click();

  await expect(page.locator('dialog.ai-result-modal')).toBeVisible();
  await expect(page.locator('.stage-img.result.shown')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: /download/i })).toBeVisible();
  expect(postedImage).toBe(true);
});
