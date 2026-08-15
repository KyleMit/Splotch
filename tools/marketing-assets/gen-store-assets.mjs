// Generates the store assets for BOTH stores (Google Play + Apple App Store):
// the five captioned marketing screenshots per device slot and the Play
// feature graphic, by driving the real Splotch app in a headless browser and
// composing each capture into its frame (lib/store-frames.mjs).
//
//   npm run gen:store-assets
//
// Captures run against a PRODUCTION build served by `vite preview` on 4173 —
// the coloring-pack manifest (the 8-book grid) only exists in a build, and the
// build must retain the dev-harness seam pickBrush waits on, so the script
// builds with PUBLIC_ENABLE_DEV_HARNESS=true unless port 4173 already serves.
//
// Output lands in store-assets/ at the exact pixel sizes each store wants:
//   Google Play  phone 1080x1920 (9:16)   tablet 1920x1080 (16:9)
//   App Store    iPhone 6.9" 1290x2796    iPad 13" 2732x2048

import { chromium } from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { PALETTE_COLORS } from '../../web/src/lib/palette.ts';
import { STORAGE_KEYS } from '../../web/src/lib/storageKeys.ts';
import { ROOT, isMain, sh, sleep } from '../lib/proc.mjs';
import { waitForUrl } from '../lib/net.mjs';
import { spawnViteServer } from '../lib/vite-server.mjs';
import { chromiumExecutablePath } from '../lib/playwright.mjs';
import { drawDinosaurWide, drawIslandTall } from '../store-drawings/generated/store-drawings.mjs';
import {
  canvasBox,
  dismissMenu,
  drawStroke,
  expandDrawer,
  openAppPage,
  openColoringBook,
  openSettingsSection,
  pickBook,
  pickBrush,
  pickColor,
  pickPage,
  setStrokeSize,
  waitForColoringOverlay,
} from '../app-driver/lib/app-driver.mjs';
import { STORE_PAGES, frameGeometry, loadFrameAssets, storePageHtml } from './lib/store-frames.mjs';

const OUT = join(ROOT, 'store-assets');
const PORT = 4173;

const C = Object.fromEntries(PALETTE_COLORS.map(({ hex, label }) => [label.toLowerCase(), hex]));

const TARGETS = [
  { name: 'phone', dir: 'screenshots/phone', width: 1080, height: 1920, orientation: 'portrait' },
  {
    name: 'tablet10',
    dir: 'screenshots/tablet10',
    width: 1920,
    height: 1080,
    orientation: 'landscape',
  },
  {
    name: 'iphone69',
    dir: 'screenshots/iphone69',
    width: 1290,
    height: 2796,
    orientation: 'portrait',
  },
  {
    name: 'ipad13',
    dir: 'screenshots/ipad13',
    width: 2732,
    height: 2048,
    orientation: 'landscape',
  },
];

// Play allows the 7" tablet slot to reuse the 10" images (same 1920x1080 spec).
const TABLET7_DIR = 'screenshots/tablet7';

// No DOM signal is surfaced for these dialog animations, so they stay timed.
const MENU_TRANSITION_MS = 450;
const PAGE_GRID_SETTLE_MS = 500;
const SCREENSHOT_SETTLE_MS = 500;
const BOOK_GRID_RETRY_LIMIT = 5;
const PAGE_PICK_RETRY_LIMIT = 4;
const PAGE_PICK_CONFIRM_TIMEOUT_MS = 4000;

// ── Scene setup mocks ───────────────────────────────────────────────────────

// The preview server's real /api/free-generation-grant has no configuration and
// fails, which hides the AI wand from the drawer — mock a fresh 10-of-10 grant
// so the drawer shows the app as a configured install sees it.
const mockFreeGrant = (page) =>
  page.route('**/api/free-generation-grant', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, limit: 10, remaining: 10, exhausted: false }),
    })
  );

// Page 05 shows the Parent Center policy matrix. Web builds default every
// check to 'never' (gates are a store-build requirement), which would read as
// guardrails-off — seed the four feature policies to the armed states the
// design calls for. parentCenter itself stays unset so opening the section
// never faces the math gate; its row sits at the modal fold.
const seedGuardrailPolicies = (page) =>
  page.addInitScript(
    ({ keys }) => {
      localStorage.setItem(keys.parentalGateAiImageMode, 'always');
      localStorage.setItem(keys.parentalGateImageReportMode, 'always');
      localStorage.setItem(keys.parentalGateExternalLinksMode, 'always');
      localStorage.setItem(keys.parentalGateFeedbackMode, 'session');
    },
    { keys: STORAGE_KEYS }
  );

