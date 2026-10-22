import type { Page } from '@playwright/test';
import {
  BETA_OPT_IN_URL,
  PLAY_STORE_LISTING_URL,
  TESTERS_GROUP_URL,
} from '../../src/lib/components/beta/androidBeta.ts';
import { betaPathFor } from '../../src/lib/components/beta/betaPlatform.ts';
import {
  TESTFLIGHT_APP_URL,
  TESTFLIGHT_INVITE_URL,
} from '../../src/lib/components/beta/iosBeta.ts';
import { SHORT_PAGE_HEIGHT_PX } from '../../src/lib/breakpoints.ts';
import { SITE_ORIGIN } from '../../src/lib/siteUrl.ts';
import { BETA_COPY } from '../../src/pageDocument/betaCopy.ts';
import { supportEmail } from '../../src/lib/supportEmail.ts';
import { expect, test } from '../fixtures.ts';
import { openDocument } from '../support/app.ts';
import { ANDROID_UA, expectWired, IPAD_UA } from '../support/group-a.ts';

const ANDROID_STEPS = 'How to join on Android';
const IOS_STEPS = 'How to join on iPhone or iPad';

// The page is prerendered with neither tab chosen: the head's boot script stamps the platform and
// the picker catches up on hydration, so a checked tab is the sign the tabs are wired to a click.
function tab(page: Page, name: 'Android' | 'iPhone / iPad') {
  return page.getByRole('radio', { name });
}

test.describe('the beta sign-up page', () => {
  test('the Android steps link to the group, the opt-in page, the listing and the feedback form', async ({
    page,
  }) => {
    await openDocument(page, '/beta');
    await expect(page.getByRole('heading', { name: ANDROID_STEPS })).toBeVisible();

    await expect(page.getByRole('link', { name: 'Join the testers group' })).toHaveAttribute(
      'href',
      TESTERS_GROUP_URL
    );
    await expect(page.getByRole('link', { name: 'Become a tester', exact: true })).toHaveAttribute(
      'href',
      BETA_OPT_IN_URL
    );
    await expect(page.getByRole('link', { name: 'Open Splotch on Google Play' })).toHaveAttribute(
      'href',
      PLAY_STORE_LISTING_URL
    );
    await expect(page.getByRole('link', { name: 'Send feedback' }).first()).toHaveAttribute(
      'href',
      '/feedback'
    );
  });

  test('the iPhone / iPad tab swaps in the TestFlight steps and records itself in the address', async ({
    page,
  }) => {
    await openDocument(page, '/beta');
    await expect(tab(page, 'Android')).toBeChecked();
    await tab(page, 'iPhone / iPad').click();

    await expect(page).toHaveURL(betaPathFor('ios'));
    await expect(tab(page, 'iPhone / iPad')).toBeChecked();
    await expect(page.getByRole('heading', { name: IOS_STEPS })).toBeVisible();
    await expect(page.getByRole('heading', { name: ANDROID_STEPS })).toBeHidden();
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
  });

  test('a link that names a platform opens that platform’s steps', async ({ page }) => {
    await openDocument(page, betaPathFor('ios'));
    await expect(page.getByRole('heading', { name: IOS_STEPS })).toBeVisible();
    await expect(tab(page, 'iPhone / iPad')).toBeChecked();

    await openDocument(page, betaPathFor('android'));
    await expect(page.getByRole('heading', { name: ANDROID_STEPS })).toBeVisible();
    await expect(tab(page, 'Android')).toBeChecked();
  });

  test('the troubleshooting panel starts collapsed on both tabs', async ({ page }) => {
    await openDocument(page, '/beta');
    await expect(tab(page, 'Android')).toBeChecked();
    const troubleshooting = page.locator('details:visible');
    await expect(troubleshooting).toHaveCount(1);
    await expect(troubleshooting).not.toHaveAttribute('open', /.*/);
    await troubleshooting.getByText('Troubleshooting', { exact: true }).click();
    await expect(troubleshooting).toHaveAttribute('open', /.*/);

    await tab(page, 'iPhone / iPad').click();
    await expect(troubleshooting).toHaveCount(1);
    await expect(troubleshooting).not.toHaveAttribute('open', /.*/);
    await troubleshooting.getByText('Troubleshooting', { exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'The invitation opens in Safari instead of TestFlight' })
    ).toBeVisible();
  });

  test('the feedback address is shown in full and reaches the form', async ({ page }) => {
    await openDocument(page, '/beta');
    const address = page.getByRole('link', { name: `${SITE_ORIGIN}/feedback` });
    await expect(address).toBeVisible();
    await expect(address).toHaveAttribute('href', '/feedback');

    const send = page.getByRole('link', { name: 'Send feedback' }).first();
    await expectWired(send);
    await send.click();
    await expect(page).toHaveURL('/feedback');
    await expect(page.getByRole('heading', { name: 'Send us feedback' })).toBeVisible();
  });

  test('the support address is absent from the served page and composed after hydration', async ({
    page,
    request,
  }) => {
    const html = await (await request.get('/beta')).text();
    expect(html).not.toContain(supportEmail());
    expect(html).toContain('noindex');

    await openDocument(page, '/beta');
    await expect(page.getByRole('link', { name: supportEmail() })).toHaveAttribute(
      'href',
      `mailto:${supportEmail()}`
    );
  });
});

