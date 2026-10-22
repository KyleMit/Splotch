import type { Page } from '@playwright/test';
import { expect } from '../fixtures.ts';
import {
  MOCK_REPORT_TOKEN,
  openAiResult,
  openSettings,
  startAiGeneration,
  stubAiEndpoint,
  stubFreeGrant,
  test,
} from '../support/group-a.ts';

const REPORT_ROUTE = '**/api/report-image';
const SAFETY_REFUSAL_STATUS = 422;
const SERVICE_UNAVAILABLE_STATUS = 503;
const INSTALLATION_ID = /^[a-f0-9]{64}$/;

type ReportRequest = { headers: Record<string, string>; body: string };

// Answers every report with a reference, recording what each one carried.
async function stubReports(page: Page, reportId: string): Promise<ReportRequest[]> {
  const received: ReportRequest[] = [];
  await page.route(REPORT_ROUTE, async (route) => {
    const request = route.request();
    received.push({
      headers: request.headers(),
      body: request.postDataBuffer()?.toString('utf8') ?? '',
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, reportId }),
    });
  });
  return received;
}

function referenceNote(reportId: string) {
  return new RegExp(`Keep this report reference.*${reportId}`);
}

// The no-setup allowance: no invite link, so the picture's report is authorised by the token the
// generation answered with. Turns AI pictures on in Settings and draws, as a first-time family does.
async function openFreeTierResult(
  page: Page,
  drawingScreen: Parameters<typeof startAiGeneration>[0]
) {
  const endpoint = await stubAiEndpoint(page);
  await stubFreeGrant(page);
  const settings = await openSettings(page);
  await settings.getByRole('switch', { name: 'Create AI Images' }).click();
  await expect(settings.getByRole('switch', { name: 'Create AI Images' })).toBeChecked();
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(settings).toBeHidden();
  const { result } = await startAiGeneration(drawingScreen);
  return { endpoint, result };
}

test.describe('an AI picture report', () => {
  test('is confirmed, then sent with the access code and handed back as a reference', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const reports = await stubReports(page, 'test-report-id');
    const { result, endpoint } = await openAiResult(drawingScreen);
    await endpoint.succeed();
    await expect(result.getByRole('status')).toHaveText('Your picture is ready');

    await result.getByRole('button', { name: 'Report this picture' }).click();
    const confirm = page.getByRole('dialog', { name: 'Report this picture', exact: true });
    await expect(confirm).toContainText('the report is deleted after 30 days.');
    await expect(confirm.getByRole('button', { name: 'Send report' })).toBeVisible();
    expect(reports).toHaveLength(0);

    await confirm.getByRole('button', { name: 'Send report' }).click();

    await expect(page.getByText(referenceNote('test-report-id'))).toBeVisible();
    await expect(confirm).toBeHidden();
    expect(reports).toHaveLength(1);
    expect(reports[0].headers['content-type']).toContain('multipart/form-data');
    expect(reports[0].headers['x-access-token']).toBeTruthy();
    expect(reports[0].body).toContain('name="kind"');
  });

  for (const dismissal of ['Escape', 'Cancel'] as const) {
    test(`dismissed with ${dismissal} leaves the result untouched and hands focus back to Report`, async ({
      drawingScreen,
    }) => {
      const { page } = drawingScreen;
      const reports = await stubReports(page, 'unused-report-id');
      const { result, endpoint } = await openAiResult(drawingScreen);
      await endpoint.succeed();
      await expect(result.getByRole('status')).toHaveText('Your picture is ready');
      const report = result.getByRole('button', { name: 'Report this picture' });
      await report.click();
      const confirm = page.getByRole('dialog', { name: 'Report this picture', exact: true });
      await expect(confirm).toBeVisible();

      if (dismissal === 'Escape') await page.keyboard.press('Escape');
      else await confirm.getByRole('button', { name: 'Cancel' }).click();

      await expect(confirm).toBeHidden();
      await expect(result.getByRole('img', { name: 'Your AI picture' })).toBeVisible();
      await expect(report).toBeFocused();
      expect(reports).toHaveLength(0);
    });
  }

  test('carries the signed report token and installation of a free-tier picture', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const reports = await stubReports(page, 'free-report-id');
    const { endpoint, result } = await openFreeTierResult(page, drawingScreen);
    await endpoint.succeed({ 'X-Report-Token': MOCK_REPORT_TOKEN });
    await expect(result.getByRole('status')).toHaveText('Your picture is ready');

    await result.getByRole('button', { name: 'Report this picture' }).click();
    await page
      .getByRole('dialog', { name: 'Report this picture', exact: true })
      .getByRole('button', { name: 'Send report' })
      .click();

    await expect(page.getByText(referenceNote('free-report-id'))).toBeVisible();
    const [{ headers }] = reports;
    expect(headers['x-installation-id']).toMatch(INSTALLATION_ID);
    expect(headers['x-report-token']).toBe(MOCK_REPORT_TOKEN);
    expect(headers['x-access-token']).toBeUndefined();
    expect(headers['x-api-key']).toBeUndefined();
  });

  test('reports a free-tier safety refusal as a false positive, with the rejected drawing only', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const reports = await stubReports(page, 'refusal-report-id');
    const { endpoint, result } = await openFreeTierResult(page, drawingScreen);
    await endpoint.fail(SAFETY_REFUSAL_STATUS);
    await expect(result.getByText('For grown-ups')).toBeVisible();

    await result.getByRole('button', { name: 'Report this refusal' }).click();
    const confirm = page.getByRole('dialog', { name: 'Report this refusal', exact: true });
    await expect(confirm).toContainText('The rejected drawing');
    await expect(confirm).toContainText('the report is deleted after 30 days.');
    await confirm.getByRole('button', { name: 'Send report' }).click();

    await expect(page.getByText(referenceNote('refusal-report-id'))).toBeVisible();
    const [{ headers, body }] = reports;
    expect(body).toContain('false-positive-refusal');
    expect(body).toContain('name="drawing"');
    expect(body).not.toContain('name="output"');
    expect(headers['x-report-token']).toBe(MOCK_REPORT_TOKEN);
    expect(headers['x-installation-id']).toMatch(INSTALLATION_ID);
  });

  test('that fails offers a retry in place, without asking for another picture', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    let attempts = 0;
    await page.route(REPORT_ROUTE, async (route) => {
      attempts += 1;
      const failed = attempts === 1;
      await route.fulfill({
        status: failed ? SERVICE_UNAVAILABLE_STATUS : 200,
        contentType: 'application/json',
        body: JSON.stringify(
          failed
            ? { ok: false, error: 'Reporting is temporarily unavailable.' }
            : { ok: true, reportId: 'retried-refusal-id' }
        ),
      });
    });
    const { result, endpoint } = await openAiResult(drawingScreen);
    await endpoint.fail(SAFETY_REFUSAL_STATUS);

    await result.getByRole('button', { name: 'Report this refusal' }).click();
    const confirm = page.getByRole('dialog', { name: 'Report this refusal', exact: true });
    await confirm.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByRole('alert')).toHaveText('Reporting is temporarily unavailable.');
    await page.getByRole('button', { name: 'Try again' }).click();
    await page
      .getByRole('dialog', { name: 'Report this refusal', exact: true })
      .getByRole('button', { name: 'Send report' })
      .click();

    await expect(page.getByText(referenceNote('retried-refusal-id'))).toBeVisible();
    expect(attempts).toBe(2);
    expect(endpoint.requests).toHaveLength(1);
  });
});
