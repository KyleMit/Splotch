// Generates the store assets for BOTH stores (Google Play + Apple App Store):
// phone/tablet screenshots per store and the Play feature graphic, by driving
// the real Splotch app in a headless browser.
// A dev server is started automatically (or reused if one is already on 4173):
//   npm run gen:store-assets
//
// Output lands in store-assets/. Screenshots are captured at the exact pixel
// sizes each store wants:
//   Google Play  phone 1080x1920 (9:16)   tablet 1920x1080 (16:9)
//   App Store    iPhone 6.9" 1290x2796    iPad 13" 2732x2048

import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PALETTE_COLORS } from '../../web/src/lib/palette.ts';
import { ROOT, sleep } from '../lib/proc.mjs';
import { chromiumExecutablePath } from '../lib/playwright.mjs';
import { drawHouseTall, drawHouseWide } from '../store-drawings/generated/store-drawings.mjs';
import {
  ensureDevServer,
  openAppPage,
  canvasBox,
  expandDrawer,
  pickColor,
  setStrokeSize,
  drawStroke,
  dismissMenu,
  openColoringBook,
  pickBook,
  pickPage,
  waitForColoringOverlay,
  openColorPicker,
  openSettingsModal,
} from '../app-driver/lib/app-driver.mjs';

const OUT = join(ROOT, 'store-assets');
const PORT = 4173;

// Google Play: 9:16 portrait phone -> 1080x1920; 16:9 landscape tablet -> 1920x1080.
const PHONE = { width: 432, height: 768, deviceScaleFactor: 2.5 };
const TABLET = { width: 1280, height: 720, deviceScaleFactor: 1.5 };
// App Store: iPhone 6.9" portrait -> 1290x2796; iPad 13" landscape -> 2732x2048.
const IPHONE = { width: 430, height: 932, deviceScaleFactor: 3 };
const IPAD = { width: 1366, height: 1024, deviceScaleFactor: 2 };

const C = Object.fromEntries(PALETTE_COLORS.map(({ hex, label }) => [label.toLowerCase(), hex]));

const shot = (page, file) => page.screenshot({ path: join(OUT, file) });

async function colorInLines(page, box) {
  const W = box.width,
    H = box.height;
  const scribble = async (hex, cx, cy, rx, ry) => {
    if (!(await pickColor(page, hex))) return;
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const a = (i / 6) * Math.PI;
      const rr = i / 60;
      pts.push({ x: cx + Math.cos(a) * rx * rr, y: cy + Math.sin(a) * ry * rr });
    }
    await drawStroke(page, box, pts);
  };
  await scribble(C.orange, W * 0.5, H * 0.45, W * 0.18, H * 0.16);
  await scribble(C.yellow, W * 0.5, H * 0.62, W * 0.14, H * 0.1);
  await scribble(C.blue, W * 0.35, H * 0.4, W * 0.08, H * 0.07);
  await scribble(C.blue, W * 0.65, H * 0.4, W * 0.08, H * 0.07);
}

// No DOM signal is surfaced for these dialog animations, so they stay timed.
const MENU_TRANSITION_MS = 450; // coloring-book dialog sliding open
const PAGE_GRID_TRANSITION_MS = 400; // a book's page grid animating in
// Scene 2 makes that same grid the subject of its shot, so it waits out the
// transition with a margin — tuning the transition carries the shot along.
const PAGE_GRID_SETTLE_MS = PAGE_GRID_TRANSITION_MS + 100;
const SCREENSHOT_SETTLE_MS = 500; // last entrance animation before the capture

// Each scene opens its own page, drives the app, captures one screenshot and
// closes — so a single scene can be run on its own while iterating on it.

async function sceneFreeDraw(browser, base, device, dir) {
  const { ctx, page } = await openAppPage(browser, base, device);
  await expandDrawer(page);
  const box = await canvasBox(page);
  await (box.height > box.width ? drawHouseTall(page, box) : drawHouseWide(page, box));
  await shot(page, `${dir}/01-draw.png`);
  await ctx.close();
}
sceneFreeDraw.label = '01-draw';

async function sceneColoringBook(browser, base, device, dir) {
  const { ctx, page } = await openAppPage(browser, base, device);
  await expandDrawer(page);
  await openColoringBook(page);
  await sleep(MENU_TRANSITION_MS);
  await pickBook(page, 'Farm');
  await sleep(PAGE_GRID_SETTLE_MS);
  await shot(page, `${dir}/02-coloring-book.png`);
  await ctx.close();
}
sceneColoringBook.label = '02-coloring-book';

