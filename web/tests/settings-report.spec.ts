import { expect, test, type Page } from '@playwright/test';

import { gotoApp, openSettingsSection } from './helpers';

// Settings' Send Feedback form across a close and reopen. The form clears
// itself on every reopen, but it deliberately never aborts a report already on
// the wire: that POST files an issue. These specs hold the report at the route
// so its response can land after the parent has started a new visit.
// Intercepted rather than posted for real: the report bucket is 5 requests/minute
// per IP, and feedback.spec.ts already spends the one real submission a run affords.

// How long the page is given to apply a report response that has already been
// delivered, before the spec concludes it was ignored. Proving a negative: a
// slower worker only lengthens the window it had to (wrongly) apply it in.
const LATE_REPORT_APPLY_WINDOW_MS = 1000;

const FIRST_DRAFT = 'The paint brush disappeared.';
const SECOND_DRAFT = 'The eraser leaves a faint line.';

// Holds every /api/report until `release()`, which resolves only once each held
// response has actually been handed to the page (or refused, for a request the
// page already abandoned).
async function holdReports(page: Page) {
  const messages: string[] = [];
  const deliveries: Promise<void>[] = [];
  let releaseAll!: () => void;
  const held = new Promise<void>((resolve) => {
    releaseAll = resolve;
  });
  await page.route('**/api/report', (route) => {
    messages.push((route.request().postDataJSON() as { message: string }).message);
    const delivery = held.then(() =>
      route
        .fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        })
        .catch(() => undefined)
    );
    deliveries.push(delivery);
    return delivery;
  });
  return {
    messages: () => messages,
    release: async () => {
      releaseAll();
      await Promise.all(deliveries);
    },
  };
}

async function sendFirstReportThenReopen(page: Page) {
  await gotoApp(page);
  await openSettingsSection(page, 'Feedback', '#reportMessage');
  await page.locator('#reportMessage').fill(FIRST_DRAFT);
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByRole('button', { name: 'Sending…' })).toBeDisabled();

  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('#settingsModal')).toBeHidden();
  await openSettingsSection(page, 'Feedback', '#reportMessage');
  await page.locator('#reportMessage').fill(SECOND_DRAFT);
}

test('a report landing after Settings reopens leaves the new draft alone', async ({ page }) => {
  // The reopen starts a fresh visit, so the earlier report's outcome belongs to
  // the visit that sent it — not to the draft the parent has since begun.
  const reports = await holdReports(page);
  await sendFirstReportThenReopen(page);
  expect(reports.messages()).toEqual([FIRST_DRAFT]);

  await reports.release();
  await page.waitForTimeout(LATE_REPORT_APPLY_WINDOW_MS);
  await expect(page.getByText('Thanks for your feedback.')).toHaveCount(0);
  await expect(page.locator('#reportMessage')).toHaveValue(SECOND_DRAFT);
});

test('sending a new draft after Settings reopens leaves the earlier report to land', async ({
  page,
}) => {
  const outcomes = new Map<string, string>();
  const record = (message: string | undefined, outcome: string) => {
    if (message) outcomes.set(message, outcome);
  };
  const reportMessage = (request: { url(): string; postDataJSON(): unknown }) =>
    request.url().includes('/api/report')
      ? (request.postDataJSON() as { message: string }).message
      : undefined;
  page.on('requestfinished', (request) => record(reportMessage(request), 'finished'));
  page.on('requestfailed', (request) =>
    record(reportMessage(request), request.failure()?.errorText ?? 'failed')
  );

  const reports = await holdReports(page);
  await sendFirstReportThenReopen(page);
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect.poll(() => reports.messages()).toEqual([FIRST_DRAFT, SECOND_DRAFT]);

  await reports.release();
  await expect.poll(() => outcomes.get(FIRST_DRAFT)).toBe('finished');
});
