// P1-2 of the PR 1319 review: does Android Chrome's rotation deliver
// orientationchange before resize (like Safari) or after (like WKWebView)?
// Measures orientationchange -> resize -> first rAF on the floor control and
// the app, interleaved arms, rotation driven the way the campaign drives it
// (user_rotation), read the way the campaign reads it (CDP via Playwright).
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const SERIAL = process.env.SERIAL ?? 'R5CRC3AVCXM';
const CDP_PORT = Number(process.env.CDP_PORT ?? 9224);
const ROUNDS = Number(process.env.ROUNDS ?? 6);
const PAGES = {
  floor: process.env.FLOOR_URL ?? 'http://192.168.40.53:4176/',
  app: process.env.APP_URL ?? 'http://192.168.40.53:4173/',
};
const SETTLE_MS = 3500;

const adb = (args) => execFileSync('adb', ['-s', SERIAL, ...args], { encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SNIPPET = `(() => {
  window.__rot = { orientationchangeAt: null, screenOrientationAt: null, resizeAt: null, frames: [] };
  const mark = (key) => () => {
    if (window.__rot[key] === null) window.__rot[key] = performance.now();
  };
  window.addEventListener('orientationchange', mark('orientationchangeAt'), true);
  screen.orientation?.addEventListener('change', mark('screenOrientationAt'), true);
  window.addEventListener('resize', mark('resizeAt'), true);
  const loop = (t) => { window.__rot.frames.push(t); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  return true;
})()`;

const READBACK = `(() => {
  const r = window.__rot;
  const firstFrameAfter = (at) => {
    const f = r.frames.find((t) => t >= at);
    return f === undefined ? null : Math.round((f - at) * 10) / 10;
  };
  const delta = (a, b) => (a !== null && b !== null ? Math.round((b - a) * 10) / 10 : null);
  return {
    orientToResizeMs: delta(r.orientationchangeAt, r.resizeAt),
    screenOrientToResizeMs: delta(r.screenOrientationAt, r.resizeAt),
    ffFromResizeMs: r.resizeAt !== null ? firstFrameAfter(r.resizeAt) : null,
    ffFromOrientMs: r.orientationchangeAt !== null ? firstFrameAfter(r.orientationchangeAt) : null,
    sawOrientation: r.orientationchangeAt !== null,
  };
})()`;

const rotationFor = (orientation) => (orientation === 'LANDSCAPE' ? '1' : '0');

const originalUserRotation = adb(['shell', 'settings', 'get', 'system', 'user_rotation']);
const originalAccel = adb(['shell', 'settings', 'get', 'system', 'accelerometer_rotation']);

adb([
  'shell',
  'am',
  'start',
  '-a',
  'android.intent.action.VIEW',
  '-d',
  PAGES.floor,
  'com.android.chrome',
]);
adb(['forward', `tcp:${CDP_PORT}`, 'localabstract:chrome_devtools_remote']);
await sleep(4000);

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
const context = browser.contexts()[0];

const pageFor = async (url) => {
  const existing = context.pages().find((candidate) => candidate.url().startsWith(url));
  if (existing) {
    await existing.bringToFront();
    return existing;
  }
  adb([
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    url,
    'com.android.chrome',
  ]);
  await sleep(4000);
  const opened = context.pages().find((candidate) => candidate.url().startsWith(url));
  if (!opened) throw new Error(`no CDP page for ${url}`);
  await opened.bringToFront();
  return opened;
};

try {
  adb(['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0']);
  let orientation = 'LANDSCAPE';
  const flip = () => (orientation = orientation === 'LANDSCAPE' ? 'PORTRAIT' : 'LANDSCAPE');
  const results = { floor: [], app: [] };
  for (let round = 0; round < ROUNDS; round += 1) {
    for (const [name, url] of Object.entries(PAGES)) {
      const page = await pageFor(url);
      await page.evaluate(SNIPPET);
      adb(['shell', 'settings', 'put', 'system', 'user_rotation', rotationFor(orientation)]);
      await sleep(SETTLE_MS);
      const reading = await page.evaluate(READBACK);
      results[name].push(reading);
      console.log(
        `round ${round} ${name} to ${orientation}: orient->resize ${reading.orientToResizeMs}ms, ` +
          `screenOrient->resize ${reading.screenOrientToResizeMs}ms, ` +
          `ff(resize) ${reading.ffFromResizeMs}ms, ff(orient) ${reading.ffFromOrientMs}ms` +
          (reading.sawOrientation ? '' : '  [no orientationchange]')
      );
      flip();
    }
    flip();
  }
} finally {
  adb(['shell', 'settings', 'put', 'system', 'user_rotation', originalUserRotation || '0']);
  if (originalAccel === 'null' || originalAccel === '') {
    adb(['shell', 'settings', 'delete', 'system', 'accelerometer_rotation']);
  } else {
    adb(['shell', 'settings', 'put', 'system', 'accelerometer_rotation', originalAccel]);
  }
  await browser.close().catch(() => null);
}
