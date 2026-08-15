import { expect, test, type Page } from '@playwright/test';
import {
  BETA_OPT_IN_URL,
  PLAY_STORE_LISTING_URL,
  TESTERS_GROUP_URL,
} from '../src/lib/components/beta/androidBeta';
import { betaPathFor } from '../src/lib/components/beta/betaPlatform';
import { TESTFLIGHT_APP_URL, TESTFLIGHT_INVITE_URL } from '../src/lib/components/beta/iosBeta';
import { SITE_ORIGIN } from '../src/lib/siteUrl';
import { supportEmail } from '../src/lib/supportEmail';
import { ANDROID_UA, IPAD_UA, renderedText } from './helpers';

// The restored mobile rule allows content width to vary with each sentence,
// but it must no longer be constrained to the old 34ch desktop measure.
const MIN_MOBILE_FINE_WIDTH_FRACTION = 0.9;

// /beta is a set of sign-up links behind two tabs; a link that points at the
// wrong place, or a tab that opens the wrong platform's instructions, is the
// only way it can fail, and nothing else in the suite would notice.

// Both panels are always in the document — the tab filter is CSS keyed on the
// platform stamped on <html> — so every CSS-selected assertion is scoped to the
// panel on show. Role queries need no scoping: the filtered-out panel is
// display:none and so out of the a11y tree.
function shownPanel(page: Page) {
  return page.locator('.beta-platform-panel:visible');
}

function tab(page: Page, name: string) {
  return page.getByRole('radio', { name });
}

// The prerendered document deliberately raises no tab: the panel is chosen by
// the head stamp, and the picker only catches up on hydration. So an `.active`
// option is this page's own "the tabs are wired" signal — clicking before it
// lands on markup with no handler and silently does nothing.
async function tabsAreLive(page: Page) {
  await expect(page.locator('.beta-platform-picker .option.active')).toHaveCount(1);
}

