import { expect, test } from '@playwright/test';
import { themes, toCssVarName, type ThemeTokens } from '../src/lib/design/tokens';

// /design is the public living styleguide (ADR-0096). Axe coverage lives in
// a11y.spec.ts; the value here is the two regressions a scan can't see: the
// theme picker must expose its selected state to assistive tech (a role=radio
// aria-checked segment, not styled buttons), and every token swatch must paint
// a real fill — a non-color token dropped straight into `background` computes
// as transparent and renders a silently blank card (the --brand-rgb channel
// triplet did exactly that).

test('theme picker exposes and updates its selected state', async ({ page }) => {
  await page.goto('/design');
  // Scoped to the header: the SegmentedPicker specimens further down include
  // their own radiogroup, whose accessible name also starts with "Theme".
  const picker = page.locator('header').getByRole('radiogroup', { name: 'Theme' });
  const system = picker.getByRole('radio', { name: 'system' });
  const dark = picker.getByRole('radio', { name: 'dark' });
  await expect(system).toHaveAttribute('aria-checked', 'true');

  // The picker is server-rendered before it's wired; retry the click until
  // hydration makes it land rather than racing it once.
  await expect(async () => {
    await dark.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark', { timeout: 500 });
  }).toPass();

  await expect(dark).toHaveAttribute('aria-checked', 'true');
  await expect(system).toHaveAttribute('aria-checked', 'false');
});

test('every token swatch paints a real fill', async ({ page }) => {
  await page.goto('/design');
  const swatches = page.locator('.swatch');
  expect(await swatches.count()).toBeGreaterThan(20);
  const unpainted = await swatches.evaluateAll((els) =>
    els
      .map((el) => {
        const style = getComputedStyle(el);
        return {
          fill: `${style.backgroundColor} ${style.backgroundImage}`,
          token: el.nextElementSibling?.textContent ?? '(unlabelled)',
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
