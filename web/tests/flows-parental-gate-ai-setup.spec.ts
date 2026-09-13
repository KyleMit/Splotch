import { expect, test, type Page } from '@playwright/test';
import { gotoApp, openSettingsModal, retryOpen, seedAiEnabled } from './helpers';
import { solveParentalGate } from './flows-harness';

// Switching AI pictures or one of its options on, and sending a key or access
// code to be checked, are the Turning on AI pictures check's operations
// (ADR-0094's 2026-09-13 amendment). Only the switch-on direction asks: turning
// something off narrows what can leave. The web build ships every check at
// Never, so each spec arms them with `gates: 'always'` — the store builds'
// default, where these checks are live.
async function openAiArtSection(page: Page, field: string) {
  await openSettingsModal(page);
  const entry = page.locator('.settings-nav').getByRole('button', { name: 'AI Art', exact: true });
  await expect(async () => {
    await entry.click({ timeout: 2000 });
    await expect(page.locator(field)).toBeInViewport({ timeout: 2000 });
  }).toPass({ timeout: 10_000 });
}

async function countRequests(page: Page, pattern: string, body: object) {
  const counter = { count: 0, bodies: [] as string[] };
  await page.route(pattern, async (route) => {
    counter.count += 1;
    counter.bodies.push(route.request().postData() ?? '');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  return counter;
}

test('turning AI pictures on waits for its check before the free count is asked for', async ({
  page,
}) => {
  const grantRequests = await countRequests(page, '**/api/free-generation-grant', {
    ok: true,
    remaining: 10,
  });
  await gotoApp(page, '/', { gates: 'always' });
  await openAiArtSection(page, '#aiImageToggle');

  const toggle = page.locator('#aiImageToggle');
  const gate = page.locator('#parentalGate');
  await retryOpen(gate, () => toggle.click({ timeout: 2000 }));
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#aiKeyInput')).toHaveCount(0);
  expect(grantRequests.count).toBe(0);

  await solveParentalGate(page);
  await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: 5000 });
  await expect.poll(() => grantRequests.count).toBeGreaterThan(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(gate).not.toBeVisible();
});

test('a key waits for the AI setup check before it is sent, from Enter or Save', async ({
  page,
}) => {
  const verifyRequests = await countRequests(page, '**/api/verify-key', { ok: true });
  await seedAiEnabled(page);
  await gotoApp(page, '/', { gates: 'always' });
  await openAiArtSection(page, '#aiKeyInput');

  const gate = page.locator('#parentalGate');
  const field = page.locator('#aiKeyInput');
  const save = page.getByRole('button', { name: 'Save' });

  // The check takes focus inside the Enter keydown that raised it, so the
  // solve below is also what proves that press never went on to activate the
  // card's Close button.
  await field.fill('sk-first-parent-key');
  await field.press('Enter');
  await expect(gate).toBeVisible();
  expect(verifyRequests.count).toBe(0);
  // The solve approves the credential the check was raised for: a value that
  // lands in the field underneath it — an autofill, say — is not what is sent.
  await field.evaluate((input: HTMLInputElement) => {
    input.value = 'sk-changed-behind-the-check';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await solveParentalGate(page);
  await expect(page.getByText('Your key works and has been accepted!')).toBeVisible({
    timeout: 5000,
  });
  expect(verifyRequests.bodies).toEqual([JSON.stringify({ apiKey: 'sk-first-parent-key' })]);

  await page.locator('#aiKeyActive').waitFor();
  await page.getByRole('button', { name: 'Forget' }).click();
  await field.fill('sk-second-parent-key');
  await retryOpen(gate, () => save.click({ timeout: 2000 }));
  await gate.getByRole('button', { name: 'Close' }).click();
  await expect(gate).not.toBeVisible();
  expect(verifyRequests.count).toBe(1);
  await expect(field).toHaveValue('sk-second-parent-key');
});

test('AI options switch on behind the AI setup check and off without one', async ({ page }) => {
  await seedAiEnabled(page);
  await gotoApp(page, '/', { gates: 'always' });
  await openAiArtSection(page, '#aiCustomizationToggle');

  const gate = page.locator('#parentalGate');
  const customization = page.locator('#aiCustomizationToggle');
  await expect(customization).toHaveAttribute('aria-checked', 'true');
  await customization.click();
  await expect(customization).toHaveAttribute('aria-checked', 'false');
  await expect(gate).not.toBeVisible();

  // From the keyboard too: the switch's own activation is spent before the
  // check opens, so neither key lands on the card that takes focus.
  const autoSave = page.locator('#autoSaveAiToggle');
  await autoSave.focus();
  await page.keyboard.press('Enter');
  await expect(gate).toBeVisible();
  await expect(autoSave).toHaveAttribute('aria-checked', 'false');
  await solveParentalGate(page);
  await expect(autoSave).toHaveAttribute('aria-checked', 'true', { timeout: 5000 });

  await customization.focus();
  await page.keyboard.press('Space');
  await expect(gate).toBeVisible();
  await expect(gate.locator('.gate-keypad')).toBeVisible();
  await expect(customization).toHaveAttribute('aria-checked', 'false');
  await solveParentalGate(page);
  await expect(customization).toHaveAttribute('aria-checked', 'true', { timeout: 5000 });
});
