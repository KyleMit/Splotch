// Generates the store assets for BOTH stores (Google Play + Apple App Store):
// phone/tablet screenshots per store and the Play feature graphic, by driving
// the real Splotch app in a headless browser.
// A dev server is started automatically (or reused if one is already on 4173):
//   npm run gen:shots
//
// Output lands in store-assets/. Screenshots are captured at the exact pixel
// sizes each store wants:
//   Google Play  phone 1080x1920 (9:16)   tablet 1920x1080 (16:9)
//   App Store    iPhone 6.9" 1290x2796    iPad 13" 2732x2048

import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, sleep } from './lib/utils.mjs';
import {
  ensureDevServer, openAppPage, canvasBox, expandDrawer, pickColor,
  setStrokeSize, drawStroke, dismissMenu, circlePts, arcPts, zigzag,
} from './lib/app-driver.mjs';

const OUT = join(ROOT, 'store-assets');
const PORT = 4173;

// Google Play: 9:16 portrait phone -> 1080x1920; 16:9 landscape tablet -> 1920x1080.
const PHONE = { width: 432, height: 768, deviceScaleFactor: 2.5 };
const TABLET = { width: 1280, height: 720, deviceScaleFactor: 1.5 };
// App Store: iPhone 6.9" portrait -> 1290x2796; iPad 13" landscape -> 2732x2048.
const IPHONE = { width: 430, height: 932, deviceScaleFactor: 3 };
const IPAD = { width: 1366, height: 1024, deviceScaleFactor: 2 };

// Brand palette (from src/lib/state/colors.svelte.js)
const C = {
  purple: '#AB71E1', blue: '#62A2E9', green: '#8CC864',
  yellow: '#F9D24F', orange: '#F89C45', red: '#EC534E', black: '#0a0b10'
};

const shot = (page, file) => page.screenshot({ path: join(OUT, file) });

// Paint a cheerful child's drawing onto the canvas: a rainbow, sun, grass and a
// flower. Uses only colors shown in every orientation (the portrait palette
// hides purple/blue), so the hero shot is full on both phone and tablet.
async function drawScene(page, box) {
  const W = box.width, H = box.height;
  // Keep the arc clear of the action-button column (left in portrait): endpoints
  // sit above the toolbar and inset from the left edge.
  const cx = W * 0.56, cy = H * 0.5;
  const r0 = Math.min(W * 0.38, H * 0.34);
  const step = Math.max(20, r0 * 0.16); // scale ring spacing to the arc, not the screen
  // Rainbow arcs (outer -> inner)
  const arc = [C.red, C.orange, C.yellow, C.green];
  for (let i = 0; i < arc.length; i++) {
    if (await pickColor(page, arc[i])) {
      await drawStroke(page, box, arcPts(cx, cy, r0 - i * step, Math.PI, Math.PI * 2));
    }
  }
  // Sun in the top-left
  if (await pickColor(page, C.yellow)) {
    const sx = W * 0.16, sy = H * 0.16, r = Math.min(W, H) * 0.07;
    await drawStroke(page, box, circlePts(sx, sy, r, 2));
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      await drawStroke(page, box, [
        { x: sx + Math.cos(a) * r * 1.5, y: sy + Math.sin(a) * r * 1.5 },
        { x: sx + Math.cos(a) * r * 2.1, y: sy + Math.sin(a) * r * 2.1 }
      ]);
    }
  }
  // Grass along the bottom + a flower (red bloom, green stem)
  if (await pickColor(page, C.green)) {
    await drawStroke(page, box, zigzag(W * 0.2, H * 0.93, W * 0.96, 14, 26));
    await drawStroke(page, box, [{ x: W * 0.78, y: H * 0.92 }, { x: W * 0.78, y: H * 0.74 }]);
  }
  if (await pickColor(page, C.red)) {
    await drawStroke(page, box, circlePts(W * 0.78, H * 0.7, Math.min(W, H) * 0.05, 2));
  }
  if (await pickColor(page, C.yellow)) {
    await drawStroke(page, box, circlePts(W * 0.78, H * 0.7, Math.min(W, H) * 0.02, 2));
  }
}

async function colorInLines(page, box) {
  const W = box.width, H = box.height;
  const scribble = async (hex, cx, cy, rx, ry) => {
    if (!(await pickColor(page, hex))) return;
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const a = (i / 6) * Math.PI;
      const rr = (i / 60);
      pts.push({ x: cx + Math.cos(a) * rx * rr, y: cy + Math.sin(a) * ry * rr });
    }
    await drawStroke(page, box, pts);
  };
  await scribble(C.orange, W * 0.5, H * 0.45, W * 0.18, H * 0.16);
  await scribble(C.yellow, W * 0.5, H * 0.62, W * 0.14, H * 0.1);
  await scribble(C.blue, W * 0.35, H * 0.4, W * 0.08, H * 0.07);
  await scribble(C.blue, W * 0.65, H * 0.4, W * 0.08, H * 0.07);
}

