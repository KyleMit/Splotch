// Diagnostic only: count pointer events the bundled page receives for individual adb swipes.
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
const serial = process.argv[2];
const port = 9239;
const adb = (...args) => spawnSync('adb', ['-s', serial, ...args], { encoding: 'utf8' }).stdout.trim();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
adb('shell', 'am', 'force-stop', 'art.splotch.app'); await wait(1500);
adb('shell', 'am', 'start', '-n', 'art.splotch.app/.MainActivity'); await wait(6000);
const pid = adb('shell', 'pidof', 'art.splotch.app').split(/\s+/)[0];
adb('forward', `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`);
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith('https://localhost'));
await page.evaluate(() => { window.__diag = []; for (const t of ['pointerdown','pointerup','pointercancel']) addEventListener(t, (e) => window.__diag.push([t, Math.round(e.clientX), Math.round(e.clientY), e.target?.id || e.target?.tagName]), true); });
const cases = [
  ['seg2 as planned', [540, 1018, 745, 1446, 500]],
  ['seg2 alone again', [540, 1018, 745, 1446, 500]],
  ['seg6 as planned', [540, 1008, 745, 1519, 500]],
  ['same start, short', [540, 1018, 600, 1100, 500]],
  ['nearby start 520', [520, 1018, 745, 1446, 500]],
  ['seg2 reversed', [745, 1446, 540, 1018, 500]],
  ['seg1 control', [335, 734, 540, 1018, 500]],
];
for (const [name, [x0, y0, x1, y1, d]] of cases) {
  const before = await page.evaluate(() => window.__diag.length);
  adb('shell', 'input', 'swipe', String(x0), String(y0), String(x1), String(y1), String(d));
  await wait(400);
  const got = await page.evaluate((b) => window.__diag.slice(b), before);
  console.log(name, JSON.stringify(got));
}
await browser.close();
adb('forward', '--remove', `tcp:${port}`);