test('the Android tab links to the group, the opt-in page, the listing, and /feedback', async ({
  page,
}) => {
  await page.goto('/beta');
  await expect(page.getByRole('heading', { name: 'Join the Splotch beta' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How to join on Android' })).toBeVisible();

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

test('the iOS tab swaps in the TestFlight steps and records itself in the URL', async ({
  page,
}) => {
  await page.goto('/beta');
  await tabsAreLive(page);
  await tab(page, 'iPhone / iPad').click();

  await expect(page).toHaveURL(betaPathFor('ios'));
  await expect(page.getByRole('heading', { name: 'How to join on iPhone or iPad' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How to join on Android' })).toBeHidden();

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

// The page is prerendered with neither tab chosen, so the parameter is read by
// the head stamp and again on hydration — a link handed to a tester has to land
// on the instructions it promised, and the picker has to agree.
test('?os= opens the platform the link names', async ({ page }) => {
  await page.goto(betaPathFor('ios'));
  await expect(page.getByRole('heading', { name: 'How to join on iPhone or iPad' })).toBeVisible();
  await expect(tab(page, 'iPhone / iPad')).toBeChecked();

  await page.goto(betaPathFor('android'));
  await expect(page.getByRole('heading', { name: 'How to join on Android' })).toBeVisible();
  await expect(tab(page, 'Android')).toBeChecked();
});

test.describe('an iPad opening the bare URL', () => {
  test.use({ userAgent: IPAD_UA });

  test('gets the TestFlight steps without asking', async ({ page }) => {
    await page.goto('/beta');
    await expect(tab(page, 'iPhone / iPad')).toBeChecked();
    await expect(page.getByRole('link', { name: 'Get TestFlight from Apple' })).toBeVisible();
  });
});

test.describe('an Android phone opening the bare URL', () => {
  test.use({ userAgent: ANDROID_UA });

  test('gets the Google Play steps', async ({ page }) => {
    await page.goto('/beta');
    await expect(tab(page, 'Android')).toBeChecked();
    await expect(page.getByRole('link', { name: 'Join the testers group' })).toBeVisible();
  });
});

// The solo pages were handed out on their own before the tabs replaced them
// (ADR-0112), so the old URLs have to keep landing on the instructions they
// named rather than 404ing or dropping the reader on the other platform.
test.describe('the deprecated solo links', () => {
  for (const [deprecated, platform, heading] of [
    ['/android-beta', 'android', 'How to join on Android'],
    ['/ios-beta', 'ios', 'How to join on iPhone or iPad'],
  ] as const) {
    test(`${deprecated} redirects to the ${platform} tab`, async ({ page }) => {
      await page.goto(deprecated);
      await expect(page).toHaveURL(betaPathFor(platform));
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    });
  }
});

// The tab row is the one piece of this page that changes shape with the
// viewport, and it does it in CSS with no JS to observe: on a sheet the labels
// hug the left, and once the sheet IS the screen the two cells split it evenly
// and the rule reaches the glass. Measured rather than assumed — a stale
// breakpoint or a lost negative margin leaves a row that looks plausible in
// isolation and wrong on the device.
test('the tabs hug the left on a sheet and split the screen on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto('/beta');

  const row = page.locator('.beta-platform-picker .picker');
  const cells = page.locator('.beta-platform-picker .option');
  const cellWidths = () =>
    cells.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));

  const sheetRow = (await row.boundingBox())!;
  const sheetCells = await cellWidths();
  expect(sheetCells).toHaveLength(2);
  expect(
    sheetCells.reduce((total, width) => total + width, 0),
    'on a sheet the labels take only the room they need'
  ).toBeLessThan(sheetRow.width / 2);

  await page.setViewportSize({ width: 390, height: 844 });
  const phoneRow = (await row.boundingBox())!;
  const phoneCells = await cellWidths();

  expect(phoneRow.x, 'the row bleeds past the page gutter to the left edge').toBeLessThan(1);
  expect(phoneRow.width, 'and reaches the right edge').toBeGreaterThan(389);
  for (const width of phoneCells) {
    expect(Math.abs(width - phoneRow.width / 2), 'each cell is half the screen').toBeLessThan(1);
  }

  // Half a phone screen is the tightest the labels ever get, and `iPhone / iPad`
  // is the longest of them — measured rather than eyeballed, because a wrapped
  // label is what would push the row past the touch-target floor below.
  const labelLines = await page.locator('.beta-platform-picker .option-label').evaluateAll((els) =>
    els.map((el) => {
      const style = getComputedStyle(el);
      return el.getBoundingClientRect().height / Number.parseFloat(style.lineHeight);
    })
  );
  for (const lines of labelLines) expect(lines, 'each label stays on one line').toBeLessThan(1.5);
});

// The design system's interaction floor is a property of the control, not of the
// viewport: a touch-capable tablet sits above the phone step and still gets
// fingers, and the underline row's padding alone leaves it a pixel short.
test('the tabs clear the 44px touch floor at every width', async ({ page }) => {
  for (const viewport of [
    { width: 1100, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/beta');
    const heights = await page
      .locator('.beta-platform-picker .option')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));

    expect(heights).toHaveLength(2);
    for (const height of heights) {
      expect(height, `tab height at ${viewport.width}px`).toBeGreaterThanOrEqual(44);
    }
  }
});

// The live tab is marked by a brand segment replacing its stretch of the rule,
// and by taking the brand ink with it — the two halves of one mark, so a change
// that drops either leaves the row looking like plain text.
test('only the live tab carries the underline segment', async ({ page }) => {
  await page.goto('/beta');
  await tabsAreLive(page);

  // `.active` lands at hydration and the option transitions color and
  // border-color in, so a snapshot taken straight after tabsAreLive can read
  // frame 0 of that transition — an active tab whose segment is still the
  // inactive transparent. Retry the whole read until the mark has painted.
  await expect(async () => {
    const marks = await page.locator('.beta-platform-picker .option').evaluateAll((els) =>
      els.map((el) => {
        const style = getComputedStyle(el);
        return {
          active: el.classList.contains('active'),
          color: style.color,
          segment: style.borderBottomColor,
          width: style.borderBottomWidth,
        };
      })
    );

    const [live, quiet] = [marks.find((m) => m.active)!, marks.find((m) => !m.active)!];
    expect(live.width).toBe('3px');
    expect(quiet.width).toBe('3px');
    expect(quiet.segment).toBe('rgba(0, 0, 0, 0)');
    expect(live.segment).not.toBe(quiet.segment);
    expect(live.color).not.toBe(quiet.color);
  }).toPass();
});

// Step 4 prints the address rather than hiding it behind link text, because the
// reader is often on a different device from the one they will report from. A
// relative href that rendered as its own path would still work on every click
// and be useless to copy, so the visible string is asserted, not just the href.
test('the feedback address is shown in full and reaches the form', async ({ page }) => {
  await page.goto('/beta');
  const address = page.getByRole('link', { name: `${SITE_ORIGIN}/feedback` });
  await expect(address).toBeVisible();
  await expect(address).toHaveAttribute('href', '/feedback');

  // /beta is prerendered and /feedback is not (it has a form action), so this
  // one link between them is the pairing a build-time crawl or a stale adapter
  // config could turn into a 404 with nothing else noticing.
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
  const html = await (await request.get('/beta')).text();
  expect(html).not.toContain(supportEmail());
  expect(html).toContain('noindex');

  await page.goto('/beta');
  await expect(page.getByRole('link', { name: supportEmail() })).toHaveAttribute(
    'href',
    `mailto:${supportEmail()}`
  );
});

// The tabs are a JavaScript filter over two panels that are both in the
// prerendered document. With scripting off the filter cannot run, so it stands
// down rather than stranding half the testers on the wrong instructions.
test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('both platforms read as stacked sections and the picker stands down', async ({ page }) => {
    await page.goto('/beta');

    await expect(page.getByRole('heading', { name: 'How to join on Android' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'How to join on iPhone or iPad' })
    ).toBeVisible();
    await expect(page.locator('.beta-platform-picker')).toBeHidden();
  });

  // The links in the picker's place are a table of contents that also filters:
  // the hash is a `:target`, and the panel that isn't targeted stands down. That
  // is the whole point of them — otherwise an iPhone reader scrolls past the
  // entire Android flow to reach their own.
  test('a jump link filters to the platform it names', async ({ page }) => {
    await page.goto('/beta');

    await page.getByRole('link', { name: 'iPhone / iPad' }).click();
    await expect(page).toHaveURL('/beta#beta-ios');
    await expect(
      page.getByRole('heading', { name: 'How to join on iPhone or iPad' })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'How to join on Android' })).toBeHidden();

    // And back the other way, so the row stays a chooser rather than a one-shot.
    await page.getByRole('link', { name: 'Android' }).click();
    await expect(page).toHaveURL('/beta#beta-android');
    await expect(page.getByRole('heading', { name: 'How to join on Android' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'How to join on iPhone or iPad' })).toBeHidden();
  });
});

// The panel a reader sees first is decided by the stamp the <head> script puts
// on <html>, not by hydration — otherwise the prerendered document would paint
// one state and rearrange itself a moment later, on exactly the phones this page
// is read on. Blocking the client bundle freezes the page in that pre-hydration
// state so it can be asserted.
test.describe('before hydration', () => {
  test.use({ userAgent: IPAD_UA });

  test('paints the detected platform with no client bundle at all', async ({ page }) => {
    await page.route('**/_app/immutable/entry/*.js', (route) => route.abort());
    await page.goto('/beta');

    await expect(
      page.getByRole('heading', { name: 'How to join on iPhone or iPad' })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'How to join on Android' })).toBeHidden();
  });
});

test('mobile fine print can use the full action column', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/beta');

  const widthRatios = await shownPanel(page)
    .locator('.action')
    .evaluateAll((actions) =>
      actions.map((action) => {
        const fine = action.querySelector<HTMLElement>('.fine');
        if (!fine) throw new Error('Expected every action to contain fine print');
        return fine.getBoundingClientRect().width / action.getBoundingClientRect().width;
      })
    );

  expect(widthRatios.length).toBeGreaterThan(0);
  for (const ratio of widthRatios) expect(ratio).toBeGreaterThan(MIN_MOBILE_FINE_WIDTH_FRACTION);
});

