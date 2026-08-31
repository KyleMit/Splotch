// First-show cost of the Settings dialog, scored against a reopen. The dialog
// mounts closed, its pane prewarms at idle, and the closed card stays laid
// out but hidden (ADR-0049's amendment) — with presentation staged separately
// from layout: the open flip itself paints nothing, the above-the-fold
// sections paint one frame later, and the rest reveal one per frame after the
// fly-in lands. "Shown" therefore means the first presented section inside an
// [open] dialog — the moment a parent first sees content — not the pane
// merely existing (the prewarmed pane satisfies weaker selectors before any
// tap) and not the whole pane (whose remainder deliberately arrives over
// frames). The first-open-over-reopen gap is the open edge's unpayable
// residual, and the number to watch for regressions. Measured on the
// production build with a `longtask` PerformanceObserver, the wide
// table-of-contents shell against the phone hub, which renders the same modal
// chrome and the same eleven rows with no section bodies at all. The settle
// before the tap is what lets the idle prewarm finish; a tap that beats idle
// (the cold path) is not scored here.
//
//   npm run perf:web:settings                       (both shells, 4x CPU throttle)
//   node tools/perf/web/capture-settings-open.mjs --throttle=1 --repeats=5 --no-build
//
// Writes settings-open.json to perf-profiles/.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { chromiumExecutablePath } from '../../lib/playwright.mjs';
import { isMain, runMain } from '../../lib/proc.mjs';
import { parsePerfArgs, requireNumberFlag } from '../lib/cli-args.mjs';
import { DEVICES } from '../lib/profile-devices.mjs';
import { buildAndPreview } from '../lib/profile-preview.mjs';
import { profilePath } from '../lib/profile-paths.mjs';
import { LONG_TASK_MS } from '../lib/performance-thresholds.mjs';

// The two shells the section list renders into, at the viewport that selects
// each (SettingsModal's 700px WIDE_QUERY). The hub is not a variant under test —
// it is the baseline, unchanged by this work. Each ready selector is the
// shell's first *presented* content inside an [open] dialog: the wide pane's
// first unstaged section (aria-busy went false at prewarm, long before any
// tap, and staged sections are laid out but invisible — neither is "shown"),
// and the hub's rows, which are never staged.
const SHELLS = {
  wide: {
    device: DEVICES.desktop,
    ready: '#settingsModal[open] .settings-pane .settings-section:not(.staged)',
    warm: '.settings-pane[aria-busy="false"]',
  },
  'phone-hub': {
    device: DEVICES.phone,
    ready: '#settingsModal[open] .hub-row',
    warm: '#settingsModal .hub-row',
  },
};

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

// A beat between closing the dialog and the reopen tap, so the close frame and
// any tail long task it reports land outside the reopen's measured window.
const REOPEN_SETTLE_MS = 500;

