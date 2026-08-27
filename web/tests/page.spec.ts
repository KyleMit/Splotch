import { expect, test, type Page } from '@playwright/test';

import { draw, gotoApp, renderedCanvasHandle, spaNavigate } from './helpers';
import { STORAGE_KEYS } from '../src/lib/storageKeys';
import { resolveTheme, THEME_COLORS, THEME_DEFAULT, type ThemePreference } from '../src/lib/theme';

async function opaquePixelCount(page: Page) {
  const canvas = await renderedCanvasHandle(page);
  try {
    return canvas.evaluate((element) => {
      const pixels = element
        .getContext('2d')!
        .getImageData(0, 0, element.width, element.height).data;
      let count = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > 0) count++;
      }
      return count;
    });
  } finally {
    await canvas.dispose();
  }
}

test('home page renders the drawing canvas', async ({ page }) => {
  await page.goto('/');

  // Title comes through from app.html
  await expect(page).toHaveTitle(/Splotch/);

  // The drawing surface mounts on the client
  await expect(page.locator('#drawingCanvas')).toBeVisible();
});

test('viewport meta permits browser zoom (no user-scalable=no / maximum-scale)', async ({
  page,
}) => {
  await page.goto('/');

  // ADR-0076: the drawing surface is zoom-locked element-by-element
  // (touch-action:none + the engine's touch preventDefault), NOT via the viewport
  // meta. Re-adding either attribute would re-block browser zoom page-wide and
  // reinstate the sole Lighthouse a11y deduction axe flags as [user-scalable].
  const content = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(content).not.toContain('user-scalable');
  expect(content).not.toContain('maximum-scale');
});

// ADR-0076: the immersive app-surface locks (no zoom, scroll, text selection, or
// iOS callout) are scoped to the drawing route. Only `/` carries the
// `data-app-surface` flag; every other route is a normal document by default.
const bodySurface = (page: Page) =>
  page.locator('body').evaluate((el) => {
    const s = getComputedStyle(el);
    return { touchAction: s.touchAction, overflowY: s.overflowY, userSelect: s.userSelect };
  });

test('the drawing route is an app surface (no zoom/scroll/selection) via the flag', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#drawingCanvas')).toBeVisible();
  expect(await page.locator('html').getAttribute('data-app-surface')).not.toBeNull();
  expect(await bodySurface(page)).toEqual({
    touchAction: 'none',
    overflowY: 'hidden',
    userSelect: 'none',
  });
});

test('non-canvas routes are normal documents by default (/privacy, /admin)', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
  expect(await page.locator('html').getAttribute('data-app-surface')).toBeNull();
  const privacy = await bodySurface(page);
  // Zoomable, scrollable, and selectable — none of the app-surface locks apply.
  expect(privacy.touchAction).toBe('auto');
  expect(privacy.overflowY).not.toBe('hidden');
  expect(privacy.userSelect).not.toBe('none');

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  const admin = await bodySurface(page);
  expect(admin.touchAction).toBe('auto');
  expect(admin.userSelect).not.toBe('none');
});

// Drive a real SvelteKit client-side navigation (no full reload), so it's a
// component's effect cleanup — not the boot script, which only runs on load —
// that has to put the document right. The sentinel a reload would wipe rides
// along, so the caller can prove the page never reloaded.
async function expectNoReload(page: Page) {
  const noReload = await page.evaluate(
    () => (window as unknown as { __spa?: boolean }).__spa === true
  );
  expect(noReload, 'expected a client-side navigation, not a full reload').toBe(true);
}