test('the troubleshooting summary drops only its middle clause on phones', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 844 });
  await page.goto('/beta');
  const summary = shownPanel(page).locator('.trouble-sub');
  await expect
    .poll(() => renderedText(summary))
    .toBe('Beta not showing up, “item not found”, or stuck on step 2?');

  await page.setViewportSize({ width: 400, height: 844 });
  await expect.poll(() => renderedText(summary)).toBe('Beta not showing up, or stuck on step 2?');
});

test('the troubleshooting panel starts collapsed on both tabs', async ({ page }) => {
  await page.goto('/beta');
  await tabsAreLive(page);
  await expect(page.getByRole('link', { name: supportEmail() })).toBeVisible();
  const panel = shownPanel(page).locator('details.beta-disclosure');
  await expect(panel).not.toHaveAttribute('open', /.*/);
  await shownPanel(page).getByText('Troubleshooting', { exact: true }).click();
  await expect(panel).toHaveAttribute('open', /.*/);

  await tab(page, 'iPhone / iPad').click();
  const iosPanel = shownPanel(page).locator('details.beta-disclosure');
  await expect(iosPanel).not.toHaveAttribute('open', /.*/);
  await shownPanel(page).getByText('Troubleshooting', { exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'The invitation opens in Safari instead of TestFlight' })
  ).toBeVisible();
});