async function sceneColorPage(browser, base, device, dir) {
  const { ctx, page } = await openAppPage(browser, base, device);
  await expandDrawer(page);
  await setStrokeSize(page, 5);
  await openColoringBook(page);
  await sleep(MENU_TRANSITION_MS);
  await pickBook(page, 'Farm');
  await sleep(PAGE_GRID_TRANSITION_MS);
  await pickPage(page, 'Cat');
  await waitForColoringOverlay(page);
  const box = await canvasBox(page);
  await colorInLines(page, box);
  await dismissMenu(page);
  await shot(page, `${dir}/03-color-page.png`);
  await ctx.close();
}
sceneColorPage.label = '03-color-page';

async function sceneColorPicker(browser, base, device, dir) {
  const { ctx, page } = await openAppPage(browser, base, device);
  await openColorPicker(page);
  await sleep(SCREENSHOT_SETTLE_MS);
  await shot(page, `${dir}/04-color-picker.png`);
  await ctx.close();
}
sceneColorPicker.label = '04-color-picker';

async function sceneSettingsModal(browser, base, device, dir) {
  const { ctx, page } = await openAppPage(browser, base, device);
  await openSettingsModal(page);
  await sleep(SCREENSHOT_SETTLE_MS);
  await shot(page, `${dir}/05-settings.png`);
  await ctx.close();
}
sceneSettingsModal.label = '05-settings';

function featureGraphicHtml(iconB64) {
  return `<!doctype html><html><head><meta charset="utf-8">
  <style>
    @font-face { font-family:'QS'; src: local('Quicksand'); }
    * { margin:0; box-sizing:border-box; }
    html,body { width:1024px; height:500px; overflow:hidden; }
    body {
      display:flex; align-items:center; gap:54px; padding:0 86px;
      font-family:'Quicksand','Segoe UI',sans-serif;
      background: radial-gradient(circle at 20% 20%, #fff 0%, #fdf7ff 45%, #f3f0ff 100%);
      position:relative;
    }
    .dots { position:absolute; inset:0; }
    .dot { position:absolute; border-radius:50%; opacity:.85; }
    .icon { width:300px; height:300px; flex:0 0 auto; filter: drop-shadow(0 14px 30px rgba(120,80,180,.25)); }
    .copy { z-index:2; }
    .name { font-size:128px; font-weight:700; letter-spacing:-2px;
      background:linear-gradient(90deg,${C.red},${C.orange},${C.yellow},${C.green},${C.blue},${C.purple});
      -webkit-background-clip:text; background-clip:text; color:transparent; line-height:1; }
    .tag { font-size:38px; font-weight:600; color:#5a4a6b; margin-top:18px; }
    .sub { font-size:24px; font-weight:500; color:#9385a3; margin-top:14px; }
  </style></head>
  <body>
    <div class="dots">
      <span class="dot" style="width:42px;height:42px;background:${C.yellow};top:48px;left:560px"></span>
      <span class="dot" style="width:26px;height:26px;background:${C.green};top:120px;left:930px"></span>
      <span class="dot" style="width:34px;height:34px;background:${C.blue};bottom:70px;left:520px"></span>
      <span class="dot" style="width:20px;height:20px;background:${C.red};bottom:120px;left:880px"></span>
      <span class="dot" style="width:30px;height:30px;background:${C.purple};top:60px;left:60px"></span>
    </div>
    <img class="icon" src="data:image/png;base64,${iconB64}">
    <div class="copy">
      <div class="name">Splotch</div>
      <div class="tag">Doodle, color &amp; create</div>
      <div class="sub">A calm, ad-free drawing app made for little hands</div>
    </div>
  </body></html>`;
}

const SCENES = [
  sceneFreeDraw,
  sceneColoringBook,
  sceneColorPage,
  sceneColorPicker,
  sceneSettingsModal,
];

const { base, stop } = await ensureDevServer(PORT);
try {
  const browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });
  const targets = [
    { name: 'phone', device: PHONE, dir: 'screenshots/phone' },
    { name: 'tablet', device: TABLET, dir: 'screenshots/tablet10' },
    { name: 'iphone', device: IPHONE, dir: 'screenshots/iphone69' },
    { name: 'ipad', device: IPAD, dir: 'screenshots/ipad13' },
  ];

  for (const t of targets) {
    for (const scene of SCENES) {
      await scene(browser, base, t.device, t.dir);
      console.log(`${t.name} ${scene.label} done`);
    }
  }

  // FEATURE GRAPHIC — 1024x500
  {
    const iconB64 = readFileSync(join(OUT, 'icon-512.png')).toString('base64');
    const ctx = await browser.newContext({
      viewport: { width: 1024, height: 500 },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await page.setContent(featureGraphicHtml(iconB64), { waitUntil: 'networkidle' });
    await sleep(300);
    await page.screenshot({ path: join(OUT, 'feature-graphic.png') });
    await ctx.close();
    console.log('feature-graphic done');
  }

  await browser.close();
} finally {
  stop();
}
console.log('ALL DONE');
