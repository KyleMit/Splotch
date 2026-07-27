// iOS profiling entry: drive the production preview build in Playwright's
// WebKit — the same engine family (WebKit + JavaScriptCore) the iOS app's
// WKWebView runs — and read the engine.* user-timing marks + frame timing.
//   npm run perf:ios            (WebKit engine, phone viewport)
//
// WebKit exposes no CDP / Chrome trace, so the main-thread breakdown and CPU
// self-time aren't available here (the report says so); the engine hot-path
// timings and FPS — the primary signal — are. This profiles the *engine*, not
// the Simulator's app shell. For device-accurate numbers, record a Timeline in
// Safari Web Inspector against the running Simulator app and feed the export to
// `npm run perf:analyze` (see the `profiling` skill).

import { webkit } from '@playwright/test';
import { isMain, runMain, sleep } from '../lib/utils.mjs';
import { buildAndPreview } from './preview.mjs';
import { driveSession } from './session.mjs';
import { resolveDevice } from './devices.mjs';
import { profilePath } from './paths.mjs';
import { warnIfNoPerfMarks } from './warnings.mjs';

const args = process.argv.slice(2);
const flag = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};
const deviceName = flag('device', 'phone');
const device = resolveDevice(deviceName);
const port = Number(flag('port', '4173'));
const build = !args.includes('--no-build');

export async function runIosProfile() {
  warnIfNoPerfMarks('npm run perf:ios');

  const outDir = profilePath('ios-webkit', deviceName);

  const { base, stop } = await buildAndPreview(port, { build });
  const browser = await webkit.launch({ headless: true });
  try {
    const ctx = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: device.deviceScaleFactor,
      hasTouch: true,
      isMobile: false,
    });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForSelector('#drawingCanvas');
    await sleep(400);

    // No CDP on WebKit — driveSession falls back to user-timing capture.
    await driveSession(page, null, {
      outDir,
      settings: {
        target: 'ios-webkit',
        device: `${deviceName} (WebKit engine, not the Simulator app)`,
        throttle: 0,
        buildMode: build ? 'production-preview' : 'production-preview (reused build)',
      },
    });
  } finally {
    await browser.close();
    stop();
  }
}

if (isMain(import.meta.url)) runMain(runIosProfile);
