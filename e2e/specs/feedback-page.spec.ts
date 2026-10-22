import type { Page } from '@playwright/test';
import { supportEmail } from '../../src/lib/supportEmail.ts';
import { expect, test } from '../fixtures.ts';
import { openDocument } from '../support/app.ts';
import { waitForHydration } from '../support/group-b.ts';

const REPORT_MESSAGE = 'The purple crayon draws green';

// The page posts to /api/report, which shares one per-IP bucket across the suite, so exactly one
// test sends for real. Every other send is answered by the stub below.
async function answerReports(page: Page, status: number, body: object) {
  const posted: string[] = [];
  await page.route('**/api/report', async (route) => {
    posted.push(route.request().postData() ?? '');
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  return posted;
}

// The form is part of the prerendered page but answers nothing until the app has mounted over it.
async function openHydratedFeedback(page: Page) {
  await openDocument(page, '/feedback');
  await waitForHydration(page.getByRole('textbox', { name: 'What went wrong?' }));
}

test.describe('the feedback page', () => {
  test('renders its shell and the report form', async ({ page }) => {
    await openDocument(page, '/feedback');

    await expect(page.getByRole('heading', { level: 1, name: 'Send us feedback' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start drawing' })).toHaveAttribute('href', '/');
    await expect(page.getByRole('button', { name: 'Send report' })).toBeVisible();
    await expect(page.getByRole('radio', { name: "Something's broken" })).toBeChecked();
  });

  test('the privacy policy points its contact at this page', async ({ page }) => {
    await openDocument(page, '/privacy');

    const links = page.getByRole('link', { name: 'private feedback form' });
    await expect(links).not.toHaveCount(0);
    for (const link of await links.all()) await expect(link).toHaveAttribute('href', '/feedback');
    await expect(page.getByRole('link', { name: 'open an issue on GitHub' })).toHaveCount(0);
  });

  test('an idea swaps the prompt, drops the device opt-in and renames the button', async ({
    page,
  }) => {
    await openHydratedFeedback(page);
    await expect(page.getByText('What went wrong?')).toBeVisible();
    await expect(page.getByRole('checkbox')).toBeVisible();

    await page.getByRole('radio', { name: 'I have an idea' }).check();

    await expect(page.getByText("What's your idea?")).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Send idea' })).toBeVisible();
  });

  test('opting into device info shows what will be sent, and unticking takes it back', async ({
    page,
  }) => {
    await openHydratedFeedback(page);
    await expect(page.getByText('What will be sent?')).toHaveCount(0);

    await page.getByRole('checkbox').check();
    await expect(page.getByText('What will be sent?')).toBeVisible();

    await page.getByRole('checkbox').uncheck();
    await expect(page.getByText('What will be sent?')).toHaveCount(0);
  });

  test('an empty report never reaches the server', async ({ page }) => {
    const posted = await answerReports(page, 200, { ok: true });
    await openHydratedFeedback(page);

    await page.getByRole('button', { name: 'Send report' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Send us feedback' })).toBeVisible();
    expect(posted).toEqual([]);
  });

  test('a delivery the server cannot make explains itself, offers email and keeps the draft', async ({
    page,
  }) => {
    await openHydratedFeedback(page);
    const message = page.getByRole('textbox', { name: 'What went wrong?' });
    await message.fill(REPORT_MESSAGE);

    await page.getByRole('button', { name: 'Send report' }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Reporting is not available right now');
    await expect(alert.getByRole('link', { name: supportEmail() })).toHaveAttribute(
      'href',
      new RegExp(`^mailto:${supportEmail()}\\?subject=`)
    );
    await expect(message).toHaveValue(REPORT_MESSAGE);
  });

  test('the support address is in no document a crawler could fetch', async ({ request }) => {
    const html = await (await request.get('/feedback')).text();

    expect(html).not.toContain(supportEmail());
  });

  test('a sent report gets a thank-you, and Send another starts an empty one', async ({ page }) => {
    const posted = await answerReports(page, 200, { ok: true });
    await openHydratedFeedback(page);
    await page.getByRole('radio', { name: 'I have an idea' }).check();
    await page.getByRole('textbox', { name: "What's your idea?" }).fill('Add a glitter brush');

    await page.getByRole('button', { name: 'Send idea' }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Thank you — your report is in.' })
    ).toBeVisible();
    expect(posted).toHaveLength(1);
    expect(JSON.parse(posted[0])).toMatchObject({
      kind: 'feature',
      message: 'Add a glitter brush',
    });

    await page.getByRole('link', { name: 'Send another' }).click();

    await expect(page.getByRole('textbox', { name: 'What went wrong?' })).toHaveValue('');
    await expect(page.getByRole('radio', { name: "Something's broken" })).toBeChecked();
    await expect(page.getByRole('checkbox')).not.toBeChecked();
  });
});
