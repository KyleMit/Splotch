import { test, expect, type Page } from '@playwright/test';
import {
  gotoApp,
  openSettingsModal,
  openHubSection,
  drawCommittedStroke,
  firstOpaquePixel,
} from './helpers';
import { openDrawer, openBrushMenu, openStrokeMenu } from './flows-harness';
import { STORAGE_KEYS } from '../src/lib/storageKeys';
import { PALETTE_COLUMN_GEOMETRY } from '../src/lib/design/trimGeometry';

const layouts = [
  { name: 'tablet', width: 1180, height: 820 },
  { name: 'portrait', width: 390, height: 844 },
  { name: 'compact', width: 844, height: 390 },
];

async function expectGlassCovers(page: Page, selector: string) {
  await expect
    .poll(() =>
      page.evaluate((selector) => {
        const panes = Array.from(document.querySelectorAll<HTMLElement>('[data-glass-pane]'));
        const rects = panes.flatMap((pane) => {
          const bounds = pane.getBoundingClientRect();
          const mask = getComputedStyle(pane).maskImage;
          const svg = decodeURIComponent(mask.slice(mask.indexOf(',') + 1, -2));
          return Array.from(
            new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('rect')
          ).map((rect) => ({
            x: bounds.x + Number(rect.getAttribute('x')),
            y: bounds.y + Number(rect.getAttribute('y')),
            width: Number(rect.getAttribute('width')),
            height: Number(rect.getAttribute('height')),
          }));
        });
        const targets = Array.from(document.querySelectorAll(selector))
          .map((el) => el.getBoundingClientRect())
          .filter((rect) => rect.width && rect.height);
        return (
          targets.length > 0 &&
          targets.every((target) =>
            rects.some(
              (rect) =>
                rect.x <= target.x &&
                rect.y <= target.y &&
                rect.x + rect.width >= target.right &&
                rect.y + rect.height >= target.bottom
            )
          )
        );
      }, selector)
    )
    .toBe(true);
}

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
        await expectGlassCovers(page, '.brush-menu');
        await page.keyboard.press('Escape');
        await expect(page.locator('.brush-menu')).toHaveCount(0);
        await expect(page.locator('#brushButton')).toBeFocused();
        await openStrokeMenu(page);
        await expectGlassCovers(page, '.stroke-width-menu');
        await page.keyboard.press('Escape');
        await expectGlassCovers(
          page,
          '.actions-panel .action-button, .drawer-toggle, #settingsButton'
        );
        if (layout.name === 'compact') {
          await page.locator('#colorButton').click();
          await page.locator('.color-menu').waitFor();
          await expectGlassCovers(page, '.color-menu');
        }
      });
    }
  }
}

test('Button style choice persists and switching keeps an existing drawing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);
  await drawCommittedStroke(page, [
    { x: 180, y: 230 },
    { x: 220, y: 280 },
    { x: 260, y: 230 },
  ]);
  await openSettingsModal(page);
  await openHubSection(page, 'appearance', '[role="radiogroup"][aria-label="Button style"]');
  const toolbar = page.getByRole('radiogroup', { name: 'Button style', exact: true });
  await toolbar.getByRole('radio', { name: 'Flat', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-toolbar', 'bare');
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.toolbarStyle))
    .toBe('bare');
  await expect(page.locator('#undoButton')).toHaveAttribute('aria-disabled', 'false');
  await expect.poll(() => firstOpaquePixel(page)).not.toBeNull();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-toolbar', 'bare');
});

