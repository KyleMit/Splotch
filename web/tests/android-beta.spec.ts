import { expect, test } from '@playwright/test';
import {
  BETA_OPT_IN_URL,
  PLAY_STORE_LISTING_URL,
  TESTERS_GROUP_URL,
  supportEmail,
} from '../src/lib/components/androidBeta/androidBeta';

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
const CONTRAST = `(fg, bg) => {
  const lum = (c) => {
    const [r, g, b] = c.match(/\\d+(\\.\\d+)?/g).slice(0, 3)
      .map(Number).map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}`;

test('the step numerals clear the 3:1 large-text minimum', async ({ page }) => {
  await page.goto('/android-beta');
  const ratios = await page.evaluate(`(() => {
    const contrast = ${CONTRAST};
    return [...document.querySelectorAll('.num')].map((el) => ({
      step: el.textContent.trim(),
      ratio: contrast(getComputedStyle(el).color, getComputedStyle(el.closest('.sheet')).backgroundColor),
    }));
  })()`);
  expect(ratios).toHaveLength(4);
  for (const { step, ratio } of ratios as { step: string; ratio: number }[]) {
    expect(ratio, `step ${step} numeral contrast`).toBeGreaterThanOrEqual(3);
  }
});

test('the troubleshooting chevron clears the 3:1 non-text minimum', async ({ page }) => {
  // WCAG 1.4.11: the chevron's rotation is the only visual open/closed signal.
  await page.goto('/android-beta');
  const ratio = await page.evaluate(`(() => {
    const contrast = ${CONTRAST};
    const svg = document.querySelector('.chev svg');
    return contrast(getComputedStyle(svg).fill, getComputedStyle(svg.closest('details')).backgroundColor);
  })()`);
  expect(ratio as number).toBeGreaterThanOrEqual(3);
});
