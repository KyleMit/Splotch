import { expect, test, type Page } from '@playwright/test';

import { gotoApp, seedAiEnabled } from './helpers';

const LANDSCAPE_VIEWPORTS = [
  { name: 'narrow phone L', width: 568, height: 320, paletteWidth: 0 },
  { name: 'common phone L', width: 667, height: 375, paletteWidth: 0 },
  { name: 'single-column', width: 1024, height: 768, paletteWidth: 84 },
] as const;

const NARROW_LANDSCAPE_VIEWPORTS = LANDSCAPE_VIEWPORTS.slice(0, 2);

// Portrait: the column clears the palette bar at the top and its size comes
// from the visible viewport height. The bar is the row's whole width, so only
// the panel's inset and the button size are compared here.
const PORTRAIT_VIEWPORTS = [
  { name: 'phone P', width: 390, height: 844 },
  { name: 'short phone P', width: 360, height: 640 },
  { name: 'tablet P', width: 768, height: 1024 },
] as const;
const PERSISTED_VISIBILITY_CONFIGURATIONS = [
  {
    name: 'three-button row',
    hiddenKeys: ['splotch-screenshot-enabled', 'splotch-undo-button-enabled'],
    visibleButtonCount: 3,
  },
  {
    name: 'brush-only row',
    hiddenKeys: [
      'splotch-stroke-width-control',
      'splotch-coloring-book-enabled',
      'splotch-screenshot-enabled',
      'splotch-undo-button-enabled',
    ],
    visibleButtonCount: 1,
  },
] as const;

interface ActionPanelGeometry {
  paletteRight: number;
  panelLeft: number;
  visibleButtonCount: number;
  buttonWidth: number;
  drawerRight: number;
  settingsLeft: number;
}

function actionPanelGeometry(page: Page): Promise<ActionPanelGeometry> {
  return page.evaluate(() => {
    const palette = document.querySelector('.color-palette');
    const panel = document.querySelector('.actions-panel');
    const drawer = document.querySelector('.actions-drawer-inner');
    const settingsButton = document.querySelector('button[aria-label="Settings"]');
    const visibleButtons = [...document.querySelectorAll('.actions-drawer .action-button')].filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        getComputedStyle(element).display !== 'none' &&
        element.getClientRects().length > 0
    );
    if (
      !(palette instanceof HTMLElement) ||
      !(panel instanceof HTMLElement) ||
      !(drawer instanceof HTMLElement) ||
      !(settingsButton instanceof HTMLElement) ||
      !visibleButtons[0]
    ) {
      throw new Error('Actions Panel geometry is unavailable');
    }
    return {
      paletteRight: palette.getBoundingClientRect().right,
      panelLeft: panel.getBoundingClientRect().left,
      visibleButtonCount: visibleButtons.length,
      buttonWidth: visibleButtons[0].getBoundingClientRect().width,
      drawerRight: drawer.getBoundingClientRect().right,
      settingsLeft: settingsButton.getBoundingClientRect().left,
    };
  });
}

async function seedPersistedHiddenControls(
  page: Page,
  hiddenKeys: readonly string[]
): Promise<void> {
  await page.addInitScript((keys) => {
    localStorage.setItem('splotch-drawer-open', 'true');
    for (const key of keys) localStorage.setItem(key, 'false');
  }, hiddenKeys);
}

async function startupPanelGeometry(page: Page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.actions-panel')!;
    const toggle = panel.querySelector('.drawer-toggle')!;
    const ai = panel.querySelector('#aiImageButton')!;
    const rect = (element: Element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      panel: rect(panel),
      toggle: rect(toggle),
      ai: rect(ai),
      aiPainted:
        getComputedStyle(ai).display !== 'none' && getComputedStyle(ai).visibility === 'visible',
      count: getComputedStyle(panel).getPropertyValue('--action-btn-count').trim(),
    };
  });
}