test('the masthead crayon strip renders every palette hue it names', async ({ page }) => {
  // The strip resolves its hues out of PALETTE_COLORS by label, so a renamed
  // palette entry would otherwise silently drop a crayon.
  await page.goto('/beta');
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
  // Each numeral — and, on the steps that keep a callout, its label — is the
  // step's ink on the step's wash, so the four numerals cover every hue and the
  // callouts re-measure theirs where a card actually paints. The numeral is set
  // below the large-text threshold, so it owes the full 4.5:1 rather than 3:1.
  test(`the step inks clear 4.5:1 on the wash they sit on in ${colorScheme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/beta');
    // Step 4's callout is the one composed after hydration, so waiting for it is
    // what makes every pair measurable.
    await expect(shownPanel(page).locator('.step-4 .card')).toBeVisible();
    const ratios = await page.evaluate(`(() => {
      const contrast = ${CONTRAST};
      const panel = [...document.querySelectorAll('.beta-platform-panel')].find(
        (el) => getComputedStyle(el).display !== 'none'
      );
      return [...panel.querySelectorAll('.steps > li')].flatMap((li) =>
        [li.querySelector('.num'), li.querySelector('.card-label')]
          .filter(Boolean)
          .map((el) => ({
            where: li.className + ' ' + el.className,
            ratio: contrast(getComputedStyle(el).color, getComputedStyle(el.closest('.num, .card')).backgroundColor),
          }))
      );
    })()`);
    // Four numerals plus the two callouts the Android panel keeps (steps 3 & 4).
    expect(ratios).toHaveLength(6);
    for (const { where, ratio } of ratios as { where: string; ratio: number }[]) {
      expect(ratio, `${where} contrast`).toBeGreaterThanOrEqual(4.5);
    }
  });

  // WCAG 1.4.11: the chevron's rotation is the only visual open/closed signal.
  // A glyph this thin reads against both the disc it is centred in and the panel
  // that disc sits on — the two are a step apart on each paper — so the ink owes
  // the floor on each rather than on whichever one happens to be measured.
  test(`the troubleshooting chevron clears the 3:1 non-text minimum in ${colorScheme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/beta');
    const ratios = await page.evaluate(`(() => {
      const contrast = ${CONTRAST};
      const panel = [...document.querySelectorAll('.beta-platform-panel')].find(
        (el) => getComputedStyle(el).display !== 'none'
      );
      const svg = panel.querySelector('.chev svg');
      const ink = getComputedStyle(svg).fill;
      return ['.chev-disc', 'details'].map((ground) => ({
        ground,
        ratio: contrast(ink, getComputedStyle(svg.closest(ground)).backgroundColor),
      }));
    })()`);
    expect(ratios).toHaveLength(2);
    for (const { ground, ratio } of ratios as { ground: string; ratio: number }[]) {
      expect(ratio, `chevron on ${ground}`).toBeGreaterThanOrEqual(3);
    }
  });
}
