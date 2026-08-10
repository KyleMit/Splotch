// First-open cost of the Settings dialog. The dialog is the one overlay too
// heavy for an idle slice, so it mounts on the tap that opens it (ADR-0049) —
// which makes that tap the whole budget. This measures it the way issue #910
// framed it: the production build, a `longtask` PerformanceObserver, and the
// wide table-of-contents shell scored against the phone hub, which renders the
// same modal chrome and the same eleven rows with no section bodies at all and
// is therefore the floor the wide shell is trying to reach.
//
//   npm run perf:settings                       (both shells, 4x CPU throttle)
//   node scripts/perf/settings-open.mjs --throttle=1 --repeats=5 --no-build
//
// Writes settings-open.json to perf-profiles/.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { chromiumExecutablePath } from '../lib/playwright.mjs';
import { isMain, runMain } from '../lib/proc.mjs';
import { parsePerfArgs, requireNumberFlag } from './args.mjs';
import { DEVICES } from './devices.mjs';
import { buildAndPreview } from './preview.mjs';
import { profilePath } from './paths.mjs';
import { LONG_TASK_MS } from './thresholds.mjs';

// The two shells the section list renders into, at the viewport that selects
// each (SettingsModal's 700px WIDE_QUERY). The hub is not a variant under test —
// it is the baseline, unchanged by this work.
const SHELLS = {
  wide: { device: DEVICES.desktop, ready: '#settingsModal .settings-pane[aria-busy="false"]' },
  'phone-hub': { device: DEVICES.phone, ready: '#settingsModal .hub-row' },
};

// The Settings chunk loads at idle well after the page settles (ADR-0049); this
// keeps that import, and every other idle boot step, out of the measured window
// so the tap is scored on the mount alone.
const IDLE_BOOT_SETTLE_MS = 4000;
// Long tasks are reported to the observer after they end, and a tail one can
// start just as the pane completes. Kept short enough that a run of repeats
// stays quick.
const TAIL_SETTLE_MS = 1500;

const { throttle, port, build, flag } = parsePerfArgs({
  throttleDefault: 4,
  extra: ['repeats'],
  entry: isMain(import.meta.url),
});
const repeats = requireNumberFlag('repeats', flag('repeats', '3'), isMain(import.meta.url));

async function measureOneOpen(browser, cdpThrottle, { device, ready }, base) {
  const ctx = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.deviceScaleFactor,
    hasTouch: true,
  });
  try {
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__settingsOpen = { longTasks: [] };
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__settingsOpen.longTasks.push({
              start: entry.startTime,
              duration: entry.duration,
            });
          }
        }).observe({ type: 'longtask', buffered: true });
      } catch {
        // longtask unsupported on this engine — the attach timing still works
      }
    });

    const cdp = await ctx.newCDPSession(page);
    if (cdpThrottle.active) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cdpThrottle.rate });
    }

    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForSelector('#drawingCanvas');
    await page.waitForTimeout(IDLE_BOOT_SETTLE_MS);

    // Both timings are taken in the page, a frame apart at worst. Read from the
    // driver instead, a `waitForSelector` plus a round trip lands ~150 ms of its
    // own polling on a number this small. The fly-in is recorded because the
    // wide shell deliberately holds its fill until the card lands: without that
    // split, the wait reads as work.
    const tapAt = await page.evaluate((ready) => {
      const at = performance.now();
      document.querySelector('#settingsButton').click();
      const pollReady = () => {
        if (document.querySelector(ready))
          window.__settingsOpen.attachedMs = performance.now() - at;
        else requestAnimationFrame(pollReady);
      };
      requestAnimationFrame(() => {
        pollReady();
        const dialog = document.querySelector('#settingsModal');
        Promise.all(
          dialog.getAnimations().map((animation) => animation.finished.catch(() => undefined))
        ).then(() => {
          window.__settingsOpen.flyInMs = performance.now() - at;
        });
      });
      return at;
    }, ready);
    await page.waitForSelector(ready);
    await page.waitForTimeout(TAIL_SETTLE_MS);
    const { attachedMs, flyInMs } = await page.evaluate(() => ({
      attachedMs: window.__settingsOpen.attachedMs ?? 0,
      flyInMs: window.__settingsOpen.flyInMs ?? 0,
    }));

    // Kept by end, not by start: the task the tap itself runs in began before
    // the clock was read inside it, and on a shell that mounts everything at
    // once that task IS the cost — filtering on `start` drops precisely the
    // measurement and reports a clean zero.
    const longTasks = await page.evaluate(
      (at) =>
        window.__settingsOpen.longTasks
          .filter((task) => task.start + task.duration >= at)
          .map((task) => ({ afterTapMs: task.start - at, duration: task.duration })),
      tapAt
    );
    return { attachedMs, flyInMs, longTasks };
  } finally {
    await ctx.close();
  }
}

const round = (n) => Math.round(n);
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

export async function runSettingsOpenProfile() {
  const outDir = profilePath('settings-open', throttle.tag);
  mkdirSync(outDir, { recursive: true });

  const { base, stop } = await buildAndPreview(port, { build });
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromiumExecutablePath(chromium),
  });
  const results = {};
  try {
    for (const [name, shell] of Object.entries(SHELLS)) {
      const runs = [];
      for (let i = 0; i < repeats; i += 1) {
        runs.push(await measureOneOpen(browser, throttle, shell, base));
      }
      results[name] = {
        viewport: `${shell.device.width}x${shell.device.height}`,
        runs: runs.map((run) => ({
          attachedMs: round(run.attachedMs),
          longTasks: run.longTasks.map((task) => ({
            afterTapMs: round(task.afterTapMs),
            durationMs: round(task.duration),
          })),
        })),
        medianAttachedMs: round(median(runs.map((run) => run.attachedMs))),
        medianFlyInMs: round(median(runs.map((run) => run.flyInMs))),
        medianLongestTaskMs: round(
          median(runs.map((run) => Math.max(0, ...run.longTasks.map((task) => task.duration))))
        ),
      };
    }
  } finally {
    await browser.close();
    stop();
  }

  const summary = { throttle: throttle.tag, repeats, longTaskThresholdMs: LONG_TASK_MS, results };
  writeFileSync(join(outDir, 'settings-open.json'), JSON.stringify(summary, null, 2));

  for (const [name, result] of Object.entries(results)) {
    console.log(
      `${name.padEnd(10)} ${result.viewport.padEnd(9)} cpu ${throttle.tag}  ` +
        `longest long task ${result.medianLongestTaskMs} ms, ` +
        `attached in ${result.medianAttachedMs} ms (fly-in ${result.medianFlyInMs} ms)  ` +
        `(runs: ${result.runs
          .map(
            (run) =>
              `[${run.longTasks.map((task) => `${task.durationMs}ms@+${task.afterTapMs}`).join(' ')}]`
          )
          .join(' ')})`
    );
  }
  console.log(`\nArtifacts: ${outDir}`);
  return summary;
}

if (isMain(import.meta.url)) runMain(runSettingsOpenProfile);