for (const scenario of [
  { name: 'grant arrives', status: 200, viewport: PORTRAIT_VIEWPORTS[0] },
  { name: 'grant is unavailable', status: 503, viewport: LANDSCAPE_VIEWPORTS[1] },
] as const) {
  test(`opted-in AI button paints without moving the drawer when ${scenario.name}`, async ({
    browser,
    page,
  }) => {
    const firstPaintContext = await browser.newContext({ viewport: scenario.viewport });
    const firstPaintPage = await firstPaintContext.newPage();
    await seedAiEnabled(firstPaintPage);
    await firstPaintPage.addInitScript(() => localStorage.setItem('splotch-drawer-open', 'true'));
    await firstPaintPage.route('**/_app/immutable/**/*.js', (route) => route.abort());
    await firstPaintPage.goto('/');
    const firstPaint = await startupPanelGeometry(firstPaintPage);
    await firstPaintContext.close();

    let releaseGrant!: () => void;
    const grantGate = new Promise<void>((resolve) => (releaseGrant = resolve));
    await page.route('**/api/free-generation-grant', async (route) => {
      await grantGate;
      await route.fulfill({
        status: scenario.status,
        contentType: 'application/json',
        body: JSON.stringify({ ok: scenario.status === 200, remaining: 7 }),
      });
    });
    await seedAiEnabled(page);
    await page.addInitScript(() => localStorage.setItem('splotch-drawer-open', 'true'));
    await page.setViewportSize(scenario.viewport);
    await gotoApp(page);
    await expect(page.locator('.actions-panel')).toHaveAttribute('data-action-panel-live', '');
    const pending = await startupPanelGeometry(page);
    const grantResponse = page.waitForResponse((response) =>
      response.url().includes('/api/free-generation-grant')
    );
    releaseGrant();
    await grantResponse;
    await expect(page.locator('#aiImageButton')).toBeVisible();
    await expect(page.locator('#aiImageButton')).toHaveAttribute(
      'aria-label',
      scenario.status === 200 ? /Create AI image/ : 'AI image unavailable'
    );
    const settled = await startupPanelGeometry(page);

    expect(firstPaint.count).toBe('6');
    expect(firstPaint.aiPainted).toBe(true);
    expect(pending.aiPainted).toBe(true);
    expect(settled.aiPainted).toBe(true);
    expect(pending.count).toBe(firstPaint.count);
    expect(settled.count).toBe(firstPaint.count);
    expect(pending.panel).toEqual(firstPaint.panel);
    expect(settled.panel).toEqual(firstPaint.panel);
    expect(pending.toggle).toEqual(firstPaint.toggle);
    expect(settled.toggle).toEqual(firstPaint.toggle);
    expect(pending.ai).toEqual(firstPaint.ai);
    expect(settled.ai).toEqual(firstPaint.ai);
  });
}

test('last known offline state leaves no gap in the first painted row', async ({
  browser,
  page,
}) => {
  const seedOffline = async (target: Page) => {
    await seedAiEnabled(target);
    await target.addInitScript(() => {
      localStorage.setItem('splotch-drawer-open', 'true');
      localStorage.setItem('splotch-last-network-online', 'false');
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    });
  };

  const firstPaintContext = await browser.newContext({ viewport: PORTRAIT_VIEWPORTS[0] });
  const firstPaintPage = await firstPaintContext.newPage();
  await seedOffline(firstPaintPage);
  await firstPaintPage.route('**/_app/immutable/**/*.js', (route) => route.abort());
  await firstPaintPage.goto('/');
  const firstPaint = await startupPanelGeometry(firstPaintPage);
  await firstPaintContext.close();

  await page.route('**/api/free-generation-grant', (route) =>
    route.fulfill({ status: 503, body: JSON.stringify({ ok: false }) })
  );
  await seedOffline(page);
  await page.setViewportSize(PORTRAIT_VIEWPORTS[0]);
  await gotoApp(page);
  await expect(page.locator('.actions-panel')).toHaveAttribute('data-action-panel-live', '');
  await expect(page.locator('#aiImageButton')).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('splotch-last-network-online')))
    .toBe('false');
  const settled = await startupPanelGeometry(page);

  expect(firstPaint.count).toBe('5');
  expect(firstPaint.aiPainted).toBe(false);
  expect(settled.count).toBe('5');
  expect(settled.aiPainted).toBe(false);
  expect(settled.panel).toEqual(firstPaint.panel);
  expect(settled.toggle).toEqual(firstPaint.toggle);
});

