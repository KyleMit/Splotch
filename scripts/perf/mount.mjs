// Page-load (mount) profiling entry: unlike scenario.mjs — which traces the
// drawing session on an already-loaded page — this traces ACROSS the initial
// navigation, so it answers "what is the main thread doing before the child
// can draw" (the Lighthouse TBT window). Phone viewport + 4× CPU throttle +
// Slow-4G network emulation approximate a low-end phone on a slow connection.
//   npm run perf:mount             (phone viewport, 4× CPU, Slow-4G)
//   node scripts/perf/mount.mjs --device=tablet --throttle=6 --no-build
//
// Writes trace.json (analyze with `npm run perf:analyze`) plus
// mount-summary.json: load-phase long tasks (>50 ms), paint timings, and any
// user-timing measures the page recorded.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { ROOT, chromiumExecutablePath } from '../lib/utils.mjs';
import { buildAndPreview } from './preview.mjs';
import { startTrace, stopTrace } from './capture.mjs';

const DEVICES = {
  phone: { width: 412, height: 915, deviceScaleFactor: 2.6 },
  tablet: { width: 1024, height: 1366, deviceScaleFactor: 2 },
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1 },
};

// Lighthouse's "Slow 4G" throttle: 150 ms RTT, 1.6 Mbps down / 750 Kbps up.
const SLOW_4G = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
};

// Let idle-deferred boot work (overlay mount, sound preload, texture warm)
// fire inside the trace so a fix that merely shifts cost later is visible.
const POST_LOAD_SETTLE_MS = 5000;

const args = process.argv.slice(2);
const flag = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};
const deviceName = flag('device', 'phone');
const device = DEVICES[deviceName] || DEVICES.phone;
const throttle = args.includes('--no-throttle') ? 1 : Number(flag('throttle', '4'));
const port = Number(flag('port', '4173'));
const build = !args.includes('--no-build');

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const throttleTag = throttle > 1 ? `${throttle}x` : 'raw';
  const outDir = join(ROOT, 'perf-profiles', `${stamp}-mount-${deviceName}-${throttleTag}`);
  mkdirSync(outDir, { recursive: true });

  const { base, stop } = await buildAndPreview(port, { build });
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromiumExecutablePath(chromium),
  });
  try {
    const ctx = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: device.deviceScaleFactor,
      hasTouch: true,
      isMobile: false,
    });
    const page = await ctx.newPage();

    // Buffered longtask observer from time zero so load-phase long tasks are
    // kept (injectObservers in capture.mjs runs post-load, too late for these).
    await page.addInitScript(() => {
      window.__mount = { longTasks: [] };
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__mount.longTasks.push({ start: entry.startTime, duration: entry.duration });
          }
        }).observe({ type: 'longtask', buffered: true });
      } catch {
        // longtask unsupported on this engine — paints/measures still work
      }
    });

    const cdp = await ctx.newCDPSession(page);
    if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', SLOW_4G);

    const events = await startTrace(cdp);
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForSelector('#drawingCanvas');
    await page.waitForTimeout(POST_LOAD_SETTLE_MS);
    await stopTrace(cdp);

    const summary = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      return {
        longTasks: window.__mount.longTasks,
        domContentLoadedMs: nav?.domContentLoadedEventEnd ?? null,
        loadEventMs: nav?.loadEventEnd ?? null,
        paints: Object.fromEntries(
          performance.getEntriesByType('paint').map((p) => [p.name, p.startTime])
        ),
        measures: performance
          .getEntriesByType('measure')
          .map((m) => ({ name: m.name, start: m.startTime, duration: m.duration })),
      };
    });

    writeFileSync(join(outDir, 'trace.json'), JSON.stringify({ traceEvents: events }));
    writeFileSync(join(outDir, 'mount-summary.json'), JSON.stringify(summary, null, 2));

    const blocking = summary.longTasks.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0);
    console.log(`Long tasks (>50 ms): ${summary.longTasks.length}, blocking time ~${blocking} ms`);
    for (const t of summary.longTasks) {
      console.log(`  at ${t.start.toFixed(0)} ms for ${t.duration.toFixed(0)} ms`);
    }
    console.log('Paints:', JSON.stringify(summary.paints));
    console.log(`DCL: ${summary.domContentLoadedMs} ms, load: ${summary.loadEventMs} ms`);
    console.log(`\nArtifacts: ${outDir}`);
    console.log(`Analyze the trace with: npm run perf:analyze -- ${join(outDir, 'trace.json')}`);
  } finally {
    await browser.close();
    stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
