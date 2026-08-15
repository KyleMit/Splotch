// Static design comps for the store-screenshot refresh: captures the five
// proposed scenes from the live app (phone portrait + tablet landscape) and
// composes each into a captioned marketing frame at the exact Google Play
// pixel sizes. Review round only — once the design is approved this compositor
// folds into gen-store-assets.mjs and this entry point goes away.
//
//   node --experimental-strip-types tools/marketing-assets/gen-store-mockups.mjs
//   [--out <dir>] [--only <slide-id-substring>]
//
// Output: <out>/{phone,tablet}/0N-*.png (default tools/marketing-assets/mockups/,
// gitignored).

import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { PALETTE_COLORS } from '../../web/src/lib/palette.ts';
import { ROOT, isMain, sleep } from '../lib/proc.mjs';
import { chromiumExecutablePath } from '../lib/playwright.mjs';
import { drawDinosaurWide, drawIslandTall } from '../store-drawings/generated/store-drawings.mjs';
import {
  canvasBox,
  dismissMenu,
  drawStroke,
  ensureDevServer,
  expandDrawer,
  openAppPage,
  openColoringBook,
  openSettingsModal,
  pickBook,
  pickBrush,
  pickColor,
  pickPage,
  setStrokeSize,
  waitForColoringOverlay,
} from '../app-driver/lib/app-driver.mjs';

const OUT_DEFAULT = join(ROOT, 'tools', 'marketing-assets', 'mockups');
const PORT = 4173;

const C = Object.fromEntries(PALETTE_COLORS.map(({ hex, label }) => [label.toLowerCase(), hex]));

// ── Frame geometry ──────────────────────────────────────────────────────────
// Final frames are the exact Google Play upload sizes. The app is captured at
// CSS size × deviceScaleFactor chosen so the raw screenshot IS the card, pixel
// for pixel — no resampling.
const FRAME_MARGIN_PX = 54;
const PORTRAIT = {
  name: 'phone',
  width: 1080,
  height: 1920,
  capture: { width: 432, height: 668, deviceScaleFactor: 2.25 }, // -> 972x1503
};
const LANDSCAPE = {
  name: 'tablet',
  width: 1920,
  height: 1080,
  capture: { width: 848, height: 648, deviceScaleFactor: 1.5 }, // -> 1272x972
  captionColumnWidthPx: 510,
};
const cardSize = (o) => ({
  width: Math.round(o.capture.width * o.capture.deviceScaleFactor),
  height: Math.round(o.capture.height * o.capture.deviceScaleFactor),
});

// Dialog/entrance animations with no DOM completion signal stay timed, same as
// gen-store-assets.mjs.
const MENU_TRANSITION_MS = 450;
const PAGE_GRID_SETTLE_MS = 500;
const SCREENSHOT_SETTLE_MS = 500;
const BOOK_GRID_RETRY_LIMIT = 5;
const PAGE_PICK_RETRY_LIMIT = 4;
const PAGE_PICK_CONFIRM_TIMEOUT_MS = 4000;
const AI_RESULT_TIMEOUT_MS = 30_000;
const AI_REVEAL_SETTLE_MS = 1400; // dial hand-off + confetti mostly fallen

// ── Scene captures ──────────────────────────────────────────────────────────

// The preview server's real /api/free-generation-grant has no configuration
// and fails, which hides the AI wand from the drawer — mock a fresh 10-of-10
// grant in every scene so the drawer shows the app as a configured install
// sees it.
const mockFreeGrant = (page) =>
  page.route('**/api/free-generation-grant', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, limit: 10, remaining: 10, exhausted: false }),
    })
  );

async function capHero(browser, base, device, tall) {
  const { ctx, page } = await openAppPage(browser, base, device, { prepare: mockFreeGrant });
  await expandDrawer(page);
  const box = await canvasBox(page);
  await (tall ? drawIslandTall(page, box) : drawDinosaurWide(page, box));
  await sleep(SCREENSHOT_SETTLE_MS);
  const shot = await page.screenshot();
  await ctx.close();
  return shot;
}

