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
