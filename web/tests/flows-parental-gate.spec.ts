import { expect, test, type Page } from '@playwright/test';
import { draw, gotoApp, openSettingsModal } from './helpers';
import { openParentalGate, solveParentalGate } from './flows-harness';
import { STORAGE_KEYS } from '../src/lib/storageKeys';

// The Grown-Ups Only gate (ParentalGate.svelte + state/parentalGate.svelte.ts)
// sits at operation boundaries, never in front of Settings itself (ADR-0094).
// Parent Center persists an independent Every time / Per session / Never policy
// for each protected feature. Every other spec seeds Never through gotoApp's
// default, so this file is the one
// place the real flow runs — gate tests navigate with `gateUnlocked: false`.

const AI_PROMPT = 'dialog.ai-prompt-modal';

// A couple of strokes so the AI button is enabled (it's disabled on a blank
// canvas), then the gate opens from it. The access-code param reveals the AI
// button (it stays hidden with no credential).
async function gotoGatedAiButton(page: Page) {
  await gotoApp(page, '/?ai_access_token=test-token', { gateUnlocked: false });
  await draw(page, [
    { x: 120, y: 120 },
    { x: 260, y: 200 },
  ]);
}

test('Settings opens directly — entry is not the gate (ADR-0094)', async ({ page }) => {
  await gotoApp(page, '/', { gateUnlocked: false });
  await openSettingsModal(page);
  await expect(page.locator('#parentalGate')).not.toBeVisible();
});

test('the AI button is gated; solving opens the AI prompt', async ({ page }) => {
  await gotoGatedAiButton(page);

  const gate = await openParentalGate(page);
  await expect(page.locator(AI_PROMPT)).not.toBeVisible();

  await solveParentalGate(page);

  // The success card shows, then the AI prompt opens after the hold.
  await expect(gate.getByText('Unlocked!')).toBeVisible();
  await expect(page.locator(AI_PROMPT)).toBeVisible({ timeout: 5000 });
  await expect(gate).not.toBeVisible();
});

test('the success card cannot be dismissed away from its destination', async ({ page }) => {
  await gotoGatedAiButton(page);
  const gate = await openParentalGate(page);
  await solveParentalGate(page);
  await expect(gate.getByText('Unlocked!')).toBeVisible();

  // A backdrop tap and Esc during the success hold must not cancel the
  // captured destination (review finding: dismissGate cleared the timer).
  await page.mouse.click(10, 10);
  await page.keyboard.press('Escape');

  await expect(page.locator(AI_PROMPT)).toBeVisible({ timeout: 5000 });
});

test('a wrong answer clears the input, shows the error, and regenerates the problem', async ({
  page,
}) => {
  await gotoGatedAiButton(page);
  const gate = await openParentalGate(page);

  const label = await page.locator('.gate-equation').getAttribute('aria-label');
  const [x, y] = label!.match(/\d+/g)!.map(Number);
  // Same digit count as the real answer, guaranteed wrong: no product of two
  // operands in [3, 9] is all nines.
  const answer = String(x * y);
  const wrong = answer === '9' ? '8' : '9'.repeat(answer.length);
  for (const digit of wrong) {
    await page.locator('.gate-keypad').getByRole('button', { name: digit, exact: true }).click();
  }

  await expect(gate.getByText('Not quite — try this one')).toBeVisible();
  // The typed digits were discarded along with the old problem.
  await expect(gate.locator('.gate-dab.filled')).toHaveCount(0);
  await expect(page.locator(AI_PROMPT)).not.toBeVisible();

  // The regenerated problem is still solvable.
  await solveParentalGate(page);
  await expect(page.locator(AI_PROMPT)).toBeVisible({ timeout: 5000 });
});

test('closing the gate discards the attempt without unlocking', async ({ page }) => {
  await gotoGatedAiButton(page);
  const gate = await openParentalGate(page);

  await page.locator('.gate-keypad').getByRole('button', { name: '5', exact: true }).click();
  await gate.getByRole('button', { name: 'Close' }).click();
  await expect(gate).not.toBeVisible();
  await expect(page.locator(AI_PROMPT)).not.toBeVisible();

  // Reopening asks again, with a fresh empty input.
  await openParentalGate(page);
  await expect(gate.locator('.gate-dab.filled')).toHaveCount(0);
});

