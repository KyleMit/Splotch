import { expect, test, type Page } from '@playwright/test';
import { colorContrast } from '../src/lib/design/colorContrast';

async function showTheme(page: Page, theme: 'light' | 'dark') {
  await page.goto('/design');
  await expect(async () => {
    await page
      .locator('header')
      .getByRole('radio', { name: theme === 'light' ? 'Light' : 'Dark', exact: true })
      .click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme, { timeout: 500 });
  }).toPass();
}

for (const theme of ['light', 'dark'] as const) {
  test(`keyboard focus follows the controls' shapes in ${theme}`, async ({ page }) => {
    await showTheme(page, theme);
    const controls = page.locator('.focus-controls');
    const brand = controls.getByRole('button', { name: 'Brand action', exact: true });
    await brand.click();
    await expect(brand).not.toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Shift+Tab');
    const names = [
      'Brand action',
      'Wash action',
      'Copy link',
      'Focus specimen access code',
      'One',
      'Folder pill',
    ];
    for (const name of names) {
      await page.keyboard.press('Tab');
      const focused = page.locator(':focus');
      await expect(focused).toHaveAccessibleName(name);
      await expect(focused).toHaveCSS('outline-style', 'solid');
      await expect(focused).toHaveCSS('outline-width', '2px');
      await expect(focused).toHaveCSS('outline-offset', '2px');
      await expect(focused).toHaveCSS('outline-color', 'rgb(171, 113, 225)');
    }
    await expect(page.locator(':focus')).toHaveCSS('border-radius', '999px');
    const copy = controls.getByRole('button', { name: 'Copy link', exact: true });
    await copy.focus();
    await expect(copy).toHaveCSS('border-radius', '8px');
    await expect(copy).toHaveCSS('padding', '0px');

    const nativeRadio = page.getByRole('radiogroup', { name: 'Report type (specimen)' });
    await nativeRadio.getByRole('radio').first().focus();
    await page.keyboard.press('ArrowRight');
    const nativeLabel = nativeRadio.locator('label:has(input:focus-visible)');
    await expect(nativeLabel).toHaveCSS('outline-color', 'rgb(171, 113, 225)');
    await expect(nativeLabel).toHaveCSS('outline-width', '2px');
    await expect(nativeLabel).toHaveCSS('outline-style', 'solid');
  });

  test(`warning semantics and ink remain readable in ${theme}`, async ({ page }) => {
    await showTheme(page, theme);
    const statuses = page.locator('.status-demo');
    await expect(statuses.getByRole('status')).toHaveCount(2);
    await expect(statuses.getByRole('alert')).toHaveCount(1);
    const warning = statuses.locator('.warning');
    await expect(warning).toHaveAttribute('role', 'status');
    await expect(warning).toHaveAttribute('aria-live', 'polite');
    await expect(warning).toHaveCSS('border-top-width', '1px');
    await expect(warning).toHaveCSS('border-top-style', 'solid');
    await expect(warning.locator('strong')).toHaveCSS('font-weight', '700');
    await expect(warning.locator('code')).toHaveCSS('font-size', '12px');
    const colors = await warning.evaluate((el) => {
      const style = getComputedStyle(el);
      const code = el.querySelector('code');
      if (!code) throw new Error('Missing inline warning chip');
      const chip = getComputedStyle(code);
      return {
        ink: style.color,
        wash: style.backgroundColor,
        chip: chip.backgroundColor,
        chipInk: chip.color,
      };
    });
    expect(colors.chipInk).toBe(colors.ink);
    expect(colors.chip).not.toBe(colors.wash);
    expect(colorContrast(colors.ink, colors.wash, colors.wash)).toBeGreaterThanOrEqual(4.5);
    expect(colorContrast(colors.chipInk, colors.chip, colors.wash)).toBeGreaterThanOrEqual(4.5);
  });

  test(`rule labels keep heading semantics and section rhythm in ${theme}`, async ({ page }) => {
    await showTheme(page, theme);
    const demo = page.locator('.rule-demo');
    await expect(demo.getByRole('heading', { name: 'Overview', level: 2 })).toBeVisible();
    await expect(demo.getByRole('heading', { name: 'Access codes · 12', level: 2 })).toBeVisible();
    await expect(demo.getByRole('heading', { name: 'Details', level: 3 })).toBeVisible();
    await expect(
      demo.getByRole('heading', { name: 'Second section · 24', level: 2 })
    ).toBeVisible();
    const heading = demo.getByRole('heading', { name: 'Overview' });
    await expect(heading).toHaveCSS('padding-bottom', '0px');
    await expect(heading).toHaveCSS('gap', '12px');
    await expect(demo.locator('.rule-stack')).toHaveCSS('gap', '40px');
    await expect(demo.locator('.rule-section').first()).toHaveCSS('gap', '20px');
    const colors = await heading.evaluate((el) => {
      const surface = el.closest('.rule-demo');
      if (!surface) throw new Error('Missing specimen surface');
      return {
        ink: getComputedStyle(el).color,
        rule: getComputedStyle(el, '::after').backgroundColor,
        surface: getComputedStyle(surface).backgroundColor,
      };
    });
    expect(colorContrast(colors.ink, colors.surface, colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(colorContrast(colors.ink, colors.surface, colors.surface)).toBeGreaterThan(
      colorContrast(colors.rule, colors.surface, colors.surface)
    );
  });
}
