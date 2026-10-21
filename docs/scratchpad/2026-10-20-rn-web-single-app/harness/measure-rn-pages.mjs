import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import { chromium } from '@playwright/test';

const ROOT = join(process.cwd(), 'experiments/native-architecture/dist/web');
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
};
const browser = await chromium.launch();
const out = {};
for (const [path, text] of [
  ['/privacy', 'Privacy policy'],
  ['/changelog', 'Changelog'],
  ['/feedback', 'feedback'],
  ['/no-such-page', 'wandered off'],
]) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const loaded = [];
  await page.route('http://rn.test/**', (route) => {
    const url = new URL(route.request().url());
    let file = join(ROOT, decodeURIComponent(url.pathname));
    let status = 200;
    if (url.pathname === '/') file = join(ROOT, 'index.html');
    if (!existsSync(file) || statSync(file).isDirectory()) {
      file = join(ROOT, '404.html');
      status = 404;
    }
    const ext = file.slice(file.lastIndexOf('.'));
    if (ext === '.js' || ext === '.css') loaded.push(file);
    route.fulfill({
      status,
      body: readFileSync(file),
      contentType: TYPES[ext] ?? 'application/octet-stream',
    });
  });
  const start = Date.now();
  await page.goto(`http://rn.test${path}`);
  await page.getByText(text, { exact: false }).first().waitFor({ timeout: 60_000 });
  const elapsed = Date.now() - start;
  const unique = [...new Set(loaded)];
  out[path] = {
    files: unique.length,
    bytes: unique.reduce((t, f) => t + statSync(f).size, 0),
    brotli: unique.reduce((t, f) => t + brotliCompressSync(readFileSync(f)).length, 0),
    unthrottledMs: elapsed,
    biggest: unique
      .map((f) => [f.split('/').pop(), statSync(f).size])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4),
  };
  await context.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 2));
