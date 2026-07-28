import { expect, test } from '@playwright/test';
import {
  BETA_OPT_IN_URL,
  PLAY_STORE_LISTING_URL,
  TESTERS_GROUP_SUBSCRIBE_EMAIL,
  TESTERS_GROUP_URL,
  supportEmail,
} from '../src/lib/androidBeta';

// The /android-beta page is a set of sign-up links; a link that points at the
// wrong place is the only way it can fail, and nothing else in the suite would
// notice.

test('the beta sign-up steps link to the group, the opt-in page, and the listing', async ({
  page,
}) => {
  await page.goto('/android-beta');
  await expect(page.getByRole('heading', { name: 'Join the Android Beta' })).toBeVisible();

  // The join CTA is a mailto: the group's web page refuses most first-time
  // testers outright, so the subscribe alias is what leads.
  await expect(page.getByRole('link', { name: 'Email to join' })).toHaveAttribute(
    'href',
    `mailto:${TESTERS_GROUP_SUBSCRIBE_EMAIL}`
  );
  await expect(page.getByRole('link', { name: 'Open the group on Google Groups' })).toHaveAttribute(
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
});

test('the support address is absent from the served HTML and added after hydration', async ({
  page,
  request,
}) => {
  // Address harvesters scrape markup, so the prerendered document must not
  // carry the literal address — only the hydrated page composes it.
  const html = await (await request.get('/android-beta')).text();
  expect(html).not.toContain(supportEmail());
  expect(html).toContain('noindex');

  await page.goto('/android-beta');
  await expect(page.getByRole('link', { name: supportEmail() })).toHaveAttribute(
    'href',
    `mailto:${supportEmail()}`
  );
});

test('the masthead crayon strip renders every palette hue it names', async ({ page }) => {
  // The strip resolves its hues out of PALETTE_COLORS by label, so a renamed
  // palette entry would otherwise silently drop a crayon.
  await page.goto('/android-beta');
  const crayons = page.locator('.crayons i');
  await expect(crayons).toHaveCount(7);
  for (const background of await crayons.evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).backgroundColor)
  )) {
    expect(background).not.toBe('rgba(0, 0, 0, 0)');
  }
});
