import { expect, test, type Page } from '@playwright/test';

import { STORAGE_KEYS } from '../src/lib/storageKeys';
import { openAiSettings, submitAiKey } from './flows-harness';
import { gotoApp } from './helpers';

const HOLD_ENCRYPTION_ATTRIBUTE = 'data-hold-encryption';
const ENCRYPTION_HELD_ATTRIBUTE = 'data-encryption-held';

function mockVerifyKey(page: Page) {
  return page.route('**/api/verify-key', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    })
  );
}

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

// A save that has already read its key and is encrypting when the database is
// deleted must not resume into the recreated database: another tab may have
// created a fresh key there, and ciphertext under the old key would replace
// that tab's readable credential with one nothing can decrypt.
test('a save paused across a deletion and another tab save fails instead of overwriting', async ({
  page,
  context,
}) => {
  await mockVerifyKey(page);
  await page.addInitScript(
    ({ holdAttribute, heldAttribute }) => {
      const encrypt = SubtleCrypto.prototype.encrypt;
      SubtleCrypto.prototype.encrypt = async function (...args) {
        const result = await encrypt.apply(this, args);
        const root = document.documentElement;
        if (root.hasAttribute(holdAttribute)) {
          root.setAttribute(heldAttribute, '');
          await new Promise<void>((resolve) => {
            const check = () =>
              root.hasAttribute(holdAttribute) ? setTimeout(check, 20) : resolve();
            check();
          });
        }
        return result;
      };
    },
    { holdAttribute: HOLD_ENCRYPTION_ATTRIBUTE, heldAttribute: ENCRYPTION_HELD_ATTRIBUTE }
  );
  await gotoApp(page);
  await openAiSettings(page);
  await submitAiKey(page, 'sk-before-deletion');
  await expect(page.locator('#aiKeyActive')).toHaveValue(/tion$/);
  await page.getByRole('button', { name: 'Forget', exact: true }).click();
  await expect(page.locator('#aiKeyInput')).toBeVisible();

  await page.evaluate(
    (holdAttribute) => document.documentElement.setAttribute(holdAttribute, ''),
    HOLD_ENCRYPTION_ATTRIBUTE
  );
  await submitAiKey(page, 'sk-held-save');
  await expect(page.locator(`html[${ENCRYPTION_HELD_ATTRIBUTE}]`)).toBeAttached();

  const cdp = await context.newCDPSession(page);
  await cdp.send('Storage.clearDataForOrigin', {
    origin: new URL(page.url()).origin,
    storageTypes: 'indexeddb',
  });

  const otherTab = await context.newPage();
  await mockVerifyKey(otherTab);
  await gotoApp(otherTab);
  await openAiSettings(otherTab);
  await submitAiKey(otherTab, 'sk-other-tab');
  await expect(otherTab.locator('#aiKeyActive')).toHaveValue(/tab$/);

  await page.evaluate(
    (holdAttribute) => document.documentElement.removeAttribute(holdAttribute),
    HOLD_ENCRYPTION_ATTRIBUTE
  );
  await expect(page.getByRole('alert')).toContainText('could not be saved securely');

  await otherTab.reload();
  await openAiSettings(otherTab, '#aiKeyActive');
  await expect(otherTab.locator('#aiKeyActive')).toHaveValue(/tab$/);
});
