import { expect, test } from '@playwright/test';
import {
  BETA_OPT_IN_URL,
  PLAY_STORE_LISTING_URL,
  TESTERS_GROUP_URL,
} from '../src/lib/components/androidBeta/androidBeta';
import { SITE_ORIGIN } from '../src/lib/siteUrl';
import { supportEmail } from '../src/lib/supportEmail';

// The /android-beta page is a set of sign-up links; a link that points at the
// wrong place is the only way it can fail, and nothing else in the suite would
// notice.

test('the beta sign-up steps link to the group, the opt-in page, the listing, and /feedback', async ({
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
  await expect(page.getByRole('link', { name: 'Send feedback' })).toHaveAttribute(
    'href',
    '/feedback'
  );
});

// Step 4 prints the address rather than hiding it behind link text, because the
// reader is often on a different device from the one they will report from. A
// relative href that rendered as its own path would still work on every click
// and be useless to copy, so the visible string is asserted, not just the href.
test('the feedback address is shown in full and points at the form', async ({ page }) => {
  await page.goto('/android-beta');
  const address = page.getByRole('link', { name: `${SITE_ORIGIN}/feedback` });
  await expect(address).toBeVisible();
  await expect(address).toHaveAttribute('href', '/feedback');
});

// /android-beta is prerendered and /feedback is not (it has a form action), so
// the one link between them is the pairing a build-time crawl or a stale
// adapter config could turn into a 404 with nothing else noticing.
test('the feedback button reaches the form', async ({ page }) => {
  await page.goto('/android-beta');
  await page.getByRole('link', { name: 'Send feedback' }).click();
  await expect(page).toHaveURL('/feedback');
  await expect(page.getByRole('heading', { name: 'Send us feedback' })).toBeVisible();
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

test('the troubleshooting panel starts collapsed', async ({ page }) => {
  await page.goto('/android-beta');
  const panel = page.locator('details.beta-disclosure');
  await expect(panel).not.toHaveAttribute('open', /.*/);
  await page.getByText('Troubleshooting', { exact: true }).click();
  await expect(panel).toHaveAttribute('open', /.*/);
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

// axe cannot check these: a one-character text node always lands in `incomplete`
// ("content is too short to determine if it is actual text content"), and the
// chevron is an SVG fill. Both carry real WCAG minimums, so they are measured
// here from the rendered page rather than assumed.
//
// The channels come off a 1x1 canvas fill rather than a regex over the computed
// string, because the two colors arrive in different notations: a plain token
// computes to `rgb(r g b)` with 0-255 channels while StepLedger's derived
// wash/ink computes to `color(srgb r g b)` with 0-1 ones, and a regex that
// scales both by 255 reads the second as near-black — every pair passing at a
// plausible-looking ratio near 1.
const CONTRAST = `(fg, bg) => {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const channels = (css) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
  };
  const lum = (css) => {
    const [r, g, b] = channels(css)
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}`;

// The page follows night mode like every other route, and the step washes and
// inks are derived from one crayon hue mixed against the themed sheet and ink
// (StepLedger). One mix strength has to hold for four crayons on two grounds,
// so both themes are measured rather than assumed from the light one.
for (const colorScheme of ['light', 'dark'] as const) {
  // Each numeral and its step's callout label are the same ink on the same
  // wash, so one measurement covers both. The numeral is set below the
  // large-text threshold, so it owes the full 4.5:1 rather than 3:1.
  test(`the step inks clear 4.5:1 on the wash they sit on in ${colorScheme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/android-beta');
    // Step 4's callout is the one composed after hydration, so waiting for it is
    // what makes all eight measurable.
    await expect(page.locator('.step-4 .card')).toBeVisible();
    const ratios = await page.evaluate(`(() => {
      const contrast = ${CONTRAST};
      return [...document.querySelectorAll('.steps > li')].flatMap((li) =>
        [li.querySelector('.num'), li.querySelector('.card-label')]
          .filter(Boolean)
          .map((el) => ({
            where: li.className + ' ' + el.className,
            ratio: contrast(getComputedStyle(el).color, getComputedStyle(el.closest('.num, .card')).backgroundColor),
          }))
      );
    })()`);
    expect(ratios).toHaveLength(8);
    for (const { where, ratio } of ratios as { where: string; ratio: number }[]) {
      expect(ratio, `${where} contrast`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test(`the troubleshooting chevron clears the 3:1 non-text minimum in ${colorScheme} mode`, async ({
    page,
  }) => {
    // WCAG 1.4.11: the chevron's rotation is the only visual open/closed signal.
    await page.emulateMedia({ colorScheme });
    await page.goto('/android-beta');
    const ratio = await page.evaluate(`(() => {
      const contrast = ${CONTRAST};
      const svg = document.querySelector('.chev svg');
      return contrast(getComputedStyle(svg).fill, getComputedStyle(svg.closest('details')).backgroundColor);
    })()`);
    expect(ratio as number).toBeGreaterThanOrEqual(3);
  });
}
