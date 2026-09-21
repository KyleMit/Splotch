// Drag-to-clear frame pacing in Android Chrome, per toolbar style.
//
// The shared action sweep measures a clear as one discrete action — pointerdown
// to the first frame that responds — so it cannot see what happens while the
// button is held and dragged. This runner holds one continuous CDP touch on the
// clear button and scrubs it back and forth across the accept radius, which is
// what a toddler does and what once collapsed the bare toolbar to ~40 fps while
// every discrete-action cell stayed green. Frame pacing is sampled in the page
// by requestAnimationFrame for the length of the scrub.
//
// Report-only: it records and prints, and gates nothing.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';
import { fail, isMain, runMain, sleep } from '../../lib/proc.mjs';
import { parsePerfArgs } from '../lib/cli-args.mjs';
import { startTrace, stopTrace } from '../lib/chrome-trace-capture.mjs';
import { ensurePreviewServer } from '../lib/profile-device-session.mjs';
import { profilePath } from '../lib/profile-paths.mjs';
import { servedBuildBinding } from '../lib/profile-preview.mjs';
import {
  adb,
  clearBrowserCaches,
  closeTarget,
  positiveInteger,
  profilerUrl,
  renderFrameRateFrom,
  resolveAndroidDevice,
  rotationFor,
  selectProfilerTarget,
  waitForCanvas,
  waitForStableFrames,
} from './capture-browser-actions.mjs';

// The storage key and values the app reads in readToolbarStyle()
// (web/src/lib/state/settings.svelte.ts). tools/ cannot import web/src, so
// tools/perf/tests/clear-drag.test.mjs fails if these drift from
// web/src/lib/storageKeys.ts and the ToolbarStyle union.
export const TOOLBAR_STORAGE_KEY = 'splotch-toolbar-style';
export const TOOLBAR_STYLES = ['buttons', 'bare'];

// Mirrors ACCEPT_RADIUS_FACTOR (web/src/lib/actions/dragToClearGeometry.ts),
// drift-guarded by the same test: the scrub must straddle the real threshold.
export const ACCEPT_RADIUS_FACTOR = 0.4;

const DEFAULT_CDP_PORT = 9_224;
const MOVES_PER_CYCLE = 60;
// Nearest and farthest drag distance, as fractions of the accept radius: each
// cycle crosses the threshold out and back, toggling the committed flood.
const SCRUB_NEAR_FRACTION = 0.25;
const SCRUB_FAR_FRACTION = 1.35;
// Target spacing between synthesized moves. CDP acknowledges a touch only once
// the renderer has handled it, so a busy page delivers fewer — the achieved
// rate is recorded rather than assumed.
const MOVE_INTERVAL_MS = 8;
const RELEASE_SETTLE_MS = 600;
// How long the page gets to follow a rotation write before the run refuses it.
const ORIENTATION_TIMEOUT_MS = 10_000;
// A frame interval this long is a visibly dropped frame at 60 Hz and above.
const JANK_INTERVAL_MS = 25;
const LONG_JANK_INTERVAL_MS = 50;
const SCRIBBLE_STROKES = 4;
const SCRIBBLE_POINTS = 40;

export function parseToolbarStyles(value) {
  if (value === undefined) return [...TOOLBAR_STYLES];
  const styles = value.split(',').map((style) => style.trim().toLowerCase());
  const unknown = styles.filter((style) => !TOOLBAR_STYLES.includes(style));
  if (unknown.length || styles.length === 0) {
    throw new Error(`--toolbars takes ${TOOLBAR_STYLES.join(' and/or ')}, comma-separated`);
  }
  return [...new Set(styles)];
}

