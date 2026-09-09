import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { SHORT_PAGE_HEIGHT_PX } from '../src/lib/breakpoints';

const SHORT_VIEWPORTS = [
  { width: 812, height: 375 },
  { width: 956, height: 440 },
];

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} feedback`, () => {
    test.use({ colorScheme, hasTouch: true });

    for (const viewport of SHORT_VIEWPORTS) {
      test(`the complete first field fits at ${viewport.width}×${viewport.height}`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await page.goto('/feedback');
        await expect(page.getByRole('button', { name: 'Why we ask' })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await expect(page.getByRole('radiogroup', { name: 'Report type' })).toBeInViewport({
          ratio: 1,
        });
        await expect(page.locator('#reportMessage')).toBeInViewport({ ratio: 1 });
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
        const option = page.locator('.report-kind .option:not(.active)');
        expect(
          await option.evaluate((el) => {
            const style = getComputedStyle(el);
            const probe = document.createElement('span');
            probe.style.color = 'var(--text)';
            el.append(probe);
            const matches = style.color === getComputedStyle(probe).color;
            probe.remove();
            return matches;
          })
        ).toBe(true);

        const cue = page.locator('.scroll-cue');
        await expect(cue).toHaveCSS('opacity', '1');
        const box = await cue.boundingBox();
        expect(box!.height).toBe(72);
        expect(box!.y + box!.height).toBe(viewport.height);
        await expect(cue).toHaveCSS('pointer-events', 'none');
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await expect(cue).toHaveCSS('opacity', '0');
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect(cue).toHaveCSS('opacity', '1');
      });
    }

    test('the disclosure remains accessible in both states', async ({ page }) => {
      await page.setViewportSize(SHORT_VIEWPORTS[0]);
      await page.goto('/feedback');
      const trigger = page.getByRole('button', { name: 'Why we ask' });
      await expect(trigger).toBeVisible();
      const closed = await new AxeBuilder({ page }).analyze();
      expect(closed.violations.filter((v) => ['serious', 'critical'].includes(v.impact!))).toEqual(
        []
      );
      await trigger.click();
      await expect(page.locator('.lede')).toBeVisible();
      const open = await new AxeBuilder({ page }).analyze();
      expect(open.violations.filter((v) => ['serious', 'critical'].includes(v.impact!))).toEqual(
        []
      );
    });
  });
}

for (const route of ['/feedback', '/changelog', '/beta']) {
  for (const hasTouch of [false, true]) {
    test.describe(`${route} with touch ${hasTouch}`, () => {
      test.use({ hasTouch, viewport: SHORT_VIEWPORTS[0] });

      test('the introduction can be opened, closed, and read after rotation', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(route);
        const trigger = page.getByRole('button', { name: 'Why we ask' });
        const lede = page.locator('.lede');
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
        await expect(lede).toBeHidden();
        await expect(trigger).toHaveAttribute('aria-controls', (await lede.getAttribute('id'))!);
        await trigger.focus();
        await page.keyboard.press('Enter');
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await expect(lede).toBeVisible();
        await expect(page.locator('.lede-chevron')).toHaveCSS('transition-duration', '0s');
        await page.keyboard.press('Space');
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
        await expect(lede).toBeHidden();
        await page.setViewportSize({ width: 812, height: SHORT_PAGE_HEIGHT_PX + 1 });
        await expect(trigger).toBeHidden();
        await expect(lede).toBeVisible();
        await page.setViewportSize({ width: 812, height: SHORT_PAGE_HEIGHT_PX });
        await expect(trigger).toBeVisible();
        await expect(lede).toBeHidden();
        await page.reload();
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      });

      test('the document fade retires at content end', async ({ page }) => {
        await page.goto(route);
        const cue = page.locator('.scroll-cue');
        await expect(cue).toHaveCSS('opacity', '1');
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await expect(cue).toHaveCSS('opacity', '0');
      });
    });
  }

  test(`${route} keeps the introduction readable without JavaScript`, async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      hasTouch: true,
      viewport: SHORT_VIEWPORTS[0],
    });
    const page = await context.newPage();
    await page.goto(route);
    await expect(page.locator('.lede')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Why we ask' })).toHaveCount(0);
    await context.close();
  });
}

test('portrait keeps its display heading and visible introduction', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/feedback');
  await expect(page.locator('.lede-toggle')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Why we ask' })).toBeHidden();
  await expect(page.locator('.lede')).toBeVisible();
  await expect(page.locator('h1')).toHaveCSS('font-size', '34px');
  await expect(page.locator('.page')).toHaveCSS('padding', '0px');
});
