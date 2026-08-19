// Playwright helpers for scripts that drive the live Splotch app in a browser
// (gen-store-assets.mjs, gen-promotional-image.mjs): dev-server lifecycle, page setup,
// and the UI gestures (pick a color, set stroke size, draw) the app needs.

import { sleep } from '../../lib/proc.mjs';
import { waitForUrl } from '../../lib/net.mjs';
import { spawnViteServer } from '../../lib/vite-server.mjs';

const DRAWING_CANVAS_SELECTOR = '#drawingCanvas';
const DRAWER_TOGGLE_SELECTOR = '.drawer-toggle';
const COLORING_BOOK_BUTTON_SELECTOR = '#coloringBookButton';
const COLOR_SWATCH_SELECTOR = (color) => `.color-swatch[data-color="${color}"]`;
const STROKE_WIDTH_BUTTON_SELECTOR = '#strokeWidthButton';
const STROKE_SIZE_BUTTON_SELECTOR = (size) => `button[aria-label="Size ${size}"]`;
const COLORING_BOOK_SELECTOR = (name) => `button[aria-label="${name} coloring book"]`;
const COLORING_BOOK_HEADING_SELECTOR = '#coloring-book-dialog h2';
const COLORING_PAGE_SELECTOR = (name) => `button[aria-label="${name} coloring page"]`;
const COLORING_OVERLAY_READY_SELECTOR = '#coloringOverlay.overlay-ready';
const SETTINGS_BUTTON_SELECTOR = '#settingsButton';
const COLOR_PICKER_SELECTOR = '#color-picker';
const BRUSH_BUTTON_SELECTOR = '#brushButton';
const BRUSH_OPTION_SELECTORS = {
  pen: '#penBrushButton',
  crayon: '#crayonBrushButton',
  magic: '#magicBrushButton',
};

const APP_STARTUP_SETTLE_DELAY_MS = 400;
const SETTINGS_SHELL_SETTLE_MS = 500; // modal fly-in before the nav is tappable
const SETTINGS_SECTION_SETTLE_MS = 900; // phone drill-in / wide pane scroll
const DRAWER_TRANSITION_DELAY_MS = 350;
const POST_COLOR_CHANGE_DELAY_MS = 220;
const STROKE_MENU_TRANSITION_DELAY_MS = 150;
const STROKE_COMPLETION_DELAY_MS = 40;
const MENU_DISMISSAL_DELAY_MS = 200;
const BRUSH_MENU_TRANSITION_DELAY_MS = 150;
const BRUSH_COMMIT_TIMEOUT_MS = 10_000;
export const DRAW_STROKE_STEPS = 6;

const isUp = async (url) => {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
};

// Reuse a dev server already listening on the port, or start one (killed via
// the returned stop(), and on process exit as a backstop).
export async function ensureDevServer(port, timeout = 90_000) {
  const base = `http://localhost:${port}/`;
  if (await isUp(base)) {
    console.log(`Reusing dev server at ${base}`);
    return { base, stop: () => {} };
  }

  console.log('Starting dev server…');
  const { stop } = spawnViteServer(port);

  try {
    await waitForUrl(base, timeout);
  } catch (err) {
    stop();
    throw err;
  }
  console.log('Server ready.');
  return { base, stop };
}

// Open the app in a fresh browser context sized to `device`; resolves once the
// drawing canvas is ready. `colorScheme` drives the app's follow-system theme
// (dark-mode scenes); `prepare(page)` runs before navigation so route mocks
// catch boot-time requests.
export async function openAppPage(browser, base, device, { colorScheme = 'light', prepare } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.deviceScaleFactor,
    hasTouch: true,
    isMobile: false,
    colorScheme,
  });
  const page = await ctx.newPage();
  await prepare?.(page);
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector(DRAWING_CANVAS_SELECTOR);
  await sleep(APP_STARTUP_SETTLE_DELAY_MS);
  return { ctx, page };
}

