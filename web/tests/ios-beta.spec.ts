import { expect, test } from '@playwright/test';
import { TESTFLIGHT_APP_URL, TESTFLIGHT_INVITE_URL } from '../src/lib/components/iosBeta/iosBeta';
import { SITE_ORIGIN } from '../src/lib/siteUrl';
import { supportEmail } from '../src/lib/supportEmail';

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

test('the iOS beta steps link to TestFlight and feedback', async ({ page }) => {
  await page.goto('/ios-beta');
  await expect(page.getByRole('heading', { name: 'Join the iPhone and iPad beta' })).toBeVisible();

  await expect(page.getByRole('link', { name: 'Get TestFlight from Apple' })).toHaveAttribute(
    'href',
    TESTFLIGHT_APP_URL
  );
  await expect(page.getByRole('link', { name: 'Open the Splotch invitation' })).toHaveAttribute(
    'href',
    TESTFLIGHT_INVITE_URL
  );
  await expect(page.getByRole('link', { name: 'Open Splotch in TestFlight' })).toHaveAttribute(
    'href',
    TESTFLIGHT_INVITE_URL
  );
  await expect(page.getByRole('link', { name: 'Send feedback' })).toHaveAttribute(
    'href',
    '/feedback'
  );
});

test('the feedback address is shown in full and reaches the form', async ({ page }) => {
  await page.goto('/ios-beta');
  const address = page.getByRole('link', { name: `${SITE_ORIGIN}/feedback` });
  await expect(address).toBeVisible();
  await expect(address).toHaveAttribute('href', '/feedback');

  await page.getByRole('link', { name: 'Send feedback' }).click();
  await expect(page).toHaveURL('/feedback');
  await expect(page.getByRole('heading', { name: 'Send us feedback' })).toBeVisible();
});

test('the support address stays out of prerendered HTML and appears after hydration', async ({
  page,
  request,
}) => {
  const html = await (await request.get('/ios-beta')).text();
  expect(html).not.toContain(supportEmail());
  expect(html).toContain('noindex');

  await page.goto('/ios-beta');
  await expect(page.getByRole('link', { name: supportEmail() })).toHaveAttribute(
    'href',
    `mailto:${supportEmail()}`
  );
});

test('the TestFlight troubleshooting panel starts collapsed', async ({ page }) => {
  await page.goto('/ios-beta');
  await expect(page.getByRole('link', { name: supportEmail() })).toBeVisible();
  const panel = page.locator('details.beta-disclosure');
  await expect(panel).not.toHaveAttribute('open', /.*/);
  await page.getByText('Troubleshooting', { exact: true }).click();
  await expect(panel).toHaveAttribute('open', /.*/);
  await expect(
    page.getByRole('heading', { name: 'The invitation opens in Safari instead of TestFlight' })
  ).toBeVisible();
});
