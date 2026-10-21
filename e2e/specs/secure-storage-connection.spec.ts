import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { openDrawingScreen } from '../support/drawing.ts';
import { openSettings } from '../support/group-c.ts';

// A parent's own OpenAI key is encrypted into the browser's IndexedDB (platform/aiVault.web.ts).
// Clearing site data from the browser force-closes every open connection to it, the end state
// WebKit reaches when it drops a backgrounded page's connections, so a save after it must open a
// fresh connection, and one begun before it must not resume into a database another tab recreated.
//
// The Node tests of the vault stand a fake database in for IndexedDB; Chromium's own deletion is
// what is exercised here.

const KEY_FIELD = 'OpenAI API Key';
const SAVED_KEY_FIELD = 'Saved OpenAI API key (masked)';
const VAULT_DATABASE = 'splotch-beta-ai-vault-v1';
const HOLD_ENCRYPTION_ATTRIBUTE = 'data-hold-encryption';
const ENCRYPTION_HELD_ATTRIBUTE = 'data-encryption-held';
const SAVE_FAILED = /could not be saved securely/;
// Test keys the provider never sees: verification is stubbed, and the suite's server could not
// authenticate them.
const FIRST_KEY = 'sk-first-key';
const KEY_AFTER_CLOSE = 'sk-after-connection-close';
const KEY_BEFORE_DELETION = 'sk-before-deletion';
const KEY_AFTER_DELETION = 'sk-after-deletion';
const HELD_KEY = 'sk-held-save';
const OTHER_TAB_KEY = 'sk-other-tab';
// The saved key reads back masked down to its last four characters.
const MASK_TAIL_LENGTH = 4;
const LISTING_BUDGET_MS = 500;

// The suite's server has no Netlify Blobs, so the free-picture count would answer with a server
// error; the answer the function gives while free pictures are off is what the page is given.
async function stubAiEndpoints(page: Page) {
  await page.route('**/api/verify-key', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    })
  );
  await page.route('**/api/free-generation-grant', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Free generations are unavailable' }),
    })
  );
}

async function openAiSettings(page: Page): Promise<Locator> {
  const settings = await openSettings(page);
  const section = settings.getByRole('region', { name: 'AI Art' });
  const master = section.getByRole('switch', { name: 'Create AI Images' });
  if ((await master.getAttribute('aria-checked')) !== 'true') await master.click();
  await expect(master).toBeChecked();
  return section;
}

async function submitAiKey(section: Locator, key: string) {
  await section.getByRole('textbox', { name: KEY_FIELD }).fill(key);
  await section.getByRole('button', { name: 'Save' }).click();
}

async function expectSavedKey(section: Locator, key: string) {
  const tail = key.slice(-MASK_TAIL_LENGTH);
  await expect(section.getByRole('textbox', { name: SAVED_KEY_FIELD })).toHaveValue(
    new RegExp(`^\\*+${tail}$`)
  );
}

async function clearVault(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Storage.clearDataForOrigin', {
    origin: new URL(page.url()).origin,
    storageTypes: 'indexeddb',
  });
}

// Chromium's databases() listing can stall for a while after a forced deletion, so a listing that
// does not answer in time reads as the database still being there and the poll asks again.
function vaultExists(page: Page) {
  return page.evaluate(
    ([name, budgetMs]) =>
      Promise.race([
        indexedDB.databases().then((all) => all.some((database) => database.name === name)),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(true), budgetMs)),
      ]),
    [VAULT_DATABASE, LISTING_BUDGET_MS] as const
  );
}

test('an API key saves after the browser closes the secure-storage connection', async ({
  page,
}) => {
  await stubAiEndpoints(page);
  await openDrawingScreen(page);
  const section = await openAiSettings(page);
  await submitAiKey(section, FIRST_KEY);
  await expectSavedKey(section, FIRST_KEY);
  await section.getByRole('button', { name: 'Forget' }).click();
  await expect(section.getByRole('textbox', { name: KEY_FIELD })).toBeVisible();
  await expect.poll(() => vaultExists(page)).toBe(true);

  await clearVault(page);
  await expect.poll(() => vaultExists(page)).toBe(false);
  await submitAiKey(section, KEY_AFTER_CLOSE);

  await expectSavedKey(section, KEY_AFTER_CLOSE);
});

test('a replacement API key saved after the database is deleted survives a reload', async ({
  page,
}) => {
  await stubAiEndpoints(page);
  await openDrawingScreen(page);
  const section = await openAiSettings(page);
  await submitAiKey(section, KEY_BEFORE_DELETION);
  await expectSavedKey(section, KEY_BEFORE_DELETION);
  await section.getByRole('button', { name: 'Forget' }).click();
  await expect(section.getByRole('textbox', { name: KEY_FIELD })).toBeVisible();

  await clearVault(page);
  await submitAiKey(section, KEY_AFTER_DELETION);
  await expectSavedKey(section, KEY_AFTER_DELETION);

  await page.reload();
  await expectSavedKey(await openAiSettings(page), KEY_AFTER_DELETION);
});

// A save that has already read its key and is encrypting when the database is deleted must not
// resume into the recreated database: another tab may have created a fresh key there, and
// ciphertext under the old key would replace that tab's readable credential with one nothing can
// decrypt.
test('a save paused across a deletion and another tab save fails instead of overwriting', async ({
  page,
  context,
}) => {
  await stubAiEndpoints(page);
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
  await openDrawingScreen(page);
  const section = await openAiSettings(page);
  await submitAiKey(section, KEY_BEFORE_DELETION);
  await expectSavedKey(section, KEY_BEFORE_DELETION);
  await section.getByRole('button', { name: 'Forget' }).click();
  await expect(section.getByRole('textbox', { name: KEY_FIELD })).toBeVisible();

  await page.evaluate(
    (holdAttribute) => document.documentElement.setAttribute(holdAttribute, ''),
    HOLD_ENCRYPTION_ATTRIBUTE
  );
  await submitAiKey(section, HELD_KEY);
  await expect(page.locator(`html[${ENCRYPTION_HELD_ATTRIBUTE}]`)).toBeAttached();

  await clearVault(page);
  const otherTab = await context.newPage();
  await stubAiEndpoints(otherTab);
  await openDrawingScreen(otherTab);
  const otherSection = await openAiSettings(otherTab);
  await submitAiKey(otherSection, OTHER_TAB_KEY);
  await expectSavedKey(otherSection, OTHER_TAB_KEY);

  await page.evaluate(
    (holdAttribute) => document.documentElement.removeAttribute(holdAttribute),
    HOLD_ENCRYPTION_ATTRIBUTE
  );
  await expect(section.getByText(SAVE_FAILED)).toBeVisible();

  await otherTab.reload();
  await expectSavedKey(await openAiSettings(otherTab), OTHER_TAB_KEY);
});