// The picker opens on the 8-book cover grid unless the installed set resolved
// late and it landed on a single book (issue #936) — reopen until the grid.
async function capBooksGrid(browser, base, device) {
  const { ctx, page } = await openAppPage(browser, base, device, { prepare: mockFreeGrant });
  await expandDrawer(page);
  for (let attempt = 0; attempt < BOOK_GRID_RETRY_LIMIT; attempt++) {
    await openColoringBook(page);
    await sleep(MENU_TRANSITION_MS);
    const heading = (await page.locator('#coloring-book-dialog h2').textContent())?.trim();
    if (heading === 'Coloring Books') break;
    await page.keyboard.press('Escape');
    await sleep(MENU_TRANSITION_MS);
  }
  await waitForDialogImages(page);
  await sleep(PAGE_GRID_SETTLE_MS);
  const shot = await page.screenshot();
  await ctx.close();
  return shot;
}

const waitForDialogImages = (page) =>
  page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('#coloring-book-dialog img')].every(
          (img) => img.complete && img.naturalWidth > 0
        ),
      { timeout: 10_000 }
    )
    .catch(() => {});

async function capMagicReveal(browser, base, device) {
  const { ctx, page } = await openAppPage(browser, base, device, { prepare: mockFreeGrant });
  await expandDrawer(page);
  await setStrokeSize(page, 5);
  await openColoringBook(page);
  await sleep(MENU_TRANSITION_MS);
  await pickBook(page, 'Farm');
  await sleep(PAGE_GRID_SETTLE_MS);
  // The book-cover tap swaps the page grid in under the finger, arming the
  // launch guard's dead zone — a first page tap can be swallowed, so retry
  // until the overlay actually appears.
  for (let attempt = 0; attempt < PAGE_PICK_RETRY_LIMIT; attempt++) {
    await pickPage(page, 'Cat');
    const landed = await waitForColoringOverlay(page, { timeout: PAGE_PICK_CONFIRM_TIMEOUT_MS })
      .then(() => true)
      .catch(() => false);
    if (landed) break;
  }
  await pickBrush(page, 'magic');
  const box = await canvasBox(page);
  const W = box.width;
  const H = box.height;
  const sweep = (yFrac) => [
    { x: W * 0.24, y: H * yFrac },
    { x: W * 0.76, y: H * (yFrac + 0.02) },
    { x: W * 0.3, y: H * (yFrac + 0.09) },
    { x: W * 0.74, y: H * (yFrac + 0.11) },
  ];
  await drawStroke(page, box, sweep(0.38));
  await drawStroke(page, box, sweep(0.56));
  await drawStroke(page, box, sweep(0.72));
  await dismissMenu(page);
  await sleep(SCREENSHOT_SETTLE_MS);
  const shot = await page.screenshot();
  await ctx.close();
  return shot;
}

