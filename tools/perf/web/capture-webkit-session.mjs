// iOS profiling entry: drive the production preview build in Playwright's
// WebKit — the same engine family (WebKit + JavaScriptCore) the iOS app's
// WKWebView runs — and read the engine.* user-timing marks + frame timing.
//   npm run perf:web:webkit            (WebKit engine, phone viewport)
//
// WebKit exposes no CDP / Chrome trace, so the main-thread breakdown and CPU
// self-time aren't available here (the report says so); the engine hot-path
// timings and FPS — the primary signal — are. This profiles the *engine*, not
// the Simulator's app shell. For device-accurate numbers, record a Timeline in
// Safari Web Inspector against the running Simulator app and feed the export to
// `npm run perf:analyze:chrome` (see the `profiling` skill).

import { webkit } from '@playwright/test';
import { isMain, runMain, sleep } from '../../lib/proc.mjs';
import { parsePerfArgs } from '../lib/cli-args.mjs';
import { buildAndPreview } from '../lib/profile-preview.mjs';
import { driveSession } from '../lib/toddler-session.mjs';
import { profilePath } from '../lib/profile-paths.mjs';
import { warnIfNoPerfMarks } from '../lib/profile-warnings.mjs';

const { deviceName, device, port, build } = parsePerfArgs({ entry: isMain(import.meta.url) });

export async function runIosProfile() {
  warnIfNoPerfMarks('npm run perf:web:webkit');

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
