#!/usr/bin/env node
// Smoke test guarding scripts/lib/app-driver.mjs against silent rot. The gen:*
// generators (gen:shots, gen:large-image) drive the live app purely by selector
// through that module and never run in CI, so a dropped import (e.g. `sleep`) or
// a stale probe/selector after an app-markup change stays broken until someone
// hand-runs a generator. This boots the real app once and exercises the driver's
// entry path — openAppPage + expandDrawer + pickColor + setStrokeSize + drawStroke
// — asserting each step matches current markup, then tears the server down.

import { chromium } from '@playwright/test';
import { chromiumExecutablePath } from './lib/utils.mjs';
import { check, fatal, summarize } from './lib/smoke.mjs';
import {
  ensureDevServer,
  openAppPage,
  canvasBox,
  expandDrawer,
  pickColor,
  setStrokeSize,
  drawStroke,
} from './lib/app-driver.mjs';

const PORT = Number(process.env.SMOKE_PORT ?? 4173);
// Landscape so the full palette (portrait hides purple/blue) and the action
// drawer both have room — the same shape the store-shots tablet target uses.
const DEVICE = { width: 1280, height: 720, deviceScaleFactor: 1 };
const GREEN = '#8CC864';

async function run(browser, base) {
  const { ctx, page } = await openAppPage(browser, base, DEVICE);
  check('openAppPage resolves with #drawingCanvas ready', true);

  await expandDrawer(page);
  check(
    'expandDrawer opens the drawer (coloring-book button visible)',
    await page.locator('#coloringBookButton').isVisible()
  );

  check(`pickColor selects the ${GREEN} swatch`, await pickColor(page, GREEN));

  await setStrokeSize(page, 5);
  check(
    'setStrokeSize marks Size 5 active',
    (await page.locator('button[aria-label="Size 5"]').getAttribute('aria-pressed')) === 'true'
  );

  const box = await canvasBox(page);
  await drawStroke(page, box, [
    { x: box.width * 0.3, y: box.height * 0.4 },
    { x: box.width * 0.7, y: box.height * 0.6 },
  ]);
  const painted = await page.evaluate(() => {
    const c = document.getElementById('drawingCanvas');
    const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
    return false;
  });
  check('drawStroke lays ink on the canvas', painted);

  await ctx.close();
}

let stop;
let browser;
try {
  ({ stop } = await ensureDevServer(PORT));
  const base = `http://localhost:${PORT}/`;
  browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });
  await run(browser, base);
} catch (err) {
  fatal(err);
} finally {
  if (browser) await browser.close();
  if (stop) stop();
}

summarize();