for (const layout of layouts.slice(0, 2)) {
  test(`Switching toolbar styles keeps the ${layout.name} HUD controls in place`, async ({
    page,
  }) => {
    await page.setViewportSize(layout);
    await page.addInitScript((key) => localStorage.setItem(key, 'true'), STORAGE_KEYS.drawerOpen);
    await gotoApp(page);
    const selectors = [
      '.color-palette',
      '.color-swatch:visible',
      '.gradient-swatch',
      '#brushButton',
      '#strokeWidthButton',
      '#undoButton',
      '#settingsButton',
    ];
    const bounds = async () =>
      Promise.all(selectors.map((selector) => page.locator(selector).first().boundingBox()));
    const initial = await bounds();
    await openSettingsModal(page);
    if (layout.name === 'portrait')
      await openHubSection(page, 'appearance', '[role="radiogroup"][aria-label="Button style"]');
    const toolbar = page.getByRole('radiogroup', { name: 'Button style', exact: true });
    await toolbar.getByRole('radio', { name: 'Flat', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-toolbar', 'bare');
    await expect.poll(bounds).toEqual(initial);
    await toolbar.getByRole('radio', { name: 'Raised', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-toolbar', 'buttons');
    await expect.poll(bounds).toEqual(initial);
  });
}

test('Buttons palette reaches the landscape edges and aligns its custom swatch with the actions', async ({
  page,
}) => {
  await page.setViewportSize(layouts[0]);
  await gotoApp(page);
  await openDrawer(page);
  const palette = (await page.locator('.color-palette').boundingBox())!;
  const first = (await page.locator('.color-swatch:visible').first().boundingBox())!;
  const custom = (await page.locator('.gradient-swatch').boundingBox())!;
  const brush = (await page.locator('#brushButton').boundingBox())!;
  expect(first.y).toBeCloseTo(palette.y + PALETTE_COLUMN_GEOMETRY.paddingPx / 2);
  expect(custom.y + custom.height / 2).toBeCloseTo(brush.y + brush.height / 2);
});

test('Landscape palette keeps its edge padding at the smallest button size', async ({ page }) => {
  await page.setViewportSize(layouts[0]);
  await page.addInitScript(
    (key) => localStorage.setItem(key, '70'),
    STORAGE_KEYS.actionButtonScale
  );
  await gotoApp(page);
  await openDrawer(page);
  const palette = page.locator('.color-palette');
  await expect(palette).toHaveCSS('padding-top', '12px');
  const paletteBounds = (await palette.boundingBox())!;
  const first = (await page.locator('.color-swatch:visible').first().boundingBox())!;
  const custom = (await page.locator('.gradient-swatch').boundingBox())!;
  const brush = (await page.locator('#brushButton').boundingBox())!;
  expect(first.y).toBeCloseTo(paletteBounds.y + PALETTE_COLUMN_GEOMETRY.paddingPx / 2);
  expect(Math.abs(custom.y + custom.height / 2 - (brush.y + brush.height / 2))).toBeLessThanOrEqual(
    2
  );
});

for (const { name, openMenu, trigger } of [
  { name: 'brush', openMenu: openBrushMenu, trigger: '#brushButton' },
  { name: 'stroke', openMenu: openStrokeMenu, trigger: '#strokeWidthButton' },
]) {
  test(`Buttons toolbar dims other actions when the ${name} flyout opens`, async ({ page }) => {
    await page.setViewportSize(layouts[0]);
    await gotoApp(page);
    await openDrawer(page);
    await openMenu(page);
    await expect(page.locator(trigger)).toHaveCSS('filter', 'none');
    await expect(page.locator('#undoButton')).toHaveCSS('filter', 'grayscale(1) opacity(0.35)');
    await expect(page.locator('.drawer-toggle')).toHaveCSS('opacity', '0.2');
  });
}

test('Buttons toolbar dims other actions when the compact color flyout opens', async ({ page }) => {
  await page.setViewportSize(layouts[2]);
  await gotoApp(page);
  await page.locator('#colorButton').click();
  await expect(page.locator('.color-menu')).toBeVisible();
  await expect(page.locator('#colorButton')).toHaveCSS('filter', 'none');
  await expect(page.locator('#undoButton')).toHaveCSS('filter', 'grayscale(1) opacity(0.35)');
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

for (const theme of ['light', 'dark']) {
  test(`Bare unavailable Undo stays transparent while pressed in ${theme}`, async ({ page }) => {
    await page.addInitScript(
      ({ keys, theme }) => {
        localStorage.setItem(keys.toolbarStyle, 'bare');
        localStorage.setItem(keys.theme, theme);
      },
      { keys: STORAGE_KEYS, theme }
    );
    await gotoApp(page);
    await openDrawer(page);
    const undo = page.locator('#undoButton');
    await expect(undo).toHaveAttribute('aria-disabled', 'true');
    await undo.hover();
    await expect(undo).toHaveCSS('transform', 'none');
    await page.mouse.down();
    await expect(undo).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(undo).toHaveCSS('box-shadow', 'none');
    await page.mouse.up();
    const toggle = page.locator('.drawer-toggle');
    await toggle.hover();
    await page.mouse.down();
    await expect(toggle).toHaveCSS('opacity', '1');
    await page.mouse.up();
  });
}

test('Bare compact fullscreen shares one pane with the toolbar', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 360 });
  await page.addInitScript((keys) => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
    });
    localStorage.setItem(keys.toolbarStyle, 'bare');
    localStorage.setItem(keys.actionButtonScale, '130');
  }, STORAGE_KEYS);
  await gotoApp(page);
  await openDrawer(page);
  await expect(page.locator('.fullscreen-toggle')).toBeVisible();
  await expect(page.locator('.fullscreen-glass')).toBeHidden();
  await expect(page.locator('[data-glass-pane]')).toHaveCount(1);
  await expectGlassCovers(
    page,
    '.fullscreen-toggle, .actions-panel .action-button, #settingsButton'
  );
});

test('Bare hides stale pane geometry until rotation layout settles', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.addInitScript((key) => localStorage.setItem(key, 'bare'), STORAGE_KEYS.toolbarStyle);
  await gotoApp(page);
  await openDrawer(page);
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-glass-pane="0"]')).toHaveCSS('visibility', 'hidden');
  await page.clock.runFor(250);
  await expect(page.locator('[data-glass-pane="0"]')).toHaveCSS('visibility', 'visible');
  await expectGlassCovers(page, '.actions-panel .action-button, .drawer-toggle, #settingsButton');
});

test('Bare brush and eraser footprints remain above the glass', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.addInitScript((key) => localStorage.setItem(key, 'bare'), STORAGE_KEYS.toolbarStyle);
  await gotoApp(page);
  await openDrawer(page);
  const glassZ = await page
    .locator('[data-glass-pane="0"]')
    .evaluate((el) => Number(getComputedStyle(el).zIndex));
  await page.mouse.move(450, 735);
  await page.mouse.down();
  await expect(page.locator('.brush-ring')).toBeVisible();
  expect(
    await page.locator('.brush-ring').evaluate((el) => Number(getComputedStyle(el).zIndex))
  ).toBeGreaterThan(glassZ);
  await page.mouse.up();
  await openBrushMenu(page);
  await page.locator('#eraserButton').click();
  await page.mouse.move(450, 735);
  await expect(page.locator('.eraser-bubble')).toBeVisible();
  expect(
    await page.locator('.eraser-bubble').evaluate((el) => Number(getComputedStyle(el).zIndex))
  ).toBeGreaterThan(glassZ);
});