test('a changed network state replaces the stored first-paint guess', async ({ browser, page }) => {
  const seedStoredOffline = async (target: Page) => {
    await seedAiEnabled(target);
    await target.addInitScript(() => {
      localStorage.setItem('splotch-drawer-open', 'true');
      localStorage.setItem('splotch-last-network-online', 'false');
    });
  };

  const firstPaintContext = await browser.newContext({ viewport: PORTRAIT_VIEWPORTS[0] });
  const firstPaintPage = await firstPaintContext.newPage();
  await seedStoredOffline(firstPaintPage);
  await firstPaintPage.route('**/_app/immutable/**/*.js', (route) => route.abort());
  await firstPaintPage.goto('/');
  const firstPaint = await startupPanelGeometry(firstPaintPage);
  await firstPaintContext.close();

  await page.route('**/api/free-generation-grant', (route) =>
    route.fulfill({ status: 503, body: JSON.stringify({ ok: false }) })
  );
  await seedStoredOffline(page);
  await page.setViewportSize(PORTRAIT_VIEWPORTS[0]);
  await gotoApp(page);
  await expect(page.locator('#aiImageButton')).toBeVisible();
  await expect(page.locator('#aiImageButton')).toHaveAttribute(
    'aria-label',
    'AI image unavailable'
  );
  const settled = await startupPanelGeometry(page);

  expect(firstPaint.count).toBe('5');
  expect(firstPaint.aiPainted).toBe(false);
  expect(settled.count).toBe('6');
  expect(settled.aiPainted).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('splotch-last-network-online'))).toBe(
    'true'
  );
});

test('AI-only drawer paints its disabled button before the grant arrives', async ({ page }) => {
  let releaseGrant!: () => void;
  const grantGate = new Promise<void>((resolve) => (releaseGrant = resolve));
  await page.route('**/api/free-generation-grant', async (route) => {
    await grantGate;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, remaining: 7 }),
    });
  });
  await seedAiEnabled(page);
  await seedPersistedHiddenControls(page, [
    'splotch-stroke-width-control',
    'splotch-crayon-enabled',
    'splotch-magic-brush-enabled',
    'splotch-eraser-enabled',
    'splotch-coloring-book-enabled',
    'splotch-screenshot-enabled',
    'splotch-undo-button-enabled',
  ]);
  await page.setViewportSize(PORTRAIT_VIEWPORTS[0]);
  await gotoApp(page);
  await expect(page.locator('.actions-panel')).toHaveAttribute('data-action-panel-live', '');
  await expect(page.locator('.actions-panel')).not.toHaveAttribute('data-no-actions', '');
  await expect(page.locator('#aiImageButton')).toBeVisible();
  const pending = await startupPanelGeometry(page);

  releaseGrant();
  await expect(page.locator('#aiImageButton .free-count')).toBeVisible();
  const settled = await startupPanelGeometry(page);
  expect(pending.count).toBe('1');
  expect(settled.count).toBe('1');
  expect(settled.panel).toEqual(pending.panel);
  expect(settled.toggle).toEqual(pending.toggle);
});

test('a usable AI button stays hidden with the closed drawer', async ({ page }) => {
  await page.route('**/api/free-generation-grant', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, remaining: 7 }),
    })
  );
  await seedAiEnabled(page);
  await gotoApp(page);
  await expect(page.locator('.actions-panel')).toHaveAttribute('data-action-panel-live', '');
  await expect(page.locator('#aiImageButton .free-count')).toHaveCount(1);
  const canvas = await page.locator('#drawingCanvas').boundingBox();
  if (!canvas) throw new Error('Drawing canvas is unavailable');
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width / 2 + 40, canvas.y + canvas.height / 2 + 40);
  await page.mouse.up();
  await expect(page.locator('#aiImageButton')).toBeEnabled();
  await expect(page.locator('#aiImageButton')).toBeHidden();
  await expect(page.locator('#undoButton')).toBeHidden();
  const aiFocused = await page.evaluate(() => {
    const aiButton = document.querySelector<HTMLButtonElement>('#aiImageButton')!;
    aiButton.focus();
    return document.activeElement === aiButton;
  });
  expect(aiFocused).toBe(false);
});

