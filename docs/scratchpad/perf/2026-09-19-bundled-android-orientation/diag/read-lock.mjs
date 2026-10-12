// Diagnostic only (not production): read the app's rotation-lock controls through Settings
// without changing them, then close Settings. Prints viewport + lock state.
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
const serial = process.argv[2];
const port = 9237;
const adb = (...args) => spawnSync('adb', ['-s', serial, ...args], { encoding: 'utf8' }).stdout.trim();
const pid = adb('shell', 'pidof', 'art.splotch.app').split(/\s+/)[0];
const unix = adb('shell', 'cat', '/proc/net/unix');
const socket = unix.includes(`webview_devtools_remote_${pid}`) ? `webview_devtools_remote_${pid}` : unix.match(/webview_devtools_remote_\d+/)?.[0];
adb('forward', `tcp:${port}`, `localabstract:${socket}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith('https://localhost'));
  const q = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? { checked: e.getAttribute('aria-checked'), pressed: e.getAttribute('aria-pressed') } : null; }, sel);
  for (let i = 0; i < 20 && !(await page.evaluate(() => document.querySelector('#settingsModal')?.open === true)); i++) {
    await page.evaluate(() => document.querySelector('button[aria-label="Settings"]')?.click());
    await wait(400);
  }
  const compact = await page.evaluate(() => !!document.querySelector('#settingsModal .quick-toggles'));
  if (!compact) {
    await page.evaluate(() => document.querySelector('#settingsModal button[data-section="appearance"]')?.click());
    await wait(800);
  }
  const result = {
    viewport: await page.evaluate(() => [innerWidth, innerHeight]),
    compact,
    lockRotation: await q('#lockRotationToggle'),
    forceLandscape: await q('#forceLandscapeToggle'),
    quickPortrait: await q('#quickLockPortrait'),
    quickLandscape: await q('#quickLockLandscape'),
  };
  await page.evaluate(() => document.querySelector('#settingsModal button[aria-label="Close"]')?.click());
  await wait(800);
  console.log(JSON.stringify(result));
  await browser.close();
} finally {
  adb('forward', '--remove', `tcp:${port}`);
}
