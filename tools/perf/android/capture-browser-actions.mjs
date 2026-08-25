import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';
import { ADB } from '../../mobile/android/lib/android-toolchain.mjs';
import { ROOT, fail, isMain, pollUntil, runMain, sleep } from '../../lib/proc.mjs';
import {
  MIN_GATED_SAMPLES,
  WARMUP_REPEATS,
  actionFailures,
  actionRows,
  summarizeActions,
} from '../lib/action-stats.mjs';
import { parsePerfArgs } from '../lib/cli-args.mjs';
import { startTrace, stopTrace } from '../lib/chrome-trace-capture.mjs';
import { profilingUrl, runActionSweep, selectedActions } from '../ios/capture-xcuitest-actions.mjs';
import { ensurePreviewServer, resolveDeviceUrl } from '../lib/profile-device-session.mjs';
import { profilePath } from '../lib/profile-paths.mjs';
import { PlaywrightWebDriver } from '../lib/webdriver-client.mjs';
import {
  ensureCampaignTheme,
  parseCampaignTheme,
  readResolvedTheme,
} from '../lib/campaign-state.mjs';

const APP_PATH = '/';
const ACTION_PROBE_FILE = join(ROOT, 'tools', 'perf', 'probes', 'action-probe.js');
const SESSION_ID = 'android-web-cdp';
const DEFAULT_CDP_PORT = 9_224;
const CDP_READY_TIMEOUT_MS = 20_000;
const PAGE_READY_TIMEOUT_MS = 30_000;
const PAGE_SETTLE_MS = 2_500;
const STABLE_FRAME_WINDOW_MS = 500;
const STABLE_FRAME_GAP_MAX_MS = 32;
const STABLE_FRAME_TIMEOUT_MS = 10_000;
const ORIENTATION_SETTLE_MS = 1_000;
const PROFILER_PARAM = 'perf-android-web';

function positiveInteger(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) fail(`--${name} must be a positive integer`);
  return parsed;
}

function adb(deviceId, args, { allowFailure = false } = {}) {
  const result = spawnSync(ADB, [...(deviceId ? ['-s', deviceId] : []), ...args], {
    encoding: 'utf8',
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`adb ${args.join(' ')} failed: ${result.stderr?.trim() || result.status}`);
  }
  return result.stdout?.trim() ?? '';
}

export function connectedAndroidDevices(output) {
  return output
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([, state]) => state === 'device')
    .map(([id]) => id);
}

function resolveAndroidDevice(requested) {
  const devices = connectedAndroidDevices(adb(null, ['devices']));
  if (requested && !devices.includes(requested)) {
    fail(
      `Android device ${requested} is not connected. Available: ${devices.join(', ') || 'none'}`
    );
  }
  if (requested) return requested;
  if (devices.length === 0) fail('No Android device is connected through ADB');
  if (devices.length > 1) fail(`Multiple Android devices are connected; pass --device-id=`);
  return devices[0];
}

function profilerUrl(base, token) {
  const url = new URL(base);
  url.searchParams.set(PROFILER_PARAM, token);
  return url.toString();
}

export function isOwnedProfilerUrl(base, candidate) {
  try {
    const expected = new URL(base);
    const url = new URL(candidate);
    return (
      url.origin === expected.origin &&
      (url.searchParams.has(PROFILER_PARAM) || url.searchParams.has('perf-actions'))
    );
  } catch {
    return false;
  }
}

async function cdpTargets(endpoint) {
  const response = await fetch(`${endpoint}/json/list`);
  if (!response.ok) throw new Error(`CDP target list returned ${response.status}`);
  return response.json();
}

async function closeTarget(endpoint, id) {
  await fetch(`${endpoint}/json/close/${encodeURIComponent(id)}`).catch(() => null);
}

async function selectProfilerTarget(endpoint, base, token) {
  const target = await pollUntil(
    async () => {
      const targets = await cdpTargets(endpoint).catch(() => []);
      return targets.find((candidate) => {
        try {
          return new URL(candidate.url).searchParams.get(PROFILER_PARAM) === token;
        } catch {
          return false;
        }
      });
    },
    CDP_READY_TIMEOUT_MS,
    250
  );
  if (!target) throw new Error('Android Chrome did not expose the launched profiler tab over CDP');
  const targets = await cdpTargets(endpoint);
  await Promise.all(
    targets
      .filter((candidate) => candidate.id !== target.id && isOwnedProfilerUrl(base, candidate.url))
      .map((candidate) => closeTarget(endpoint, candidate.id))
  );
  return target;
}

async function clearBrowserCaches(page) {
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  });
}

