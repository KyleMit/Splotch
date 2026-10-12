import { expect, test, type Page } from '@playwright/test';
import {
  AI_FAILED_ANNOUNCEMENT,
  AI_LOADING_TITLE,
  AI_READY_ANNOUNCEMENT,
} from '../src/lib/ai/loadingCopy';
import { openAiResult, prepareAiGeneration } from './ai-harness';
import { openDrawer } from './flows-harness';
import { retryOpen } from './helpers';

// What a screen reader gets from the AI Result: the dial and the reveal are
// silent, so a visually hidden status says each state in words, and focus has
// somewhere to land when the card closes. The card's presentation lives in
// ai-result.spec.ts.

const RESULT = 'dialog.ai-result-modal';

function resultStatus(page: Page) {
  return page.locator(`${RESULT} > [role="status"]`);
}

async function closeRevealedResult(page: Page) {
  await expect(page.locator('.stage-img.result.shown')).toBeVisible({ timeout: 10_000 });
  await page.locator(RESULT).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator(RESULT)).not.toBeVisible();
}

test('the status announces the picture being made, then that it is ready', async ({ page }) => {
  const endpoint = await openAiResult(page);
  await expect(resultStatus(page)).toHaveText(AI_LOADING_TITLE);

  await endpoint.succeed();
  await expect(resultStatus(page)).toHaveText(AI_READY_ANNOUNCEMENT, { timeout: 10_000 });
});

test('the status announces a failed picture', async ({ page }) => {
  const endpoint = await openAiResult(page);
  await expect(resultStatus(page)).toHaveText(AI_LOADING_TITLE);

  await endpoint.fail(500);
  await expect(resultStatus(page)).toHaveText(AI_FAILED_ANNOUNCEMENT);
});

// The result opens from a style button in the AI Style Prompt, which closes as
// the result opens, so the dialog's own focus restore has nowhere to go.
test('closing the result returns focus to the AI button', async ({ page }) => {
  const endpoint = await prepareAiGeneration(page);
  await openDrawer(page);
  const prompt = page.locator('dialog.ai-prompt-modal');
  await retryOpen(prompt, () => page.locator('#aiImageButton').click({ timeout: 3000 }));
  await prompt.getByRole('button', { name: 'Magical' }).click();
  await expect(page.locator(RESULT)).toBeVisible();
  await endpoint.succeed();

  await closeRevealedResult(page);
  await expect(page.locator('#aiImageButton')).toBeFocused();
});

test('closing the result with the drawer folded focuses the drawer toggle', async ({ page }) => {
  const endpoint = await openAiResult(page);
  await endpoint.succeed();

  await closeRevealedResult(page);
  await expect(page.locator('#drawerToggle')).toBeFocused();
});
