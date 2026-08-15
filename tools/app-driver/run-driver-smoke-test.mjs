#!/usr/bin/env node
// Smoke test guarding tools/app-driver/lib/app-driver.mjs against silent rot. The gen:*
// generators (gen:store-assets, gen:promotional-image) drive the live app purely by selector
// through that module and never run in CI, so a dropped import (e.g. `sleep`) or
// a stale probe/selector after an app-markup change stays broken until someone
// hand-runs a generator. This boots the real app once and exercises the driver's
// entry path — openAppPage + expandDrawer + palette/picker colors + pickBrush + setStrokeSize + drawStroke
// + the coloring-book path (openColoringBook + pickBook + pickPage +
// waitForColoringOverlay) — plus every generated scene color at all four store
// target viewports, then tears the server down.

import { chromium } from '@playwright/test';
import { PALETTE_COLORS } from '../../web/src/lib/palette.ts';
import { STORE_DRAWING_SCENES } from '../store-drawings/generated/store-drawings.mjs';
import { chromiumExecutablePath } from '../lib/playwright.mjs';
import { sleep } from '../lib/proc.mjs';
import { check, fatal, summarize } from '../lib/smoke.mjs';
import {
  ensureDevServer,
  openAppPage,
  canvasBox,
  expandDrawer,
  pickColor,
  pickDrawingColor,
  pickBrush,
  setStrokeSize,
  drawStroke,
  hasInk,
  tiledRendererIsActive,
  openColoringBook,
  openSettingsSection,
  pickBook,
  pickPage,
  waitForColoringOverlay,
} from './lib/app-driver.mjs';

const PORT = Number(process.env.SMOKE_PORT ?? 4173);
const STORE_TARGETS = [
  {
    label: 'Google Play phone',
    orientation: 'tall',
    device: { width: 432, height: 768, deviceScaleFactor: 1 },
  },
  {
    label: 'App Store iPhone',
    orientation: 'tall',
    device: { width: 430, height: 932, deviceScaleFactor: 1 },
  },
  {
    label: 'Google Play tablet',
    orientation: 'wide',
    device: { width: 1280, height: 720, deviceScaleFactor: 1 },
  },
  {
    label: 'App Store iPad',
    orientation: 'wide',
    device: { width: 1366, height: 1024, deviceScaleFactor: 1 },
  },
];
const PRIMARY_TARGET = STORE_TARGETS[2];
const GREEN = '#8CC864';

function sceneColors(orientation) {
  const unique = new Map();
  for (const [key, scene] of Object.entries(STORE_DRAWING_SCENES)) {
    if (!key.endsWith(`-${orientation}`)) continue;
    for (const color of scene.colors) unique.set(JSON.stringify(color), color);
  }
  return [...unique.values()];
}

async function verifySceneColors(page, target) {
  const colors = sceneColors(target.orientation);
  const missing = [];
  for (const color of colors.filter(({ kind }) => kind === 'palette')) {
    const palette = PALETTE_COLORS.find(({ label }) => label === color.label);
    if (
      !palette ||
      !(await page.locator(`.color-swatch[data-color="${palette.hex}"]:visible`).count())
    ) {
      missing.push(`palette:${color.label}`);
    }
  }

  const pickerColors = colors.filter(({ kind }) => kind === 'picker');
  if (pickerColors.length > 0) {
    await page.locator('.gradient-swatch:visible').click();
    await page.locator('#color-picker').waitFor({ state: 'visible' });
    for (const color of pickerColors) {
      if (
        !(await page.locator(`#color-picker .hexagon[data-color="${color.hex}"]:visible`).count())
      ) {
        missing.push(`picker:${color.hex}`);
      }
    }
    await page.keyboard.press('Escape');
    await page.locator('#color-picker').waitFor({ state: 'hidden' });
  }

  check(
    `${target.label} exposes every generated ${target.orientation} scene color`,
    missing.length === 0,
    missing.join(', ')
  );
}

async function run(browser, base) {
  const { ctx, page } = await openAppPage(browser, base, PRIMARY_TARGET.device);
  check('openAppPage resolves with #drawingCanvas ready', true);
  await verifySceneColors(page, PRIMARY_TARGET);

  await expandDrawer(page);
  check(
    'expandDrawer opens the drawer (coloring-book button visible)',
    await page.locator('#coloringBookButton').isVisible()
  );

  check(`pickColor selects the ${GREEN} swatch`, await pickColor(page, GREEN));

  await pickDrawingColor(page, { kind: 'picker', hex: '#2ECC71' });
  check(
    'pickDrawingColor selects an exact hex-grid color',
    (await page.locator('.gradient-swatch').getAttribute('class'))?.includes('active') === true
  );

  await pickBrush(page, 'crayon');
  check(
    'pickBrush returns after the engine commits crayon mode',
    (await page.evaluate(() => window.__committedBrushMode?.())) === 'crayon'
  );

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
  check('the tiled renderer is the active surface', await tiledRendererIsActive(page));
  check('drawStroke lays ink on a visible live tile', await hasInk(page));

  await openColoringBook(page);
  await sleep(450);
  await pickBook(page, 'Farm');
  await sleep(400);
  await pickPage(page, 'Cat');
  await waitForColoringOverlay(page);
  check(
    'openColoringBook + pickBook + pickPage apply a Cat page overlay',
    await page.locator('#coloringOverlay').isVisible()
  );

  await openSettingsSection(page, 'Parent Center');
  check(
    'openSettingsSection lands the wide shell on Parent Center',
    await page.getByRole('heading', { name: 'Parent Center' }).first().isVisible()
  );

  await ctx.close();

  for (const target of STORE_TARGETS) {
    if (target === PRIMARY_TARGET) continue;
    const { ctx: targetContext, page: targetPage } = await openAppPage(
      browser,
      base,
      target.device
    );
    await verifySceneColors(targetPage, target);
    // The phone hub is the other Settings shell — drill-in navigation instead
    // of the wide sidebar scroll.
    if (target.label === 'Google Play phone') {
      await openSettingsSection(targetPage, 'Parent Center');
      check(
        'openSettingsSection drills the phone hub into Parent Center',
        await targetPage.getByRole('heading', { name: 'Parent Center' }).first().isVisible()
      );
    }
    await targetContext.close();
  }
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
