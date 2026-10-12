import { expect, test, type Page } from '@playwright/test';

import { openSettingsSection } from './flows-harness';
import { gotoApp } from './helpers';

// Settings' Send Feedback deliberately leaves an already-sent report to land
// across a close and reopen (flows-settings.spec.ts pins that). These pin what
// the reopened form owes the parent while that report is still in flight.

const LATE_REPORT_SETTLE_MS = 500;

async function holdReportResponses(page: Page) {
  const releases: Array<() => void> = [];
  await page.route('**/api/report', async (route) => {
    await new Promise<void>((resolve) => releases.push(resolve));
    await route
      .fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      .catch(() => undefined);
  });
  return releases;
}

async function sendReportThenReopenSettings(page: Page, releases: Array<() => void>) {
  await gotoApp(page);
  await openSettingsSection(page, 'Feedback', '#reportMessage');
  await page.locator('#reportMessage').fill('The paint brush disappeared.');
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect.poll(() => releases.length).toBe(1);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('#settingsModal')).toBeHidden();
  await openSettingsSection(page, 'Feedback', '#reportMessage');
}

test('a report sent before reopening Settings leaves the new draft in place', async ({ page }) => {
  const releases = await holdReportResponses(page);
  await sendReportThenReopenSettings(page, releases);
  await page.locator('#reportMessage').fill('The stamps are upside down.');

  const reportResponse = page.waitForResponse('**/api/report');
  releases[0]!();
  await reportResponse;
  // Proves a negative: whether the late result is applied or dropped, a slower
  // worker only lengthens the observation.
  await page.waitForTimeout(LATE_REPORT_SETTLE_MS);
  await expect(page.locator('#reportMessage')).toHaveValue('The stamps are upside down.');
});

test('a second report sent after reopening Settings leaves the first to land', async ({ page }) => {
  const reportOutcomes: string[] = [];
  page.on('requestfailed', (request) => {
    if (request.url().includes('/api/report')) reportOutcomes.push('failed');
  });
  page.on('requestfinished', (request) => {
    if (request.url().includes('/api/report')) reportOutcomes.push('finished');
  });
  const releases = await holdReportResponses(page);
  await sendReportThenReopenSettings(page, releases);
  await page.locator('#reportMessage').fill('The stamps are upside down.');
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect.poll(() => releases.length).toBe(2);

  for (const release of releases) release();
  await expect.poll(() => reportOutcomes).toEqual(['finished', 'finished']);
});
