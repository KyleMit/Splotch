// Web profiling entry: build the production preview bundle (PERF_MARKS=true),
// open it in a headless Chromium at a chosen device viewport + CPU throttle,
// and run the shared toddler session against it.
//   npm run perf:web            (phone viewport, 4× CPU throttle)
//   npm run perf:web:raw        (no throttle)
//   node tools/perf/web/capture-web-session.mjs --device=tablet --throttle=6 --no-build
//
// Headless + CPU throttling approximates a phone — good for hotspots and
// regressions, but absolute frame numbers want the Android path (capture-webview-session.mjs).

import { chromium } from '@playwright/test';
import { chromiumExecutablePath } from '../../lib/playwright.mjs';
import { isMain, runMain, sleep } from '../../lib/proc.mjs';
import { parsePerfArgs } from '../lib/cli-args.mjs';
import { buildAndPreview } from '../lib/profile-preview.mjs';
import { driveSession } from '../lib/toddler-session.mjs';
import { profilePath } from '../lib/profile-paths.mjs';
import { warnIfNoPerfMarks } from '../lib/profile-warnings.mjs';

const { deviceName, device, throttle, port, build } = parsePerfArgs({
  throttleDefault: 4,
  entry: isMain(import.meta.url),
});

export async function runWebScenario() {
  warnIfNoPerfMarks('npm run perf:web');

  const outDir = profilePath('web', deviceName, throttle.tag);

  const { base, stop } = await buildAndPreview(port, { build });
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromiumExecutablePath(chromium),
  });
  try {
    const ctx = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: device.deviceScaleFactor,
      hasTouch: true,
      isMobile: false,
    });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForSelector('#drawingCanvas');
    await sleep(400);

    const cdp = await ctx.newCDPSession(page);
    if (throttle.active) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle.rate });
    }

    await driveSession(page, cdp, {
      outDir,
      settings: {
        target: 'web',
        device: deviceName,
        viewport: device,
        throttle: throttle.forSettings,
        buildMode: build ? 'production-preview' : 'production-preview (reused build)',
      },
    });
  } finally {
    await browser.close();
    stop();
  }
}

if (isMain(import.meta.url)) runMain(runWebScenario);
