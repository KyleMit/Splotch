// Diagnostic only: with user_rotation=1 asserted, release the app lock via Settings and watch
// whether the page follows; then try re-asserting user_rotation. Restores lock + adb at the end.
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { releaseNativeRotationLock, restoreNativeRotationLock } from '../../../../tools/perf/lib/campaign-state.mjs';
const serial = process.argv[2];
const port = 9238;
const adb = (...args) => spawnSync('adb', ['-s', serial, ...args], { encoding: 'utf8' }).stdout.trim();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const before = { a: adb('shell', 'settings', 'get', 'system', 'accelerometer_rotation'), u: adb('shell', 'settings', 'get', 'system', 'user_rotation') };
adb('shell', 'am', 'force-stop', 'art.splotch.app'); await wait(1500);
adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
adb('shell', 'settings', 'put', 'system', 'user_rotation', '1'); await wait(2500);
adb('shell', 'am', 'start', '-n', 'art.splotch.app/.MainActivity'); await wait(6000);
const pid = adb('shell', 'pidof', 'art.splotch.app').split(/\s+/)[0];
adb('forward', `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`);
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith('https://localhost'));
const execute = (script) => page.evaluate(`(() => {${script}})()`);
const vp = async (tag) => console.log(tag, JSON.stringify(await page.evaluate(() => [innerWidth, innerHeight, screen.orientation.type])), adb('shell', 'dumpsys', 'window').match(/mDisplayRotation=ROTATION_\d+/)?.[0]);
let initial;
try {
  await vp('launched');
  initial = await releaseNativeRotationLock(execute);
  console.log('initial', JSON.stringify(initial));
  for (const t of [0, 500, 1500, 3000]) { await wait(t ? 500 : 0); await vp(`after-unlock+${t}`); }
  adb('shell', 'settings', 'put', 'system', 'user_rotation', '0'); await wait(300);
  adb('shell', 'settings', 'put', 'system', 'user_rotation', '1'); await wait(2500);
  await vp('after-reassert');
} finally {
  if (initial?.lockedOrientation) await restoreNativeRotationLock(execute, initial).catch((e) => console.log('restore failed', e.message));
  await vp('after-restore').catch(() => {});
  await browser.close();
  adb('forward', '--remove', `tcp:${port}`);
  adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', before.a);
  adb('shell', 'settings', 'put', 'system', 'user_rotation', before.u);
}