// Heads from the button's docked centre toward the lower-left of the canvas,
// where a finger dragging the corner button actually goes.
export function clearDragPath(
  { x, y, radius, width, height },
  cycles,
  movesPerCycle = MOVES_PER_CYCLE
) {
  const angle = Math.atan2(height * 0.6 - y, width * 0.3 - x);
  const mid = (SCRUB_NEAR_FRACTION + SCRUB_FAR_FRACTION) / 2;
  const swing = (SCRUB_FAR_FRACTION - SCRUB_NEAR_FRACTION) / 2;
  const points = [];
  for (let cycle = 0; cycle < cycles; cycle++) {
    for (let step = 0; step < movesPerCycle; step++) {
      const phase = (step / movesPerCycle) * 2 * Math.PI;
      const distance = radius * (mid - swing * Math.cos(phase));
      points.push({ x: x + distance * Math.cos(angle), y: y + distance * Math.sin(angle) });
    }
  }
  return points;
}

export function frameIntervalSummary(timestamps, start, end) {
  const frames = timestamps.filter((at) => at >= start && at <= end);
  const intervals = frames
    .slice(1)
    .map((at, index) => at - frames[index])
    .sort((a, b) => a - b);
  const quantile = (q) =>
    intervals.length ? intervals[Math.min(intervals.length - 1, Math.floor(q * intervals.length))] : null;
  const durationMs = end - start;
  return {
    durationMs: Math.round(durationMs),
    frames: frames.length,
    fps: durationMs > 0 ? Number((frames.length / (durationMs / 1000)).toFixed(1)) : null,
    p50Ms: quantile(0.5),
    p95Ms: quantile(0.95),
    maxMs: intervals.at(-1) ?? null,
    over25Ms: intervals.filter((interval) => interval > JANK_INTERVAL_MS).length,
    over50Ms: intervals.filter((interval) => interval > LONG_JANK_INTERVAL_MS).length,
  };
}

function touchDriver(cdp) {
  return (type, x, y) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 0.5 }],
    });
}

async function pacedMoves(touch, points) {
  const startedAt = performance.now();
  for (const [index, point] of points.entries()) {
    const wait = startedAt + index * MOVE_INTERVAL_MS - performance.now();
    if (wait > 0) await sleep(wait);
    await touch('touchMove', point.x, point.y);
  }
}

// Ink on the page, so the wash and flood composite over a drawing rather than
// blank paper.
async function scribble(page, touch) {
  const { width, height } = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  for (let stroke = 0; stroke < SCRIBBLE_STROKES; stroke++) {
    const points = Array.from({ length: SCRIBBLE_POINTS }, (_, index) => ({
      x: width * (0.2 + (0.6 * index) / SCRIBBLE_POINTS),
      y: height * (0.35 + 0.1 * stroke) + 40 * Math.sin(index / 4),
    }));
    await touch('touchStart', points[0].x, points[0].y);
    await pacedMoves(touch, points);
    await touch('touchEnd');
  }
}

export function orientationOf({ width, height }) {
  return width > height ? 'LANDSCAPE' : 'PORTRAIT';
}

// Android can accept a rotation write and still hand the page the other
// orientation, so the label is what the page reports, never what was asked.
async function readOrientation(page) {
  return orientationOf(
    await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  );
}

async function waitForOrientation(page, orientation) {
  await page
    .waitForFunction(
      (landscape) => innerWidth > innerHeight === landscape,
      orientation === 'LANDSCAPE',
      { timeout: ORIENTATION_TIMEOUT_MS }
    )
    .catch(async () => {
      throw new Error(
        `requested ${orientation} but the page reports ${await readOrientation(page)}; refusing to label the capture`
      );
    });
}

async function loadToolbar(page, base, style, orientation) {
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [TOOLBAR_STORAGE_KEY, style]);
  await page.goto(base, { waitUntil: 'load' });
  await waitForCanvas(page);
  await waitForOrientation(page, orientation);
  await page.waitForFunction((value) => document.documentElement.dataset.toolbar === value, style);
  await waitForStableFrames(page);
}

