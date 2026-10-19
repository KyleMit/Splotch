import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Applied (not simulated) throttling: DevTools' Slow 4G values + 4x CPU through CDP, cold cache.
// Records FCP, LCP, and "handlers at" — the moment the Purple swatch carries React props, i.e. a
// tap would be handled — plus "settled at", when the clear underlay (client-only) mounts.
// node tti-probe.mjs <url> <label> <samples> [width]x[height] [first|repeat] [paint]
// `paint` records only FCP and LCP, for a page that is not a React app (the shipping SvelteKit app).
// With `repeat`, each sample first loads the page unthrottled (installing the service worker and
// filling the HTTP cache), then measures a throttled reload with the cache left on.
import { createRequire } from 'node:module';
const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const require = createRequire(join(REPO, 'package.json'));
const { chromium } = require('playwright');
const [url, label, samplesArg = '3', size = '412x915', visit = 'first'] = process.argv.slice(2);
const repeat = visit === 'repeat';
const paintOnly = process.argv[7] === 'paint';
const [width, height] = size.split('x').map(Number);
const SLOW_4G = {
  offline: false,
  latency: 562.5,
  downloadThroughput: (1474.56 * 1024) / 8,
  uploadThroughput: (675 * 1024) / 8,
};
const rows = [];
for (let i = 0; i < Number(samplesArg); i++) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  if (repeat) {
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(4000);
  } else await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    window.__marks = {};
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__marks.lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__marks[e.name] = e.startTime;
    }).observe({ type: 'paint', buffered: true });
    const poll = () => {
      const swatch = document.querySelector('[aria-label=Purple]');
      if (
        !window.__marks.handlers &&
        swatch &&
        Object.keys(swatch).some((k) => k.startsWith('__reactProps'))
      )
        window.__marks.handlers = performance.now();
      if (!window.__marks.settled && document.querySelector('[data-testid=rsd-clear-underlay]'))
        window.__marks.settled = performance.now();
      if (!window.__marks.handlers || !window.__marks.settled) requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  if (paintOnly) await page.waitForTimeout(5000);
  else {
    await page.waitForFunction(() => window.__marks.handlers && window.__marks.settled, null, {
      timeout: 120_000,
    });
    await page.waitForTimeout(1500);
  }
  const m = await page.evaluate(() => window.__marks);
  const row = {
    label,
    fcp: Math.round(m['first-contentful-paint']),
    lcp: Math.round(m.lcp),
    handlers: Math.round(m.handlers),
    settled: Math.round(m.settled),
  };
  rows.push(row);
  console.log(JSON.stringify(row));
  await browser.close();
}
const median = (k) => rows.map((r) => r[k]).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
console.log(
  `${label} median: FCP ${median('fcp')} LCP ${median('lcp')} handlers ${median('handlers')} settled ${median('settled')}`
);