// A toddler-style stick figure with a flower, matching the real generation
// sample (scrapbook/model-eval .../line__person-flower__tall) the mocked
// endpoint returns, so the drawing on the canvas and the AI result agree.
async function drawPersonAndFlower(page, box) {
  const W = box.width;
  const H = box.height;
  const pt = (x, y) => ({ x: W * x, y: H * y });
  const ellipse = (cx, cy, rx, ry, rotation = 0, steps = 20) => {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * 2 * Math.PI;
      const ex = Math.cos(a) * rx;
      const ey = Math.sin(a) * ry;
      pts.push(
        pt(
          cx + ex * Math.cos(rotation) - ey * Math.sin(rotation),
          cy + ex * Math.sin(rotation) + ey * Math.cos(rotation)
        )
      );
    }
    return pts;
  };

  await setStrokeSize(page, 2);

  await pickColor(page, C.purple);
  await drawStroke(page, box, ellipse(0.3, 0.26, 0.1, 0.075)); // head
  await drawStroke(page, box, [pt(0.26, 0.29), pt(0.3, 0.31), pt(0.34, 0.29)]); // smile
  await drawStroke(page, box, [pt(0.27, 0.245)]); // eyes
  await drawStroke(page, box, [pt(0.33, 0.245)]);
  const hair = [];
  for (let i = 0; i <= 6; i++) {
    hair.push(pt(0.24 + i * 0.02, i % 2 === 0 ? 0.185 : 0.15));
  }
  await drawStroke(page, box, hair); // spiky hair
  await drawStroke(page, box, [pt(0.3, 0.335), pt(0.3, 0.52)]); // body
  await drawStroke(page, box, [pt(0.18, 0.46), pt(0.3, 0.42), pt(0.43, 0.38)]); // arms
  await drawStroke(page, box, [pt(0.3, 0.52), pt(0.24, 0.66)]); // legs
  await drawStroke(page, box, [pt(0.3, 0.52), pt(0.37, 0.66)]);

  await pickColor(page, C.green);
  await drawStroke(page, box, [pt(0.68, 0.62), pt(0.665, 0.5), pt(0.675, 0.38), pt(0.67, 0.3)]); // stem
  await drawStroke(page, box, ellipse(0.74, 0.5, 0.05, 0.025, -0.5)); // leaf

  await pickColor(page, C.orange);
  const FLOWER_CX = 0.675;
  const FLOWER_CY = 0.235;
  const PETAL_COUNT = 5;
  for (let k = 0; k < PETAL_COUNT; k++) {
    const a = (k / PETAL_COUNT) * 2 * Math.PI - Math.PI / 2;
    // Petal loops around the flower center, long axis pointing outward. The
    // x-radius is scaled by H/W so petals stay round on the tall canvas.
    await drawStroke(
      page,
      box,
      ellipse(
        FLOWER_CX + (Math.cos(a) * 0.062 * H) / W,
        FLOWER_CY + Math.sin(a) * 0.062,
        (0.045 * H) / W,
        0.028,
        a,
        16
      )
    );
  }
  await pickColor(page, C.yellow);
  await drawStroke(page, box, ellipse(FLOWER_CX, FLOWER_CY, (0.025 * H) / W, 0.025)); // center
}

async function capAiResult(browser, base, device, aiResultJpg) {
  const { ctx, page } = await openAppPage(browser, base, device, {
    prepare: async (page) => {
      await mockFreeGrant(page);
      await page.route('**/api/generate-image*', (route) =>
        route.fulfill({ status: 200, contentType: 'image/jpeg', body: aiResultJpg })
      );
    },
  });
  await expandDrawer(page);
  const box = await canvasBox(page);
  await drawPersonAndFlower(page, box);
  await page.locator('#aiImageButton').click();
  const style = page.getByRole('button', { name: 'Magical' });
  await style.click();
  await page.locator('.stage-img.result.shown').waitFor({ timeout: AI_RESULT_TIMEOUT_MS });
  await sleep(AI_REVEAL_SETTLE_MS);
  const shot = await page.screenshot();
  await ctx.close();
  return shot;
}

async function capDarkSettings(browser, base, device) {
  const { ctx, page } = await openAppPage(browser, base, device, {
    colorScheme: 'dark',
    prepare: mockFreeGrant,
  });
  await openSettingsModal(page);
  await sleep(MENU_TRANSITION_MS + SCREENSHOT_SETTLE_MS);
  const shot = await page.screenshot();
  await ctx.close();
  return shot;
}

// ── Frame composition ───────────────────────────────────────────────────────