export const canvasBox = (page) => page.locator(DRAWING_CANVAS_SELECTOR).boundingBox();

// The action drawer (brush menu / coloring book / camera / undo) starts collapsed.
// Its buttons stay in the DOM always (ADR-0040) — open/closed is CSS-only, so
// probe visibility (a closed drawer hides them) rather than presence.
export async function expandDrawer(page) {
  const toggle = page.locator(DRAWER_TOGGLE_SELECTOR);
  if ((await toggle.count()) && !(await page.locator(COLORING_BOOK_BUTTON_SELECTOR).isVisible())) {
    await toggle.click();
    await sleep(DRAWER_TRANSITION_DELAY_MS);
  }
}

// Pick a palette swatch by hex, then respect the 100ms post-color-change guard
// the drawing engine enforces before it starts a new stroke. Returns false if
// the swatch isn't shown at this viewport width.
export async function pickColor(page, hex) {
  const swatch = page.locator(COLOR_SWATCH_SELECTOR(hex));
  if ((await swatch.count()) && (await swatch.first().isVisible())) {
    await swatch.first().click({ force: true });
    await sleep(POST_COLOR_CHANGE_DELAY_MS);
    return true;
  }
  return false;
}

async function waitForDialogAnimation(page, selector) {
  const dialog = page.locator(selector);
  await dialog.waitFor({ state: 'visible' });
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {})))
  );
}

export async function pickDrawingColor(page, color) {
  if (color.kind === 'palette') {
    const swatch = page.locator(`.color-swatch[aria-label="${color.label}"]:visible`).first();
    if (!(await swatch.count())) throw new Error(`Palette color ${color.label} is not visible`);
    await swatch.click({ force: true });
    await sleep(POST_COLOR_CHANGE_DELAY_MS);
    return;
  }
  if (color.kind === 'picker') {
    await page.locator(COLOR_SWATCH_SELECTOR('custom')).click();
    await waitForDialogAnimation(page, COLOR_PICKER_SELECTOR);
    const hexagon = page
      .locator(`${COLOR_PICKER_SELECTOR} .hexagon[data-color="${color.hex}"]:visible`)
      .first();
    if (!(await hexagon.count())) throw new Error(`Picker color ${color.hex} is not visible`);
    await hexagon.click();
    await page.locator(COLOR_PICKER_SELECTOR).waitFor({ state: 'hidden' });
    await sleep(POST_COLOR_CHANGE_DELAY_MS);
    return;
  }
  throw new Error(`Unknown drawing color kind ${color.kind}`);
}

export async function pickBrush(page, brush) {
  const optionSelector = BRUSH_OPTION_SELECTORS[brush];
  if (!optionSelector) throw new Error(`Unknown drawing brush ${brush}`);
  await page.locator(BRUSH_BUTTON_SELECTOR).click();
  await sleep(BRUSH_MENU_TRANSITION_DELAY_MS);
  const option = page.locator(optionSelector);
  await option.click();
  await page.waitForFunction((expected) => window.__committedBrushMode?.() === expected, brush, {
    timeout: BRUSH_COMMIT_TIMEOUT_MS,
  });
}

export async function setStrokeSize(page, size) {
  const btn = page.locator(STROKE_WIDTH_BUTTON_SELECTOR);
  if (!(await btn.count())) return;
  await btn.click();
  await sleep(STROKE_MENU_TRANSITION_DELAY_MS);
  await page.locator(STROKE_SIZE_BUTTON_SELECTOR(size)).click();
  await sleep(STROKE_MENU_TRANSITION_DELAY_MS);
}

