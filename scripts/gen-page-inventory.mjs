import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { ROOT, isMain, runMain } from './lib/proc.mjs';
import { chromiumExecutablePath } from './lib/playwright.mjs';
import { waitForUrl } from './lib/net.mjs';
import {
  PAGE_INVENTORY_VIEWPORTS,
  attachExpectedCapturePaths,
  inventoryCapturePath,
  readDesignCritique,
  renderPageInventoryReport,
} from './lib/page-inventory-report.mjs';
import { spawnViteServer } from './lib/vite-server.mjs';

const PORT_DEFAULT = 4319;
const OUT_DEFAULT = join(ROOT, 'scrapbook/page-inventory');
const SERVER_BOOT_MS = 120_000;
const ACTION_MS = 15_000;
const TAP_GUARD_MS = 750;
const WEBP_QUALITY = 84;

const PHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const TABLET_UA =
  'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const STORAGE = {
  'splotch-ai-access-token': 'daycare-club',
  'splotch-advanced-controls': 'true',
  'splotch-drawer-open': 'false',
  'splotch-lock-rotation': 'false',
  'splotch-theme': 'light',
  'splotch-install-dismissed': 'false',
  'splotch-install-completed': 'false',
  'splotch-parental-gate-ai-image-mode': 'never',
  'splotch-parental-gate-image-report-mode': 'never',
  'splotch-parental-gate-external-links-mode': 'never',
  'splotch-parental-gate-feedback-mode': 'never',
  'splotch-parental-gate-parent-center-mode': 'never',
};

const SERVER_ENV = {
  PUBLIC_ENABLE_DEV_HARNESS: 'true',
  ADMIN_ACCESS_TOKEN: 'page-inventory-admin-secret',
  ALLOWED_TOKENS_LIST: 'daycare-club,page-inventory-harness',
  GEMINI_API_KEY: 'not-a-usable-gemini-key',
  GITHUB_ISSUE_TOKEN: '',
  GITHUB_ISSUE_REPO: 'splotch-page-inventory/nowhere',
};

const ROUTES = {
  '/': ['Drawing canvas', 'The blank drawing surface and its resting canvas chrome.'],
  '/admin': ['Admin · signed out', 'The server-rendered administrator sign-in surface.'],
  '/android-beta': ['Android beta', 'Google Play closed-test sign-up instructions.'],
  '/changelog': ['Changelog', 'The complete release history at its opening position.'],
  '/design': ['Design system', 'The public living styleguide at its opening position.'],
  '/dev': ['Dev harness index', 'The development-only index of interactive harnesses.'],
  '/dev/ai-timer': ['AI timer harness', 'The AI animation harness before a run starts.'],
  '/dev/engine': ['Drawing engine harness', 'The development-only engine control surface.'],
  '/feedback': ['Feedback', 'The standalone bug report and feature idea form.'],
  '/privacy': ['Privacy policy', 'The public privacy policy at its opening position.'],
};

