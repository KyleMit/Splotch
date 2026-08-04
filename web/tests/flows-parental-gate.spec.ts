import { expect, test, type Page } from '@playwright/test';
import { gotoApp, openParentalGate, openSettingsModal, solveParentalGate } from './helpers';

// The Grown-Ups Only gate (ParentalGate.svelte + state/parentalGate.svelte.ts):
// the Settings gear opens a multiplication challenge instead of Settings, and
// only a correct answer opens the grown-ups area. Every other spec seeds a
// stored unlock through gotoApp's default, so this file is the one place the
// real flow runs — each test here navigates with `gateUnlocked: false`.

async function gotoGatedApp(page: Page) {
  await gotoApp(page, '/', { gateUnlocked: false });
}

// Read the current challenge from the equation row's accessible label.
async function readChallenge(page: Page): Promise<{ x: number; y: number }> {
  const label = await page.locator('.gate-equation').getAttribute('aria-label');
  const [x, y] = label!.match(/\d+/g)!.map(Number);
  return { x, y };
}

test('the Settings gear is gated; solving the problem opens Settings', async ({ page }) => {
  await gotoGatedApp(page);

  const gate = await openParentalGate(page);
  await expect(page.locator('#settingsModal')).not.toBeVisible();

  await solveParentalGate(page);

  // The success card shows, then Settings opens after the hold.
  await expect(gate.getByText('Unlocked!')).toBeVisible();
  await expect(page.locator('#settingsModal')).toBeVisible({ timeout: 5000 });
  await expect(gate).not.toBeVisible();
});

test('a wrong answer clears the input, shows the error, and regenerates the problem', async ({
  page,
}) => {
  await gotoGatedApp(page);
  const gate = await openParentalGate(page);

  const { x, y } = await readChallenge(page);
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
  await expect(page.locator('#settingsModal')).not.toBeVisible();

  // The regenerated problem is still solvable.
  await solveParentalGate(page);
  await expect(page.locator('#settingsModal')).toBeVisible({ timeout: 5000 });
});

test('closing the gate discards the attempt without unlocking', async ({ page }) => {
  await gotoGatedApp(page);
  const gate = await openParentalGate(page);

  await page.locator('.gate-keypad').getByRole('button', { name: '5', exact: true }).click();
  await gate.getByRole('button', { name: 'Close' }).click();
  await expect(gate).not.toBeVisible();
  await expect(page.locator('#settingsModal')).not.toBeVisible();

  // Reopening asks again, with a fresh empty input.
  await openParentalGate(page);
  await expect(gate.locator('.gate-dab.filled')).toHaveCount(0);
});

test('"skip for this session" stops re-asking until the app reopens', async ({ page }) => {
  await gotoGatedApp(page);
  const gate = await openParentalGate(page);

  // The native radio is visually hidden; the label row is the tap target.
  await gate.getByText('Skip for this session', { exact: true }).click();
  await expect(gate.getByRole('radio', { name: /Skip for this session/ })).toBeChecked();
  await solveParentalGate(page);
  const settings = page.locator('#settingsModal');
  await expect(settings).toBeVisible({ timeout: 5000 });
  await settings.getByRole('button', { name: 'Close' }).click();
  await expect(settings).not.toBeVisible();

  // Same session: the gear goes straight to Settings.
  await openSettingsModal(page);

  // A relaunch (reload) clears the in-memory session unlock and asks again.
  await gotoGatedApp(page);
  await openParentalGate(page);
});

test('"don\'t ask again" survives a relaunch until Settings resets it', async ({ page }) => {
  await gotoGatedApp(page);
  const gate = await openParentalGate(page);

  // The native radio is visually hidden; the label row is the tap target.
  await gate.getByText("Don't ask again", { exact: true }).click();
  await expect(gate.getByRole('radio', { name: /Don't ask again/ })).toBeChecked();
  await solveParentalGate(page);
  await expect(page.locator('#settingsModal')).toBeVisible({ timeout: 5000 });

  // Relaunch: the stored unlock skips the gate entirely.
  await gotoGatedApp(page);
  const settings = await openSettingsModal(page);

  // The Grown-ups check toggle in Controls & Buttons clears the stored unlock.
  await settings.getByRole('button', { name: 'Controls & Buttons' }).click();
  const toggle = page.locator('#parentalGateToggle');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await settings.getByRole('button', { name: 'Close' }).click();

  // The gear is gated again.
  await openParentalGate(page);
});
