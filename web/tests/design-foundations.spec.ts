import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { colorContrast } from '../src/lib/design/colorContrast';

const MIN_WARNING_CHIP_CONTRAST = { light: 1.1, dark: 1.25 } as const;

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
    const names = ['Brand action', 'Wash action', 'Copy link', 'Access code', 'One', 'Folder pill'];
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

    const nativeRadio = page.getByRole('radiogroup', { name: 'Native radio group (specimen)' });
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
    await expect(warning).toHaveCSS('border-top-width', '0px');
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
        surface: style.getPropertyValue('--surface').trim(),
        successWash: style.getPropertyValue('--success-wash').trim(),
        chip: chip.backgroundColor,
        chipInk: chip.color,
      };
    });
    expect(colorContrast(colors.wash, colors.surface, colors.surface)).toBeGreaterThanOrEqual(
      colorContrast(colors.successWash, colors.surface, colors.surface)
    );
    expect(colors.chipInk).toBe(colors.ink);
    expect(colorContrast(colors.chip, colors.wash, colors.wash)).toBeGreaterThanOrEqual(
      MIN_WARNING_CHIP_CONTRAST[theme]
    );
    expect(colorContrast(colors.ink, colors.wash, colors.wash)).toBeGreaterThanOrEqual(4.5);
    expect(colorContrast(colors.chipInk, colors.chip, colors.wash)).toBeGreaterThanOrEqual(4.5);
  });

  test(`rule labels keep heading semantics and section rhythm in ${theme}`, async ({ page }) => {
    await showTheme(page, theme);
    const demo = page.locator('.rule-demo');
    await expect(
      demo.getByRole('heading', { name: 'Heading', level: 2, exact: true })
    ).toBeVisible();
    await expect(
      demo.getByRole('heading', { name: 'Heading with count · Count', level: 3 })
    ).toBeVisible();
    await expect(demo.getByRole('heading')).toHaveCount(2);
    const heading = demo.getByRole('heading', { name: 'Heading', exact: true });
    await expect(heading).toHaveCSS('padding-bottom', '0px');
    await expect(heading).toHaveCSS('gap', '12px');
    await expect(demo).toHaveCSS('gap', '40px');
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

// An unknown pseudo-class reproduces selector-list parsing on browsers that
// support :focus-visible but predate :has(), without requiring an old binary.
test('an unsupported relational selector leaves basic keyboard focus intact', async ({ page }) => {
  const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
  const tokens = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');
  await page.setContent('<button type="button">Focus action</button>');
  await page.addStyleTag({ content: tokens });
  await page.addStyleTag({ content: css.replaceAll(':has(', ':unsupported-has(') });
  await page.keyboard.press('Tab');
  const button = page.getByRole('button', { name: 'Focus action' });
  await expect(button).toBeFocused();
  await expect(button).toHaveCSS('outline-style', 'solid');
  await expect(button).toHaveCSS('outline-width', '2px');
  await expect(button).toHaveCSS('outline-color', 'rgb(171, 113, 225)');
});

for (const theme of ['light', 'dark'] as const) {
  test(`dialog header keeps back flat and separates its title in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await showTheme(page, theme);
    const specimen = page.locator('.header-specimen');
    const back = specimen.getByRole('button', { name: 'Back', exact: true });
    const close = specimen.getByRole('button', { name: 'Close', exact: true });
    for (const button of [back, close]) {
      await expect(button).toHaveCSS('width', '44px');
      await expect(button).toHaveCSS('height', '44px');
    }
    const controls = await specimen.locator('button').evaluateAll((buttons) =>
      buttons.map((button) => {
        const style = getComputedStyle(button);
        const box = button.getBoundingClientRect();
        return {
          fill: getComputedStyle(button.querySelector('svg')!).fill,
          background: style.backgroundColor,
          borderWidth: style.borderWidth,
          shadow: style.boxShadow,
          top: box.top,
          right: box.right,
        };
      })
    );
    expect(controls[0].fill).toBe(controls[1].fill);
    expect(controls[0].borderWidth).toBe('0px');
    expect(controls[0].shadow).toBe('none');
    expect(controls[1].borderWidth).toBe('2px');
    expect(controls[1].shadow).not.toBe('none');
    const title = await specimen.getByRole('heading', { name: 'Appearance' }).boundingBox();
    expect(title!.x - controls[0].right).toBeGreaterThanOrEqual(16);
    expect(controls[0].top).toBe(controls[1].top);
    expect(controls[1].right).toBeLessThanOrEqual(375);
    expect(
      colorContrast(controls[0].fill, controls[0].background, controls[0].background)
    ).toBeGreaterThanOrEqual(3);
    await back.hover();
    await expect(back).toHaveCSS('border-width', '0px');
    await expect(back).toHaveCSS('box-shadow', 'none');
    await back.click();
    await expect(specimen.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await close.click();
    await expect(specimen.getByRole('button', { name: 'Show dialog header' })).toBeVisible();
  });

  test(`styleguide prose keeps tokens whole and uses body contrast in ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await showTheme(page, theme);
    const tokens = page.locator('main p code');
    expect(await tokens.count()).toBeGreaterThan(0);
    const wrapping = await tokens.evaluateAll((elements) =>
      elements
        .filter((el) => getComputedStyle(el).whiteSpace !== 'nowrap')
        .map((el) => el.textContent)
    );
    expect(wrapping).toEqual([]);
    const bodyInk = await page.locator('.lede').evaluate((el) => getComputedStyle(el).color);
    for (const selector of ['.sources', '.defaults p', '#color .hint']) {
      await expect(page.locator(selector)).toHaveCSS('color', bodyInk);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test(`swatch stacks clip their last row to rounded corners in ${theme}`, async ({ page }) => {
    await showTheme(page, theme);
    const stacks = page.locator('.family-stack');
    expect(await stacks.count()).toBeGreaterThan(0);
    const clips = await stacks.evaluateAll((elements) =>
      elements.map((el) => ({
        overflow: getComputedStyle(el).overflow,
        radius: getComputedStyle(el).borderRadius,
      }))
    );
    for (const clip of clips) {
      expect(clip.overflow).toBe('hidden');
      expect(clip.radius).toBe('12px');
    }
  });
}