// Draw one freehand stroke through a list of {x,y} canvas-relative points.
export async function drawStroke(page, box, pts, { finishEndpoint = false } = {}) {
  if (pts.length === 0) return;
  const abs = pts.map((p) => ({ x: box.x + p.x, y: box.y + p.y }));
  await page.mouse.move(abs[0].x, abs[0].y);
  await page.mouse.down();
  for (let i = 1; i < abs.length; i++) {
    await page.mouse.move(abs[i].x, abs[i].y, { steps: DRAW_STROKE_STEPS });
  }
  // The engine's live curve ends at the midpoint before the last raw sample.
  // Holding that endpoint for one more sample lets authored pointer paths reach it.
  if (finishEndpoint) await page.mouse.move(abs.at(-1).x, abs.at(-1).y);
  await page.mouse.up();
  await sleep(STROKE_COMPLETION_DELAY_MS);
}

export async function tiledRendererIsActive(page) {
  return page.locator(DRAWING_CANVAS_SELECTOR).evaluate((canvas) => {
    const bounds = canvas.getBoundingClientRect();
    return canvas.width < bounds.width && canvas.height < bounds.height;
  });
}

export async function hasInk(page) {
  return page.evaluate(() => {
    const tiles = document.querySelectorAll('canvas[data-live-tile]:not([hidden])');
    if (tiles.length === 0) return false;
    for (const canvas of tiles) {
      const context = canvas.getContext('2d');
      if (!context) continue;
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let index = 3; index < data.length; index += 4) {
        if (data[index] > 0) return true;
      }
    }
    return false;
  });
}

// Click an empty canvas corner to close any open menu before a screenshot.
export async function dismissMenu(page) {
  await page.locator(DRAWING_CANVAS_SELECTOR).click({ position: { x: 5, y: 5 } });
  await sleep(MENU_DISMISSAL_DELAY_MS);
}

export async function openColoringBook(page) {
  await page.locator(COLORING_BOOK_BUTTON_SELECTOR).click();
}

export async function pickBook(page, name) {
  const book = page.locator(COLORING_BOOK_SELECTOR(name));
  await page.locator(COLORING_BOOK_HEADING_SELECTOR).waitFor();
  if (await book.isVisible()) {
    await book.click();
    return;
  }

  const activeBookName = (await page.locator(COLORING_BOOK_HEADING_SELECTOR).textContent())?.trim();
  if (activeBookName !== name) throw new Error(`Coloring book ${name} is not available`);
}

export async function pickPage(page, pageName) {
  await page.locator(COLORING_PAGE_SELECTOR(pageName)).click();
}

// The overlay <img> only gets .overlay-ready once the page art has decoded, so
// it's the signal that a picked coloring page is actually painted.
export async function waitForColoringOverlay(page, { timeout } = {}) {
  await page.waitForSelector(COLORING_OVERLAY_READY_SELECTOR, { timeout });
}

// Where the coloring page art actually renders, in page coordinates: the
// overlay <img> fills the paper and contain-fits its art, so the art rect must
// be recovered from the element box and the image's natural size. Pointer
// paths aimed at page features scale into this rect.
export async function coloringOverlayArtRect(page) {
  return page.locator(COLORING_OVERLAY_READY_SELECTOR).evaluate((img) => {
    const box = img.getBoundingClientRect();
    const scale = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
    const width = img.naturalWidth * scale;
    const height = img.naturalHeight * scale;
    return {
      x: box.x + (box.width - width) / 2,
      y: box.y + (box.height - height) / 2,
      width,
      height,
    };
  });
}

async function openSettingsModal(page) {
  await page.locator(SETTINGS_BUTTON_SELECTOR).click();
}

// Navigate Settings to a section by its nav label. Works in both shells: the
// phone hub drills into the section, the wide sidebar scrolls its pane there.
// getByRole matches the accessible name by substring, so hub rows that append
// a status line still match their label.
export async function openSettingsSection(page, label) {
  await openSettingsModal(page);
  await sleep(SETTINGS_SHELL_SETTLE_MS);
  await page.getByRole('button', { name: label }).first().click();
  await sleep(SETTINGS_SECTION_SETTLE_MS);
}
