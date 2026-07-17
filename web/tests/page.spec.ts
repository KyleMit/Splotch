import { expect, test } from '@playwright/test';

test('home page renders the drawing canvas', async ({ page }) => {
  await page.goto('/');

  // Title comes through from app.html
  await expect(page).toHaveTitle(/Splotch/);

  // The drawing surface mounts on the client
  await expect(page.locator('#drawingCanvas')).toBeVisible();
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