const { base, stop } = await ensureDevServer(PORT);
try {
  const browser = await chromium.launch();
  const targets = [
    { name: 'phone', device: PHONE, dir: 'screenshots/phone' },
    { name: 'tablet', device: TABLET, dir: 'screenshots/tablet10' },
    { name: 'iphone', device: IPHONE, dir: 'screenshots/iphone69' },
    { name: 'ipad', device: IPAD, dir: 'screenshots/ipad13' }
  ];

  for (const t of targets) {
    // SCENE 1 — free drawing
    {
      const { ctx, page } = await openAppPage(browser, base, t.device);
      await expandDrawer(page);
      await setStrokeSize(page, 4);
      const box = await canvasBox(page);
      await drawScene(page, box);
      await dismissMenu(page);
      await shot(page, `${t.dir}/01-draw.png`);
      await ctx.close();
      console.log(`${t.name} 01-draw done`);
    }

    // SCENE 2 — coloring book (Farm pages grid)
    {
      const { ctx, page } = await openAppPage(browser, base, t.device);
      await expandDrawer(page);
      await page.locator('#coloringBookButton').click();
      await sleep(450);
      await page.locator('button[aria-label="Farm coloring book"]').click();
      await sleep(500);
      await shot(page, `${t.dir}/02-coloring-book.png`);
      await ctx.close();
      console.log(`${t.name} 02-coloring-book done`);
    }

    // SCENE 3 — coloring a page within the lines
    {
      const { ctx, page } = await openAppPage(browser, base, t.device);
      await expandDrawer(page);
      await setStrokeSize(page, 5);
      await page.locator('#coloringBookButton').click();
      await sleep(450);
      await page.locator('button[aria-label="Farm coloring book"]').click();
      await sleep(400);
      await page.locator('button[aria-label="Farm coloring page"]').first().click();
      await sleep(700); // wait for overlay image to load
      const box = await canvasBox(page);
      await colorInLines(page, box);
      await dismissMenu(page);
      await shot(page, `${t.dir}/03-color-page.png`);
      await ctx.close();
      console.log(`${t.name} 03-color-page done`);
    }

    // SCENE 4 — rainbow color picker
    {
      const { ctx, page } = await openAppPage(browser, base, t.device);
      await page.locator('.color-swatch[data-color="custom"]').click();
      await sleep(500);
      await shot(page, `${t.dir}/04-color-picker.png`);
      await ctx.close();
      console.log(`${t.name} 04-color-picker done`);
    }

    // SCENE 5 — Parent Center (settings / trust)
    {
      const { ctx, page } = await openAppPage(browser, base, t.device);
      await page.locator('#parentHelpButton').click();
      await sleep(500);
      await shot(page, `${t.dir}/05-parent-center.png`);
      await ctx.close();
      console.log(`${t.name} 05-parent-center done`);
    }
  }

  // FEATURE GRAPHIC — 1024x500
  {
    const iconB64 = readFileSync(join(OUT, 'icon-512.png')).toString('base64');
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
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
      background:linear-gradient(90deg,#EC534E,#F89C45,#F9D24F,#8CC864,#62A2E9,#AB71E1);
      -webkit-background-clip:text; background-clip:text; color:transparent; line-height:1; }
    .tag { font-size:38px; font-weight:600; color:#5a4a6b; margin-top:18px; }
    .sub { font-size:24px; font-weight:500; color:#9385a3; margin-top:14px; }
  </style></head>
  <body>
    <div class="dots">
      <span class="dot" style="width:42px;height:42px;background:#F9D24F;top:48px;left:560px"></span>
      <span class="dot" style="width:26px;height:26px;background:#8CC864;top:120px;left:930px"></span>
      <span class="dot" style="width:34px;height:34px;background:#62A2E9;bottom:70px;left:520px"></span>
      <span class="dot" style="width:20px;height:20px;background:#EC534E;bottom:120px;left:880px"></span>
      <span class="dot" style="width:30px;height:30px;background:#AB71E1;top:60px;left:60px"></span>
    </div>
    <img class="icon" src="data:image/png;base64,${iconB64}">
    <div class="copy">
      <div class="name">Splotch</div>
      <div class="tag">Doodle, color &amp; create</div>
      <div class="sub">A calm, ad-free drawing app made for little hands</div>
    </div>
  </body></html>`;
}