function filesBelow(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

export function discoverPageRoutes() {
  const routesDir = join(ROOT, 'web/src/routes');
  return filesBelow(routesDir)
    .filter((file) => file.endsWith(`${sep}+page.svelte`))
    .map((file) => {
      const dir = relative(routesDir, resolve(file, '..'));
      return dir ? `/${dir.split(sep).join('/')}` : '/';
    })
    .sort((a, b) => a.localeCompare(b));
}

export function discoverSettingsSections() {
  const source = readFileSync(join(ROOT, 'web/src/lib/components/settings/sections.ts'), 'utf8');
  const block = source.match(/export const SECTIONS = \[([\s\S]*?)\] as const/)?.[1];
  if (!block) throw new Error('Could not find the canonical SECTIONS array');
  const sections = [];
  for (const entry of block.matchAll(/\{([^{}]+)\}/g)) {
    const id = entry[1].match(/\bid:\s*'([^']+)'/)?.[1];
    const label = entry[1].match(/\blabel:\s*(['"])(.*?)\1/)?.[2];
    const title = entry[1].match(/\btitle:\s*(['"])(.*?)\1/)?.[2];
    if (id && label) sections.push({ id, label, title });
  }
  if (!sections.length) throw new Error('The canonical SECTIONS array contained no sections');
  return sections;
}

const surface = (group, id, title, description, source, prepare, cleanup) => ({
  group,
  id,
  title,
  description,
  source,
  prepare,
  cleanup,
});

async function navigate(page, route) {
  const response = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: ACTION_MS });
  if (!response?.ok()) throw new Error(`${route} returned HTTP ${response?.status()}`);
  if (route === '/') await waitForCanvas(page);
  else if (route === '/dev/engine') await page.waitForFunction(() => window.__engineReady === true);
  else if (route === '/admin') {
    await page
      .locator('input[placeholder="Admin access key"], input[placeholder="Add a code…"]')
      .waitFor();
  } else await page.locator('h1').first().waitFor();
}

function waitForCanvas(page) {
  return page.waitForFunction(() => {
    const canvas = document.getElementById('drawingCanvas');
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    const box = canvas.getBoundingClientRect();
    return (canvas.width !== 300 || canvas.height !== 150) && box.width > 0 && box.height > 0;
  });
}

async function freshHome(page, overrides = {}) {
  await page.evaluate(
    (values) => {
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
    },
    { ...STORAGE, ...overrides }
  );
  await navigate(page, '/');
}

async function retryOpen(ready, open, label) {
  const deadline = Date.now() + ACTION_MS;
  while (Date.now() < deadline) {
    if (await ready.isVisible().catch(() => false)) return ready;
    await open().catch(() => undefined);
    await ready.waitFor({ state: 'visible', timeout: 2500 }).catch(() => undefined);
  }
  throw new Error(`${label} did not open`);
}

async function openDialog(page, selector, trigger, label) {
  return retryOpen(page.locator(selector), trigger, label);
}

async function openSettings(page) {
  return openDialog(
    page,
    '#settingsModal',
    () => page.locator('#settingsButton').click(),
    'Settings'
  );
}

async function openDrawer(page) {
  const undo = page.locator('#undoButton');
  if (!(await undo.isVisible())) {
    await retryOpen(
      undo,
      () => page.getByRole('button', { name: 'Expand controls' }).click(),
      'Drawer'
    );
  }
}

async function draw(page, yFraction = 0.5) {
  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) throw new Error('Drawing canvas has no bounds');
  const y = box.y + box.height * yFraction;
  await page.mouse.move(box.x + box.width * 0.24, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.76, y, { steps: 24 });
  await page.mouse.up();
}

async function aiResult(page) {
  await navigate(page, '/dev/ai-timer');
  const dialog = await openDialog(
    page,
    'dialog.ai-result-modal',
    () => page.getByRole('button', { name: /Fast/ }).click(),
    'AI result'
  );
  await dialog.locator('.dial').waitFor();
  return dialog;
}

async function admin(page) {
  await navigate(page, '/admin');
  if (await page.getByPlaceholder('Add a code…').isVisible()) return;
  await page.getByPlaceholder('Admin access key').fill('page-inventory-admin-secret');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByPlaceholder('Add a code…').waitFor({ timeout: ACTION_MS });
}

function routeSurfaces() {
  const pages = discoverPageRoutes().map((route) => {
    const [title, description] = ROUTES[route] ?? [
      route,
      `The ${route} route at its opening position.`,
    ];
    return surface(
      'routes',
      route === '/' ? 'home' : route.slice(1).replaceAll('/', '-'),
      title,
      description,
      route,
      (page) => navigate(page, route)
    );
  });
  return [
    ...pages,
    surface(
      'routes',
      'error-screen',
      'App error screen',
      'The shared SvelteKit error boundary rendered for an unknown route.',
      '+error.svelte (404)',
      async (page) => {
        const response = await page.goto('/__page-inventory-missing', {
          waitUntil: 'domcontentloaded',
          timeout: ACTION_MS,
        });
        if (response?.status() !== 404) {
          throw new Error(`Unknown route returned HTTP ${response?.status()}`);
        }
        await page.getByRole('alert').waitFor();
      }
    ),
  ];
}

function settingsSurfaces() {
  const overview = surface(
    'settings',
    'settings-overview',
    'Settings · overview',
    'The phone section hub and tablet split-pane default view.',
    'Settings',
    async (page) => {
      await freshHome(page);
      await openSettings(page);
    }
  );
  return [
    overview,
    ...discoverSettingsSections().map((section) =>
      surface(
        'settings',
        `settings-${section.id}`,
        `Settings · ${section.title ?? section.label}`,
        `The ${section.label} section in the phone drill-in and tablet split-pane shells.`,
        `Settings/${section.id}`,
        async (page, viewport) => {
          await freshHome(page);
          const modal = await openSettings(page);
          const row = modal.locator(`[data-section="${section.id}"]`);
          await row.evaluate((element) => element.click());
          if (viewport.width < 700) {
            await modal
              .getByRole('heading', { name: section.title ?? section.label, exact: true })
              .waitFor();
          } else {
            await modal.locator(`[data-section="${section.id}"][aria-current="page"]`).waitFor();
          }
        }
      )
    ),
  ];
}

async function coloringDialog(page) {
  await freshHome(page);
  await openDrawer(page);
  return openDialog(
    page,
    '#coloring-book-dialog',
    () => page.locator('#coloringBookButton').click(),
    'Coloring books'
  );
}

function controlSurfaces() {
  return [
    surface(
      'controls',
      'drawing-with-ink',
      'Drawing canvas · ink',
      'A simple stroke on the live tiled drawing surface.',
      'DrawingCanvas',
      async (page) => {
        await freshHome(page);
        await draw(page);
      }
    ),
    surface(
      'controls',
      'dark-canvas',
      'Drawing canvas · dark theme',
      'The canvas, palette, and resting controls on dark paper.',
      'DrawingCanvas/theme=dark',
      async (page) => {
        await freshHome(page, { 'splotch-theme': 'dark' });
        await draw(page);
      }
    ),
    surface(
      'controls',
      'actions-drawer',
      'Actions drawer',
      'The expanded auxiliary-control drawer over a drawing.',
      'ActionsPanel',
      async (page) => {
        await freshHome(page);
        await draw(page);
        await openDrawer(page);
      }
    ),
    surface(
      'controls',
      'brush-menu',
      'Brush menu',
      'Pen, crayon, Magic Brush, and eraser in the shared flyout.',
      'BrushMenu',
      async (page) => {
        await freshHome(page);
        await openDrawer(page);
        await page.locator('#brushButton').click();
        await page.locator('.brush-menu').waitFor();
      }
    ),
    surface(
      'controls',
      'stroke-width-menu',
      'Stroke-width menu',
      'Line-width choices with live brush previews.',
      'StrokeWidthMenu',
      async (page) => {
        await freshHome(page);
        await openDrawer(page);
        await page.locator('#strokeWidthButton').click();
        await page.locator('.stroke-width-menu').waitFor();
      }
    ),
    surface(
      'controls',
      'color-picker',
      'Custom color picker',
      'The responsive honeycomb color grid.',
      'ColorPicker',
      async (page) => {
        await freshHome(page);
        await openDialog(
          page,
          '#color-picker',
          () => page.getByRole('button', { name: 'Custom Color' }).click(),
          'Color picker'
        );
      }
    ),
    surface(
      'controls',
      'coloring-books',
      'Coloring-book picker',
      'The installed coloring-book cover grid.',
      'ColoringBook/books',
      coloringDialog
    ),
    surface(
      'controls',
      'coloring-pages',
      'Coloring-page picker',
      'A coloring book drilled into its page grid.',
      'ColoringBook/pages',
      async (page) => {
        const dialog = await coloringDialog(page);
        await dialog
          .getByRole('button', { name: / coloring book$/i })
          .first()
          .evaluate((element) => element.click());
        await dialog
          .getByRole('button', { name: / coloring page$/i })
          .first()
          .waitFor();
      }
    ),
    surface(
      'controls',
      'coloring-page-applied',
      'Coloring page · applied',
      'A selected page with its active-page chip.',
      'DrawingCanvas/coloring-page',
      async (page) => {
        const dialog = await coloringDialog(page);
        await dialog
          .getByRole('button', { name: / coloring book$/i })
          .first()
          .evaluate((element) => element.click());
        const choice = dialog.getByRole('button', { name: / coloring page$/i }).first();
        await choice.waitFor();
        await page.waitForTimeout(TAP_GUARD_MS);
        await choice.click();
        await page.locator('#coloringOverlay.overlay-ready').waitFor({ timeout: ACTION_MS });
      }
    ),
    surface(
      'controls',
      'clear-coachmark',
      'Clear gesture · coachmark',
      'The pull-to-clear tutorial after three taps.',
      'ClearCoachmark',
      async (page) => {
        await freshHome(page);
        const button = page.locator('#clearButton');
        await button.click();
        await button.click();
        await button.click();
        await page.locator('.clear-coachmark.visible').waitFor();
      }
    ),
    surface(
      'controls',
      'clear-drag-preview',
      'Clear gesture · threshold',
      'The accept ring and paper wash while held past threshold.',
      'ClearButton/drag',
      async (page) => {
        await freshHome(page);
        await draw(page);
        const box = await page.locator('#clearButton').boundingBox();
        if (!box) throw new Error('Clear button has no bounds');
        const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        const size = page.viewportSize();
        const distance = Math.min(size.width, size.height) * 0.43;
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(
          start.x - distance * Math.SQRT1_2,
          start.y + distance * Math.SQRT1_2,
          { steps: 18 }
        );
        await page.locator('#clearButton.delete-ready').waitFor();
      },
      (page) => page.mouse.up()
    ),
    ...['install-banner', 'install-banner-hint'].map((id) =>
      surface(
        'controls',
        id,
        id.endsWith('hint') ? 'Install banner · instructions' : 'Install banner',
        id.endsWith('hint')
          ? 'The expanded iOS Share-sheet guidance.'
          : 'The earned iOS home-screen prompt after a few strokes.',
        `InstallBanner${id.endsWith('hint') ? '/hint' : ''}`,
        async (page) => {
          await freshHome(page);
          await draw(page, 0.38);
          await draw(page, 0.5);
          await draw(page, 0.62);
          const banner = page.locator('.install-banner');
          await banner.waitFor({ timeout: ACTION_MS });
          if (id.endsWith('hint')) {
            await banner.getByRole('button', { name: 'How?' }).click();
            await banner.locator('.install-hint').waitFor();
          }
        }
      )
    ),
    surface(
      'controls',
      'parental-gate',
      'Grown-Ups Only gate',
      'The multiplication challenge protecting a sensitive operation.',
      'ParentalGate',
      async (page) => {
        await freshHome(page, { 'splotch-parental-gate-ai-image-mode': 'always' });
        await draw(page);
        await openDrawer(page);
        await openDialog(
          page,
          '#parentalGate',
          () => page.locator('#aiImageButton').click(),
          'Parental gate'
        );
      }
    ),
  ];
}

function aiSurfaces() {
  const failure = (id, key, title, description) =>
    surface('ai', `ai-result-${id}`, title, description, `AiImageResult/${id}`, async (page) => {
      const dialog = await aiResult(page);
      await page.keyboard.press(key);
      await dialog.locator('.ai-result-error').waitFor();
    });
  return [
    surface(
      'ai',
      'ai-style-picker',
      'AI style picker',
      'Style selection over the child’s drawing preview.',
      'AiImagePrompt',
      async (page) => {
        await freshHome(page);
        await draw(page);
        await openDrawer(page);
        const dialog = await openDialog(
          page,
          '.ai-prompt-modal',
          () => page.locator('#aiImageButton').click(),
          'AI style picker'
        );
        await dialog.locator('.ai-style-option').first().waitFor();
      }
    ),
    surface(
      'ai',
      'ai-result-loading',
      'AI result · generating',
      'The progress dial over the blurred drawing preview.',
      'AiImageResult/loading',
      aiResult
    ),
    surface(
      'ai',
      'ai-result-success',
      'AI result · revealed',
      'The generated picture, download action, and report flag.',
      'AiImageResult/success',
      async (page) => {
        await aiResult(page);
        await page.keyboard.press('f');
        await page.locator('.stage-img.result.shown').waitFor({ timeout: ACTION_MS });
      }
    ),
    surface(
      'ai',
      'ai-report-confirmation',
      'AI result · report confirmation',
      'The confirmation and retention notice before a report is sent.',
      'AiImageReport',
      async (page) => {
        await aiResult(page);
        await page.keyboard.press('f');
        await page.locator('.stage-img.result.shown').waitFor({ timeout: ACTION_MS });
        await page.getByRole('button', { name: 'Report this picture' }).click();
        await page.locator('.ai-report-confirmation').waitFor();
      }
    ),
    failure('safety', 's', 'AI result · safety refusal', 'The child-safe refusal treatment.'),
    failure('timeout', 't', 'AI result · timeout', 'The retryable timeout treatment.'),
    failure(
      'server-error',
      'e',
      'AI result · server error',
      'The generic generation failure treatment.'
    ),
  ];
}

function adminSurfaces() {
  return [
    surface(
      'admin',
      'admin-authenticated',
      'Admin · authenticated',
      'The ledger, persistence warning, and free-grant metrics.',
      '/admin authenticated',
      admin
    ),
    surface(
      'admin',
      'admin-row-actions',
      'Admin · access-code actions',
      'The modal action sheet on phones and inline actions on tablets.',
      'InviteMenu/responsive ledger',
      async (page) => {
        await admin(page);
        const more = page.getByRole('button', { name: /More options for/ }).first();
        if (await more.isVisible()) {
          await more.click();
          await page.locator('dialog.more-menu').waitFor();
        } else {
          await page.getByRole('button', { name: 'Copy link' }).first().focus();
        }
      }
    ),
  ];
}

export function allSurfaces() {
  return [
    ...routeSurfaces(),
    ...settingsSurfaces(),
    ...controlSurfaces(),
    ...aiSurfaces(),
    ...adminSurfaces(),
  ];
}

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const visible = Array.from(document.images).filter((image) => {
      const box = image.getBoundingClientRect();
      return (
        box.width > 0 &&
        box.height > 0 &&
        box.bottom >= 0 &&
        box.top <= innerHeight &&
        box.right >= 0 &&
        box.left <= innerWidth
      );
    });
    await Promise.all(visible.map((image) => image.decode().catch(() => undefined)));
    await new Promise((resolveFrame) =>
      requestAnimationFrame(() => requestAnimationFrame(resolveFrame))
    );
    const finiteAnimations = document.getAnimations().filter((animation) => {
      const endTime = animation.effect?.getComputedTiming().endTime;
      return typeof endTime === 'number' && Number.isFinite(endTime);
    });
    await Promise.all(finiteAnimations.map((animation) => animation.finished.catch(() => {})));
  });
  await page.addStyleTag({
    content:
      '*,*::before,*::after{caret-color:transparent!important;transition-duration:0s!important;animation-play-state:paused!important}',
  });
}

