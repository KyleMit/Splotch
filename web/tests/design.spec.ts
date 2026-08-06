import { expect, test, type Locator } from '@playwright/test';
import { themes, toCssVarName, type ThemeTokens } from '../src/lib/design/tokens';
import { gotoApp, openSettingsModal } from './helpers';

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
