import { chromium, expect } from '@playwright/test';
import { compositeVisibleLiveTiles } from '../../../web/src/lib/drawing/liveTileComposite.ts';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { writeFile } from 'node:fs/promises';
const base = resolve('web/build');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.json': 'application/json',
};
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  let file = resolve(base, '.' + path);
  if (path === '/') file = resolve(base, 'index.html');
  else if (!extname(file) && existsSync(file + '.html')) file += '.html';
  if (!file.startsWith(base) || (!existsSync(file) && extname(file))) {
    res.statusCode = 404;
    res.end();
    return;
  }
  if (!existsSync(file)) file = resolve(base, '200.html');
  res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise((resolve, reject) => {
  server.on('error', reject);
  server.listen(5301, '127.0.0.1', resolve);
});
const browser = await chromium.launch();
const records = [];
try {
  await expect(async () =>
    expect((await fetch('http://localhost:5301/privacy')).ok).toBe(true)
  ).toPass({ timeout: 10000 });
  for (const colorScheme of ['light', 'dark']) {
    const context = await browser.newContext({
      colorScheme,
      viewport: { width: 320, height: 568 },
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.stack);
      console.log('PAGE ERROR', error.stack);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') console.log('CONSOLE ERROR', message.text());
    });
    const response = await page.goto('http://localhost:5301/privacy/missing');
    expect(response.status()).toBe(200);
    expect(await response.text()).not.toContain('This page wandered off');
    await expect(
      page.getByRole('heading', { name: 'This page wandered off', exact: true })
    ).toBeVisible();
    await expect(page).toHaveTitle('Page not found · Splotch');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('.page-footer [aria-current]')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page
      .locator('.not-found-links a')
      .evaluateAll((links) =>
        links.map((link) => ({
          text: link.textContent,
          href: link.getAttribute('href'),
          rect: link.getBoundingClientRect().toJSON(),
        }))
      );
    expect(geometry[0].rect.top).toBeLessThan(geometry[1].rect.top);
    expect(geometry[1].rect.top).toBe(geometry[2].rect.top);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.screenshot({
      path: `screenshots/not-found/native-phone-${colorScheme}.png`,
      fullPage: true,
    });
    await page
      .locator('.not-found-links')
      .getByRole('link', { name: 'Privacy', exact: true })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy policy');
    await expect(page.locator('.page-footer [aria-current]')).toHaveText('Privacy');
    await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(0);
    await page.goto('http://localhost:5301/no-such-page');
    await expect(
      page.getByRole('heading', { name: 'This page wandered off', exact: true })
    ).toBeVisible();
    await page
      .locator('.not-found-links')
      .getByRole('link', { name: 'Start drawing', exact: true })
      .click();
    await page.screenshot({ path: `screenshots/not-found/native-drawing-${colorScheme}.png` });
    await expect(page.locator('#drawingCanvas')).toBeVisible();
    await expect(async () => {
      await page.locator('#drawerToggle').click();
      await expect(page.locator('#brushButton')).toBeVisible();
    }).toPass({ timeout: 10000 });
    await page.locator('#drawerToggle').click();
    await page.mouse.move(130, 180);
    await page.mouse.down();
    await page.mouse.move(200, 240, { steps: 10 });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const canvas = await page.evaluateHandle(compositeVisibleLiveTiles, undefined);
        try {
          return await canvas.evaluate((c) => {
            if (!c.width || !c.height) return false;
            return c
              .getContext('2d')
              .getImageData(0, 0, c.width, c.height)
              .data.some((value, index) => index % 4 === 3 && value > 0);
          });
        } finally {
          await canvas.dispose();
        }
      })
      .toBe(true);
    expect(pageErrors).toEqual([]);
    records.push({
      colorScheme,
      geometry,
      missingRecovered: true,
      privacyCurrent: true,
      drawingBooted: true,
      drawingPainted: true,
      pageErrors,
    });
    await context.close();
  }
} finally {
  await writeFile('screenshots/not-found/native-records.json', JSON.stringify(records, null, 2));
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