test('Parent Center is gated before its controls appear and persists every feature policy', async ({
  page,
}) => {
  await gotoApp(page, '/', { gateUnlocked: false });
  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'Parent Center' }).click();

  const gate = page.locator('#parentalGate');
  await expect(gate).toBeVisible();
  await expect(settings.getByText(/Parental gates keep actions/)).not.toBeVisible();
  await solveParentalGate(page);
  await expect(settings.getByText(/Parental gates keep actions/)).toBeVisible({ timeout: 5000 });

  const features = [
    'Generating an AI image',
    'Viewing external links',
    'Sending feedback',
    'Opening Parent Center',
  ];
  for (const feature of features) {
    await expect(
      settings.getByRole('radiogroup', { name: `${feature} parental gate frequency` })
    ).toBeVisible();
  }

  await settings
    .getByRole('radiogroup', { name: 'Generating an AI image parental gate frequency' })
    .getByRole('radio', { name: 'Per session' })
    .click();
  await settings
    .getByRole('radiogroup', { name: 'Viewing external links parental gate frequency' })
    .getByRole('radio', { name: 'Never' })
    .click();
  await settings
    .getByRole('radiogroup', { name: 'Opening Parent Center parental gate frequency' })
    .getByRole('radio', { name: 'Never' })
    .click();

  await settings.getByRole('button', { name: 'Close' }).click();
  await page.reload();
  await expect(page.locator('#drawingCanvas')).toBeVisible();
  const reopened = await openSettingsModal(page);
  await reopened.getByRole('button', { name: 'Parent Center' }).click();
  await expect(gate).not.toBeVisible();
  await expect(
    reopened
      .getByRole('radiogroup', { name: 'Generating an AI image parental gate frequency' })
      .getByRole('radio', { name: 'Per session' })
  ).toHaveAttribute('aria-checked', 'true');
  await expect(
    reopened
      .getByRole('radiogroup', { name: 'Viewing external links parental gate frequency' })
      .getByRole('radio', { name: 'Never' })
  ).toHaveAttribute('aria-checked', 'true');
});

test('Per session asks once for AI and asks again after a relaunch', async ({ page }) => {
  await page.addInitScript(
    ([aiKey]) => localStorage.setItem(aiKey, 'session'),
    [STORAGE_KEYS.parentalGateAiImageMode]
  );
  await gotoGatedAiButton(page);
  await openParentalGate(page);
  await solveParentalGate(page);

  const prompt = page.locator(AI_PROMPT);
  await expect(prompt).toBeVisible({ timeout: 5000 });
  await prompt.getByRole('button', { name: 'Close' }).click();
  await page.locator('#aiImageButton').click();
  await expect(prompt).toBeVisible();
  await expect(page.locator('#parentalGate')).not.toBeVisible();

  await gotoGatedAiButton(page);
  await openParentalGate(page);
});

test('external links inside Settings follow the Every time policy', async ({ page, context }) => {
  // Serve the link-out locally so the popup never reaches the real network.
  await context.route('https://github.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html>stub</html>' })
  );

  await gotoApp(page, '/', { gateUnlocked: false });
  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'About' }).click();

  await page.getByRole('link', { name: 'View source on GitHub' }).click();
  const gate = page.locator('#parentalGate');
  await expect(gate).toBeVisible();
  const popup = context.waitForEvent('page');
  await solveParentalGate(page);
  const popupPage = await popup;
  await expect.poll(() => popupPage.url()).toContain('github.com/KyleMit/Splotch');
  await expect(gate).not.toBeVisible();
});

test('sending feedback waits for its parental gate before posting', async ({ page }) => {
  let reportRequests = 0;
  await page.route('**/api/report', async (route) => {
    reportRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });
  await gotoApp(page, '/', { gateUnlocked: false });
  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'Feedback' }).click();
  await page.locator('#reportMessage').fill('The purple crayon draws green');
  await page.getByRole('button', { name: 'Send report' }).click();

  const gate = page.locator('#parentalGate');
  await expect(gate).toBeVisible();
  expect(reportRequests).toBe(0);
  await solveParentalGate(page);
  await expect(page.getByText('Thanks! Your report was sent.')).toBeVisible({ timeout: 5000 });
  expect(reportRequests).toBe(1);
});
