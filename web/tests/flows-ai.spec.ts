import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

import { STORAGE_KEYS } from '../src/lib/storageKeys';

import {
  draw,
  gotoApp,
  headingOffsetFromPaneTop,
  openSettingsModal,
  seedAiEnabled,
  SECTION_LANDED_MAX_PX,
} from './helpers';

import { openDrawer } from './flows-harness';

// ── AI generation flow (mocked endpoint) ────────────────────────────────────

const webp = readFileSync(new URL('../static/icons/handmade-paper.webp', import.meta.url));
const AI_KEY_SEED_MARKER = 'splotch-test-ai-key-seeded';

async function enableAiInSettings(page: import('@playwright/test').Page) {
  const settings = await openSettingsModal(page);
  await settings.locator('.settings-nav').getByRole('button', { name: 'AI Art' }).click();
  await page.locator('#aiImageToggle').click();
  await settings.getByRole('button', { name: 'Close' }).click();
}

test('a fresh installation does not fetch an AI allowance or show the canvas action', async ({
  page,
}) => {
  let grantStatusRequests = 0;
  await page.route('**/api/free-generation-grant', async (route) => {
    grantStatusRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, limit: 10, remaining: 7, exhausted: false }),
    });
  });
  await gotoApp(page);
  await openDrawer(page);

  await expect(page.locator('#aiImageButton')).toBeHidden();
  expect(grantStatusRequests).toBe(0);
});

test('an access-code invite saves the credential without enabling AI', async ({ page }) => {
  await gotoApp(page, '/?ai_access_token=test-token');
  await expect.poll(() => page.url()).not.toContain('ai_access_token');
  await openDrawer(page);
  await expect(page.locator('#aiImageButton')).toBeHidden();

  const settings = await openSettingsModal(page);
  await settings.locator('.settings-nav').getByRole('button', { name: 'AI Art' }).click();
  const toggle = page.locator('#aiImageToggle');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(
    page.getByText("Your access code is saved — turn this on whenever you're ready.")
  ).toBeVisible();

  await toggle.click();
  await expect(page.locator('#aiCodeActive')).toHaveValue('test-token');
});

test('AI Settings explains the off feature without mounting its setup controls', async ({
  page,
}) => {
  await gotoApp(page);

  const settings = await openSettingsModal(page);
  await settings.locator('.settings-nav').getByRole('button', { name: 'AI Art' }).click();
  await expect(page.getByText('What turning this on does')).toBeInViewport();
  await expect(page.locator('#aiKeyInput')).toHaveCount(0);
});

test('the off explanation reuses a known exhausted allowance', async ({ page }) => {
  await page.route('**/api/free-generation-grant', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, limit: 10, remaining: 0, exhausted: true }),
    })
  );
  await gotoApp(page);

  const settings = await openSettingsModal(page);
  await settings.locator('.settings-nav').getByRole('button', { name: 'AI Art' }).click();
  const toggle = page.locator('#aiImageToggle');
  await toggle.click();
  await expect(page.getByText('Your 10 free AI creations are used up.')).toBeVisible();

  await toggle.click();
  await expect(page.getByText('Your 10 free pictures are used up.')).toBeVisible();
});

test('an exhausted free installation keeps the AI affordance and opens BYOK setup', async ({
  page,
}) => {
  await page.route('**/api/free-generation-grant', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, limit: 10, remaining: 0, exhausted: true }),
    })
  );
  await gotoApp(page);
  await enableAiInSettings(page);
  await openDrawer(page);
  await draw(page, [
    { x: 120, y: 120 },
    { x: 260, y: 200 },
  ]);

  const ai = page.locator('#aiImageButton');
  await expect(ai).toBeVisible();
  await expect(ai).toHaveAccessibleName('Set up AI image');
  await ai.click();

  await expect(page.locator('#settingsModal')).toBeVisible();
  await expect(page.getByText('Your 10 free AI creations are used up.')).toBeVisible();
  // The wide shell mounts every section at once, so a visible key field no
  // longer proves the request landed on AI Art — the pane has to have scrolled
  // that section's heading up to its top edge.
  await expect.poll(() => headingOffsetFromPaneTop(page, 'ai')).toBeLessThan(SECTION_LANDED_MAX_PX);
  await expect(page.locator('#aiKeyInput')).toBeVisible();
});

test('a migrated BYO key reveals the AI button on the next launch', async ({ page }) => {
  let grantStatusRequests = 0;
  await page.route('**/api/free-generation-grant', (route) => {
    grantStatusRequests += 1;
    return route.fulfill({ status: 500 });
  });
  await page.addInitScript(
    ({ aiUserApiKey, aiImageEnabled, seedMarker }) => {
      if (sessionStorage.getItem(seedMarker)) return;
      localStorage.setItem(aiUserApiKey, 'test-byo-key');
      localStorage.setItem(aiImageEnabled, 'true');
      sessionStorage.setItem(seedMarker, 'true');
    },
    {
      aiUserApiKey: STORAGE_KEYS.legacyAiUserApiKey,
      aiImageEnabled: STORAGE_KEYS.aiImageEnabled,
      seedMarker: AI_KEY_SEED_MARKER,
    }
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
  expect(grantStatusRequests).toBe(0);
});

test('the AI button posts the drawing and reveals the generated result', async ({ page }) => {
  let postedImage = false;
  let grantStatusRequests = 0;
  await page.route('**/api/free-generation-grant', (route) => {
    grantStatusRequests += 1;
    return route.fulfill({ status: 500 });
  });
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

  await seedAiEnabled(page);
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
  expect(grantStatusRequests).toBe(0);
});

// A cutout cover ships with real alpha so the picker's own surface shows
// through, and leans on a CSS drop-shadow to lift it. `filter` rasterizes the
// element's background along with its content, so giving this <img> a plate of
// its own would silently hand drop-shadow the rounded tile to trace instead of
// the sticker silhouette — a regression invisible in a diff and easy to
// reintroduce by "tidying" the background back onto every thumb.
test('a cutout style cover carries no plate of its own', async ({ page }) => {
  await seedAiEnabled(page);
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

  const cutout = page.locator('.ai-style-thumb-cutout');
  await expect(cutout).toBeVisible();
  await expect
    .poll(() => cutout.evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe('rgba(0, 0, 0, 0)');
  await expect
    .poll(() => cutout.evaluate((el) => getComputedStyle(el).filter))
    .toContain('drop-shadow');

  // Its opaque siblings still get the plate, so they have something to show
  // before the lazy image decodes.
  await expect
    .poll(() =>
      page
        .locator('.ai-style-thumb:not(.ai-style-thumb-cutout)')
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor)
    )
    .not.toBe('rgba(0, 0, 0, 0)');
});
