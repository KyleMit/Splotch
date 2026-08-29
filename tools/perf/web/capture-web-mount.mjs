// Page-load (mount) profiling entry: unlike capture-web-session.mjs — which traces the
// drawing session on an already-loaded page — this traces ACROSS the initial
// navigation, so it answers "what is the main thread doing before the child
// can draw" (the Lighthouse TBT window). Phone viewport + 4× CPU throttle +
// Slow-4G network emulation approximate a low-end phone on a slow connection.
//   npm run perf:web:mount             (phone viewport, 4× CPU, Slow-4G)
//   node tools/perf/web/capture-web-mount.mjs --device=tablet --throttle=6 --no-build
//
// Writes trace.json (analyze with `npm run perf:analyze:chrome`) plus
// mount-summary.json: load-phase long tasks (>50 ms), paint timings, and any
// user-timing measures the page recorded.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { chromiumExecutablePath } from '../../lib/playwright.mjs';
import { isMain, runMain } from '../../lib/proc.mjs';
import { parsePerfArgs } from '../lib/cli-args.mjs';
import { buildAndPreview } from '../lib/profile-preview.mjs';
import { startTrace, stopTrace } from '../lib/chrome-trace-capture.mjs';
import { profilePath } from '../lib/profile-paths.mjs';
import { LONG_TASK_MS } from '../lib/performance-thresholds.mjs';

// Lighthouse's "Slow 4G" throttle: 150 ms RTT, 1.6 Mbps down / 750 Kbps up.
const SLOW_4G = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
};

// Let idle-deferred boot work (overlay mount, sound preload, texture warm)
// fire inside the trace so a fix that merely shifts cost later is visible.
const POST_LOAD_SETTLE_MS = 10_000;

const { deviceName, device, throttle, port, build } = parsePerfArgs({
  throttleDefault: 4,
  entry: isMain(import.meta.url),
});

export async function runMountProfile() {
  const outDir = profilePath('mount', deviceName, throttle.tag);
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
    // kept (injectObservers in chrome-trace-capture.mjs runs post-load, too late for these).
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
    if (throttle.active) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle.rate });
    }
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', SLOW_4G);

    const events = await startTrace(cdp);
    // Background overlays may start image prefetches several idle slices apart.
    // Waiting for global network-idle here makes those measured jobs a hidden
    // precondition and can time out before the explicit settle window starts.
    await page.goto(base, { waitUntil: 'load' });
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

    const blocking = summary.longTasks.reduce(
      (sum, t) => sum + Math.max(0, t.duration - LONG_TASK_MS),
      0
    );
    console.log(
      `Long tasks (>${LONG_TASK_MS} ms): ${summary.longTasks.length}, blocking time ~${blocking} ms`
    );
    for (const t of summary.longTasks) {
      console.log(`  at ${t.start.toFixed(0)} ms for ${t.duration.toFixed(0)} ms`);
    }
    console.log('Paints:', JSON.stringify(summary.paints));
    console.log(`DCL: ${summary.domContentLoadedMs} ms, load: ${summary.loadEventMs} ms`);
    console.log(`\nArtifacts: ${outDir}`);
    console.log(
      `Analyze the trace with: npm run perf:analyze:chrome -- ${join(outDir, 'trace.json')}`
    );
  } finally {
    await browser.close();
    stop();
  }
}

if (isMain(import.meta.url)) runMain(runMountProfile);
