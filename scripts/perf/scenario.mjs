// Web profiling entry: build the production preview bundle (PERF_MARKS=true),
// open it in a headless Chromium at a chosen device viewport + CPU throttle,
// and run the shared toddler session against it.
//   npm run perf:web            (phone viewport, 4× CPU throttle)
//   npm run perf:web:raw        (no throttle)
//   node scripts/perf/scenario.mjs --device=tablet --throttle=6 --no-build
//
// Headless + CPU throttling approximates a phone — good for hotspots and
// regressions, but absolute frame numbers want the Android path (android.mjs).

import { chromium } from '@playwright/test';
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
const throttle = args.includes('--no-throttle') ? 1 : Number(flag('throttle', '4'));
const port = Number(flag('port', '4173'));
const build = !args.includes('--no-build');

async function main() {
  if (process.env.PERF_MARKS !== 'true') {
    console.warn(
      '! PERF_MARKS is not "true" — engine.* marks will be absent. Use `npm run perf:web`.'
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const throttleTag = throttle > 1 ? `${throttle}x` : 'raw';
  const outDir = join(ROOT, 'perf-profiles', `${stamp}-web-${deviceName}-${throttleTag}`);

  const { base, stop } = await buildAndPreview(port, { build });
  const browser = await chromium.launch({ headless: true });
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
    if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });

    await driveSession(page, cdp, {
      outDir,
      settings: {
        target: 'web',
        device: deviceName,
        viewport: device,
        throttle: throttle > 1 ? throttle : 0,
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
