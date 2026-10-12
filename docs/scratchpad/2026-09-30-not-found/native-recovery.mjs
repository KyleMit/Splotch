import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { writeFile } from 'node:fs/promises';
const base = resolve(process.env.SPLOTCH_NATIVE_EXPORT_DIR ?? 'web/build');
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
const manifest = JSON.parse(
  readFileSync(
    process.env.SPLOTCH_NATIVE_MANIFEST ?? 'web/.svelte-kit/output/client/.vite/manifest.json'
  )
);
const notFoundFile = manifest['src/lib/components/page/NotFoundPage.svelte'].file;
const gateFile = manifest['src/lib/components/ParentalGate.svelte'].file;
const records = [];
expect.configure({ timeout: 10000 });
async function context() {
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 } });
  await ctx.addInitScript(() => {
    window.requestIdleCallback = () => 1;
    window.cancelIdleCallback = () => {};
    window.native404TransientErrors = [];
    const record = (node) => {
      if (node instanceof Element) {
        if (
          node.matches('.error-screen[role="alert"]') ||
          node.querySelector('.error-screen[role="alert"]')
        )
          window.native404TransientErrors.push('crash alert inserted');
        if (
          (node.matches('title') && node.textContent.includes('Oops!')) ||
          [...node.querySelectorAll('title')].some((title) => title.textContent.includes('Oops!'))
        )
          window.native404TransientErrors.push('crash title inserted');
      } else if (node.parentElement?.matches('title') && node.textContent.includes('Oops!'))
        window.native404TransientErrors.push('crash title text inserted');
    };
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') record(mutation.target);
        for (const node of mutation.addedNodes) record(node);
      }
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  await ctx.route('https://splotch.art/feedback', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Native outbound evidence fixture</h1>' })
  );
  return ctx;
}
async function ready(page, path) {
  await page.goto('http://localhost:5301/' + path);
  await expect(
    page.getByRole('heading', { name: 'This page wandered off', exact: true })
  ).toBeVisible();
  expect(await page.evaluate(() => window.native404TransientErrors)).toEqual([]);
}
async function solve(page) {
  const gate = page.locator('#parentalGate');
  const label = await gate.locator('.gate-equation').getAttribute('aria-label');
  const [x, y] = label.match(/\d+/g).map(Number);
  for (const [i, digit] of [...String(x * y)].entries()) {
    await expect(async () => {
      if ((await gate.locator('.gate-dab.filled').count()) <= i)
        await gate.getByRole('button', { name: digit, exact: true }).click();
      await expect(gate.locator('.gate-dab.filled')).toHaveCount(i + 1, { timeout: 1000 });
    }).toPass({ timeout: 15000 });
  }
  await expect(async () => {
    await gate.getByRole('button', { name: 'Check answer' }).click();
    await expect(gate.locator('.gate-keypad')).not.toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15000 });
}

