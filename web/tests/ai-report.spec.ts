import { expect, test } from '@playwright/test';
import { CLIENT_REQUEST_TIMEOUT_MS } from '../src/lib/ai/limits';
import { STORAGE_KEYS } from '../src/lib/storageKeys';
import { enforceProductionCsp } from './helpers';
import {
  MOCK_REPORT_TOKEN,
  landedReportConfirm,
  openAiResult,
  resultBoxes,
  revealAiResult,
  revealedBoxes,
} from './ai-harness';

// The picture-report flow launched from the AI result: the confirmation dialog,
// its dismissals, the send's deadline, and the credentials the request carries.
// The result modal's own presentation lives in ai-result.spec.ts.
// Watch it run with:
//   npm run test:e2e:headed -- ai-report

test.describe('AI picture report', () => {
  test('confirms and sends an AI picture report from the result', async ({ page }) => {
    let reportRequests = 0;
    // Under the shipped CSP, because the report reads the drawing and the result
    // back out of their object URLs — a `blob:` fetch the policy has to permit.
    // Without this the flow passes here and fails in production.
    await enforceProductionCsp(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.addInitScript(
      (key) => localStorage.setItem(key, 'never'),
      STORAGE_KEYS.parentalGateImageReportMode
    );
    await page.route('**/api/report-image', async (route) => {
      reportRequests += 1;
      expect(route.request().headers()['content-type']).toContain('multipart/form-data');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, reportId: 'test-report-id' }),
      });
    });
    await revealAiResult(page);

    const report = page.getByRole('button', { name: 'Report this picture' });
    // The Report control is deliberately fine print; the tap target around it
    // still has to clear the app's 44px minimum.
    const { report: reportBox, strip } = await resultBoxes(page);
    expect(reportBox.width).toBeGreaterThanOrEqual(44);
    expect(reportBox.height).toBeGreaterThanOrEqual(44);
    expect(reportBox.height).toBeGreaterThan(strip.height);

    await report.focus();
    await expect(report).toBeFocused();
    await page.keyboard.press('Enter');
    const confirm = await landedReportConfirm(page);
    await expect(confirm).toContainText('the report is deleted after 30 days.');
    // The confirmation names the two artifacts by showing them, and stands in
    // front of the result rather than in its footer — so the Download button is
    // still on screen behind the second scrim, and is no longer a live choice.
    await expect(confirm.locator('img')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
    expect(reportRequests).toBe(0);

    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByText(/Keep this report reference.*test-report-id/)).toBeVisible();
    await expect(confirm).not.toBeVisible();
    expect(reportRequests).toBe(1);
  });

  // The confirmation carries no close disc — Cancel is the dismissal — and it
  // stands in front of the result rather than replacing anything in it, so
  // backing out has to leave the card exactly as it was.
  test('cancelling the report confirmation returns to an untouched result', async ({ page }) => {
    let reportRequests = 0;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(
      (key) => localStorage.setItem(key, 'never'),
      STORAGE_KEYS.parentalGateImageReportMode
    );
    await page.route('**/api/report-image', async (route) => {
      reportRequests += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await revealAiResult(page);

    const before = await revealedBoxes(page);
    await page.getByRole('button', { name: 'Report this picture' }).click();
    const confirm = await landedReportConfirm(page);
    // The picture behind it does not resize to make room, as the old inline
    // confirmation made it.
    expect((await revealedBoxes(page)).stage.height).toBeCloseTo(before.stage.height, 0);

    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).not.toBeVisible();
    await expect(page.locator('.ai-result-disclosure')).toBeVisible();
    expect((await revealedBoxes(page)).card.height).toBeCloseTo(before.card.height, 0);
    expect(reportRequests).toBe(0);
  });

  // A <dialog> hands focus back to whatever held it before showModal(), so the
  // Report control has to still be mounted and connected when the confirmation
  // goes away — otherwise dismissing drops a keyboard user on <body>, outside
  // the result dialog they were working in.
  for (const dismissal of ['Escape', 'Cancel'] as const) {
    test(`dismissing the confirmation with ${dismissal} hands focus back to Report`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.addInitScript(
        (key) => localStorage.setItem(key, 'never'),
        STORAGE_KEYS.parentalGateImageReportMode
      );
      await revealAiResult(page);

      const report = page.getByRole('button', { name: 'Report this picture' });
      await report.focus();
      await page.keyboard.press('Enter');
      const confirm = await landedReportConfirm(page);

      if (dismissal === 'Escape') await page.keyboard.press('Escape');
      else await confirm.getByRole('button', { name: 'Cancel' }).click();
      await expect(confirm).not.toBeVisible();
      await expect(report).toBeFocused();
    });
  }

  // Dismissal is blocked while the request is on the wire, so the deadline is
  // the only thing that can end a send that never settles. Without it the
  // topmost dialog stays open against Cancel, the backdrop, Esc and Android
  // back alike, for as long as the browser holds the socket.
  test('a report send that never settles times out into the retry state', async ({ page }) => {
    test.setTimeout(CLIENT_REQUEST_TIMEOUT_MS * 3);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(
      (key) => localStorage.setItem(key, 'never'),
      STORAGE_KEYS.parentalGateImageReportMode
    );
    // Never fulfilled, never aborted from this side: the client's own deadline
    // has to be what ends it.
    await page.route('**/api/report-image', async () => {});
    await revealAiResult(page);

    await page.getByRole('button', { name: 'Report this picture' }).click();
    const confirm = await landedReportConfirm(page);
    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByRole('button', { name: 'Sending…' })).toBeVisible();

    const retry = page.getByRole('button', { name: 'Try again' });
    await expect(retry).toBeVisible({ timeout: CLIENT_REQUEST_TIMEOUT_MS * 1.5 });
    await expect(confirm).not.toBeVisible();
    await expect(page.getByRole('alert')).toContainText('taking too long');
    // The dialog that closed took the focused button with it, so the retry it
    // left behind is where a keyboard user has to land.
    await expect(retry).toBeFocused();
  });

  // Issue #960: a free-tier picture was unreportable because the client sent an
  // empty X-Access-Token, which the server answered 403 to. The credentials the
  // report carries are the whole regression, so assert the headers themselves.
  test('reports a free-tier picture with the signed report token', async ({ page }) => {
    let reportHeaders: Record<string, string> | null = null;
    await enforceProductionCsp(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(
      (key) => localStorage.setItem(key, 'never'),
      STORAGE_KEYS.parentalGateImageReportMode
    );
    await page.route('**/api/report-image', async (route) => {
      reportHeaders = route.request().headers();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, reportId: 'free-report-id' }),
      });
    });
    await revealAiResult(page, { freeTier: true });

    await page.getByRole('button', { name: 'Report this picture' }).focus();
    await page.keyboard.press('Enter');
    await landedReportConfirm(page);
    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByText(/Keep this report reference.*free-report-id/)).toBeVisible();

    expect(reportHeaders).not.toBeNull();
    expect(reportHeaders?.['x-installation-id']).toMatch(/^[a-f0-9]{64}$/);
    // Carried from the generation response — the proof the server signed, which
    // is what actually authorizes the free report.
    expect(reportHeaders?.['x-report-token']).toBe(MOCK_REPORT_TOKEN);
    expect(reportHeaders?.['x-access-token']).toBeUndefined();
    expect(reportHeaders?.['x-api-key']).toBeUndefined();
  });

  test('confirms and sends a free-tier false-positive refusal report', async ({ page }) => {
    let reportBody = '';
    let reportHeaders: Record<string, string> | null = null;
    await enforceProductionCsp(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.addInitScript(
      (key) => localStorage.setItem(key, 'never'),
      STORAGE_KEYS.parentalGateImageReportMode
    );
    await page.route('**/api/report-image', async (route) => {
      reportHeaders = route.request().headers();
      reportBody = route.request().postDataBuffer()?.toString('utf8') ?? '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, reportId: 'refusal-report-id' }),
      });
    });
    const endpoint = await openAiResult(page, { freeTier: true });
    await endpoint.fail(422, { 'X-Report-Token': MOCK_REPORT_TOKEN });

    const report = page.getByRole('button', { name: 'Report this refusal' });
    await expect(page.getByText('For grown-ups')).toBeVisible();
    await expect(report).toBeVisible();
    const reportBox = await report.boundingBox();
    expect(reportBox?.height).toBeGreaterThanOrEqual(44);

    await report.focus();
    await page.keyboard.press('Enter');
    const confirm = await landedReportConfirm(page);
    await expect(confirm).toContainText(
      "The rejected drawing, selected art style, exact instruction sent to the AI, and the AI's refusal reason"
    );
    await expect(confirm).toContainText('the report is deleted after 30 days.');
    await expect(confirm.locator('img')).toHaveCount(1);
    await expect(confirm.getByText('The rejected drawing', { exact: true })).toBeVisible();

    await confirm.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByText(/Keep this report reference.*refusal-report-id/)).toBeVisible();
    expect(reportBody).toContain('false-positive-refusal');
    expect(reportBody).toContain('name="drawing"');
    expect(reportBody).not.toContain('name="output"');
    expect(reportHeaders?.['x-report-token']).toBe(MOCK_REPORT_TOKEN);
    expect(reportHeaders?.['x-installation-id']).toMatch(/^[a-f0-9]{64}$/);
  });

  for (const viewport of [
    { width: 740, height: 360 },
    { width: 480, height: 320 },
  ]) {
    test(`cancelling a refusal report restores focus at ${viewport.width}×${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await page.addInitScript(
        (key) => localStorage.setItem(key, 'never'),
        STORAGE_KEYS.parentalGateImageReportMode
      );
      const endpoint = await openAiResult(page);
      await endpoint.fail(422);

      const report = page.getByRole('button', { name: 'Report this refusal' });
      await report.focus();
      await page.keyboard.press('Enter');
      const confirm = await landedReportConfirm(page);
      const geometry = await confirm.evaluate((dialog) => {
        const dialogBox = dialog.getBoundingClientRect();
        const headingBox = dialog.querySelector('h3')!.getBoundingClientRect();
        const disclosureBox = dialog
          .querySelector('.ai-report-confirm-heading p')!
          .getBoundingClientRect();
        return {
          dialogTop: dialogBox.top,
          dialogBottom: dialogBox.bottom,
          headingTop: headingBox.top,
          disclosureTop: disclosureBox.top,
        };
      });
      expect(geometry.dialogTop).toBeGreaterThanOrEqual(0);
      expect(geometry.dialogBottom).toBeLessThanOrEqual(viewport.height);
      expect(geometry.headingTop).toBeGreaterThanOrEqual(geometry.dialogTop);
      expect(geometry.disclosureTop).toBeGreaterThanOrEqual(geometry.dialogTop);

      await page.keyboard.press('Escape');
      await expect(confirm).not.toBeVisible();
      await expect(report).toBeFocused();
    });
  }

  test('a failed refusal report offers an in-place retry without another generation', async ({
    page,
  }) => {
    let attempts = 0;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(
      (key) => localStorage.setItem(key, 'never'),
      STORAGE_KEYS.parentalGateImageReportMode
    );
    await page.route('**/api/report-image', async (route) => {
      attempts += 1;
      await route.fulfill({
        status: attempts === 1 ? 503 : 200,
        contentType: 'application/json',
        body:
          attempts === 1
            ? JSON.stringify({ ok: false, error: 'Reporting is temporarily unavailable.' })
            : JSON.stringify({ ok: true, reportId: 'retried-refusal-id' }),
      });
    });
    const endpoint = await openAiResult(page);
    await endpoint.fail(422);

    await page.getByRole('button', { name: 'Report this refusal' }).click();
    await landedReportConfirm(page);
    await page.getByRole('button', { name: 'Send report' }).click();
    const retry = page.getByRole('button', { name: 'Try again' });
    await expect(retry).toBeFocused();
    await retry.click();
    await landedReportConfirm(page);
    await page.getByRole('button', { name: 'Send report' }).click();

    await expect(page.getByText(/Keep this report reference.*retried-refusal-id/)).toBeVisible();
    expect(attempts).toBe(2);
  });
});
