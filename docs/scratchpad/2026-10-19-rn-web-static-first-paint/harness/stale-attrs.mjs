import { fileURLToPath } from 'node:url';
// Compare the settled DOM after hydrating the prerendered shell with the settled DOM of a fresh
// client render (the export's non-prerendered 404.html served at /). React 19 keeps a mismatched
// attribute from the server markup silently in production, so any difference here is either a
// stale attribute or a genuine divergence.
// node stale-attrs.mjs <origin> <exportDir> <width>x<height> [light|dark] [storageJSON]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const require = createRequire(join(REPO, 'package.json'));
const { chromium } = require('playwright');
const [origin, exportDir, size, scheme = 'light', storage] = process.argv.slice(2);
const [width, height] = size.split('x').map(Number);
const notFoundShell = readFileSync(join(exportDir, '404.html'), 'utf8');

async function settledDom(fresh) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: scheme,
    isMobile: width < 600 || height < 600,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.addInitScript((seed) => {
    if (seed) for (const [k, v] of Object.entries(JSON.parse(seed))) localStorage.setItem(k, v);
  }, storage ?? null);
  if (fresh)
    await page.route(`${origin}/`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: notFoundShell,
      })
    );
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${origin}/`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const dom = await page.evaluate(() => {
    const walk = (el) => [
      `<${el.tagName.toLowerCase()} ${[...el.attributes]
        .map((a) => `${a.name}="${a.name === 'style' ? el.style.cssText : a.value}"`)
        .sort()
        .join(' ')}>`,
      ...[...el.children].flatMap(walk),
    ];
    return walk(document.getElementById('root'))
      .slice(1)
      .map((line) => line.replace(/ data-first-frame-viewport="[^"]*"/, ''));
  });
  await browser.close();
  return { dom, errors };
}

const hydrated = await settledDom(false);
const fresh = await settledDom(true);
const domDir = join(import.meta.dirname, '../results/dom');
mkdirSync(domDir, { recursive: true });
const out = `${domDir}/stale-${size}-${scheme}${storage ? '-seeded' : ''}`;
writeFileSync(`${out}-hydrated.txt`, hydrated.dom.join('\n'));
writeFileSync(`${out}-fresh.txt`, fresh.dom.join('\n'));
const a = new Set(hydrated.dom);
const b = new Set(fresh.dom);
const onlyHydrated = hydrated.dom.filter((l) => !b.has(l));
const onlyFresh = fresh.dom.filter((l) => !a.has(l));
console.log(
  JSON.stringify(
    {
      size,
      scheme,
      seeded: !!storage,
      hydratedLines: hydrated.dom.length,
      freshLines: fresh.dom.length,
      onlyHydrated: onlyHydrated.map((l) => l.replace(/class="[^"]*"/, 'class=…').slice(0, 260)),
      onlyFresh: onlyFresh.map((l) => l.replace(/class="[^"]*"/, 'class=…').slice(0, 260)),
      errors: [...hydrated.errors, ...fresh.errors].slice(0, 5),
    },
    null,
    1
  )
);
