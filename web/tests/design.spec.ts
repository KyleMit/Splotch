import { expect, test, type Locator } from '@playwright/test';
import { themes, toCssVarName, type ThemeTokens } from '../src/lib/design/tokens';
import { gotoApp, openHydratedContents, openSettingsModal } from './helpers';

// /design is the public living styleguide (ADR-0096). Axe coverage lives in
// a11y.spec.ts; the value here is the regressions a scan can't see: the
// theme picker must expose its selected state to assistive tech (a role=radio
// aria-checked segment, not styled buttons), every color chip must paint
// a real fill — a non-color token dropped straight into `background` computes
// as transparent and renders a silently blank chip (the --brand-rgb channel
// triplet did exactly that) — and the specimens must lay out the way the real
// app lays them out, which for a shared component means the styleguide is the
// one place it renders outside its usual ancestor.

test('theme picker exposes and updates its selected state', async ({ page }) => {
  await page.goto('/design');
  // Scoped to the header: the SegmentedPicker specimens further down include
  // their own radiogroup, whose accessible name also starts with "Theme".
  const picker = page.locator('header').getByRole('radiogroup', { name: 'Theme' });
  const light = picker.getByRole('radio', { name: 'Light' });
  const dark = picker.getByRole('radio', { name: 'Dark' });
  // The toggle is binary and initializes from the applied theme — no stamp and
  // a light-scheme browser resolve to Light.
  await expect(light).toHaveAttribute('aria-checked', 'true');

  // The picker is server-rendered before it's wired; retry the click until
  // hydration makes it land rather than racing it once.
  await expect(async () => {
    await dark.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark', { timeout: 500 });
  }).toPass();

  await expect(dark).toHaveAttribute('aria-checked', 'true');
  await expect(light).toHaveAttribute('aria-checked', 'false');
});

