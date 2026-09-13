import { expect, test, type Page } from '@playwright/test';
import { gotoApp, seedAiEnabled } from './helpers';
import { openParentalGate, solveParentalGate } from './flows-harness';

// Random tapping must not tap through the Grown-Ups Only gate (ADR-0094's
// mash-resistance amendment). The rules and their odds are unit-tested beside
// the state module; this pins what a grown-up meets in the real card: the
// check key, the lockout message, a keypad that ignores even a right answer,
// and a card that stays the same size throughout (issue #1522 is already about
// this dialog overflowing a landscape phone).

const AI_PROMPT = 'dialog.ai-prompt-modal';
// The spec runner cannot compile the runes state module, so these restate
// GATE_WRONG_ANSWERS_BEFORE_LOCKOUT and GATE_LOCKOUT_BASE_MS.
const WRONG_ANSWERS_BEFORE_LOCKOUT = 3;
const LOCKOUT_MS = 30_000;
const LOCKOUT_MESSAGE = 'Too many tries — try again in 30 seconds';

async function checkEmptyAnswer(page: Page) {
  await page.locator('.gate-keypad').getByRole('button', { name: 'Check answer' }).click();
  await expect(page.locator('.gate-content.shaking')).toHaveCount(0);
}

test('repeated wrong answers pause the keypad until the lockout ends', async ({ page }) => {
  await page.clock.install();
  await seedAiEnabled(page);
  await gotoApp(page, '/?ai_access_token=test-token', { gates: 'always' });
  const gate = await openParentalGate(page);
  const cardHeight = (await gate.boundingBox())!.height;

  for (let i = 0; i < WRONG_ANSWERS_BEFORE_LOCKOUT; i++) await checkEmptyAnswer(page);

  await expect(gate.getByText(LOCKOUT_MESSAGE)).toBeVisible();
  await expect(gate.getByRole('button', { name: 'Check answer' })).toHaveAttribute(
    'aria-disabled',
    'true'
  );
  expect((await gate.boundingBox())!.height).toBe(cardHeight);

  const label = await page.locator('.gate-equation').getAttribute('aria-label');
  const [x, y] = label!.match(/\d+/g)!.map(Number);
  for (const name of [...String(x * y), 'Check answer']) {
    await gate.getByRole('button', { name, exact: true }).click({ force: true });
  }
  await expect(page.locator('.gate-dab.filled')).toHaveCount(0);
  await expect(page.locator(AI_PROMPT)).not.toBeVisible();

  await page.clock.fastForward(LOCKOUT_MS);
  await expect(gate.getByText(LOCKOUT_MESSAGE)).not.toBeVisible();
  await solveParentalGate(page);
  await expect(page.locator(AI_PROMPT)).toBeVisible({ timeout: 5000 });
});
