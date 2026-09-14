import { expect, test } from '@playwright/test';

import { STORAGE_KEYS } from '../src/lib/storageKeys';
import { openAiSettings, submitAiKey } from './flows-harness';
import { gotoApp } from './helpers';

// Clearing IndexedDB from the browser force-closes every open connection to it,
// the same end state WebKit reaches when it drops a backgrounded page's
// connections.
test('an API key saves after the browser closes the secure-storage connection', async ({
  page,
}) => {
  await page.route('**/api/verify-key', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    })
  );
  await gotoApp(page);
  await openAiSettings(page);
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.secureVaultEmpty))
    .not.toBeNull();

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Storage.clearDataForOrigin', {
    origin: new URL(page.url()).origin,
    storageTypes: 'indexeddb',
  });

  await submitAiKey(page, 'sk-after-connection-close');

  await expect(page.locator('#aiKeyActive')).toHaveValue(/lose$/);
});

// A vault that has already read its master key keeps that key in memory. Once
// the browser deletes the database out from under the connection, a save must
// not encrypt with the stale key and write the ciphertext beside no key at all,
// which the next launch could never decrypt.
test('a replacement API key saved after the database is deleted survives a reload', async ({
  page,
}) => {
  await page.route('**/api/verify-key', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    })
  );
  await gotoApp(page);
  await openAiSettings(page);
  await submitAiKey(page, 'sk-before-deletion');
  await expect(page.locator('#aiKeyActive')).toHaveValue(/tion$/);
  await page.getByRole('button', { name: 'Forget', exact: true }).click();
  await expect(page.locator('#aiKeyInput')).toBeVisible();

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Storage.clearDataForOrigin', {
    origin: new URL(page.url()).origin,
    storageTypes: 'indexeddb',
  });

  await submitAiKey(page, 'sk-after-deletion');
  await expect(page.locator('#aiKeyActive')).toHaveValue(/tion$/);

  await page.reload();
  await openAiSettings(page, '#aiKeyActive');
  await expect(page.locator('#aiKeyActive')).toHaveValue(/tion$/);
});
