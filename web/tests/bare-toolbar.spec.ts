import { test, expect } from '@playwright/test';
import {
  gotoApp,
  openSettingsModal,
  openHubSection,
  drawCommittedStroke,
  firstOpaquePixel,
} from './helpers';
import { openDrawer, openBrushMenu } from './flows-harness';
import { STORAGE_KEYS } from '../src/lib/storageKeys';

const layouts = [
  { name: 'tablet', width: 1180, height: 820 },
  { name: 'portrait', width: 390, height: 844 },
  { name: 'compact', width: 844, height: 390 },
];

for (const layout of layouts) {
  for (const theme of ['light', 'dark']) {
    for (const scale of [70, 100, 130]) {
      test(`Bare ${layout.name} ${theme} at ${scale}% covers the controls and open menus`, async ({
        page,
      }) => {
        await page.setViewportSize(layout);
        await page.addInitScript(
          ({ keys, theme, scale }) => {
            localStorage.setItem(keys.toolbarStyle, 'bare');
            localStorage.setItem(keys.theme, theme);
            localStorage.setItem(keys.actionButtonScale, String(scale));
          },
          { keys: STORAGE_KEYS, theme, scale }
        );
        await gotoApp(page);
        await openDrawer(page);
        await openBrushMenu(page);
        await expect(page.locator('#brushButton')).toHaveCSS(
          'background-color',
          'rgba(0, 0, 0, 0)'
        );
        await expect
          .poll(() =>
            page.evaluate(() => {
              const menu = document.querySelector('.brush-menu')!.getBoundingClientRect();
              const pane = document.querySelector<HTMLElement>('[data-glass-pane="0"]')!;
              const bounds = pane.getBoundingClientRect();
              const mask = getComputedStyle(pane).maskImage;
              const svg = decodeURIComponent(mask.slice(mask.indexOf(',') + 1, -2));
              const rects = new DOMParser()
                .parseFromString(svg, 'image/svg+xml')
                .querySelectorAll('rect');
              return Array.from(rects).some((rect) => {
                const x = bounds.x + Number(rect.getAttribute('x'));
                const y = bounds.y + Number(rect.getAttribute('y'));
                return (
                  x <= menu.x &&
                  y <= menu.y &&
                  x + Number(rect.getAttribute('width')) >= menu.right &&
                  y + Number(rect.getAttribute('height')) >= menu.bottom
                );
              });
            })
          )
          .toBe(true);
        await page.keyboard.press('Escape');
        await expect(page.locator('.brush-menu')).toHaveCount(0);
        await expect(page.locator('#brushButton')).toBeFocused();
      });
    }
  }
}

test('Toolbar choice persists and switching keeps an existing drawing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);
  await drawCommittedStroke(page, [
    { x: 180, y: 230 },
    { x: 220, y: 280 },
    { x: 260, y: 230 },
  ]);
  await openSettingsModal(page);
  await openHubSection(page, 'appearance', '[role="radiogroup"][aria-label="Toolbar"]');
  const toolbar = page.getByRole('radiogroup', { name: 'Toolbar', exact: true });
  await toolbar.getByRole('radio', { name: 'Bare', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-toolbar', 'bare');
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.toolbarStyle))
    .toBe('bare');
  await expect(page.locator('#undoButton')).toHaveAttribute('aria-disabled', 'false');
  await expect.poll(() => firstOpaquePixel(page)).not.toBeNull();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-toolbar', 'bare');
});

for (const layout of layouts) {
  test(`Bare ${layout.name} shrinks its glass when drawing controls are disabled`, async ({
    page,
  }) => {
    await page.setViewportSize(layout);
    await page.addInitScript((keys) => {
      localStorage.setItem(keys.toolbarStyle, 'bare');
      localStorage.setItem(keys.drawerOpen, 'true');
      for (const key of [
        keys.crayonEnabled,
        keys.magicBrushEnabled,
        keys.eraserEnabled,
        keys.strokeWidthControl,
        keys.undoButtonEnabled,
      ])
        localStorage.setItem(key, 'false');
    }, STORAGE_KEYS);
    await gotoApp(page);
    await expect(page.locator('#brushButton')).toBeHidden();
    await expect(page.locator('#strokeWidthButton')).toBeHidden();
    await expect(page.locator('#coloringBookButton')).toBeVisible();
    const pane = page.locator('[data-glass-pane="0"]');
    await expect(pane).toBeVisible();
    const maskArea = () =>
      pane.evaluate((element) => {
        const mask = getComputedStyle(element).maskImage;
        const svg = decodeURIComponent(mask.slice(mask.indexOf(',') + 1, -2));
        return Array.from(
          new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('rect')
        ).reduce(
          (sum, rect) =>
            sum + Number(rect.getAttribute('width')) * Number(rect.getAttribute('height')),
          0
        );
      });
    const initial = await maskArea();
    await page.getByRole('button', { name: 'Collapse controls', exact: true }).click();
    await expect(page.locator('#coloringBookButton')).toBeHidden();
    await expect.poll(maskArea).toBeLessThan(initial);
  });
}

test('Bare compact color menu keeps its swatches and dismissal', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.addInitScript((key) => localStorage.setItem(key, 'bare'), STORAGE_KEYS.toolbarStyle);
  await gotoApp(page);
  await page.locator('#colorButton').click();
  await expect(page.locator('.color-menu')).toBeVisible();
  await expect(page.locator('.color-menu')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.locator('.color-menu').getByRole('button', { name: 'Red', exact: true }).click();
  await expect(page.locator('.color-menu')).toHaveCount(0);
  await expect(page.locator('#colorButton')).toHaveCSS('color', 'rgb(236, 83, 78)');
});
