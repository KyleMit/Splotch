import { expect, test } from '@playwright/test';
import {
  BETA_OPT_IN_URL,
  PLAY_STORE_LISTING_URL,
  TESTERS_GROUP_URL,
} from '../src/routes/android-beta/androidBeta';

// The /android-beta page is a set of sign-up links; a link that points at the
// wrong place is the only way it can fail, and nothing else in the suite would
// notice.

test('the beta sign-up steps link to the group, the opt-in page, and the listing', async ({
  page,
}) => {
  await page.goto('/android-beta');
  await expect(page.getByRole('heading', { name: 'Join the Android Beta' })).toBeVisible();

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
});
