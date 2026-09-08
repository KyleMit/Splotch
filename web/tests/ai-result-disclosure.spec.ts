import { expect, test } from '@playwright/test';
import { scale } from '../src/lib/design/tokens';
import { colorContrast } from '../src/lib/design/colorContrast';
import { revealAiResult } from './ai-harness';

// The strip sits on the dimmed backdrop, which is dark under either theme, so
// its on-scrim tokens stay unchanged under either app theme.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`paints the strip on backdrop colors in ${colorScheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await revealAiResult(page);

    const chrome = await page
      .getByRole('button', { name: 'Report this picture' })
      .evaluate((button, inkTokens) => {
        const tokenStyle = document.createElement('span').style;
        tokenStyle.color = inkTokens.scrimInk;
        const expectedText = tokenStyle.color;
        tokenStyle.color = inkTokens.scrimInkDanger;
        const strip = button.closest('.ai-result-disclosure') as HTMLElement;
        const icon = button.querySelector('svg') as SVGElement;
        return {
          expectedText,
          expectedReport: tokenStyle.color,
          fill: getComputedStyle(strip).backgroundColor,
          ground: getComputedStyle(strip).backdropFilter,
          text: getComputedStyle(strip).color,
          report: getComputedStyle(button).color,
          iconFill: getComputedStyle(icon).fill,
        };
      }, scale);
    expect(chrome.fill).toBe(scale.scrimPill);
    // The fill alone leaves the drawing showing through under 12px text; the
    // brightness floor is what keeps the ink legible over light artwork.
    expect(chrome.ground).toContain('brightness');
    expect(chrome.text).toBe(chrome.expectedText);
    expect(chrome.report).toBe(chrome.expectedReport);
    // Beats the modal shell's icon re-ink, which would repaint it dark on dark.
    expect(chrome.iconFill).toBe(chrome.report);
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`disclosure text and glyphs keep full opacity in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await revealAiResult(page);
    const strip = page.locator('.ai-result-disclosure');
    await expect(strip).toBeVisible();
    await expect(strip.locator('.ai-disclosure-separator')).toHaveCSS('opacity', '1');
    const flag = strip.getByRole('button', { name: 'Report this picture' });
    await expect(flag).toHaveCSS('opacity', '1');
    const ink = await flag.evaluate((el) => getComputedStyle(el).color);
    await expect(flag.locator('svg')).toHaveCSS('fill', ink);
    await flag.evaluate((el: HTMLButtonElement) => {
      el.disabled = true;
    });
    await expect(flag).toHaveCSS('opacity', '1');
    const softInk = await flag.evaluate((el) => getComputedStyle(el).color);
    await expect(flag.locator('svg')).toHaveCSS('fill', softInk);
    await expect(strip.locator('.ai-disclosure-separator')).toHaveCSS('color', softInk);
    const captionInk = await strip.evaluate((el) => getComputedStyle(el).color);
    const filter = await strip.evaluate((el) => getComputedStyle(el).backdropFilter);
    const brightness = Number(filter.match(/brightness\(([\d.]+)\)/)?.[1]);
    expect(brightness).toBeGreaterThan(0);
    const brightestChannel = Math.ceil(255 * brightness);
    const brightestBackdrop = `rgb(${brightestChannel}, ${brightestChannel}, ${brightestChannel})`;
    const fill = await strip.evaluate((el) => getComputedStyle(el).backgroundColor);
    const contrast = colorContrast(softInk, fill, brightestBackdrop);
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    expect(contrast).toBeLessThan(colorContrast(captionInk, fill, brightestBackdrop));
    expect(contrast).toBeLessThan(colorContrast(ink, fill, brightestBackdrop));
  });
}
