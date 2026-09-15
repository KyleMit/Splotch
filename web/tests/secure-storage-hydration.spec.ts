import { expect, test } from '@playwright/test';

import { STORAGE_KEYS } from '../src/lib/storageKeys';
import { openAiSettings, submitAiKey } from './flows-harness';
import { gotoApp } from './helpers';

const SECURE_STORAGE_RESTORED_ATTRIBUTE = 'data-secure-storage-restored';

// A legacy plaintext key makes boot hydration write to secure storage. Failing
// that write rejects the hydration and leaves the in-memory key empty while the
// vault still may hold a secret, so a key submitted afterwards is refused. Storage
// is repaired before the submit: the refusal itself, not a failing write, is what
// the parent must hear about.
test('a key submitted after a failed credential hydration reports the save failure', async ({
  page,
}) => {
  await page.route('**/api/verify-key', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    })
  );
  await page.addInitScript(
    ({ legacyKey, restoredAttribute }) => {
      localStorage.setItem(legacyKey, 'sk-legacy-plaintext');
      const transaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (storeNames, mode, options) {
        const restored = document.documentElement.hasAttribute(restoredAttribute);
        if (this.name === 'splotch-secure' && !restored) {
          throw new Error('forced secure storage failure');
        }
        return transaction.call(this, storeNames, mode, options);
      };
    },
    {
      legacyKey: STORAGE_KEYS.legacyAiUserApiKey,
      restoredAttribute: SECURE_STORAGE_RESTORED_ATTRIBUTE,
    }
  );
  await gotoApp(page);
  await openAiSettings(page);
  await page.evaluate(
    (restoredAttribute) => document.documentElement.setAttribute(restoredAttribute, ''),
    SECURE_STORAGE_RESTORED_ATTRIBUTE
  );

  await submitAiKey(page, 'sk-after-failed-hydration');

  await expect(page.getByRole('alert')).toContainText('could not be saved securely');
  await expect(page.locator('#aiKeyInput')).toBeVisible();
  await expect(page.locator('#aiKeyActive')).toHaveCount(0);
});

test('a key stays present when a failed hydration makes forget refuse the write', async ({
  page,
}) => {
  await gotoApp(page);
  await page.evaluate(async () => {
    if (!window.__prepareRefusedAiKeyForget) throw new Error('Credential test seam missing');
    await window.__prepareRefusedAiKeyForget('sk-existing-key');
  });
  await openAiSettings(page, '#aiKeyActive');

  await page.getByRole('button', { name: 'Forget' }).click();

  await expect(page.getByRole('alert')).toContainText('could not be removed securely');
  await expect(page.locator('#aiKeyActive')).toHaveValue('***********-key');
});
