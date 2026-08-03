import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

import { STORAGE_KEYS } from '../src/lib/storageKeys';

import { draw, gotoApp } from './helpers';

import { openDrawer } from './flows-harness';

// ── AI generation flow (mocked endpoint) ────────────────────────────────────

const webp = readFileSync(new URL('../static/icons/handmade-paper.webp', import.meta.url));
const AI_KEY_SEED_MARKER = 'splotch-test-ai-key-seeded';

test('a migrated BYO key reveals the AI button on the next launch', async ({ page }) => {
  await page.addInitScript(
    ({ aiUserApiKey, seedMarker }) => {
      if (sessionStorage.getItem(seedMarker)) return;
      localStorage.setItem(aiUserApiKey, 'test-byo-key');
      sessionStorage.setItem(seedMarker, 'true');
    },
    { aiUserApiKey: STORAGE_KEYS.legacyAiUserApiKey, seedMarker: AI_KEY_SEED_MARKER }
  );
  await gotoApp(page);
  await expect
    .poll(() =>
      page.evaluate(
        (aiUserApiKey) => localStorage.getItem(aiUserApiKey),
        STORAGE_KEYS.legacyAiUserApiKey
      )
    )
    .toBeNull();

  await page.reload();
  await expect(page.locator('#drawingCanvas')).toBeVisible();
  await openDrawer(page);

  await expect(page.locator('#aiImageButton')).toBeVisible();
});

test('the AI button posts the drawing and reveals the generated result', async ({ page }) => {
  let postedImage = false;
  await page.route('**/api/generate-image?style=Magical', async (route) => {
    const req = route.request();
    // The client sends the raw image bytes as the body (no multipart envelope)
    // with the credential in a header — and a WebP upload (issue #345), which
    // Chromium encodes, so the Content-Type is image/webp.
    postedImage =
      req.method() === 'POST' &&
      req.headers()['content-type'] === 'image/webp' &&
      Boolean(req.headers()['x-access-token'] ?? req.headers()['x-api-key']) &&
      Boolean(req.postDataBuffer()?.length);
    await route.fulfill({ status: 200, contentType: 'image/webp', body: webp });
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
  const downloadButton = page.getByRole('button', { name: /download/i });
  await expect(downloadButton).toBeVisible();
  const download = page.waitForEvent('download');
  await downloadButton.click();
  await expect((await download).suggestedFilename()).toMatch(/^splotch-ai-.+\.webp$/);
  expect(postedImage).toBe(true);
});
