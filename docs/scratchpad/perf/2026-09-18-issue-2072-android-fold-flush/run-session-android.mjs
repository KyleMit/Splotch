// The 1750 package's Android driver, with PAYLOAD selecting payload-diag.js for
// the diagnostic controls. Android Chrome counterpart of run-session.mjs: opens /dev/engine in the
// phone's Chrome, attaches over the forwarded devtools socket, runs the same
// in-page session payload, and writes the page's result.
//   HARNESS_URL=http://<lan-ip>:<port>/dev/engine OUT_DIR=<dir> ANDROID_SERIAL=<id> \
//     node run-session-android.mjs <label> <restamp|glaze-direct> <paced|burst> ['{"undoGapMs":700}']
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const [label = 'run', arm = 'restamp', mode = 'paced', extra = '{}'] = process.argv.slice(2);
const base = process.env.HARNESS_URL;
const serial = process.env.ANDROID_SERIAL;
const outDir = process.env.OUT_DIR ?? join(here, 'runs');
const CDP_PORT = Number(process.env.CDP_PORT ?? 9224);
const POLL_MS = 3000;
const RESULT_TIMEOUT_MS = 15 * 60_000;
if (!base || !serial) throw new Error('set HARNESS_URL and ANDROID_SERIAL');

const adb = (...args) => {
  const r = spawnSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`adb ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};
const url = `${base}?run=${encodeURIComponent(label)}-${Date.now()}`;
const refreshHz = adb('shell', 'dumpsys', 'display').match(/renderFrameRate\s+([\d.]+)/)?.[1] ?? null;
adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url, 'com.android.chrome');
adb('forward', `tcp:${CDP_PORT}`, 'localabstract:chrome_devtools_remote');
let browser;
try {
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  let page;
  for (let i = 0; i < 40 && !page; i++) {
    page = browser.contexts()[0].pages().find((p) => p.url() === url);
    if (!page) await new Promise((r) => setTimeout(r, 500));
  }
  if (!page) throw new Error(`no Chrome page at ${url}`);
  await page.bringToFront();
  await page.waitForFunction(() => window.__engineReady === true && !!window.__engine, null, {
    timeout: 60_000,
  });
  const cfg = { arm, mode, ...JSON.parse(extra) };
  await page.evaluate((c) => (window.__cfg = c), cfg);
  const injectAt = Date.now();
  await page.evaluate(readFileSync(process.env.PAYLOAD ?? join(here, '../2026-09-18-issue-1750-ipad-baseline/session-payload.js'), 'utf8'));
  let result = null;
  const deadline = Date.now() + RESULT_TIMEOUT_MS;
  while (!result && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    result = await page.evaluate(() => window.__session ?? null);
  }
  if (!result) throw new Error('no result before the timeout');
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `${label}.json`);
  writeFileSync(
    file,
    JSON.stringify({
      label,
      harnessUrl: base,
      device: { platform: 'android', refreshHz },
      host: { wallFromInjectMs: Date.now() - injectAt, at: new Date().toISOString() },
      result,
    })
  );
  if (result.error) console.log('ERROR', result.error);
  else console.log(JSON.stringify({ label, arm: result.arm, entry: result.entry, vp: result.viewport, ua: result.ua }));
  await page.close();
} finally {
  await browser?.close().catch(() => {});
  spawnSync('adb', ['-s', serial, 'forward', '--remove', `tcp:${CDP_PORT}`]);
}