test.describe('an iPad opening the bare address', () => {
  test.use({ userAgent: IPAD_UA });

  test('gets the TestFlight steps without asking', async ({ page }) => {
    await openDocument(page, '/beta');
    await expect(tab(page, 'iPhone / iPad')).toBeChecked();
    await expect(page.getByRole('link', { name: 'Get TestFlight from Apple' })).toBeVisible();
  });

  test('paints those steps before any script bundle has loaded', async ({ page }) => {
    await page.route('**/_expo/static/js/**', (route) => route.abort());
    await openDocument(page, '/beta');

    await expect(page.getByRole('heading', { name: IOS_STEPS })).toBeVisible();
    await expect(page.getByRole('heading', { name: ANDROID_STEPS })).toBeHidden();
  });
});

test.describe('an Android phone opening the bare address', () => {
  test.use({ userAgent: ANDROID_UA });

  test('gets the Google Play steps', async ({ page }) => {
    await openDocument(page, '/beta');
    await expect(tab(page, 'Android')).toBeChecked();
    await expect(page.getByRole('link', { name: 'Join the testers group' })).toBeVisible();
  });
});

const SHORT_LANDSCAPE_PHONE = { width: 812, height: 375 };
const SHORT_DESKTOP_WINDOW = { width: 683, height: 360 };

test.describe('on a short screen', () => {
  test('a short desktop window tucks the introduction behind About this page and keeps the picker', async ({
    page,
  }) => {
    await page.setViewportSize(SHORT_DESKTOP_WINDOW);
    await openDocument(page, '/beta');
    await expect(page.getByText(BETA_COPY.lede)).toBeHidden();
    const about = page.getByRole('button', { name: 'About this page' });
    await expectWired(about);

    await about.click();

    await expect(page.getByText(BETA_COPY.lede)).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: BETA_COPY.picker })).toBeVisible();
  });

  test.describe('touch', () => {
    test.use({ hasTouch: true });

    for (const [platform, steps, other] of [
      ['android', ANDROID_STEPS, 'ios'],
      ['ios', IOS_STEPS, 'android'],
    ] as const) {
      test(`opens on the ${platform} steps and keeps the other platform one tap away`, async ({
        page,
      }) => {
        await page.setViewportSize(SHORT_LANDSCAPE_PHONE);
        await openDocument(page, betaPathFor(platform));
        await expect(page.getByRole('heading', { name: steps })).toBeInViewport();
        await expect(page.getByRole('radiogroup', { name: BETA_COPY.picker })).toBeHidden();
        await expect(page.getByText(BETA_COPY.lede)).toBeHidden();
        const alternate = page.getByRole('link', { name: BETA_COPY.alternate[platform] });
        await expect(alternate).toBeVisible();
        await expectWired(alternate);

        await alternate.click();

        await expect(page).toHaveURL(betaPathFor(other));
        await page.setViewportSize({ ...SHORT_LANDSCAPE_PHONE, height: SHORT_PAGE_HEIGHT_PX + 1 });
        await expect(page.getByRole('radiogroup', { name: BETA_COPY.picker })).toBeVisible();
        await expect(page.getByText(BETA_COPY.lede)).toBeVisible();
        await expect(page.getByRole('link', { name: BETA_COPY.alternate[other] })).toBeHidden();
      });
    }
  });
});