async function waitForStableFrames(page) {
  await sleep(PAGE_SETTLE_MS);
  await page.evaluate(
    ({ stableWindowMs, maxGapMs, timeoutMs }) =>
      new Promise((resolve, reject) => {
        let previous;
        let stableSince;
        const timeout = setTimeout(
          () => reject(new Error(`Frames did not stabilize within ${timeoutMs} ms`)),
          timeoutMs
        );
        const frame = (at) => {
          if (previous !== undefined && at - previous <= maxGapMs) stableSince ??= at;
          else stableSince = undefined;
          previous = at;
          if (stableSince !== undefined && at - stableSince >= stableWindowMs) {
            clearTimeout(timeout);
            resolve(true);
          } else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
    {
      stableWindowMs: STABLE_FRAME_WINDOW_MS,
      maxGapMs: STABLE_FRAME_GAP_MAX_MS,
      timeoutMs: STABLE_FRAME_TIMEOUT_MS,
    }
  );
}

async function waitForCanvas(page) {
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector('#drawingCanvas');
      return canvas instanceof HTMLCanvasElement && canvas.width > 0;
    },
    undefined,
    { timeout: PAGE_READY_TIMEOUT_MS }
  );
}

function rotationFor(orientation) {
  return orientation === 'LANDSCAPE' ? '1' : '0';
}

export async function runAndroidWebActions(argv = process.argv.slice(2)) {
  const { flag, has, port } = parsePerfArgs(
    {
      entry: true,
      extra: [
        'url',
        'device-id',
        'cdp-port',
        'orientation',
        'actions',
        'repeats',
        'label',
        'output',
        'trace',
        'report-only',
        'no-serve',
        'theme',
      ],
    },
    argv
  );
  const base = resolveDeviceUrl(flag('url'), port, APP_PATH);
  const deviceId = resolveAndroidDevice(flag('device-id'));
  const cdpPort = positiveInteger(flag('cdp-port', String(DEFAULT_CDP_PORT)), 'cdp-port');
  const repeats = positiveInteger(flag('repeats', '4'), 'repeats');
  if (repeats < WARMUP_REPEATS + MIN_GATED_SAMPLES) {
    fail(`--repeats must provide one warmup and ${MIN_GATED_SAMPLES} scored samples`);
  }
  const actions = selectedActions(flag('actions'));
  const requestedTheme = parseCampaignTheme(flag('theme'));
  const requestedOrientation = flag('orientation')?.toUpperCase();
  if (requestedOrientation && !['PORTRAIT', 'LANDSCAPE'].includes(requestedOrientation)) {
    fail('--orientation must be PORTRAIT or LANDSCAPE');
  }
  const token = `${Date.now()}`;
  const launchUrl = profilerUrl(base, token);
  const endpoint = `http://127.0.0.1:${cdpPort}`;
  const originalAutoRotation = adb(deviceId, [
    'shell',
    'settings',
    'get',
    'system',
    'accelerometer_rotation',
  ]);
  const originalRotation = adb(deviceId, ['shell', 'settings', 'get', 'system', 'user_rotation']);
  // Pin the panel to its base 60Hz for the whole sweep. Chrome boosts an
  // adaptive-sync panel to 120Hz around touch, and during the boost's decay
  // the compositor presents every third vsync — a flat 25.0ms (3 x 8.33) frame
  // cadence behind instantaneous first frames that the gates charged as
  // dropped frames across the entire toggle/theme family (issue 1251). Pinned
  // to 60Hz the same actions score 16.7-16.8 flat: the work was never the
  // cost, the boost-window presentation stepping was. Drawing captures are NOT
  // pinned — their cadence check and 120hz refresh regime need the boost.
  const REFRESH_RATE_SETTINGS = ['peak_refresh_rate', 'min_refresh_rate'];
  const originalRefreshRates = REFRESH_RATE_SETTINGS.map((name) =>
    adb(deviceId, ['shell', 'settings', 'get', 'system', name])
  );
  const restoreRefreshRate = () => {
    REFRESH_RATE_SETTINGS.forEach((name, index) => {
      const original = originalRefreshRates[index];
      const args =
        original === 'null'
          ? ['shell', 'settings', 'delete', 'system', name]
          : ['shell', 'settings', 'put', 'system', name, original];
      adb(deviceId, args, { allowFailure: true });
    });
  };
  for (const name of REFRESH_RATE_SETTINGS) {
    adb(deviceId, ['shell', 'settings', 'put', 'system', name, '60.0']);
  }
  let server;
  let browser;
  let cdp;
  let target;
  let traceActive = false;
  let traceEvents;
  const output =
    flag('output') ??
    join(profilePath('android-web-actions', flag('label', 'full-suite')), 'actions.json');

  try {
    server = await ensurePreviewServer(base, port, !has('no-serve'));
    adb(deviceId, [
      'shell',
      'am',
      'start',
      '-a',
      'android.intent.action.VIEW',
      '-d',
      launchUrl,
      'com.android.chrome',
    ]);
    adb(deviceId, ['forward', `tcp:${cdpPort}`, 'localabstract:chrome_devtools_remote']);
    target = await selectProfilerTarget(endpoint, base, token);
    browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0];
    const page = context.pages().find((candidate) => candidate.url() === target.url);
    if (!page) throw new Error(`Playwright could not attach to ${target.url}`);
    await page.bringToFront();
    await waitForCanvas(page);
    await clearBrowserCaches(page);

    const readOrientation = () =>
      page.evaluate(() => (innerWidth > innerHeight ? 'LANDSCAPE' : 'PORTRAIT'));
    const rotate = async (orientation) => {
      adb(deviceId, ['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0']);
      adb(deviceId, [
        'shell',
        'settings',
        'put',
        'system',
        'user_rotation',
        rotationFor(orientation),
      ]);
      await page.waitForFunction(
        (next) => (next === 'LANDSCAPE' ? innerWidth > innerHeight : innerHeight > innerWidth),
        orientation,
        { timeout: PAGE_READY_TIMEOUT_MS }
      );
      await sleep(ORIENTATION_SETTLE_MS);
    };
    cdp = await context.newCDPSession(page);
    const client = new PlaywrightWebDriver(page, {
      cdp,
      readOrientation,
      rotate,
      readWindowRect: () =>
        page.evaluate(() => ({ x: 0, y: 0, width: innerWidth, height: innerHeight })),
      includeBrowserChrome: false,
      useWebGeometryForClear: true,
    });
    if (requestedOrientation) await client.setOrientation(requestedOrientation);
    const originalOrientation = await client.orientation();
    const execute = (script) => page.evaluate(`(() => {${script}})()`);
    let settingsShell = null;
    const samples = [];
    const expectedLabels = new Set();
    let baselineTheme;
    if (has('trace')) {
      traceEvents = await startTrace(cdp);
      traceActive = true;
    }

    for (let repeat = 1; repeat <= repeats; repeat++) {
      await page.goto(profilingUrl(base, repeat), { waitUntil: 'load' });
      await waitForCanvas(page);
      await ensureCampaignTheme(execute, requestedTheme);
      baselineTheme = await readResolvedTheme(execute);
      await page.evaluate(readFileSync(ACTION_PROBE_FILE, 'utf8'));
      await waitForStableFrames(page);
      console.log(`\nAndroid web action sweep ${repeat}/${repeats}`);
      const sweep = await runActionSweep({
        client,
        sessionId: SESSION_ID,
        execute,
        actions,
        originalOrientation,
        baselineTheme,
      });
      settingsShell = sweep.settingsShell;
      if (repeat <= WARMUP_REPEATS) {
        for (const sample of sweep.samples) expectedLabels.add(sample.label);
      }
      samples.push(
        ...sweep.samples.map((sample) => ({
          ...sample,
          repeat,
          warmup: repeat <= WARMUP_REPEATS,
        }))
      );
    }

    if (traceActive) {
      await stopTrace(cdp);
      traceActive = false;
    }

    const summaries = summarizeActions(samples, expectedLabels);
    const failures = actionFailures(summaries);
    mkdirSync(dirname(output), { recursive: true });
    const artifact = {
      device: {
        name: adb(deviceId, ['shell', 'getprop', 'ro.product.model']) || deviceId,
        os: adb(deviceId, ['shell', 'getprop', 'ro.build.version.release']) || 'unknown',
        id: deviceId,
      },
      appUrl: base,
      transport: 'android-chrome-cdp',
      uiActivation: 'trusted-cdp-touch',
      refreshRatePinnedHz: 60,
      actions: [...actions],
      repeats,
      orientation: originalOrientation,
      theme: baselineTheme,
      settingsShell,
      samples,
      summaries,
      passed: failures.length === 0,
    };
    writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`);
    if (traceEvents) {
      writeFileSync(join(dirname(output), 'trace.json'), JSON.stringify({ traceEvents }));
    }
    console.log('\nAndroid Chrome discrete action response');
    console.table(actionRows(summaries));
    console.log(`\nWrote ${output}`);
    if (failures.length && !has('report-only')) {
      throw new Error(
        `Action frame gates failed: ${failures.map((summary) => summary.label).join(', ')}`
      );
    }
    return artifact;
  } finally {
    if (traceActive && cdp) await stopTrace(cdp).catch(() => null);
    await browser?.close();
    if (target) await closeTarget(endpoint, target.id);
    adb(deviceId, ['forward', '--remove', `tcp:${cdpPort}`], { allowFailure: true });
    adb(deviceId, ['shell', 'settings', 'put', 'system', 'user_rotation', originalRotation], {
      allowFailure: true,
    });
    adb(
      deviceId,
      ['shell', 'settings', 'put', 'system', 'accelerometer_rotation', originalAutoRotation],
      { allowFailure: true }
    );
    restoreRefreshRate();
    server?.stop();
  }
}

if (isMain(import.meta.url)) runMain(runAndroidWebActions);
