import { expect, test } from '@playwright/test';

// /feedback is the standalone, link-shareable twin of the Parent Center's Send
// Feedback section: the same fields, posted to a form action instead of
// /api/report so it still works without JavaScript. The endpoint's validation
// and honeypot are covered by scripts/api-smoke.mjs against the shared core; the
// value here is the page — that it renders, that it composes the payload the
// action reads, and that it can post at all.
//
// The report bucket is 5 requests/minute per IP and /api/report shares it, so
// exactly one test here actually submits. Adding a second submitting test would
// spend the budget CI's retries need.

test('the feedback page renders the shell and the report form', async ({ page }) => {
  await page.goto('/feedback');

  await expect(page.getByRole('heading', { name: 'Send us feedback', level: 1 })).toBeVisible();
  await expect(page.locator('.crayons i')).toHaveCount(7);
  await expect(page.getByRole('link', { name: '← Back to drawing' })).toHaveAttribute('href', '/');
  await expect(page.getByRole('button', { name: 'Send report' })).toBeVisible();
});

test('the kind picker swaps the prompt and hides the device opt-in for an idea', async ({
  page,
}) => {
  await page.goto('/feedback');

  await expect(page.getByText('What went wrong?')).toBeVisible();
  await expect(page.getByRole('checkbox')).toBeVisible();

  await page.getByRole('radio', { name: 'I have an idea' }).click();
  await expect(page.getByText("What's your idea?")).toBeVisible();
  // Device info only helps reproduce a bug, so it leaves with the bug kind.
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.locator('input[name="kind"]')).toHaveValue('feature');
});

test('opting into device info fills the hidden field the form action reads', async ({ page }) => {
  await page.goto('/feedback');
  const devicePayload = page.locator('input[name="device"]');
  await expect(devicePayload).toHaveValue('');

  await page.getByRole('checkbox').check();
  await expect(page.getByText('What will be sent?')).toBeVisible();
  await expect
    .poll(async () => JSON.parse((await devicePayload.inputValue()) || '{}').platform)
    .toBe('Web');

  // Unticking must retract it — the preview and the payload are one promise.
  await page.getByRole('checkbox').uncheck();
  await expect(devicePayload).toHaveValue('');
});

test('the message field is required, so an empty report never reaches the server', async ({
  page,
}) => {
  await page.goto('/feedback');
  await page.getByRole('button', { name: 'Send report' }).click();

  await expect(page.locator('#reportMessage')).toHaveJSProperty('validity.valueMissing', true);
  await expect(page).toHaveURL(/\/feedback$/);
});

test('a submitted report surfaces the server’s answer without losing what was typed', async ({
  page,
}) => {
  // The test server runs without GITHUB_ISSUE_TOKEN, so a well-formed report
  // gets the graceful "not available" 503 rather than opening a real issue.
  // That is the round trip this asserts: form action reached, error rendered.
  await page.goto('/feedback');
  await page.locator('#reportMessage').fill('The purple crayon draws green');
  await page.getByRole('button', { name: 'Send report' }).click();

  await expect(page.getByRole('alert')).toContainText('Reporting is not available right now');
  await expect(page.locator('#reportMessage')).toHaveValue('The purple crayon draws green');
});
