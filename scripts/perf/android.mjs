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
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { ROOT, sleep, run, fail } from '../lib/utils.mjs';
import { driveSession } from './session.mjs';

const APP_ID = 'art.splotch.app';
const CDP_PORT = 9222;

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
function readWebviewSocket() {
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
async function findWebviewSocket(timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const socket = readWebviewSocket();
    if (socket) return socket;
    if (Date.now() > deadline) return null;
    await sleep(1000);
  }
}

async function getWebviewPage(browser) {
  // The WebView's page may take a moment to register after launch.
  for (let i = 0; i < 20; i++) {
    const ctx = browser.contexts()[0];
    const pages = ctx ? ctx.pages() : [];
    const page = pages.find((p) => !p.url().startsWith('about:')) || pages[0];
    if (page) return page;
    await sleep(500);
  }
  throw new Error('No WebView page exposed over CDP');
}

async function main() {
  requireDevice();

  if (build) {
    if (process.env.PERF_MARKS !== 'true') {
      console.warn(
        '! PERF_MARKS is not "true" — rebuild may omit engine.* marks. Use `npm run perf:android`.'
      );
    }
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

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outDir = join(ROOT, 'perf-profiles', `${stamp}-android-${model.replace(/\s+/g, '_')}`);

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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