const INK = '#4b3d5f';
const INK_MUTED = '#8d7fa0';
const INK_ON_DARK = '#f2eff7';
const INK_MUTED_ON_DARK = '#b9b3c6';
// Wide ellipse + gentle stops: a tight circle leaves a visible white hotspot
// on the landscape frame.
// The radial's bright center sits OFF-canvas: any in-frame center reads as a
// hotspot blob against the near-flat wash.
const LIGHT_FRAME_BG =
  'radial-gradient(150% 170% at -8% -10%, #ffffff 0%, #fbf6ff 45%, #f0ebfb 100%)';
const DARK_FRAME_BG = 'radial-gradient(150% 170% at -8% -10%, #363047 0%, #251f31 48%, #181420 100%)';
const CARD_RADIUS_PX = 36;
const CARD_SHADOW = '0 24px 60px rgba(120,80,180,.28), 0 0 0 1px rgba(120,80,180,.10)';
const CARD_SHADOW_DARK = '0 24px 60px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.08)';

const dot = (x, y, size, color) =>
  `<span class="dot" style="left:${x}px;top:${y}px;width:${size}px;height:${size}px;background:${color}"></span>`;

// Dot positions live in the corners and the strip just above the card — never
// inside the centered caption block, where they collide with long sub lines.
const dotsFor = (o) =>
  o === PORTRAIT
    ? [
        dot(64, 84, 34, C.purple),
        dot(982, 66, 26, C.green),
        dot(240, 340, 18, C.yellow),
        dot(844, 336, 22, C.red),
        dot(46, 344, 28, C.blue),
        dot(1002, 350, 24, C.orange),
      ].join('')
    : [
        dot(66, 76, 30, C.purple),
        dot(498, 58, 22, C.green),
        dot(88, 952, 26, C.blue),
        dot(476, 924, 18, C.red),
        dot(390, 120, 20, C.yellow),
        dot(578, 92, 24, C.orange),
      ].join('');

function frameCss(assets) {
  return `
    @font-face {
      font-family: 'Quicksand';
      src: url(data:font/woff2;base64,${assets.fontB64}) format('woff2-variations');
      font-weight: 300 700;
    }
    * { margin: 0; box-sizing: border-box; }
    body {
      font-family: 'Quicksand', sans-serif;
      position: relative;
      overflow: hidden;
    }
    .dot { position: absolute; border-radius: 50%; opacity: .85; z-index: 0; }
    .card {
      position: absolute; z-index: 2;
      border-radius: ${CARD_RADIUS_PX}px;
      box-shadow: ${CARD_SHADOW};
    }
    body.dark .card { box-shadow: ${CARD_SHADOW_DARK}; }
    .caption { position: absolute; z-index: 1; display: flex; flex-direction: column; }
    .wordmark { display: flex; align-items: center; gap: 18px; }
    .wordmark img { width: 60px; height: 60px; }
    .wordmark span { font-size: 46px; font-weight: 700; color: ${INK}; letter-spacing: -.5px; }
    body.dark .wordmark span { color: ${INK_ON_DARK}; }
    h1 { font-size: 72px; font-weight: 700; color: ${INK}; line-height: 1.12; letter-spacing: -1px; }
    body.dark h1 { color: ${INK_ON_DARK}; }
    .sub { font-size: 40px; font-weight: 600; color: ${INK_MUTED}; line-height: 1.3; }
    body.dark .sub { color: ${INK_MUTED_ON_DARK}; }
    .chips { display: flex; flex-wrap: wrap; gap: 14px; }
    .chip {
      display: inline-flex; align-items: center; gap: 12px;
      background: rgba(255,255,255,.85); border-radius: 999px;
      padding: 12px 24px; font-size: 28px; font-weight: 600; color: ${INK};
      box-shadow: 0 6px 18px rgba(120,80,180,.14);
    }
    .chip i { width: 14px; height: 14px; border-radius: 50%; }
  `;
}

