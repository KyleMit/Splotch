import { expect, test, type Page } from '@playwright/test';

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

// ADR-0076: the zoom lock is scoped to the drawing route. Only `/` carries the
// `data-zoom-locked` flag (→ body touch-action: none); every other route defaults
// to touch-action: auto and is freely pinch-zoomable for low-vision users.
const bodyTouchAction = (page: Page) =>
  page.locator('body').evaluate((el) => getComputedStyle(el).touchAction);

test('the drawing route locks page zoom via the data-zoom-locked flag', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#drawingCanvas')).toBeVisible();
  expect(await page.locator('html').getAttribute('data-zoom-locked')).not.toBeNull();
  expect(await bodyTouchAction(page)).toBe('none');
});

test('non-canvas routes default to browser-zoomable (/privacy, /admin)', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
  expect(await page.locator('html').getAttribute('data-zoom-locked')).toBeNull();
  expect(await bodyTouchAction(page)).toBe('auto');

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  expect(await bodyTouchAction(page)).toBe('auto');
});

test('client-side nav off the drawing route unlocks zoom (effect cleanup, not a reload)', async ({
  page,
}) => {
  await page.goto('/');
  expect(await bodyTouchAction(page)).toBe('none');

  // Drive a real SvelteKit client-side navigation (no full reload), so it's the
  // / page's effect cleanup — not the boot script, which only runs on load — that
  // must clear the flag. The sentinel proves the page never reloaded.
  await page.evaluate(() => ((window as unknown as { __spa: boolean }).__spa = true));
  await page.evaluate(() => {
    const a = document.createElement('a');
    a.href = '/privacy';
    document.body.appendChild(a);
    a.click();
  });
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();

  const noReload = await page.evaluate(
    () => (window as unknown as { __spa?: boolean }).__spa === true
  );
  expect(noReload, 'expected a client-side navigation, not a full reload').toBe(true);
  expect(await bodyTouchAction(page)).toBe('auto');
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
  // gen-large-image.mjs emitted 1920x1080); this guards against a repeat.
  const declaredWidth = Number(await meta('og:image:width'));
  const declaredHeight = Number(await meta('og:image:height'));

  const res = await request.get('/large-image.png');
  expect(res.ok()).toBeTruthy();
  const png = await res.body();
  // PNG IHDR stores width at byte 16 and height at byte 20 (big-endian uint32).
  expect(png.readUInt32BE(16)).toBe(declaredWidth);
  expect(png.readUInt32BE(20)).toBe(declaredHeight);
});