async function scrubClearButton(page, touch, cycles) {
  const geometry = await page.evaluate((factor) => {
    const rect = document.querySelector('#clearButton').getBoundingClientRect();
    return {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
      radius: Math.min(innerWidth, innerHeight) * factor,
      width: innerWidth,
      height: innerHeight,
    };
  }, ACCEPT_RADIUS_FACTOR);
  await page.evaluate(() => {
    window.__clearDragFrames = [];
    const frame = (at) => {
      window.__clearDragFrames.push(at);
      window.__clearDragRaf = requestAnimationFrame(frame);
    };
    window.__clearDragRaf = requestAnimationFrame(frame);
  });
  const path = clearDragPath(geometry, cycles);
  const start = await page.evaluate(() => performance.now());
  await touch('touchStart', geometry.x, geometry.y);
  await pacedMoves(touch, path);
  // Back to the dock before letting go, so the scrub never commits a clear.
  await touch('touchMove', geometry.x, geometry.y);
  await touch('touchEnd');
  const end = await page.evaluate(() => performance.now());
  await sleep(RELEASE_SETTLE_MS);
  const frames = await page.evaluate(() => {
    cancelAnimationFrame(window.__clearDragRaf);
    return window.__clearDragFrames;
  });
  const summary = frameIntervalSummary(frames, start, end);
  return {
    ...summary,
    moves: path.length,
    movesPerSecond: Number((path.length / (summary.durationMs / 1000)).toFixed(1)),
  };
}

function summarizeByToolbar(samples) {
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  return Object.fromEntries(
    [...new Set(samples.map((sample) => sample.toolbar))].map((toolbar) => {
      const rows = samples.filter((sample) => sample.toolbar === toolbar);
      return [
        toolbar,
        {
          samples: rows.length,
          medianFps: median(rows.map((row) => row.fps)),
          medianP95Ms: median(rows.map((row) => row.p95Ms)),
          worstMs: Math.max(...rows.map((row) => row.maxMs)),
          over50Ms: rows.reduce((total, row) => total + row.over50Ms, 0),
        },
      ];
    })
  );
}

