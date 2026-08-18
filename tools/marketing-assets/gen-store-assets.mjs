// Generates the store assets for BOTH stores (Google Play + Apple App Store):
// the five captioned marketing screenshots per device slot and the Play
// feature graphic. Two stages:
//
//   1. CAPTURE — drive the real Splotch app in a headless browser through the
//      scenes below and write each app screenshot to store-assets/captures/
//      (committed, so frame-only iteration and the /dev/store-frames harness
//      work without re-driving the app).
//   2. RENDER — screenshot the live /dev/store-frames/render route (the frame
//      design system lives in web/src/routes/dev/store-frames/lib/) at each
//      store slot's exact pixel size into store-assets/.
//
//   npm run gen:store-assets            # both stages
//   npm run gen:store-assets:frames     # stage 2 only, from committed captures
//
// Runs against a PRODUCTION build served by `vite preview` on --port (default
// 4173) — the coloring-pack manifest (the 8-book grid) only exists in a build,
// and the build must retain the dev-harness seam pickBrush waits on, so the
// script builds with PUBLIC_ENABLE_DEV_HARNESS=true when the port is free. A
// server already on the port is reused only after its identity route proves it
// serves this checkout; any other responder fails the run. The preview server
// itself also gets PUBLIC_ENABLE_DEV_HARNESS=true so the server-side gate
// opens the /dev/store-frames route.
//
// Output lands in store-assets/ at the exact pixel sizes each store wants:
//   Google Play  phone 1080x1920 (9:16)   tablet 1920x1080 (16:9)
//   App Store    iPhone 6.9" 1290x2796    iPad 13" 2732x2048

