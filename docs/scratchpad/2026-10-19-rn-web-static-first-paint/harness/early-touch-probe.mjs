// Applied Slow 4G + 4x CPU (as tti-probe.mjs), cold cache, phone. A finger lands on the paper as soon
// as first contentful paint is reported and keeps moving until the drawing engine has listened for
// a while, then lifts. Records when the paper and each liveness stamp appeared, whether the shell
// answered the touch with a burst, when the engine took the finger over (gotpointercapture), and
// whether the held finger left real ink.
// node early-touch-probe.mjs <url> <label> <samples> [width]x[height]
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const require = createRequire(join(REPO, 'package.json'));
const { chromium } = require('playwright');
const [url, label, samplesArg = '3', size = '412x915'] = process.argv.slice(2);
const [width, height] = size.split('x').map(Number);
const SLOW_4G = {
  offline: false,
  latency: 562.5,
  downloadThroughput: (1474.56 * 1024) / 8,
  uploadThroughput: (675 * 1024) / 8,
};
const MOVE_EVERY_MS = 50;
// How long the finger keeps drawing after the engine listens, so its stroke has ink to show.
const DRAW_AFTER_LIVE_MS = 800;
const GIVE_UP_MS = 30_000;

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
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    const marks = (window.__marks = { bursts: 0 });
    const now = () => performance.now();
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) marks.lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) marks[e.name] = e.startTime;
    }).observe({ type: 'paint', buffered: true });
    // `document` exists before its root element does; one observer sees the stamps, the bursts and
    // the paper arriving, whichever comes first.
    new MutationObserver((records) => {
      const html = document.documentElement;
      if (marks.drawingLive === undefined && html?.hasAttribute('data-drawing-live'))
        marks.drawingLive = now();
      if (marks.controlsLive === undefined && html?.hasAttribute('data-controls-live'))
        marks.controlsLive = now();
      for (const record of records)
        for (const node of record.addedNodes)
          if (node.classList?.contains('first-frame-burst')) marks.bursts++;
      if (marks.paper === undefined && document.querySelector('[data-testid=drawing-paper]'))
        marks.paper = now();
    }).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-drawing-live', 'data-controls-live'],
    });
    document.addEventListener(
      'gotpointercapture',
      () => {
        if (marks.captured === undefined) marks.captured = now();
      },
      true
    );
  });
  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForFunction(
    () =>
      window.__marks?.['first-contentful-paint'] !== undefined &&
      document.querySelector('[data-testid=drawing-paper]'),
    null,
    { timeout: GIVE_UP_MS, polling: 16 }
  );
  const box = await page.evaluate(() => {
    const rect = document.querySelector('[data-testid=drawing-paper]').getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  const touchedAt = await page.evaluate(() => performance.now());
  const at = (k) => [{ x: box.x + (k % 40) * 3, y: box.y + Math.floor(k / 40) * 8 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  let k = 1;
  let liveFor = 0;
  const started = Date.now();
  while (liveFor < DRAW_AFTER_LIVE_MS && Date.now() - started < GIVE_UP_MS) {
    await new Promise((done) => setTimeout(done, MOVE_EVERY_MS));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(k++) });
    const live = await page.evaluate(
      // A build without a prerendered frame has no live stamp: its paper listens as it appears.
      () =>
        document.querySelector('template[id^="first-frame-"]')
          ? window.__marks.drawingLive
          : window.__marks.paper
    );
    if (live !== undefined) liveFor += MOVE_EVERY_MS;
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(1000);
  const result = await page.evaluate(() => ({
    ...window.__marks,
    inkPaths: document.querySelectorAll('[data-testid=drawing-paper] path').length,
  }));
  const r = (value) => (value === undefined ? null : Math.round(value));
  const row = {
    label,
    fcp: r(result['first-contentful-paint']),
    lcp: r(result.lcp),
    touchedAt: r(touchedAt),
    bursts: result.bursts,
    drawingLive: r(result.drawingLive),
    captured: r(result.captured),
    controlsLive: r(result.controlsLive),
    paper: r(result.paper),
    inkPaths: result.inkPaths,
  };
  rows.push(row);
  console.log(JSON.stringify(row));
  await browser.close();
}
const median = (k) => {
  const values = rows.map((row) => row[k]).filter((v) => v !== null);
  return values.length ? values.sort((a, b) => a - b)[Math.floor(values.length / 2)] : null;
};
console.log(
  `${label} median: FCP ${median('fcp')} LCP ${median('lcp')} drawing live ${median('drawingLive')} captured ${median('captured')} controls live ${median('controlsLive')} ink paths ${median('inkPaths')}`
);