try {
  for (const state of ['pending', 'failed']) {
    const ctx = await context(),
      page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.stack || error.message));
    let release;
    await ctx.route('**/' + notFoundFile, async (route) => {
      if (state === 'pending') {
        await new Promise((resolve) => (release = resolve));
        await route.continue();
      } else await route.abort();
    });
    await page.goto('http://localhost:5301/no-such-page');
    if (state === 'pending') {
      await expect(
        page.getByRole('heading', { name: 'Page not found', exact: true })
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Start drawing', exact: true })).toBeVisible();
      await expect(page).toHaveTitle('Page not found · Splotch');
      expect(await page.evaluate(() => window.native404TransientErrors)).toEqual([]);
    } else {
      await expect(page.getByRole('heading', { name: 'Oops!', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Start over' })).toBeVisible();
    }
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `screenshots/not-found/native-fallback-${state}.png`,
      fullPage: true,
    });
    if (state === 'pending') {
      await page.getByRole('link', { name: 'Start drawing', exact: true }).click();
      await expect(page.locator('#drawingCanvas')).toBeVisible();
      expect(await page.evaluate(() => window.native404TransientErrors)).toEqual([]);
      release();
    } else {
      await page.getByRole('button', { name: 'Start over' }).click();
      await expect(page.locator('#drawingCanvas')).toBeVisible();
    }
    expect(errors).toEqual([]);
    records.push({
      state,
      recoveryVisible: true,
      recovered: true,
      errors,
      ...(state === 'pending' ? { transientErrors: [] } : {}),
    });
    await ctx.close();
  }
  for (const path of ['privacy/missing', 'no-such-page']) {
    const ctx = await context(),
      page = await ctx.newPage();
    const errors = [];
    let gateRequests = 0;
    page.on('pageerror', (e) => errors.push(e.stack));
    page.on('request', (req) => {
      if (req.url().endsWith(gateFile)) gateRequests++;
    });
    await ready(page, path);
    expect(gateRequests).toBe(0);
    const link = page.locator('.page-footer').getByRole('link', { name: /Send feedback/ });
    await link.click();
    await expect(page.locator('#parentalGate')).toBeVisible();
    await expect(page.locator('#parentalGate')).toHaveCount(1);
    expect(ctx.pages()).toHaveLength(1);
    const popup = page.waitForEvent('popup');
    await solve(page);
    await expect(await popup).toHaveURL('https://splotch.art/feedback');
    expect(errors).toEqual([]);
    records.push({
      path,
      coldGateRequestsBeforeClick: 0,
      oneDialog: true,
      originalTarget: true,
      errors,
      transientErrors: await page.evaluate(() => window.native404TransientErrors),
    });
    await ctx.close();
  }
  {
    const ctx = await context(),
      page = await ctx.newPage();
    await ready(page, 'no-such-page');
    const link = page.locator('.page-footer').getByRole('link', { name: /Send feedback/ });
    await link.click();
    await expect(async () => {
      await page
        .locator('#parentalGate')
        .getByRole('button', { name: /Manage these checks in/ })
        .click();
      await expect(page.getByText('Solve the problem to manage grown-up checks')).toBeVisible({
        timeout: 1000,
      });
    }).toPass({ timeout: 10000 });
    await solve(page);
    await expect(page.locator('#settingsModal')).toBeVisible();
    await expect(page.locator('#settingsModal')).toHaveCount(1);
    await page
      .locator('#settingsModal')
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await expect(link).toBeFocused();
    records.push({ manageOneSettings: true, returnsFocus: true });
    await ctx.close();
  }
  for (const mode of ['never', 'session']) {
    const ctx = await context(),
      page = await ctx.newPage();
    await ctx.addInitScript(
      (mode) => localStorage.setItem('splotch-parental-gate-external-links-mode', mode),
      mode
    );
    await ready(page, 'no-such-page');
    const link = page.locator('.page-footer').getByRole('link', { name: /Send feedback/ });
    if (mode === 'session') {
      await link.click();
      const first = page.waitForEvent('popup');
      await solve(page);
      await (await first).close();
    }
    const popup = page.waitForEvent('popup');
    await link.click();
    await expect(await popup).toHaveURL('https://splotch.art/feedback');
    await expect(page.locator('#parentalGate')).not.toBeVisible();
    records.push({ mode, originalTrustedClickPopup: true });
    await ctx.close();
  }
  const ctx = await context(),
    page = await ctx.newPage(),
    requests = [];
  page.on('request', (r) => {
    if (/\.(js|css)(?:\?|$)/.test(r.url())) requests.push(new URL(r.url()).pathname.slice(1));
  });
  await page.goto('http://localhost:5301/');
  await expect(page.locator('#drawingCanvas')).toBeVisible();
  await page.waitForTimeout(1500);
  records.push({ nativeColdDrawingRequests: [...new Set(requests)].sort() });
  await ctx.close();
  console.log(JSON.stringify(records, null, 2));
} finally {
  await writeFile(
    'screenshots/not-found/native-recovery-records.json',
    JSON.stringify(records, null, 2)
  );
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