import { chromium } from '@playwright/test';
import { copyFileSync, existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { PALETTE_COLORS } from '../../web/src/lib/palette.ts';
import { STORAGE_KEYS } from '../../web/src/lib/storageKeys.ts';
import {
  STORE_TARGETS,
  FEATURE_GRAPHIC,
} from '../../web/src/routes/dev/store-frames/lib/targets.ts';
import { frameGeometry } from '../../web/src/routes/dev/store-frames/lib/geometry.ts';
import { STORE_PAGES, pageHasCapture } from '../../web/src/routes/dev/store-frames/lib/pages.ts';
import {
  FEATURE_GRAPHIC_PAGE_PARAM,
  renderPath,
  STORE_FRAME_IDENTITY_PATH,
} from '../../web/src/routes/dev/store-frames/lib/paths.ts';
import { ROOT, isMain, sh, sleep } from '../lib/proc.mjs';
import { waitForUrl } from '../lib/net.mjs';
import { spawnViteServer } from '../lib/vite-server.mjs';
import { chromiumExecutablePath } from '../lib/playwright.mjs';
import { drawDinosaurWide, drawIslandTall } from '../store-drawings/generated/store-drawings.mjs';
import { magicScribbleScene } from '../store-drawings/lib/magic-scribbles.mjs';
import {
  canvasBox,
  coloringOverlayArtRect,
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
import { BOOKS_TWO_COL_CSS, BOOKS_TWO_COL_MIN_ASPECT } from './lib/books-grid-override.mjs';

const OUT = join(ROOT, 'store-assets');
const CAPTURES = join(OUT, 'captures');
const DEFAULT_PORT = 4173;

const C = Object.fromEntries(PALETTE_COLORS.map(({ hex, label }) => [label.toLowerCase(), hex]));

// Play allows the 7" tablet slot to reuse the 10" images (same 1920x1080 spec).
const TABLET7_DIR = 'screenshots/tablet7';

// No DOM signal is surfaced for these dialog animations, so they stay timed.
const MENU_TRANSITION_MS = 450;
const PAGE_GRID_SETTLE_MS = 500;
const SCREENSHOT_SETTLE_MS = 500;
const BOOK_GRID_RETRY_LIMIT = 5;
const PAGE_PICK_RETRY_LIMIT = 4;
const PAGE_PICK_CONFIRM_TIMEOUT_MS = 4000;
// The render route reports data-render-state once fonts are loaded and every
// image (served from disk by the harness's asset endpoint) has decoded.
const RENDER_STATE_TIMEOUT_MS = 30_000;

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

// Capture mode (web/src/lib/storeCapture.ts) drops the free-generation count
// off the wand button: a per-install number that reads as noise in a marketing
// shot. Set before navigation so it is true by the app's first paint.
const enableCaptureMode = (page) =>
  page.addInitScript(() => {
    window.__storeCapture = true;
  });

// Every scene wants both: the app as a configured install shows it, without
// the install-specific badge.
const prepareCapture = async (page) => {
  await mockFreeGrant(page);
  await enableCaptureMode(page);
};

// The portrait v2 handoff enlarges the on-screen action buttons for store
// legibility. This is the app's own Button Size setting (an integer percent of
// the size-class step, 100 = default), seeded before the capture instead of
// raster-scaling buttons afterward.
const HERO_BUTTON_SCALE_PERCENT = 122;
const seedButtonScale = (page) =>
  page.addInitScript(({ key, value }) => localStorage.setItem(key, String(value)), {
    key: STORAGE_KEYS.actionButtonScale,
    value: HERO_BUTTON_SCALE_PERCENT,
  });

// Page 05 shows the Tool Drawer section in dark mode: Advanced Controls on
// (so the per-tool toggles and the Button Size slider render) with the Stroke
// width tool turned off — a parent mid-curation, "parents set the guardrails"
// readable at a glance. The button scale matches the hero capture so the
// slider shows the same value page 01's buttons render at.
const seedToolDrawerSettings = (page) =>
  page.addInitScript(
    ({ keys, buttonScale }) => {
      localStorage.setItem(keys.advancedControls, 'true');
      localStorage.setItem(keys.strokeWidthControl, 'false');
      localStorage.setItem(keys.actionButtonScale, String(buttonScale));
    },
    { keys: STORAGE_KEYS, buttonScale: HERO_BUTTON_SCALE_PERCENT }
  );

// ── Scenes ──────────────────────────────────────────────────────────────────

// The portrait hero pinches the island drawing in toward the bottom-right
// (the handoff's capture rework): scaled to 0.92 with the left and top edges
// inset so the art clears the enlarged action-button column while keeping its
// right margin.
const HERO_TALL_DRAW_INSET = { left: 0.08, top: 0.04, scale: 0.92 };
const insetHeroBox = (box) => ({
  x: box.x + box.width * HERO_TALL_DRAW_INSET.left,
  y: box.y + box.height * HERO_TALL_DRAW_INSET.top,
  width: box.width * HERO_TALL_DRAW_INSET.scale,
  height: box.height * HERO_TALL_DRAW_INSET.scale,
});

async function sceneHero(browser, base, capture, orientation) {
  const { ctx, page } = await openAppPage(browser, base, capture, {
    prepare: async (page) => {
      await prepareCapture(page);
      await seedButtonScale(page);
    },
  });
  await expandDrawer(page);
  const box = await canvasBox(page);
  await (orientation === 'portrait'
    ? drawIslandTall(page, insetHeroBox(box))
    : drawDinosaurWide(page, box));
  await pickColor(page, C.green); // the spec's resting selection: green ring, pen brush
  await sleep(SCREENSHOT_SETTLE_MS);
  const shot = await page.screenshot();
  await ctx.close();
  return shot;
}

// The picker opens on the 8-book cover grid unless the installed set resolved
// late and it landed on a single book (issue #936) — reopen until the grid.
async function sceneBooks(browser, base, capture) {
  const { ctx, page } = await openAppPage(browser, base, capture, { prepare: prepareCapture });
  if (capture.height / capture.width >= BOOKS_TWO_COL_MIN_ASPECT) {
    await page.addStyleTag({ content: BOOKS_TWO_COL_CSS });
  }
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
// overwrite the 02-books capture with a half-loaded grid.
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
  const { ctx, page } = await openAppPage(browser, base, capture, { prepare: prepareCapture });
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
  await magicScribbles(page, box, orientation);
  // No dismissMenu here: the brush and size menus close themselves on pick,
  // and a canvas click with magic armed would reveal a dot in the paper corner.
  await sleep(SCREENSHOT_SETTLE_MS);
  const shot = await page.screenshot();
  await ctx.close();
  return shot;
}

// ~85% reveal as natural child scribbles (magic-scribbles.mjs): row fills and
// spirals aimed at the cat page's features, leaving margins and a few outline
// patches white so the mid-reveal story stays visible. The seeded design-space
// paths scale into the live art rect, so they land on the same features at
// every capture size.
async function magicScribbles(page, box, orientation) {
  const artRect = await coloringOverlayArtRect(page);
  const { designWidth, designHeight, strokes } = magicScribbleScene(orientation);
  const scaleX = artRect.width / designWidth;
  const scaleY = artRect.height / designHeight;
  for (const stroke of strokes) {
    await drawStroke(
      page,
      box,
      stroke.map((p) => ({
        x: artRect.x - box.x + p.x * scaleX,
        y: artRect.y - box.y + p.y * scaleY,
      }))
    );
  }
}

async function sceneParents(browser, base, capture) {
  const { ctx, page } = await openAppPage(browser, base, capture, {
    colorScheme: 'dark',
    prepare: async (page) => {
      await prepareCapture(page);
      await seedToolDrawerSettings(page);
    },
  });
  await openSettingsSection(page, 'Tool Drawer');
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

// Which checkout an already-running server is serving, via the harness's
// identity route — null when the responder doesn't answer it (a stale build,
// or not Splotch at all).
async function servedRepoRoot(base) {
  try {
    const response = await fetch(new URL(STORE_FRAME_IDENTITY_PATH, base));
    if (!response.ok) return null;
    return (await response.json()).repoRoot ?? null;
  } catch {
    return null;
  }
}

// Reuse a server already on the port only if its identity route proves it
// serves THIS checkout — the frames now render from the server's components,
// so an arbitrary root-200 responder (a stale server, a concurrent worktree's)
// would silently write another branch's frame design into this checkout's
// committed finals. Otherwise build the instrumented production bundle and
// serve it.
async function ensurePreviewServer(port) {
  const base = `http://localhost:${port}/`;
  if (await isUp(base)) {
    const thisRoot = realpathSync(ROOT);
    const served = await servedRepoRoot(base);
    if (served !== thisRoot) {
      throw new Error(
        `Port ${port} is already serving ${served ?? 'something that is not this checkout (no store-frames identity route)'}, ` +
          `not ${thisRoot}. Stop that server, or rerun with --port <unused port>.`
      );
    }
    console.log(`Reusing this checkout's server at ${base}`);
    return { base, stop: () => {} };
  }
  console.log('Building production bundle (PUBLIC_ENABLE_DEV_HARNESS=true)…');
  await sh('PUBLIC_ENABLE_DEV_HARNESS=true npm run build');
  console.log('Starting preview server…');
  const { stop } = spawnViteServer(port, {
    command: 'preview',
    // The client seam is baked in at build time; the server-side route gate
    // (requireDevHarness) reads the env at request time, so the preview
    // process needs it too or /dev/store-frames 404s.
    env: { PUBLIC_ENABLE_DEV_HARNESS: 'true' },
  });
  try {
    await waitForUrl(base, 60_000);
  } catch (err) {
    stop();
    throw err;
  }
  return { base, stop };
}

const captureFile = (target, page) => join(CAPTURES, target.name, `${page.id}.png`);

// Screenshots the /dev/store-frames render surface at an exact pixel size,
// waiting on its explicit ready/error signal rather than network idle.
async function renderRoutePage(browser, base, path, width, height, outFile) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(new URL(path, base).href);
  const surface = page.locator('[data-render-state="ready"], [data-render-state="error"]');
  await surface.waitFor({ timeout: RENDER_STATE_TIMEOUT_MS });
  if ((await surface.getAttribute('data-render-state')) === 'error') {
    const message = (await page.locator('.error').textContent())?.trim();
    await ctx.close();
    throw new Error(`Render route reported an error for ${path}: ${message}`);
  }
  await page.screenshot({ path: outFile });
  await ctx.close();
}

// ── Main ────────────────────────────────────────────────────────────────────

// `only` filters narrow a run for iteration: target/page substrings, e.g.
// { target: 'tablet10', page: '03' }. A filtered run skips the tablet7 copy
// and the feature graphic unless every target ran. `framesOnly` skips the
// app-driving capture stage and renders from the committed captures.
export async function generateStoreAssets({
  target: onlyTarget = '',
  page: onlyPage = '',
  framesOnly = false,
  port = DEFAULT_PORT,
} = {}) {
  const targets = STORE_TARGETS.filter((t) => !onlyTarget || t.name.includes(onlyTarget));
  const pages = STORE_PAGES.filter((p) => !onlyPage || p.id.includes(onlyPage));
  if (targets.length === 0 || pages.length === 0) {
    throw new Error(`No targets or pages match --target=${onlyTarget} --page=${onlyPage}`);
  }
  const fullRun = targets.length === STORE_TARGETS.length && pages.length === STORE_PAGES.length;

  if (framesOnly) {
    const missing = targets
      .flatMap((t) => pages.filter(pageHasCapture).map((p) => captureFile(t, p)))
      .filter((file) => !existsSync(file));
    if (missing.length > 0) {
      throw new Error(
        `--frames-only needs committed captures; missing:\n  ${missing.join('\n  ')}\nRun npm run gen:store-assets first.`
      );
    }
  }

  const { base, stop } = await ensurePreviewServer(port);
  try {
    const browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });

    for (const target of targets) {
      const geo = frameGeometry(target);
      mkdirSync(join(OUT, target.dir), { recursive: true });
      mkdirSync(join(CAPTURES, target.name), { recursive: true });
      for (const page of pages) {
        const scene = SCENES[page.id];
        if (scene && !framesOnly) {
          const shot = await scene(browser, base, geo.capture, target.orientation);
          writeFileSync(captureFile(target, page), shot);
        }
        await renderRoutePage(
          browser,
          base,
          renderPath(page.id, target.name),
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

      await renderRoutePage(
        browser,
        base,
        renderPath(FEATURE_GRAPHIC_PAGE_PARAM),
        FEATURE_GRAPHIC.width,
        FEATURE_GRAPHIC.height,
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
    options: {
      target: { type: 'string' },
      page: { type: 'string' },
      'frames-only': { type: 'boolean' },
      port: { type: 'string' },
    },
  });
  await generateStoreAssets({
    target: values.target ?? '',
    page: values.page ?? '',
    framesOnly: values['frames-only'] ?? false,
    port: values.port ? Number(values.port) : DEFAULT_PORT,
  });
}