// A system-dark first load has no data-theme stamp — the page is dark purely
// via prefers-color-scheme — and hydration doesn't repair attributes, so a
// toggle initialized client-side would keep the server's Light aria-checked
// forever. The post-mount adoption is what this locks in.
test.describe('system-dark first load', () => {
  test.use({ colorScheme: 'dark' });

  test('the theme toggle and chip values adopt the applied dark theme', async ({ page }) => {
    await page.goto('/design');
    const picker = page.locator('header').getByRole('radiogroup', { name: 'Theme' });
    // Retried, not read once: the adoption lands after hydration.
    await expect(picker.getByRole('radio', { name: 'Dark' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expect(picker.getByRole('radio', { name: 'Light' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    // The chip's printed value follows the same state — derived from the
    // token source, not a mirrored hex.
    await expect(
      page.locator('.color-chip', { has: page.getByText('--app-bg', { exact: true }) })
    ).toContainText(themes.dark.appBg);
  });
});

// On a phone the header sheds the toggle's words, and below 390 the page label
// with them — the row cannot seat the brand, a 170px track and a ~99px label in
// 375pt, which is how "Design system" came to render as "De…". What the collapse
// must not cost is the option's *name*: the visible text is where a bare segment
// gets one, so hiding it without moving the name onto the control leaves two
// unlabelled buttons. These are the widths either side of the label threshold.
for (const { device, viewport, pageLabel } of [
  { device: 'an iPhone 13 mini', viewport: { width: 375, height: 812 }, pageLabel: 'hidden' },
  { device: 'an iPhone 16 Pro Max', viewport: { width: 440, height: 956 }, pageLabel: 'shown' },
] as const) {
  test(`the header theme options keep their names with the labels collapsed on ${device}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/design');
    const picker = page.locator('header').getByRole('radiogroup', { name: 'Theme' });

    // Found by accessible name with the text gone — the assertion the collapse
    // is there to survive.
    for (const name of ['Light', 'Dark']) {
      const option = picker.getByRole('radio', { name });
      await expect(option).toBeVisible();
      await expect(option.locator('.option-label')).toBeHidden();
      // Square rather than a shrunken pill: the label was what gave it width.
      const box = (await option.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    // Which state the label is in is the case's own assertion, not a branch on
    // what it happens to be: reading it off the page would let 440 pass by
    // hiding the label, which is the half of the breakpoint this case exists
    // to hold. Shown then means shown whole — never an ellipsized one.
    const label = page.locator('.header-label');
    await expect(label).toBeVisible({ visible: pageLabel === 'shown' });
    // Shown then means shown whole — never an ellipsized one. The hidden case is
    // `display: none` rather than unmounted, so both widths read zero there and
    // the same check carries (trivially) instead of needing a branch around it.
    const clipped = await label.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(clipped).toBe(false);
  });
}

test('every color chip paints a real fill', async ({ page }) => {
  await page.goto('/design');
  const chips = page.locator('.color-chip');
  expect(await chips.count()).toBeGreaterThan(20);
  const unpainted = await chips.evaluateAll((els) =>
    els
      .map((el) => {
        const style = getComputedStyle(el);
        return {
          fill: `${style.backgroundColor} ${style.backgroundImage}`,
          token: el.querySelector('.chip-name')?.textContent ?? '(unlabelled)',
        };
      })
      .filter(({ fill }) => fill === 'rgba(0, 0, 0, 0) none')
      .map(({ token }) => token)
  );

  // Tokens authored as 'transparent' in the scanned (light) theme are blank on
  // purpose — derived from the source so the allowance can't drift.
  const transparentByDesign = (Object.keys(themes.light) as (keyof ThemeTokens)[])
    .filter((key) => themes.light[key] === 'transparent')
    .map((key) => toCssVarName(key));
  expect(unpainted.sort()).toEqual(transparentByDesign.sort());
});

// The Disclosure primitive's chevron rotates via `transform` on a ::after
// pseudo-element, and a non-replaced *inline* box is not transformable — so the
// rotation silently no-ops unless the primitive blockifies it. It once relied on
// every call site to do that from outside, which meant a new caller that styled
// nothing got a dead chevron. /design renders the primitive with only its own
// padding/type/color on top, so it is the one place this is observable without a
// caller's layout confounding it.
test('the disclosure chevron rotates open', async ({ page }) => {
  await page.goto('/design');
  const summary = page.locator('.disclosure-demo summary');
  const chevronTransform = () =>
    summary.evaluate((el) => getComputedStyle(el, '::after').transform);

  // getComputedStyle reports a transform on an inline box even though it is
  // never applied, so the matrix below proves the rule is declared, not that it
  // renders. This is the assertion that fails when the chevron stops rotating.
  await expect
    .poll(() => summary.evaluate((el) => getComputedStyle(el, '::after').display))
    .not.toBe('inline');

  await expect.poll(chevronTransform).toBe('none');

  await summary.click();
  await expect
    .poll(() => summary.evaluate((el) => el.closest('details')?.hasAttribute('open')))
    .toBe(true);

  // Any non-identity matrix, rather than the exact 90° one: what regresses here
  // is the rotation being dropped entirely, and pinning the angle would make the
  // spec a second home for a value the primitive owns.
  await expect
    .poll(chevronTransform)
    .not.toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\)|matrix\(1,0,0,1,0,0\))$/);
});

// The scroll-cue specimens are the one place the primitive stands in a plain
// box — no dialog, no settings pane — so they are where its positional contract
// is observable with nothing else in the way. Lift a cue out of the scroller it
// belongs to and it still paints a gradient; what changes is only which end it
// reads, so the caption and the specimen part company in silence.
test('the scroll cue specimens show the state each one is captioned with', async ({ page }) => {
  await page.goto('/design');
  const scrollers = page.locator('.cue-scroller');
  await expect(scrollers).toHaveCount(2);
  // Read them where a reader reads them. The primitive leaves its observer root
  // implicit, so an intersection is clipped by every scrollable ancestor — the
  // document included. A specimen still below the page's own fold therefore has
  // its end off screen for that reason, and reports the same "more below" the
  // app's dialogs only ever get from their own scrollport.
  await page.locator('.cue-demo').scrollIntoViewIfNeeded();

  const cueOpacity = (index: number) =>
    scrollers
      .nth(index)
      .locator('.scroll-cue')
      .evaluate((el) => Number(getComputedStyle(el).opacity));

  await expect.poll(() => cueOpacity(0)).toBe(1);
  await expect.poll(() => cueOpacity(1)).toBe(0);

  await scrollers.first().evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await expect.poll(() => cueOpacity(0)).toBe(0);
});

// The icon column a settings row hangs off — the icon's box, the gap to its
// label, and the indent that lines a help line (and an icon-less SliderRow) up
// under that label — comes from custom properties declared outside the row
// components. Scoped to the modal, they simply don't resolve in the furniture
// demo: the icon falls back to its intrinsic size and the indent collapses to
// zero, with nothing in the suite the wiser.
async function iconColumnMetrics(scope: Locator) {
  return scope.evaluate((root) => {
    const styleOf = (selector: string) => {
      const el = root.querySelector(selector);
      if (!el) throw new Error(`no ${selector} inside ${root.className}`);
      return getComputedStyle(el);
    };
    const icon = styleOf('.setting-icon');
    return {
      iconWidth: icon.width,
      iconHeight: icon.height,
      gap: styleOf('.setting-info').columnGap,
      indent: styleOf('.setting-help').marginLeft,
    };
  });
}

test('the styleguide lays settings rows out on the modal’s icon column', async ({ page }) => {
  await gotoApp(page);
  const modal = await openSettingsModal(page);
  await modal.locator('.settings-nav').getByRole('button', { name: 'Saving' }).click();
  const inModal = await iconColumnMetrics(modal.locator('.settings-zoom'));

  // Asserted as a relationship rather than against pixel literals, so the
  // pairing stays free to change: whatever the icon box is, the indent clears
  // it plus the gap. Equality alone would still hold if both contexts lost the
  // properties together.
  const px = (value: string) => Number.parseFloat(value);
  expect(px(inModal.iconWidth)).toBeGreaterThan(0);
  expect(inModal.iconHeight).toBe(inModal.iconWidth);
  expect(px(inModal.indent)).toBeCloseTo(px(inModal.iconWidth) + px(inModal.gap));

  await page.goto('/design');
  expect(await iconColumnMetrics(page.locator('.furniture-demo'))).toEqual(inModal);
});

// Below the 980px breakpoint the sidebar rail is gone and the sticky contents
// row is the only thing reporting reading position, so what it says — and where
// picking from it lands — is the whole narrow-screen navigation contract.
test.describe('phone contents', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the row counts the sections at the hero and names the one being read', async ({ page }) => {
    await page.goto('/design');
    const row = page.locator('.header-toc summary');
    // Derived from the sections the page actually renders, not a written count.
    const sections = await page.locator('main.styleguide section[data-sg-section]').count();
    await expect(row).toContainText(`${sections} sections`);

    // The last section, at max scroll: a spy keyed on "the heading has crossed
    // the line" can only ever reach it if the page reserves room under it.
    // Read off the DOM rather than the a11y tree: the panel is closed, so its
    // rows are display:none and no role selector can see them.
    const lastLabel = await page.locator('.header-toc a').last().textContent();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(row).toContainText(lastLabel!.trim());

    // Symmetric rather than latched: back at the hero it advertises the count.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(row).toContainText(`${sections} sections`);
  });

  // A sticky element taller than its scrollport can never be scrolled to its own
  // bottom — the pin outlives the scroll — so the panel has to cap itself to the
  // room under the row. Its own padding has to come out of that cap, not add to
  // it, which is what content-box would silently do.
  test('the open panel fits the viewport it is pinned in, all the way to its last row', async ({
    page,
  }) => {
    await page.goto('/design');
    const contents = page.locator('.header-toc');
    await contents.locator('summary').click();

    await expect
      .poll(() =>
        page.evaluate(() => {
          const panel = document.querySelector('.header-toc .panel')!.getBoundingClientRect();
          return Math.round(panel.bottom - window.innerHeight);
        })
      )
      .toBeLessThanOrEqual(0);

    const last = contents.getByRole('link').last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
  });

  // Where the viewport is short the list outruns the panel and the internal
  // scroll is the only way to the last row — which the case above never
  // exercises, because at 844 tall the whole list fits.
  test('the last row stays reachable when the list outruns the panel', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 667 });
    await page.goto('/design');
    const contents = page.locator('.header-toc');
    await contents.locator('summary').click();

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const panel = document.querySelector('.header-toc .panel')!;
            return panel.scrollHeight - panel.clientHeight;
          }),
        { message: 'the list has to outrun the panel for this to test anything' }
      )
      .toBeGreaterThan(0);

    const last = contents.getByRole('link').last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
  });

  // The row is in the flow above every section it links to, so the panel's
  // height has to leave the document before the target's position means
  // anything — jumping while open lands a full panel-height short, and the row
  // would then name a different section than the one picked.
  test('picking a section from the panel lands it clear of the header', async ({ page }) => {
    await page.goto('/design');
    const contents = page.locator('.header-toc');
    await openHydratedContents(contents);
    await contents.getByRole('link', { name: 'Named chrome' }).click();
    await expect(contents.locator('details')).not.toHaveAttribute('open');

    // Bounded on both sides: under the header is a heading parked out of sight,
    // and a screenful below it is the undershoot of measuring the target while
    // the panel's height is still in the flow above it.
    const gapBelowHeader = () =>
      page.evaluate(() => {
        const header = document.querySelector('.site-header')!.getBoundingClientRect();
        const section = document.getElementById('named')!.getBoundingClientRect();
        return Math.round(section.top - header.bottom);
      });
    await expect.poll(gapBelowHeader).toBeLessThanOrEqual(48);
    expect(await gapBelowHeader()).toBeGreaterThanOrEqual(0);
    await expect(contents.locator('summary')).toContainText('Named chrome');

    // The narrow pick has to leave the same trace the wide rail's anchor does,
    // or the section can't be shared and Back doesn't undo the jump.
    await expect(page).toHaveURL(/#named$/);
    await page.goBack();
    await expect(page).not.toHaveURL(/#named$/);
  });

  // Collapsing the panel takes the activated row out of the document with focus
  // still on it, which drops a keyboard user to <body> at the moment they
  // navigate — no focus ring, and Tab restarts from the top of the page.
  test('activating a row from the keyboard leaves focus on the collapsed row', async ({ page }) => {
    await page.goto('/design');
    const contents = page.locator('.header-toc');
    await openHydratedContents(contents);

    await contents.getByRole('link', { name: 'Named chrome' }).focus();
    await page.keyboard.press('Enter');
    await expect(contents.locator('details')).not.toHaveAttribute('open');

    await expect
      .poll(() =>
        page.evaluate(
          () => document.activeElement === document.querySelector('.header-toc summary')
        )
      )
      .toBe(true);
  });
});

// A deep link is the one jump the contents does not compute for itself, so it
// rides on scroll-margin-top — which has to agree with a header that carries a
// row more chrome below the breakpoint. The section components each used to
// declare that number, which is how it came to disagree with the header.
for (const [label, viewport] of [
  ['a phone', { width: 390, height: 844 }],
  ['a desktop', { width: 1280, height: 900 }],
] as const) {
  test(`a deep link parks its heading clear of the sticky header on ${label}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/design#motion');

    await expect
      .poll(() =>
        page.evaluate(() => {
          const header = document.querySelector('.site-header')!.getBoundingClientRect();
          const section = document.getElementById('motion')!.getBoundingClientRect();
          return Math.round(section.top - header.bottom);
        })
      )
      .toBeGreaterThanOrEqual(0);
  });
}

// 390 is the common phone width; 320 is the narrowest supported one, where a
// grid column floor wider than the padded viewport once forced sideways scroll.
for (const width of [320, 390]) {
  test(`the styleguide never scrolls sideways on a ${width}px phone viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/design');
    await expect(page.locator('h1', { hasText: 'Splotch design system' })).toBeVisible();

    // Polled, not read once: the font load can reflow the token tables after
    // first paint, and overflow only exists once the widest row has laid out.
    await expect
      .poll(() => page.locator('main.styleguide').evaluate((el) => el.scrollWidth - el.clientWidth))
      .toBeLessThanOrEqual(0);
  });
}