// ── Scenes ──────────────────────────────────────────────────────────────────

async function sceneHero(browser, base, capture, orientation) {
  const { ctx, page } = await openAppPage(browser, base, capture, { prepare: mockFreeGrant });
  await expandDrawer(page);
  const box = await canvasBox(page);
  await (orientation === 'portrait' ? drawIslandTall(page, box) : drawDinosaurWide(page, box));
  await pickColor(page, C.green); // the spec's resting selection: green ring, pen brush
  await sleep(SCREENSHOT_SETTLE_MS);
  const shot = await page.screenshot();
  await ctx.close();
  return shot;
}

// The picker opens on the 8-book cover grid unless the installed set resolved
// late and it landed on a single book (issue #936) — reopen until the grid.
async function sceneBooks(browser, base, capture) {
  const { ctx, page } = await openAppPage(browser, base, capture, { prepare: mockFreeGrant });
  await expandDrawer(page);
  let onGrid = false;
  for (let attempt = 0; attempt < BOOK_GRID_RETRY_LIMIT; attempt++) {
    await openColoringBook(page);
    await sleep(MENU_TRANSITION_MS);
    const heading = (await page.locator('#coloring-book-dialog h2').textContent())?.trim();
    if (heading === 'Coloring Books') {
      onGrid = true;
      break;
    }
    await page.keyboard.press('Escape');
    await sleep(MENU_TRANSITION_MS);
  }
  if (!onGrid) {
    throw new Error(
      'Coloring Books grid never appeared — is the server a production build with the pack manifest?'
    );
  }
  await waitForDialogImages(page);
  await sleep(PAGE_GRID_SETTLE_MS);
  const shot = await page.screenshot();
  await ctx.close();
  return shot;
}

// Rejects when the cover thumbs never finish decoding (or none render at
// all), failing the scene and the run — a swallowed failure here would
// overwrite 02-books.png with a half-loaded grid.
const DIALOG_IMAGES_TIMEOUT_MS = 10_000;
const waitForDialogImages = (page) =>
  page.waitForFunction(
    () => {
      const covers = [...document.querySelectorAll('#coloring-book-dialog img')];
      return covers.length > 0 && covers.every((img) => img.complete && img.naturalWidth > 0);
    },
    undefined,
    { timeout: DIALOG_IMAGES_TIMEOUT_MS }
  );

async function sceneMagic(browser, base, capture, orientation) {
  const { ctx, page } = await openAppPage(browser, base, capture, { prepare: mockFreeGrant });
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
  await pickColor(page, C.purple); // the spec's ringed swatch while magic is active
  await pickBrush(page, 'magic');
  const box = await canvasBox(page);
  await magicReveal(page, box, orientation);
  await dismissMenu(page);
  await sleep(SCREENSHOT_SETTLE_MS);
  const shot = await page.screenshot();
  await ctx.close();
  return shot;
}

// ~85% reveal: full-width zigzag sweeps down the page, leaving the margins and
// a few outline patches white so the mid-reveal story stays visible. Portrait
// insets the left edge: the tool drawer floats over the canvas's lower left,
// and a sweep that begins on one of its buttons never reaches the paper.
const REVEAL_LEFT_FRACTION = { landscape: 0.07, portrait: 0.18 };
async function magicReveal(page, box, orientation) {
  const W = box.width;
  const H = box.height;
  const x0 = REVEAL_LEFT_FRACTION[orientation];
  const BAND_TOP_FRACTION = 0.12;
  const BAND_STEP_FRACTION = 0.16;
  const BAND_COUNT = 5;
  for (let i = 0; i < BAND_COUNT; i++) {
    const y = H * (BAND_TOP_FRACTION + i * BAND_STEP_FRACTION);
    await drawStroke(page, box, [
      { x: W * x0, y },
      { x: W * 0.93, y: y + H * 0.03 },
      { x: W * (x0 + 0.03), y: y + H * 0.09 },
      { x: W * 0.9, y: y + H * 0.12 },
    ]);
  }
}

