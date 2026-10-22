import { expect, test } from '../api-fixtures.ts';
import { openSettings, startAiGeneration } from '../support/group-a.ts';
import type { Page } from '@playwright/test';
import { waitForHydration } from '../support/group-b.ts';

test('the lane refuses page and context request interception', async ({ page, context }) => {
  expect(() => page.route('**/api/**', (route) => route.fulfill({ status: 200 }))).toThrow(
    'forbids request stubs'
  );
  expect(() => context.route('**/api/**', (route) => route.fulfill({ status: 200 }))).toThrow(
    'forbids request stubs'
  );
});

async function enablePictures(page: Page, key?: string) {
  const settings = await openSettings(page);
  await settings.getByRole('switch', { name: 'Create AI Images' }).click();
  await expect(settings.getByText('10 free AI creations left.', { exact: true })).toBeVisible();
  if (key) {
    await settings.getByRole('textbox', { name: 'OpenAI API Key', exact: true }).fill(key);
    await settings.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      settings.getByText('Your key works and has been accepted!', { exact: true })
    ).toBeVisible();
  }
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
}

test('a fresh installation generates through the worker and polls, then reports its picture', async ({
  drawingScreen,
  apiEnvironment,
}, testInfo) => {
  const { page } = drawingScreen;
  const responses: { path: string; status: number }[] = [];
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith('/api/')) responses.push({ path, status: response.status() });
  });
  await enablePictures(page);
  const { result } = await startAiGeneration(drawingScreen);
  await expect(result.getByRole('img', { name: 'Your AI picture' })).toBeVisible();
  await expect(result.getByRole('status')).toHaveText('Your picture is ready');
  await testInfo.attach('real-handler-result', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  expect(responses).toContainEqual({ path: '/api/generate-image', status: 202 });
  expect(responses).toContainEqual({ path: '/api/generation-result', status: 200 });
  await result.getByRole('button', { name: 'Report this picture' }).click();
  await page
    .getByRole('dialog', { name: 'Report this picture', exact: true })
    .getByRole('button', { name: 'Send report' })
    .click();
  await expect(page.getByText(/Keep this report reference/)).toBeVisible();
  await expect
    .poll(() => apiEnvironment.issues())
    .toEqual([expect.objectContaining({ title: '[AI image] Reported Magical picture' })]);
  expect((await apiEnvironment.storeNames()).every((name) => name.startsWith('test-'))).toBe(true);
  await page.reload();
  const settings = await openSettings(page);
  await expect(settings.getByText('9 free AI creations left.', { exact: true })).toBeVisible();
});

test('feedback reaches the recording sink through the real form handler', async ({
  page,
  apiEnvironment,
}) => {
  await page.goto('/feedback');
  const message = page.getByRole('textbox', { name: 'What went wrong?' });
  await waitForHydration(message);
  await message.fill('The integration drawing needs more glitter');
  await page.getByRole('button', { name: 'Send report', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Thank you — your report is in.' })).toBeVisible();
  await expect
    .poll(() => apiEnvironment.issues())
    .toEqual([
      expect.objectContaining({ title: '[Bug] The integration drawing needs more glitter' }),
    ]);
});

test('the real key oracle rejects an invalid key without storing it', async ({ drawingScreen }) => {
  const { page } = drawingScreen;
  const settings = await openSettings(page);
  await settings.getByRole('switch', { name: 'Create AI Images' }).click();
  await settings
    .getByRole('textbox', { name: 'OpenAI API Key', exact: true })
    .fill('sk-test-invalid-key');
  const checked = page.waitForResponse('**/api/verify-key');
  await settings.getByRole('button', { name: 'Save', exact: true }).click();
  const response = await checked;
  expect(response.status()).toBe(200);
  expect(response.headers()['x-robots-tag']).toBe('noindex');
  await expect(
    settings.getByText('That key could not authenticate with OpenAI.', { exact: true })
  ).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Forget', exact: true })).toBeHidden();
});

test('a content refusal travels through polling and can be reported with its real proof', async ({
  drawingScreen,
  apiEnvironment,
}) => {
  const { page } = drawingScreen;
  await enablePictures(page, 'sk-test-refusal');
  const refused = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/generation-result' && response.status() === 422
  );
  const { result } = await startAiGeneration(drawingScreen);
  const response = await refused;
  expect(response.headers()['x-report-token']).toBeTruthy();
  await expect(
    result.getByText("That picture didn't work — try drawing something different!", { exact: true })
  ).toBeVisible();
  await expect(result.getByRole('img', { name: 'Your AI picture' })).toBeHidden();
  await result.getByRole('button', { name: 'Report this refusal', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Report this refusal', exact: true })
    .getByRole('button', { name: 'Send report', exact: true })
    .click();
  await expect(page.getByText(/Keep this report reference/)).toBeVisible();
  await expect
    .poll(() => apiEnvironment.issues())
    .toEqual([expect.objectContaining({ title: expect.stringContaining('refusal') })]);
});

test('a fake provider failure reaches the UI through the background result handler', async ({
  drawingScreen,
}) => {
  const { page } = drawingScreen;
  await enablePictures(page, 'sk-test-error');
  const failed = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/generation-result' && response.status() === 502
  );
  const { result } = await startAiGeneration(drawingScreen);
  expect((await failed).headers()['x-robots-tag']).toBe('noindex');
  await expect(
    result.getByRole('heading', { name: "Hmm, that didn't work", exact: true })
  ).toBeVisible();
  await expect(result.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
});
