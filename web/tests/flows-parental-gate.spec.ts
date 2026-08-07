import { expect, test, type Page } from '@playwright/test';
import { draw, gotoApp, openSettingsModal } from './helpers';
import { openDrawer, openParentalGate, solveParentalGate } from './flows-harness';

// The Grown-Ups Only gate (ParentalGate.svelte + state/parentalGate.svelte.ts)
// sits at operation boundaries, never in front of Settings itself (ADR-0094):
// the AI button gates with the remember preference honored, and external
// link-outs inside Settings gate non-bypassably (force). Every other spec
// seeds a stored unlock through gotoApp's default, so this file is the one
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

test('"skip for this session" stops re-asking until the app reopens', async ({ page }) => {
  await gotoGatedAiButton(page);
  const gate = await openParentalGate(page);

  // The native radio is visually hidden; the label row is the tap target.
  await gate.getByText('Skip for this session', { exact: true }).click();
  await expect(gate.getByRole('radio', { name: /Skip for this session/ })).toBeChecked();
  await solveParentalGate(page);
  const prompt = page.locator(AI_PROMPT);
  await expect(prompt).toBeVisible({ timeout: 5000 });
  await prompt.getByRole('button', { name: 'Close' }).click();
  await expect(prompt).not.toBeVisible();

  // Same session: the AI button goes straight to the prompt.
  await page.locator('#aiImageButton').click();
  await expect(prompt).toBeVisible();
  await expect(page.locator('#parentalGate')).not.toBeVisible();

  // A relaunch (reload) clears the in-memory session unlock and asks again.
  await gotoGatedAiButton(page);
  await openParentalGate(page);
});

test('"don\'t ask again" survives a relaunch until Settings resets it', async ({ page }) => {
  await gotoGatedAiButton(page);
  const gate = await openParentalGate(page);

  // The native radio is visually hidden; the label row is the tap target.
  await gate.getByText("Don't ask again", { exact: true }).click();
  await expect(gate.getByRole('radio', { name: /Don't ask again/ })).toBeChecked();
  await solveParentalGate(page);
  await expect(page.locator(AI_PROMPT)).toBeVisible({ timeout: 5000 });

  // Relaunch: the stored unlock skips the gate entirely.
  await gotoGatedAiButton(page);
  await openDrawer(page);
  await page.locator('#aiImageButton').click();
  await expect(page.locator(AI_PROMPT)).toBeVisible();
  await page.locator(AI_PROMPT).getByRole('button', { name: 'Close' }).click();

  // The Grown-ups check toggle in Buttons clears the stored unlock.
  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'Buttons' }).click();
  const toggle = page.locator('#parentalGateToggle');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await settings.getByRole('button', { name: 'Close' }).click();

  // The AI button is gated again.
  await openParentalGate(page);
});

test('turning the gate check off is itself force-gated', async ({ page }) => {
  // Seeded unlock active — yet weakening the protection must still re-ask.
  await gotoApp(page);
  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'Buttons' }).click();

  const toggle = page.locator('#parentalGateToggle');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  // Seeded forever-unlock means the toggle starts off; turn it on first so
  // there's a protection to weaken.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  await toggle.click();
  const gate = page.locator('#parentalGate');
  await expect(gate).toBeVisible();
  // Forced attempts hide the remember preference — they never skip.
  await expect(gate.getByText('After I solve it')).not.toBeVisible();
  // The toggle hasn't flipped yet; only a solve applies it.
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  await solveParentalGate(page);
  await expect(gate).not.toBeVisible({ timeout: 5000 });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
});

test('external links inside Settings gate non-bypassably', async ({ page, context }) => {
  // Serve the link-out locally so the popup never reaches the real network.
  await context.route('https://github.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html>stub</html>' })
  );

  // Seeded forever-unlock (gotoApp default) — a link-out must still ask.
  await gotoApp(page);
  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'About' }).click();

  await page.getByRole('link', { name: 'View source on GitHub' }).click();
  const gate = page.locator('#parentalGate');
  await expect(gate).toBeVisible();
  await expect(gate.getByText('After I solve it')).not.toBeVisible();

  const popup = context.waitForEvent('page');
  await solveParentalGate(page);
  const popupPage = await popup;
  await expect.poll(() => popupPage.url()).toContain('github.com/KyleMit/Splotch');
  await expect(gate).not.toBeVisible();
});