// One tap-to-shown cycle. Both timings are taken in the page, a frame apart at
// worst. Read from the driver instead, a `waitForSelector` plus a round trip
// lands ~150 ms of its own polling on a number this small. The fly-in is
// recorded because a tap that beats the prewarm still holds its fill until the
// card lands: without that split, the wait reads as work.
async function measureOpenCycle(page, ready) {
  const { tapAt, taskFloor } = await page.evaluate((ready) => {
    const at = performance.now();
    const floor = window.__settingsOpen.longTasks.length;
    window.__settingsOpen.shownMs = undefined;
    window.__settingsOpen.flyInMs = undefined;
    document.querySelector('#settingsButton').click();
    const pollReady = () => {
      if (document.querySelector(ready)) window.__settingsOpen.shownMs = performance.now() - at;
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
    return { tapAt: at, taskFloor: floor };
  }, ready);
  await page.waitForSelector(ready);
  await page.waitForTimeout(TAIL_SETTLE_MS);
  const { shownMs, flyInMs } = await page.evaluate(() => ({
    shownMs: window.__settingsOpen.shownMs ?? 0,
    flyInMs: window.__settingsOpen.flyInMs ?? 0,
  }));

  // Kept by end, not by start: the task the tap itself runs in began before
  // the clock was read inside it, and where the open does real work that task
  // IS the cost — filtering on `start` drops precisely the measurement and
  // reports a clean zero. Sliced from the observer index taken at this tap so
  // an earlier cycle's tasks can't bleed into this one.
  const longTasks = await page.evaluate(
    ({ tapAt, taskFloor }) =>
      window.__settingsOpen.longTasks
        .slice(taskFloor)
        .filter((task) => task.start + task.duration >= tapAt)
        .map((task) => ({ afterTapMs: task.start - tapAt, duration: task.duration })),
    { tapAt, taskFloor }
  );
  return { shownMs, flyInMs, longTasks };
}

async function measureFirstOpenAndReopen(browser, cdpThrottle, { device, ready, warm }, base) {
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
        // longtask unsupported on this engine — the shown timing still works
      }
    });

    const cdp = await ctx.newCDPSession(page);
    if (cdpThrottle.active) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cdpThrottle.rate });
    }

    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForSelector('#drawingCanvas');
    // The interaction-quiet residency pump deliberately spaces hidden mounts.
    // Observe the pane's own completion instead of coupling this warm-open
    // profile to a particular queue length or cadence.
    await page.waitForSelector(warm, { state: 'attached' });

    const firstOpen = await measureOpenCycle(page, ready);
    // Close through the dialog's own close(): modalDialog re-syncs the open
    // flag off the `close` event, so this is the Esc path without synthesizing
    // keyboard input.
    await page.evaluate(() => document.querySelector('#settingsModal').close());
    // Attached, not visible: a closed dialog never matches Playwright's
    // default visible state.
    await page.waitForSelector('#settingsModal:not([open])', { state: 'attached' });
    await page.waitForTimeout(REOPEN_SETTLE_MS);
    const reopen = await measureOpenCycle(page, ready);
    return { firstOpen, reopen };
  } finally {
    await ctx.close();
  }
}

const round = (n) => Math.round(n);
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const longestTask = (cycle) => Math.max(0, ...cycle.longTasks.map((task) => task.duration));

const cycleDetail = (cycle) => ({
  shownMs: round(cycle.shownMs),
  longTasks: cycle.longTasks.map((task) => ({
    afterTapMs: round(task.afterTapMs),
    durationMs: round(task.duration),
  })),
});

const cycleMedians = (cycles) => ({
  medianShownMs: round(median(cycles.map((cycle) => cycle.shownMs))),
  medianFlyInMs: round(median(cycles.map((cycle) => cycle.flyInMs))),
  medianLongestTaskMs: round(median(cycles.map(longestTask))),
});

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
        runs.push(await measureFirstOpenAndReopen(browser, throttle, shell, base));
      }
      results[name] = {
        viewport: `${shell.device.width}x${shell.device.height}`,
        runs: runs.map((run) => ({
          firstOpen: cycleDetail(run.firstOpen),
          reopen: cycleDetail(run.reopen),
        })),
        firstOpen: cycleMedians(runs.map((run) => run.firstOpen)),
        reopen: cycleMedians(runs.map((run) => run.reopen)),
      };
    }
  } finally {
    await browser.close();
    stop();
  }

  const summary = { throttle: throttle.tag, repeats, longTaskThresholdMs: LONG_TASK_MS, results };
  writeFileSync(join(outDir, 'settings-open.json'), JSON.stringify(summary, null, 2));

  for (const [name, result] of Object.entries(results)) {
    const describeCycle = (label, cycle) =>
      `${label}: longest task ${cycle.medianLongestTaskMs} ms, shown in ${cycle.medianShownMs} ms`;
    console.log(
      `${name.padEnd(10)} ${result.viewport.padEnd(9)} cpu ${throttle.tag}  ` +
        `${describeCycle('first open', result.firstOpen)}  ` +
        `${describeCycle('reopen', result.reopen)}  ` +
        `(first-open runs: ${result.runs
          .map(
            (run) =>
              `[${run.firstOpen.longTasks.map((task) => `${task.durationMs}ms@+${task.afterTapMs}`).join(' ')}]`
          )
          .join(' ')})`
    );
  }
  console.log(`\nArtifacts: ${outDir}`);
  return summary;
}

if (isMain(import.meta.url)) runMain(runSettingsOpenProfile);
