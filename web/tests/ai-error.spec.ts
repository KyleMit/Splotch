import { expect, test } from '@playwright/test';
import { openAiResult, landedReportConfirm, invokeAiGeneration } from './ai-harness';
import { enforceProductionCsp, settleFlyIn } from './helpers';
import { solveParentalGate, settleTapGuard } from './flows-harness';
import { STORAGE_KEYS } from '../src/lib/storageKeys';

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 1032, height: 1376 },
    { width: 812, height: 375 },
  ]) {
    test(`${theme} ${viewport.width}: first and repeated failures fit and preserve the drawing`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      const endpoint = await openAiResult(page);
      await endpoint.fail();
      const card = page.locator('dialog.ai-result-modal');
      const retry = card.getByRole('button', { name: 'Try again', exact: true });
      await expect(retry).toBeVisible();
      const button = await retry.boundingBox();
      expect(button?.height).toBeGreaterThanOrEqual(56);
      await page.screenshot({ path: testInfo.outputPath('first.png') });
      await retry.click();
      await expect(page.locator('.ai-loading-caption')).toBeVisible();
      await endpoint.fail();
      await expect(card.getByRole('heading', { name: 'Still not working' })).toBeVisible();
      await expect(retry).toHaveCount(0);
      const report = page.getByRole('button', { name: 'Report a problem' });
      const reportBox = await report.boundingBox();
      expect(reportBox?.height).toBeGreaterThanOrEqual(44);
      expect((reportBox?.y ?? 0) + (reportBox?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
      await page.screenshot({ path: testInfo.outputPath('repeated.png') });
      await report.click();
      const confirm = await landedReportConfirm(page);
      await settleTapGuard(page);
      await expect(confirm).toContainText('2 in a row');
      await expect(confirm.locator('img')).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath('report.png') });
      await confirm.getByRole('button', { name: 'Cancel' }).click();
      await expect(report).toBeFocused();
      await card.getByRole('button', { name: 'Keep drawing', exact: true }).click();
      await expect(card).not.toBeVisible();
      await expect(page.locator('#drawingCanvas')).toBeVisible();
      await expect(card).not.toHaveAttribute('open');
      await settleTapGuard(page);
      await invokeAiGeneration(page);
      await endpoint.fail();
      await expect(retry).toBeVisible();
    });
  }
}

for (const device of [false, true]) {
  test(`sends only previewed diagnostics, device opt-in ${device}`, async ({ page }) => {
    if (!process.env.DEV_SERVER) await enforceProductionCsp(page);
    const endpoint = await openAiResult(page);
    await endpoint.fail(503);
    await page.getByRole('button', { name: 'Report a problem' }).click();
    const confirm = await landedReportConfirm(page);
    await settleTapGuard(page);
    const rows = await confirm.locator('.ai-report-diagnostics dl > div').allTextContents();
    await confirm.getByRole('checkbox', { name: 'Include device info' }).setChecked(device);
    const request = page.waitForRequest('**/api/report');
    await page.route('**/api/report', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    );
    await confirm.getByRole('button', { name: 'Send report' }).click();
    const sent = await request;
    const payload = sent.postDataJSON();
    expect(Object.keys(payload).sort()).toEqual(
      device ? ['device', 'kind', 'message'] : ['kind', 'message']
    );
    expect(payload.kind).toBe('bug');
    expect(payload.message.split('\n')).toEqual(rows.map((row) => row.trim()));
    expect(sent.headers()['x-access-token']).toBeUndefined();
    expect(sent.headers()['x-report-token']).toBeUndefined();
    await expect(
      page.getByText('Thanks. Your problem report was sent to our private support tracker.')
    ).toBeVisible();
  });
}

test('requires the configured parental gate before preview or send', async ({ page }) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, 'always'),
    STORAGE_KEYS.parentalGateImageReportMode
  );
  const endpoint = await openAiResult(page);
  await endpoint.fail();
  await page.getByRole('button', { name: 'Report a problem' }).click();
  const gate = page.locator('dialog.parental-gate');
  await expect(gate).toBeVisible();
  await settleFlyIn(gate);
  await expect(page.locator('dialog.ai-report-confirm')).not.toBeVisible();
  await solveParentalGate(page);
  await expect(await landedReportConfirm(page)).toContainText('What will be sent');
});

test('a rejected report offers another confirmation without losing the generation retry', async ({
  page,
}) => {
  await page.route('**/api/report', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"ok":false,"error":"Reporting unavailable"}',
    })
  );
  const endpoint = await openAiResult(page);
  await endpoint.fail();
  await page.getByRole('button', { name: 'Report a problem' }).click();
  const confirm = await landedReportConfirm(page);
  await settleTapGuard(page);
  await confirm.getByRole('button', { name: 'Send report' }).click();
  const reportRetry = page.getByRole('button', { name: 'Retry report' });
  await expect(reportRetry).toBeFocused();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(1);
  await expect(page.getByText('Reporting unavailable')).toBeVisible();
  await reportRetry.click();
  await landedReportConfirm(page);
  await settleTapGuard(page);
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('.ai-error-primary').click();
  await endpoint.succeed();
  await expect(page.locator('.stage-img.result.shown')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Report this picture' })).toBeVisible();
});

test('keeps the close control reachable after scrolling report feedback', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 812, height: 375 });
  await page.route('**/api/report', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"ok":false,"error":"Reporting unavailable"}',
    })
  );
  const endpoint = await openAiResult(page);
  await endpoint.fail();
  await page.getByRole('button', { name: 'Report a problem' }).click();
  const confirm = await landedReportConfirm(page);
  await settleTapGuard(page);
  await confirm.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText('Reporting unavailable')).toBeVisible();
  const scrolled = await page.locator('.ai-result-content').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    return el.scrollTop;
  });
  expect(scrolled).toBeGreaterThan(0);
  const card = await page.locator('.ai-result-modal').boundingBox();
  const close = page.getByRole('button', { name: 'Close', exact: true });
  const closeBox = await close.boundingBox();
  expect(closeBox?.y).toBeGreaterThanOrEqual(card?.y ?? 0);
  await page.screenshot({ path: testInfo.outputPath('report-error.png') });
  await close.click();
  await expect(page.locator('.ai-result-modal')).not.toBeVisible();
});

for (const viewport of [
  { width: 375, height: 812 },
  { width: 812, height: 375 },
]) {
  test(`safety refusal stays centered without a report strip at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const endpoint = await openAiResult(page);
    await endpoint.fail(422);
    await expect(page.locator('.ai-result-error.safety')).toBeVisible();
    const card = await page.locator('.ai-result-modal').boundingBox();
    expect((card?.y ?? 0) + (card?.height ?? 0) / 2).toBeCloseTo(viewport.height / 2, 0);
    await expect(page.locator('.ai-result-disclosure')).toHaveCount(0);
  });
}