function captionHtml(slide, o, assets) {
  const wordmark = slide.wordmark
    ? `<div class="wordmark"><img src="data:image/png;base64,${assets.iconB64}"><span>Splotch</span></div>`
    : '';
  const chips =
    o === LANDSCAPE && slide.chips
      ? `<div class="chips">${slide.chips
          .map(
            (c, i) => `<span class="chip"><i style="background:${c.color}"></i>${c.label}</span>`
          )
          .join('')}</div>`
      : '';
  return `${wordmark}<h1>${slide.title}</h1><p class="sub">${slide.sub}</p>${chips}`;
}

function frameHtml(slide, o, assets, cardInnerHtml) {
  const card = cardSize(o);
  const layout =
    o === PORTRAIT
      ? `
    .caption {
      left: ${FRAME_MARGIN_PX}px; top: ${FRAME_MARGIN_PX}px;
      width: ${o.width - 2 * FRAME_MARGIN_PX}px;
      height: ${o.height - 2 * FRAME_MARGIN_PX - card.height - FRAME_MARGIN_PX / 2}px;
      align-items: center; justify-content: center; text-align: center; gap: 18px;
    }
    .card, .stage {
      left: ${(o.width - card.width) / 2}px; top: ${o.height - FRAME_MARGIN_PX - card.height}px;
      width: ${card.width}px; height: ${card.height}px;
    }`
      : `
    .caption {
      left: ${FRAME_MARGIN_PX}px; top: ${FRAME_MARGIN_PX}px;
      width: ${o.captionColumnWidthPx}px; height: ${o.height - 2 * FRAME_MARGIN_PX}px;
      align-items: flex-start; justify-content: center; gap: 22px;
    }
    h1 { font-size: 64px; }
    .sub { font-size: 36px; }
    .card, .stage {
      left: ${o.width - FRAME_MARGIN_PX - card.width}px; top: ${FRAME_MARGIN_PX}px;
      width: ${card.width}px; height: ${card.height}px;
    }`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${frameCss(assets)}
    html, body { width: ${o.width}px; height: ${o.height}px; }
    body { background: ${slide.dark ? DARK_FRAME_BG : LIGHT_FRAME_BG}; }
    ${layout}
  </style></head>
  <body class="${slide.dark ? 'dark' : ''}">
    ${dotsFor(o)}
    <div class="caption">${captionHtml(slide, o, assets)}</div>
    ${cardInnerHtml}
  </body></html>`;
}

const screenshotCard = (shotBuffer) =>
  `<img class="card" src="data:image/png;base64,${shotBuffer.toString('base64')}">`;

// Landscape AI slot: a doodle -> masterpiece before/after built from a real
// generation pair, in place of a single app capture.
function beforeAfterStage(assets) {
  return `
  <div class="stage" style="position:absolute; z-index:2; display:flex; align-items:center; justify-content:center; gap:44px;">
    <img style="width:540px; border-radius:24px; transform:rotate(-2deg); box-shadow:${CARD_SHADOW}"
      src="data:image/jpeg;base64,${assets.aiBeforeB64}">
    <svg width="96" height="72" viewBox="0 0 96 72" fill="none">
      <path d="M6 46 C 30 20, 62 20, 84 38" stroke="${C.pink}" stroke-width="9" stroke-linecap="round"/>
      <path d="M84 38 L 66 32 M84 38 L 74 54" stroke="${C.pink}" stroke-width="9" stroke-linecap="round"/>
    </svg>
    <div style="background:#fff; padding:16px 16px 0; border-radius:10px; transform:rotate(2deg); box-shadow:${CARD_SHADOW}">
      <img style="width:540px; display:block; border-radius:4px" src="data:image/jpeg;base64,${assets.aiAfterB64}">
      <div style="font-size:26px; font-weight:600; color:${INK_MUTED}; text-align:center; padding:14px 0 16px">AI-generated picture</div>
    </div>
  </div>`;
}

// ── Slides ──────────────────────────────────────────────────────────────────

const SLIDES = [
  {
    id: '01-draw',
    title: 'Just open and draw',
    sub: 'Big, chunky strokes made for little hands',
    wordmark: true,
    chips: [
      { label: '8 coloring books', color: C.green },
      { label: 'Magic brush', color: C.purple },
      { label: 'No ads', color: C.red },
    ],
    capture: (browser, base, o) => capHero(browser, base, o.capture, o === PORTRAIT),
  },
  {
    id: '02-books',
    title: '48 pages to color, in 8 little books',
    sub: 'Farm, dinosaurs, space, trucks, and more',
    capture: (browser, base, o) => capBooksGrid(browser, base, o.capture),
  },
  {
    id: '03-magic',
    title: 'The magic brush fills in the colors',
    sub: 'Stay inside the lines with one happy swipe',
    capture: (browser, base, o) => capMagicReveal(browser, base, o.capture),
  },
  {
    id: '04-ai',
    title: 'Turn a doodle into a masterpiece',
    sub: '10 free magic pictures — a grown-up holds the key',
    capture: (browser, base, o, assets) =>
      o === PORTRAIT ? capAiResult(browser, base, o.capture, assets.aiResultTall) : null,
    stage: (o, assets) => (o === LANDSCAPE ? beforeAfterStage(assets) : null),
  },
  {
    id: '05-parents',
    title: 'No ads. No tracking. Nothing to buy.',
    sub: 'Parents pick the tools. Kids just draw.',
    dark: true,
    capture: (browser, base, o) => capDarkSettings(browser, base, o.capture),
  },
];

// ── Main ────────────────────────────────────────────────────────────────────

const MODEL_EVAL_ASSETS = join(ROOT, 'scrapbook', 'model-eval', 'prompt-adherence', 'assets');

function loadStaticAssets() {
  return {
    fontB64: readFileSync(
      join(
        ROOT,
        'node_modules',
        '@fontsource-variable',
        'quicksand',
        'files',
        'quicksand-latin-wght-normal.woff2'
      )
    ).toString('base64'),
    iconB64: readFileSync(join(ROOT, 'store-assets', 'icon-512.png')).toString('base64'),
    aiResultTall: readFileSync(
      join(MODEL_EVAL_ASSETS, 'line__person-flower__tall__overlay-rich__1.jpg')
    ),
    aiBeforeB64: readFileSync(join(MODEL_EVAL_ASSETS, 'in__line__house-sun__wide.jpg')).toString(
      'base64'
    ),
    aiAfterB64: readFileSync(
      join(MODEL_EVAL_ASSETS, 'line__house-sun__wide__overlay-rich__1.jpg')
    ).toString('base64'),
  };
}

async function renderFrame(browser, html, width, height, outFile) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await sleep(250);
  await page.screenshot({ path: outFile });
  await ctx.close();
}

export async function generateStoreMockups({ out = OUT_DEFAULT, only = '' } = {}) {
  const assets = loadStaticAssets();
  const { base, stop } = await ensureDevServer(PORT);
  try {
    const browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });
    for (const o of [PORTRAIT, LANDSCAPE]) {
      mkdirSync(join(out, o.name), { recursive: true });
      for (const slide of SLIDES) {
        if (only && !slide.id.includes(only)) continue;
        const shot = await slide.capture(browser, base, o, assets);
        const cardHtml = shot ? screenshotCard(shot) : slide.stage(o, assets);
        const outFile = join(out, o.name, `${slide.id}.png`);
        await renderFrame(
          browser,
          frameHtml(slide, o, assets, cardHtml),
          o.width,
          o.height,
          outFile
        );
        console.log(`${o.name} ${slide.id} done`);
      }
    }
    await browser.close();
  } finally {
    stop();
  }
  console.log('ALL DONE');
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: { out: { type: 'string' }, only: { type: 'string' } },
  });
  await generateStoreMockups({ out: values.out ?? OUT_DEFAULT, only: values.only ?? '' });
}
