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
import { join } from 'node:path';
import { ROOT, sleep } from '../lib/utils.mjs';
import { buildAndPreview } from './preview.mjs';
import { driveSession } from './session.mjs';

const DEVICES = {
  phone: { width: 412, height: 915, deviceScaleFactor: 2.6 },
  tablet: { width: 1024, height: 1366, deviceScaleFactor: 2 },
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1 },
};

const args = process.argv.slice(2);
const flag = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};
const deviceName = flag('device', 'phone');
const device = DEVICES[deviceName] || DEVICES.phone;
const port = Number(flag('port', '4173'));
const build = !args.includes('--no-build');

async function main() {
  if (process.env.PERF_MARKS !== 'true') {
    console.warn(
      '! PERF_MARKS is not "true" — engine.* marks will be absent. Use `npm run perf:ios`.'
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(ROOT, 'perf-profiles', `${stamp}-ios-webkit-${deviceName}`);

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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