async function sceneParents(browser, base, capture) {
  const { ctx, page } = await openAppPage(browser, base, capture, {
    colorScheme: 'dark',
    prepare: async (page) => {
      await mockFreeGrant(page);
      await seedGuardrailPolicies(page);
    },
  });
  await openSettingsSection(page, 'Parent Center');
  await sleep(SCREENSHOT_SETTLE_MS);
  const shot = await page.screenshot();
  await ctx.close();
  return shot;
}

const SCENES = {
  '01-draw': sceneHero,
  '02-books': sceneBooks,
  '03-magic': sceneMagic,
  '05-parents': sceneParents,
};

// ── Server + render plumbing ────────────────────────────────────────────────

const isUp = async (url) => {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
};

// Reuse a server already on the port (the caller is trusted to have built it
// right), or build the instrumented production bundle and serve it.
async function ensurePreviewServer(port) {
  const base = `http://localhost:${port}/`;
  if (await isUp(base)) {
    console.log(`Reusing server at ${base}`);
    return { base, stop: () => {} };
  }
  console.log('Building production bundle (PUBLIC_ENABLE_DEV_HARNESS=true)…');
  await sh('PUBLIC_ENABLE_DEV_HARNESS=true npm run build');
  console.log('Starting preview server…');
  const { stop } = spawnViteServer(port, { command: 'preview' });
  try {
    await waitForUrl(base, 60_000);
  } catch (err) {
    stop();
    throw err;
  }
  return { base, stop };
}

async function renderFrame(browser, html, width, height, outFile) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await sleep(250);
  await page.screenshot({ path: outFile });
  await ctx.close();
}

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

// ── Main ────────────────────────────────────────────────────────────────────

// `only` filters narrow a run for iteration: target/page substrings, e.g.
// { target: 'tablet10', page: '03' }. A filtered run skips the tablet7 copy
// and the feature graphic unless every target ran.
export async function generateStoreAssets({ target: onlyTarget = '', page: onlyPage = '' } = {}) {
  const assets = loadFrameAssets();
  const targets = TARGETS.filter((t) => !onlyTarget || t.name.includes(onlyTarget));
  const pages = STORE_PAGES.filter((p) => !onlyPage || p.id.includes(onlyPage));
  if (targets.length === 0 || pages.length === 0) {
    throw new Error(`No targets or pages match --target=${onlyTarget} --page=${onlyPage}`);
  }
  const fullRun = targets.length === TARGETS.length && pages.length === STORE_PAGES.length;

  const { base, stop } = await ensurePreviewServer(PORT);
  try {
    const browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });

    for (const target of targets) {
      const geo = frameGeometry(target);
      mkdirSync(join(OUT, target.dir), { recursive: true });
      for (const page of pages) {
        const scene = SCENES[page.id];
        const shot = scene ? await scene(browser, base, geo.capture, target.orientation) : null;
        const html = storePageHtml(target, geo, page, assets, shot);
        await renderFrame(
          browser,
          html,
          target.width,
          target.height,
          join(OUT, target.dir, `${page.id}.png`)
        );
        console.log(`${target.name} ${page.id} done`);
      }
    }

    if (fullRun) {
      // Play's 7" tablet slot reuses the 10" images.
      mkdirSync(join(OUT, TABLET7_DIR), { recursive: true });
      for (const page of STORE_PAGES) {
        copyFileSync(
          join(OUT, 'screenshots/tablet10', `${page.id}.png`),
          join(OUT, TABLET7_DIR, `${page.id}.png`)
        );
      }
      console.log('tablet7 copied from tablet10');

      // FEATURE GRAPHIC — 1024x500
      const iconB64 = readFileSync(join(OUT, 'icon-512.png')).toString('base64');
      await renderFrame(
        browser,
        featureGraphicHtml(iconB64),
        1024,
        500,
        join(OUT, 'feature-graphic.png')
      );
      console.log('feature-graphic done');
    }

    await browser.close();
  } finally {
    stop();
  }
  console.log('DONE');
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: { target: { type: 'string' }, page: { type: 'string' } },
  });
  await generateStoreAssets({ target: values.target ?? '', page: values.page ?? '' });
}
