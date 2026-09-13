import { expect, test, type Page } from '@playwright/test';
import { gotoApp, seedAiEnabled } from './helpers';
import { openParentalGate, solveParentalGate } from './flows-harness';
import {
  gateLockoutMessage,
  GATE_LOCKOUT_BASE_MS,
  GATE_WRONG_ANSWERS_BEFORE_LOCKOUT,
} from '../src/lib/state/parentalGateLockout';

// Random tapping must not tap through the Grown-Ups Only gate (ADR-0094's
// mash-resistance amendment). The rules and their odds are unit-tested beside
// the state module; this pins what a grown-up meets in the real card: the
// check key, a countdown that tells the truth after a reopen, a keypad that
// ignores even a right answer, and a card that stays the same size throughout
// (issue #1522 is already about this dialog overflowing a landscape phone).

const AI_PROMPT = 'dialog.ai-prompt-modal';
const ELAPSED_BEFORE_REOPEN_MS = 25_000;
const LANDSCAPE_PHONE = { width: 568, height: 320 };

async function checkEmptyAnswer(page: Page) {
  await page.locator('.gate-keypad').getByRole('button', { name: 'Check answer' }).click();
  await expect(page.locator('.gate-content.shaking')).toHaveCount(0);
}

async function lockOut(page: Page) {
  for (let i = 0; i < GATE_WRONG_ANSWERS_BEFORE_LOCKOUT; i++) await checkEmptyAnswer(page);
}

test('repeated wrong answers pause the keypad until the lockout ends', async ({ page }) => {
  await page.clock.install();
  await seedAiEnabled(page);
  await gotoApp(page, '/?ai_access_token=test-token', { gates: 'always' });
  const gate = await openParentalGate(page);
  const cardHeight = (await gate.boundingBox())!.height;
  const message = gate.locator('.gate-error');

  await lockOut(page);

  await expect(message).toHaveText(gateLockoutMessage(GATE_LOCKOUT_BASE_MS));
  await expect(gate.getByRole('status')).toHaveText(gateLockoutMessage(GATE_LOCKOUT_BASE_MS));
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

  await page.clock.fastForward(GATE_LOCKOUT_BASE_MS);
  await expect(message).toHaveText('');
  await solveParentalGate(page);
  await expect(page.locator(AI_PROMPT)).toBeVisible({ timeout: 5000 });
});

test('a reopened card counts down from the time actually left', async ({ page }) => {
  await page.clock.install();
  await seedAiEnabled(page);
  await gotoApp(page, '/?ai_access_token=test-token', { gates: 'always' });
  const gate = await openParentalGate(page);
  await lockOut(page);

  await gate.getByRole('button', { name: 'Close' }).click();
  await expect(gate).not.toBeVisible();
  await page.clock.fastForward(ELAPSED_BEFORE_REOPEN_MS);
  await openParentalGate(page);

  // The clock keeps running while the card flies back in, so any of the last
  // few seconds is the truth; the full pause it started with is not.
  const remainingSeconds = (GATE_LOCKOUT_BASE_MS - ELAPSED_BEFORE_REOPEN_MS) / 1000;
  const truthful = Array.from({ length: remainingSeconds }, (_, i) =>
    gateLockoutMessage((i + 1) * 1000)
  );
  const message = gate.locator('.gate-error');
  await expect(message).not.toHaveText('');
  expect(truthful).toContain(await message.textContent());
});

// On a landscape phone the check key and the feedback it produces must share
// the screen: a parent who answers wrongly sees why without scrolling.
test('a landscape phone shows the check key and its feedback together', async ({ page }) => {
  await page.setViewportSize(LANDSCAPE_PHONE);
  await seedAiEnabled(page);
  await gotoApp(page, '/?ai_access_token=test-token', { gates: 'always' });
  const gate = await openParentalGate(page);

  await checkEmptyAnswer(page);

  for (const part of [
    gate.getByRole('button', { name: 'Check answer' }),
    gate.locator('.gate-equation'),
    gate.locator('.gate-error'),
  ]) {
    await expect(part).toBeInViewport({ ratio: 1 });
  }
  await expect(gate.locator('.gate-error')).not.toHaveText('');
});
