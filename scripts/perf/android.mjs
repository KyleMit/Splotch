// Android profiling entry: profile the REAL Capacitor WebView on a connected
// emulator/device — no CPU throttle, because the device is the target. Reuses
// the same session + capture + analyzer as the web path; only the page source
// differs (a device WebView reached over `adb forward` + connectOverCDP instead
// of a launched Chromium).
//
//   npm run perf:android            (build native w/ PERF_MARKS, install, profile)
//   node scripts/perf/android.mjs --no-build   (profile the installed app as-is)
//
// Local-only: needs an Android emulator/device on adb and the toolchain. The
// installed app must be a PERF_MARKS=true build for the engine.* marks to appear
// (the default flow rebuilds + reinstalls it).

import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { sleep, pollUntil, run, fail, isMain, runMain } from '../lib/utils.mjs';
import { driveSession } from './session.mjs';
import { profilePath } from './paths.mjs';
import { warnIfNoPerfMarks } from './warnings.mjs';

const APP_ID = 'art.splotch.app';
const CDP_PORT = 9222;
const WEBVIEW_SOCKET_TIMEOUT_MS = 25_000;
const WEBVIEW_SOCKET_POLL_INTERVAL_MS = 1_000;
const WEBVIEW_PAGE_TIMEOUT_MS = 10_000;
const WEBVIEW_PAGE_POLL_INTERVAL_MS = 500;

const args = process.argv.slice(2);
const build = !args.includes('--no-build');

const adb = (cmdArgs, opts = {}) => spawnSync('adb', cmdArgs, { encoding: 'utf8', ...opts });

function requireDevice() {
  const out = adb(['devices']).stdout || '';
  const devices = out
    .split('\n')
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l.endsWith('\tdevice'));
  if (devices.length === 0) {
    fail('No Android device/emulator on adb. Boot one (npm run android:boot) and retry.');
  }
}

// The WebView exposes its DevTools over an abstract unix socket named
// webview_devtools_remote_<pid>. Prefer the app's own pid; fall back to any.
export function readWebviewSocket() {
  const pid = (adb(['shell', 'pidof', APP_ID]).stdout || '').trim().split(/\s+/)[0];
  const unix = adb(['shell', 'cat', '/proc/net/unix']).stdout || '';
  const sockets = unix
    .split('\n')
    .map((l) => l.trim().split(/\s+/).pop())
    .filter((s) => s && s.includes('webview_devtools_remote'))
    .map((s) => s.replace(/^@/, ''));
  if (sockets.length === 0) return null;
  const byPid = pid && sockets.find((s) => s.endsWith(`_${pid}`));
  return byPid || sockets[0];
}

// A freshly (re)installed app can take several seconds to cold-start its
// WebView and register the socket, so poll instead of a single fixed wait.
export async function findWebviewSocket(timeoutMs = WEBVIEW_SOCKET_TIMEOUT_MS) {
  return pollUntil(readWebviewSocket, timeoutMs, WEBVIEW_SOCKET_POLL_INTERVAL_MS);
}

export async function getWebviewPage(browser) {
  // The WebView's page may take a moment to register after launch.
  const page = await pollUntil(() => {
    const ctx = browser.contexts()[0];
    const pages = ctx ? ctx.pages() : [];
    return pages.find((candidate) => !candidate.url().startsWith('about:'));
  }, WEBVIEW_PAGE_TIMEOUT_MS, WEBVIEW_PAGE_POLL_INTERVAL_MS);
  if (!page) throw new Error('No navigated WebView page was exposed over CDP');
  return page;
}

export async function runAndroidProfile() {
  requireDevice();

  if (build) {
    warnIfNoPerfMarks('npm run perf:android');
    // cap:sync (build:cap, inheriting PERF_MARKS) + gradle installDebug.
    run('npm', ['run', 'android:run']);
  }

  console.log('Launching app…');
  adb(['shell', 'am', 'start', '-n', `${APP_ID}/.MainActivity`], { stdio: 'ignore' });

  const socket = await findWebviewSocket();
  if (!socket) {
    fail(
      'No WebView DevTools socket found. Is the app a debug build (WebView debugging on) and in the foreground?'
    );
  }
  console.log(`WebView socket: ${socket}`);

  adb(['forward', `tcp:${CDP_PORT}`, `localabstract:${socket}`]);
  let browser;
  try {
    browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
    const page = await getWebviewPage(browser);
    await page.waitForSelector('#drawingCanvas', { timeout: 30_000 });
    await sleep(400);

    const cdp = await page.context().newCDPSession(page);
    const model = (adb(['shell', 'getprop', 'ro.product.model']).stdout || 'device').trim();

    const outDir = profilePath('android', model.replace(/\s+/g, '_'));

    await driveSession(page, cdp, {
      outDir,
      settings: {
        target: 'android',
        device: model,
        throttle: 0,
        buildMode: build ? 'native-debug (PERF_MARKS)' : 'native-debug (installed as-is)',
      },
    });
  } finally {
    if (browser) await browser.close();
    adb(['forward', '--remove', `tcp:${CDP_PORT}`]);
  }
}

if (isMain(import.meta.url)) runMain(runAndroidProfile);
