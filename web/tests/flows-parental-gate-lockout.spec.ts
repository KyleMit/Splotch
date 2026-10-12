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
// ignores even a right answer, and a card that stays the same size throughout.

const AI_PROMPT = 'dialog.ai-prompt-modal';
const ELAPSED_BEFORE_REOPEN_MS = 25_000;
// The shortest landscape phone the compact card is tuned for, below every
// page-inventory size.
const SHORT_LANDSCAPE_PHONE = { width: 568, height: 320 };
// The landscape phones the page-inventory critique found the card cropped at
// (issue #1522). Transcribed rather than imported, since the inventory is an
// untyped .mjs; tools/tests/page-inventory-spec-viewports.test.mjs holds each
// literal to the inventory id in its trailing comment.
const SMALL_IPHONE_LANDSCAPE = { width: 812, height: 375 }; // iphone-13-mini-landscape
const LARGE_IPHONE_LANDSCAPE = { width: 956, height: 440 }; // iphone-16-pro-max-landscape

async function checkEmptyAnswer(page: Page) {
  await page.locator('.gate-keypad').getByRole('button', { name: 'Check answer' }).click();
  await expect(page.locator('.gate-content.shaking')).toHaveCount(0);
}

async function lockOut(page: Page) {
  for (let i = 0; i < GATE_WRONG_ANSWERS_BEFORE_LOCKOUT; i++) await checkEmptyAnswer(page);
}

// The dialog opens with focus on its first control, the close button. An answer
// typed from there must still be checked by Enter rather than closed away: the
// check key replaced auto-submit, so Enter is how a keyboard answers.
test('an answer typed on a freshly opened card is checked by Enter, not closed', async ({
  page,
}) => {
  await seedAiEnabled(page);
  await gotoApp(page, '/?ai_access_token=test-token', { gates: 'always' });
  await openParentalGate(page);

  const label = await page.locator('.gate-equation').getAttribute('aria-label');
  const [x, y] = label!.match(/\d+/g)!.map(Number);
  for (const key of [...String(x * y), 'Enter']) await page.keyboard.press(key);

  await expect(page.locator(AI_PROMPT)).toBeVisible({ timeout: 5000 });
});

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

// On a landscape phone the whole card shares the screen: every key, the
// equation, the feedback a wrong answer produces, and the manage footer. A
// parent who answers wrongly sees why without scrolling, and no key sits past
// the viewport edge where a tap cannot reach it.
for (const [label, viewport] of [
  ['a short landscape phone', SHORT_LANDSCAPE_PHONE],
  ['a small iPhone in landscape', SMALL_IPHONE_LANDSCAPE],
  ['a large iPhone in landscape', LARGE_IPHONE_LANDSCAPE],
] as const) {
  test(`${label} holds the whole card on screen`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seedAiEnabled(page);
    await gotoApp(page, '/?ai_access_token=test-token', { gates: 'always' });
    const gate = await openParentalGate(page);

    await checkEmptyAnswer(page);

    const keys = await gate.locator('.gate-keypad button').all();
    expect(keys).toHaveLength(12);
    for (const part of [
      ...keys,
      gate.locator('.gate-header'),
      gate.locator('.gate-equation'),
      gate.locator('.gate-error'),
      gate.locator('.gate-manage'),
    ]) {
      await expect(part).toBeInViewport({ ratio: 1 });
    }
    await expect(gate.locator('.gate-error')).not.toHaveText('');
  });
}
