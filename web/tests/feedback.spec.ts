import { expect, test, type Page } from '@playwright/test';
import { supportEmail } from '../src/lib/supportEmail';

// /feedback is the standalone, link-shareable twin of Settings' Send
// Feedback section: the same fields, posted to a form action instead of
// /api/report so it still works without JavaScript. The endpoint's validation
// and honeypot are covered by tools/api-smoke/run-local-contract.mjs against the shared core, and
// parseDeviceField by report.test.ts; the value here is the page — that it
// renders, composes the payload the action reads, and can post at all.
//
// The report bucket is 5 requests/minute per IP and /api/report shares it, so
// exactly one test here actually submits. Adding a second submitting test would
// spend the budget CI's retries need.
//
// Every scripted control on this page is driven by a Svelte handler, so a click
// that lands before hydration is swallowed with no way to recover — hence
// `retryClick` rather than a bare `.click()` (.claude/rules/testing.md).
async function retryClick(page: Page, click: () => Promise<void>, assert: () => Promise<void>) {
  await expect(async () => {
    await click();
    await assert();
  }).toPass();
}

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

  await retryClick(
    page,
    () => page.getByRole('radio', { name: 'I have an idea' }).check(),
    () => expect(page.getByText("What's your idea?")).toBeVisible()
  );
  // Device info only helps reproduce a bug, so it leaves with the bug kind.
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  // "Send report" reads wrong once the reporter is filing an idea.
  await expect(page.getByRole('button', { name: 'Send idea' })).toBeVisible();
});

test('the kind picker is a real radio group, so it submits without JavaScript', async ({
  browser,
}) => {
  // The picker used to be scripted <button>s over a hidden input: with JS off it
  // stayed frozen on "bug", so an idea was filed as a bug with nothing on screen
  // to say so. Native radios are what make the no-JS path honest.
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/feedback');

  await page.getByRole('radio', { name: 'I have an idea' }).check();
  await expect(page.getByRole('radio', { name: 'I have an idea' })).toBeChecked();
  await expect(page.locator('input[name="kind"]:checked')).toHaveValue('feature');
  await context.close();
});

test('a narrow phone keeps each kind option on one line', async ({ browser }) => {
  // The ≤400px tightening lives in ReportFields as a :global() override on the
  // picker's forwarded class: without it these two labels — the longest any
  // picker carries — wrap to two lines and the control stops reading as one
  // track. Wrapping would push an option past the primitive's 44px single-line
  // min-height, and a label that merely got clipped instead would overflow its
  // option box — so the two checks together prove each label fits on one line.
  const context = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const page = await context.newPage();
  await page.goto('/feedback');

  const options = page.locator('.report-kind label.option');
  await expect(options).toHaveCount(2);
  for (const option of await options.all()) {
    const box = await option.boundingBox();
    expect(box?.height).toBeLessThanOrEqual(45);
    expect(await option.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  await context.close();
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

test('the failure state explains itself, offers email, and keeps what was typed', async ({
  browser,
}) => {
  // Run with JavaScript off: that is the path where the server has to echo the
  // submitted values, since the page is re-rendered from scratch rather than
  // patched by use:enhance. With JS on, client state alone would keep the text,
  // so that assertion would pass without the server doing anything.
  //
  // The web server is started with GITHUB_ISSUE_TOKEN blanked
  // (playwright.shared.ts), so a well-formed report gets the graceful "not
  // available" 503 rather than opening a real issue in the tracker.
  //
  // One test, three assertions, because they are one behaviour — what the
  // reporter is left with when the tracker can't be reached — and because the
  // shared 5/min report bucket has no room for a second submitting test.
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/feedback');
  await page.locator('#reportMessage').fill('The purple crayon draws green');
  await page.getByRole('button', { name: 'Send report' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Reporting is not available right now');
  await expect(alert.getByRole('link', { name: supportEmail() })).toHaveAttribute(
    'href',
    new RegExp(`^mailto:${supportEmail()}\\?subject=`)
  );
  await expect(page.locator('#reportMessage')).toHaveValue('The purple crayon draws green');
  await context.close();
});

test('the support address reaches no document a crawler could fetch', async ({ request }) => {
  // Unlike /android-beta, this page is meant to be indexed, so the address must
  // not ride along in a GET — it is offered only in the POST response that
  // carries a failure. Address harvesters scrape markup, and they issue GETs.
  const html = await (await request.get('/feedback')).text();
  expect(html).not.toContain(supportEmail());
});

test('the private-report thank-you is a GET with no issue link', async ({ page }) => {
  // Post/Redirect/Get: the success view is reached by redirect and driven by the
  // query string, never by re-rendering the POST response.
  await page.goto('/feedback?sent=1');

  await expect(
    page.getByRole('heading', { name: 'Thank you — your report is in.', level: 1 })
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'View your report ↗' })).toHaveCount(0);

  // The URL is what a reporter passes on next, so the confirmation strips the
  // query it arrived with rather than handing the next visitor a stale thank-you.
  await expect.poll(() => new URL(page.url()).search).toBe('');
});