export async function runClearDrag(argv = process.argv.slice(2)) {
  const { flag, has, port } = parsePerfArgs(
    {
      entry: isMain(import.meta.url),
      extra: [
        'url',
        'device-id',
        'cdp-port',
        'toolbars',
        'orientation',
        'repeats',
        'cycles',
        'label',
        'output',
        'trace',
        'no-serve',
        'allow-foreign-build',
      ],
    },
    argv
  );
  let toolbars;
  try {
    toolbars = parseToolbarStyles(flag('toolbars'));
  } catch (error) {
    fail(error.message);
  }
  const orientation = (flag('orientation') ?? 'PORTRAIT').toUpperCase();
  if (!['PORTRAIT', 'LANDSCAPE'].includes(orientation)) {
    fail('--orientation must be PORTRAIT or LANDSCAPE');
  }
  const allowForeignBuild = has('allow-foreign-build');
  if (allowForeignBuild && !flag('url')) {
    fail('--allow-foreign-build needs --url= naming the externally served build it allows');
  }
  const repeats = positiveInteger(flag('repeats', '3'), 'repeats');
  const cycles = positiveInteger(flag('cycles', '6'), 'cycles');
  const cdpPort = positiveInteger(flag('cdp-port', String(DEFAULT_CDP_PORT)), 'cdp-port');
  const deviceId = resolveAndroidDevice(flag('device-id'));
  // localhost through `adb reverse` by default rather than the LAN address the
  // other device runners use: Chrome's "Always use secure connections" setting
  // interposes a warning page on a plain-http LAN origin, and exempts localhost.
  const reversed = !flag('url');
  const base = flag('url') ?? `http://localhost:${port}/`;
  const endpoint = `http://127.0.0.1:${cdpPort}`;
  const token = `${Date.now()}`;
  const output =
    flag('output') ??
    join(profilePath('android-web-clear-drag', flag('label', toolbars.join('-'))), 'clear-drag.json');

  const originalAutoRotation = adb(deviceId, ['shell', 'settings', 'get', 'system', 'accelerometer_rotation']);
  const originalRotation = adb(deviceId, ['shell', 'settings', 'get', 'system', 'user_rotation']);
  const restoreDevice = () => {
    adb(deviceId, ['shell', 'settings', 'put', 'system', 'user_rotation', originalRotation], {
      allowFailure: true,
    });
    adb(deviceId, ['shell', 'settings', 'put', 'system', 'accelerometer_rotation', originalAutoRotation], {
      allowFailure: true,
    });
    adb(deviceId, ['forward', '--remove', `tcp:${cdpPort}`], { allowFailure: true });
    if (reversed) adb(deviceId, ['reverse', '--remove', `tcp:${port}`], { allowFailure: true });
  };
  process.once('exit', restoreDevice);

  let server;
  let browser;
  let cdp;
  let target;
  let traceEvents;
  let traceActive = false;
  try {
    server = await ensurePreviewServer(base, port, !has('no-serve'), { allowForeignBuild });
    const servedBuild = await servedBuildBinding(base, { verifiedAgainstCheckout: !allowForeignBuild });
    if (reversed) adb(deviceId, ['reverse', `tcp:${port}`, `tcp:${port}`]);
    adb(deviceId, ['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0']);
    adb(deviceId, ['shell', 'settings', 'put', 'system', 'user_rotation', rotationFor(orientation)]);
    const launchUrl = profilerUrl(base, token);
    adb(deviceId, ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', launchUrl, 'com.android.chrome']);
    adb(deviceId, ['forward', `tcp:${cdpPort}`, 'localabstract:chrome_devtools_remote']);
    target = await selectProfilerTarget(endpoint, base, token);
    browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0];
    const page = context.pages().find((candidate) => candidate.url() === target.url);
    if (!page) throw new Error(`Playwright could not attach to ${target.url}`);
    await page.bringToFront();
    // A service worker left by an earlier build would serve its old shell, and
    // the scrub would measure that build instead of the one just bound above.
    await waitForCanvas(page);
    await clearBrowserCaches(page);
    cdp = await context.newCDPSession(page);
    const touch = touchDriver(cdp);
    if (has('trace')) {
      traceEvents = await startTrace(cdp);
      traceActive = true;
    }

    const samples = [];
    for (let repeat = 1; repeat <= repeats; repeat++) {
      for (const toolbar of toolbars) {
        await loadToolbar(page, launchUrl, toolbar, orientation);
        await scribble(page, touch);
        await waitForStableFrames(page);
        const scrub = await scrubClearButton(page, touch, cycles);
        const observed = await readOrientation(page);
        if (observed !== orientation) {
          throw new Error(`the page rotated to ${observed} during the scrub; discarding the run`);
        }
        const sample = { repeat, toolbar, orientation: observed, ...scrub };
        console.log(
          `${toolbar.padEnd(7)} repeat ${repeat}: ${sample.fps} fps, p95 ${sample.p95Ms?.toFixed(1)} ms, ` +
            `max ${sample.maxMs?.toFixed(1)} ms, ${sample.over50Ms} frames >${LONG_JANK_INTERVAL_MS} ms, ` +
            `${sample.movesPerSecond} moves/s`
        );
        samples.push(sample);
      }
    }
    if (traceActive) {
      await stopTrace(cdp);
      traceActive = false;
    }

    const artifact = {
      device: {
        name: adb(deviceId, ['shell', 'getprop', 'ro.product.model']) || deviceId,
        os: adb(deviceId, ['shell', 'getprop', 'ro.build.version.release']) || 'unknown',
        id: deviceId,
        renderFrameRateHz: renderFrameRateFrom(adb(deviceId, ['shell', 'dumpsys', 'display'])),
      },
      appUrl: base,
      ...servedBuild,
      transport: 'android-chrome-cdp',
      orientation,
      cycles,
      movesPerCycle: MOVES_PER_CYCLE,
      samples,
      summaries: summarizeByToolbar(samples),
    };
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`);
    if (traceEvents) writeFileSync(join(dirname(output), 'trace.json'), JSON.stringify({ traceEvents }));
    console.log('\nDrag-to-clear scrub, by toolbar style');
    console.table(artifact.summaries);
    console.log(`\nWrote ${output}`);
    return artifact;
  } finally {
    if (traceActive && cdp) await stopTrace(cdp).catch(() => null);
    await browser?.close().catch(() => null);
    if (target) await closeTarget(endpoint, target.id);
    process.removeListener('exit', restoreDevice);
    restoreDevice();
    server?.stop();
  }
}

if (isMain(import.meta.url)) runMain(runClearDrag);