async function capture(page, item, viewport, out) {
  await item.prepare(page, viewport);
  await settle(page);
  const path = inventoryCapturePath(item, viewport);
  const target = join(out, path);
  mkdirSync(resolve(target, '..'), { recursive: true });
  const png = await page.screenshot({ type: 'png' });
  await sharp(png).webp({ quality: WEBP_QUALITY, effort: 5 }).toFile(target);
  await item.cleanup?.(page);
  return path;
}

function options(argv) {
  const parsed = parseArgs({
    args: argv,
    options: {
      out: { type: 'string', default: OUT_DEFAULT },
      port: { type: 'string', default: String(PORT_DEFAULT) },
      critique: { type: 'string' },
    },
    strict: true,
  }).values;
  const port = Number(parsed.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error(`Invalid --port: ${parsed.port}`);
  const out = resolve(ROOT, parsed.out);
  const scrapbook = resolve(ROOT, 'scrapbook');
  if (!out.startsWith(`${scrapbook}${sep}`)) {
    throw new Error(`--out must stay inside scrapbook/: ${parsed.out}`);
  }
  const defaultCritique = join(out, 'design-critique.json');
  const critique = parsed.critique ? resolve(ROOT, parsed.critique) : defaultCritique;
  if (parsed.critique && !existsSync(critique)) {
    throw new Error(`--critique does not exist: ${parsed.critique}`);
  }
  return { out, port, critique: existsSync(critique) ? critique : undefined };
}

export async function generateOutputAtomically(out, generate) {
  const parent = dirname(out);
  mkdirSync(parent, { recursive: true });
  const staging = mkdtempSync(join(parent, `.${basename(out)}-staging-`));
  const previous = `${staging}-previous`;
  let previousMoved = false;
  try {
    const result = await generate(staging);
    if (existsSync(out)) {
      renameSync(out, previous);
      previousMoved = true;
    }
    try {
      renameSync(staging, out);
    } catch (error) {
      if (previousMoved) renameSync(previous, out);
      throw error;
    }
    if (previousMoved) rmSync(previous, { recursive: true, force: true });
    return result;
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

export async function generatePageInventory(argv = process.argv.slice(2)) {
  const { out, port, critique: critiquePath } = options(argv);
  const items = attachExpectedCapturePaths(allSurfaces());
  const expectedImages = items.flatMap((item) => Object.values(item.captures));
  const critique = readDesignCritique(critiquePath, expectedImages);
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: ROOT,
    env: { ...process.env, ...SERVER_ENV },
    stdio: 'inherit',
  });
  if (build.error) throw build.error;
  if (build.status !== 0) throw new Error(`Production build exited ${build.status}`);
  const { snapshots, bytes } = await generateOutputAtomically(out, async (staging) => {
    const assets = join(staging, 'assets');
    mkdirSync(assets, { recursive: true });
    const server = spawnViteServer(port, {
      command: 'preview',
      env: SERVER_ENV,
    });
    let browser;
    try {
      await waitForUrl(`http://localhost:${port}`, SERVER_BOOT_MS);
      browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });
      for (const view of PAGE_INVENTORY_VIEWPORTS) {
        const context = await browser.newContext({
          baseURL: `http://localhost:${port}`,
          viewport: { width: view.width, height: view.height },
          deviceScaleFactor: 1,
          hasTouch: true,
          userAgent: view.width < 700 ? PHONE_UA : TABLET_UA,
          colorScheme: 'light',
          reducedMotion: 'reduce',
        });
        await context.addInitScript((defaults) => {
          for (const [key, value] of Object.entries(defaults)) {
            if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
          }
        }, STORAGE);
        const page = await context.newPage();
        for (const item of items) {
          console.log(`${view.id.padEnd(21)} ${item.id}`);
          item.captures ??= {};
          item.captures[view.id] = await capture(page, item, view, staging);
        }
        await context.close();
      }
      writeFileSync(join(staging, 'index.html'), renderPageInventoryReport(items, critique));
      if (critiquePath) copyFileSync(critiquePath, join(staging, 'design-critique.json'));
      return {
        snapshots: items.length * PAGE_INVENTORY_VIEWPORTS.length,
        bytes: filesBelow(assets).reduce((sum, file) => sum + statSync(file).size, 0),
      };
    } finally {
      await browser?.close();
      server.stop();
    }
  });
  console.log(
    `Wrote ${snapshots} snapshots and ${relative(ROOT, join(out, 'index.html'))} (${(bytes / 1024 / 1024).toFixed(1)} MiB)`
  );
}

if (isMain(import.meta.url)) runMain(generatePageInventory);