test('client-side nav off the drawing route drops the app-surface locks (effect cleanup)', async ({
  page,
}) => {
  await page.goto('/');
  expect((await bodySurface(page)).touchAction).toBe('none');

  await spaNavigate(page, '/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();

  await expectNoReload(page);
  const after = await bodySurface(page);
  expect(after.touchAction).toBe('auto');
  expect(after.userSelect).not.toBe('none');
});

// <meta name="theme-color"> is the browser address bar and the PWA status bar.
// The drawing route is the one page that overrides it — NotchBand tints it with
// the active drawing color — so leaving that route has to hand the tag back, or
// the standalone page that replaces it renders under an address bar still
// wearing the drawing color. app.html's pre-paint script can't cover this: it
// runs on load only.
const themeColor = (page: Page) => page.getAttribute('meta[name="theme-color"]', 'content');

const THEME_PREFERENCE_CASES = [
  { label: 'the system preference under a light OS', preference: 'system', systemDark: false },
  { label: 'the system preference under a dark OS', preference: 'system', systemDark: true },
  { label: 'an explicit light preference under a dark OS', preference: 'light', systemDark: true },
  { label: 'an explicit dark preference under a light OS', preference: 'dark', systemDark: false },
] satisfies { label: string; preference: ThemePreference; systemDark: boolean }[];

for (const { label, preference, systemDark } of THEME_PREFERENCE_CASES) {
  test(`the drawing route hands theme-color back on client-side nav, and takes it again (${label})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: systemDark ? 'dark' : 'light' });
    if (preference !== THEME_DEFAULT) {
      await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
        STORAGE_KEYS.theme,
        preference,
      ] as const);
    }

    await page.goto('/');
    await expect(page.locator('#drawingCanvas')).toBeVisible();

    const pageColor = THEME_COLORS[resolveTheme(preference, systemDark)];
    await expect
      .poll(() => themeColor(page), {
        message: 'NotchBand tints the tag with the active drawing color on /',
      })
      .not.toBe(pageColor);
    const drawingColor = await themeColor(page);

    await spaNavigate(page, '/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
    await expect.poll(() => themeColor(page)).toBe(pageColor);

    await spaNavigate(page, '/');
    await expect(page.locator('#drawingCanvas')).toBeVisible();
    await expect.poll(() => themeColor(page)).toBe(drawingColor);
    await expectNoReload(page);
  });
}

test('drawing survives a real-route remount and the fresh tiled canvas accepts more ink', async ({
  page,
}) => {
  await gotoApp(page);
  await draw(page, [
    { x: 80, y: 100 },
    { x: 260, y: 100 },
  ]);
  const beforeNavigation = await opaquePixelCount(page);
  expect(beforeNavigation).toBeGreaterThan(0);

  await page.evaluate(() => {
    const link = document.createElement('a');
    link.href = '/privacy';
    document.body.appendChild(link);
    link.click();
  });
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
  await page.goBack();
  await expect(page.locator('#drawingCanvas')).toBeVisible();
  expect(await opaquePixelCount(page)).toBeGreaterThanOrEqual(beforeNavigation);

  await draw(page, [
    { x: 80, y: 220 },
    { x: 260, y: 220 },
  ]);
  expect(await opaquePixelCount(page)).toBeGreaterThan(beforeNavigation);
});

test('link-preview meta tags are present and match the real OG image', async ({
  page,
  request,
}) => {
  await page.goto('/');

  const meta = (name: string, attr = 'property') =>
    page.locator(`meta[${attr}="${name}"]`).getAttribute('content');

  // The Open Graph + Twitter tags social platforms read to unfurl the link.
  expect(await meta('og:title')).toContain('Splotch');
  expect(await meta('og:image')).toContain('/large-image.png');
  expect(await meta('twitter:card', 'name')).toBe('summary_large_image');
  expect(await meta('twitter:image', 'name')).toContain('/large-image.png');

  // og:image:width/height must match the actual PNG, or a scraper renders the
  // card with the wrong aspect box. These drifted once (declared 1200x630 while
  // gen-promotional-image.mjs emitted 1920x1080); this guards against a repeat.
  const declaredWidth = Number(await meta('og:image:width'));
  const declaredHeight = Number(await meta('og:image:height'));

  const res = await request.get('/large-image.png');
  expect(res.ok()).toBeTruthy();
  const png = await res.body();
  // PNG IHDR stores width at byte 16 and height at byte 20 (big-endian uint32).
  expect(png.readUInt32BE(16)).toBe(declaredWidth);
  expect(png.readUInt32BE(20)).toBe(declaredHeight);
});