for (const viewport of LANDSCAPE_VIEWPORTS) {
  test(`${viewport.name} Actions Panel first paint matches hydrated geometry`, async ({
    browser,
    page,
  }) => {
    const preHydrationContext = await browser.newContext({
      javaScriptEnabled: false,
      viewport,
    });
    const preHydrationPage = await preHydrationContext.newPage();
    await preHydrationPage.goto('/');
    await expect(preHydrationPage.locator('.color-palette')).toBeVisible({
      visible: viewport.paletteWidth > 0,
    });
    const preHydration = await actionPanelGeometry(preHydrationPage);
    await preHydrationContext.close();

    expect(preHydration.paletteRight).toBe(viewport.paletteWidth);
    expect(preHydration.panelLeft).toBeGreaterThan(preHydration.paletteRight);
    expect(preHydration.visibleButtonCount).toBe(5);

    await page.setViewportSize(viewport);
    await gotoApp(page);
    await expect(page.locator('.actions-panel')).toHaveAttribute('data-action-panel-live', '');
    const hydrated = await actionPanelGeometry(page);

    expect(hydrated.paletteRight).toBe(viewport.paletteWidth);
    expect(hydrated.panelLeft).toBeGreaterThan(hydrated.paletteRight);
    expect(hydrated.visibleButtonCount).toBe(5);
    expect(preHydration.panelLeft).toBe(hydrated.panelLeft);
    expect(preHydration.buttonWidth).toBeCloseTo(hydrated.buttonWidth, 2);
  });
}

for (const viewport of PORTRAIT_VIEWPORTS) {
  test(`${viewport.name} Actions Panel first paint matches hydrated geometry`, async ({
    browser,
    page,
  }) => {
    const preHydrationContext = await browser.newContext({
      javaScriptEnabled: false,
      viewport,
    });
    const preHydrationPage = await preHydrationContext.newPage();
    await preHydrationPage.goto('/');
    await expect(preHydrationPage.locator('.color-palette')).toBeVisible();
    const preHydration = await actionPanelGeometry(preHydrationPage);
    await preHydrationContext.close();

    expect(preHydration.visibleButtonCount).toBe(5);

    await page.setViewportSize(viewport);
    await gotoApp(page);
    await expect(page.locator('.actions-panel')).toHaveAttribute('data-action-panel-live', '');
    const hydrated = await actionPanelGeometry(page);

    expect(hydrated.visibleButtonCount).toBe(5);
    expect(hydrated.panelLeft).toBe(preHydration.panelLeft);
    expect(hydrated.buttonWidth).toBeCloseTo(preHydration.buttonWidth, 2);
  });
}

for (const configuration of PERSISTED_VISIBILITY_CONFIGURATIONS) {
  test(`${configuration.name} first paint matches hydrated geometry`, async ({ browser, page }) => {
    const viewport = LANDSCAPE_VIEWPORTS[0];
    const firstPaintContext = await browser.newContext({ viewport });
    const firstPaintPage = await firstPaintContext.newPage();
    await seedPersistedHiddenControls(firstPaintPage, configuration.hiddenKeys);
    await firstPaintPage.route('**/_app/immutable/**/*.js', (route) => route.abort());
    await firstPaintPage.goto('/');
    await expect(firstPaintPage.locator('.color-palette')).toBeHidden();
    const firstPaint = await actionPanelGeometry(firstPaintPage);
    await firstPaintContext.close();

    expect(firstPaint.visibleButtonCount).toBe(configuration.visibleButtonCount);

    await seedPersistedHiddenControls(page, configuration.hiddenKeys);
    await page.setViewportSize(viewport);
    await gotoApp(page);
    await expect(page.locator('.actions-panel')).toHaveAttribute('data-action-panel-live', '');
    const hydrated = await actionPanelGeometry(page);

    expect(hydrated.visibleButtonCount).toBe(configuration.visibleButtonCount);
    expect(firstPaint.panelLeft).toBe(hydrated.panelLeft);
    expect(firstPaint.buttonWidth).toBeCloseTo(hydrated.buttonWidth, 2);
  });
}

for (const viewport of NARROW_LANDSCAPE_VIEWPORTS) {
  test(`${viewport.name} six-button row clears the Settings Button`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('splotch-drawer-open', 'true');
      localStorage.setItem('splotch-ai-access-token', 'test-token');
      localStorage.setItem('splotch-ai-image-enabled', 'true');
    });
    await page.setViewportSize(viewport);
    await gotoApp(page);
    await expect(page.locator('.actions-panel')).toHaveAttribute('data-action-panel-live', '');
    await expect(page.locator('#aiImageButton')).toBeVisible();

    const hydrated = await actionPanelGeometry(page);
    expect(hydrated.visibleButtonCount).toBe(6);
    expect(hydrated.drawerRight).toBeLessThanOrEqual(hydrated.settingsLeft);
    expect(hydrated.drawerRight).toBeLessThanOrEqual(viewport.width);
  });
}
