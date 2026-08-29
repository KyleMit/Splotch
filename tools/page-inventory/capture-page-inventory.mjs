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
import {
  captureRecord,
  createCaptureManifest,
  pixelIdenticalReviewGroups,
  readDesignCritique,
  sha256File,
  validateThemeCaptureDifferences,
} from './lib/page-inventory-data.mjs';
import { CAPTURE_ATTEMPTS, assertCaptureRendered } from './lib/page-inventory-capture.mjs';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';
import { chromiumExecutablePath } from '../lib/playwright.mjs';
import { waitForUrl } from '../lib/net.mjs';
import {
  PAGE_INVENTORY_VIEWPORTS,
  PAGE_INVENTORY_THEMES,
  attachExpectedCapturePaths,
  inventoryCapturePath,
  renderPageInventoryReport,
} from './lib/page-inventory-report.mjs';
import { spawnViteServer } from '../lib/vite-server.mjs';
// TypeScript, so both entry points that reach it run under
// --experimental-strip-types (capture:page-inventory, attach:page-inventory-feedback).
import { aiOutputFor } from '../../web/tests/artifacts/ai-output-fixtures.ts';

const PORT_DEFAULT = 4319;
const OUT_DEFAULT = join(ROOT, 'scrapbook/page-inventory');
const SPOT_CHECK_OUT_DEFAULT = join(ROOT, '.scrapbook-scratch/page-inventory-spot-check');
const SCRAPBOOK_ROOT = join(ROOT, 'scrapbook');
const SERVER_BOOT_MS = 120_000;
const ACTION_MS = 15_000;
const TAP_GUARD_MS = 750;
const WEBP_QUALITY = 84;
const CAPTURE_MANIFEST_NAME = 'capture-manifest.json';
const SPOT_CHECK_RECORDS_NAME = 'spot-check-captures.json';
const SETTINGS_WIDE_MIN_WIDTH_PX = 700;
const SCROLL_END_EPSILON_PX = 1;
// The wide shell parks a jumped-to section just clear of the pane's top edge
// rather than flush against it, and the pane's own padding holds the first
// section clear of it too — so a landed section sits in a band below that edge,
// never on it. The band stays far under one section's height so it cannot
// accept the section above the requested one; tests/page-inventory.test.mjs
// checks it against the insets the shell actually parks at.
export const SECTION_LANDED_BAND_PX = 40;

const PHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const TABLET_UA =
  'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const STORAGE = {
  'splotch-ai-access-token': 'daycare-club',
  // isAiImageButtonVisible() requires this toggle as well as a credential, so
  // without it the AI button stays hidden and every surface reached through it
  // — the parental gate and the whole ai/ group — is unreachable.
  'splotch-ai-image-enabled': 'true',
  'splotch-advanced-controls': 'true',
  'splotch-drawer-open': 'false',
  'splotch-lock-rotation': 'false',
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
  OPENAI_API_KEY: 'not-a-usable-openai-key',
  GITHUB_ISSUE_TOKEN: '',
  GITHUB_ISSUE_REPO: 'splotch-page-inventory/nowhere',
};

const ROUTES = {
  '/': ['Drawing canvas', 'The blank drawing surface and its resting canvas chrome.'],
  '/admin': ['Admin · signed out', 'The server-rendered administrator sign-in surface.'],
  '/changelog': ['Changelog', 'The complete release history at its opening position.'],
  '/design': ['Design system', 'The public living styleguide at its opening position.'],
  '/feedback': ['Feedback', 'The standalone bug report and feature idea form.'],
  '/privacy': ['Privacy policy', 'The public privacy policy at its opening position.'],
};

// The /dev tree is internal tooling nobody ships or design-reviews.
const INTERNAL_ROUTE_ROOTS = ['/dev'];

// Routes whose captures are driven by an explicit surface below instead of the
// generic one-shot-per-route pass, because a single visit does not show the
// whole page. /beta is one page with two panels behind a platform picker, and
// every context here carries an iPhone or iPad user agent (PHONE_UA/TABLET_UA),
// so a bare visit would capture the iOS panel at all eight viewports and never
// review the Android one.
const EXPLICITLY_DRIVEN_ROUTES = ['/beta'];

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
    .filter(
      (route) =>
        !INTERNAL_ROUTE_ROOTS.some((root) => route === root || route.startsWith(`${root}/`)) &&
        !EXPLICITLY_DRIVEN_ROUTES.includes(route)
    )
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

const surface = (group, id, title, description, source, prepare, { cleanup } = {}) => ({
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
  const modal = await openDialog(
    page,
    '#settingsModal',
    () => page.locator('#settingsButton').click(),
    'Settings'
  );
  // The wide shell fills its pane a section per frame, so a shot taken as the
  // card lands catches a half-built page. tools/perf/tests/xcuitest-actions.test.mjs
  // holds this token against the shell that sets it.
  if (await modal.locator('.settings-pane').count()) {
    await modal.locator('.settings-pane[aria-busy="false"]').waitFor();
  }
  return modal;
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

async function aiResult(page, outcome = 'pending') {
  await freshHome(page);
  await draw(page, 0.25);
  await page.waitForFunction(() => {
    const history = window.__drawingDebug?.getUndoDebug();
    return Boolean(history && history.snapshots > 0 && history.pendingCommands === 0);
  });
  const heldRequests = [];
  await page.unroute('**/api/generate-image*');
  await page.route('**/api/generate-image*', async (route) => {
    if (outcome === 'pending') {
      // Leaving a route handler without settling it fails the fetch; the loading
      // surface needs the request itself to remain in flight through capture.
      await new Promise((release) => heldRequests.push(release));
      return;
    }
    if (outcome === 'success') {
      await route.fulfill({
        status: 200,
        contentType: 'image/jpeg',
        body: aiOutputFor(page.viewportSize()),
      });
      return;
    }
    const status = outcome === 'safety' ? 422 : 500;
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'Page inventory generation failure' }),
    });
  });
  await page.waitForFunction(() => typeof window.__aiGenerate === 'function');
  await page.evaluate(() => {
    void window.__aiGenerate({ style: 'Magical' });
  });
  const dialog = page.locator('dialog.ai-result-modal');
  await dialog.waitFor();
  if (outcome === 'pending') await dialog.locator('.dial').waitFor();
  return dialog;
}

async function admin(page) {
  await navigate(page, '/admin');
  if (await page.getByPlaceholder('Add a code…').isVisible()) return;
  await page.getByPlaceholder('Admin access key').fill('page-inventory-admin-secret');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByPlaceholder('Add a code…').waitFor({ timeout: ACTION_MS });
}

// One surface per beta panel, each deep-linked so the pre-paint stamp opens the
// tab this capture is for whatever the context's user agent says. The wait is
// load-bearing: the prerendered document raises no tab (the picker only catches
// up on hydration), so a shot taken before it shows a tab row with nothing live.
function betaPanelSurface(platform, title, description) {
  const route = `/beta?os=${platform}`;
  return surface('routes', `beta-${platform}`, title, description, route, async (page) => {
    await navigate(page, route);
    await page
      .locator('.beta-platform-picker .option.active')
      .waitFor({ state: 'visible', timeout: ACTION_MS });
  });
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
    betaPanelSurface(
      'android',
      'Beta sign-up · Android',
      'Google Play closed-test instructions, on the Android tab of the beta page.'
    ),
    betaPanelSurface(
      'ios',
      'Beta sign-up · iOS',
      'TestFlight instructions, on the iOS tab of the beta page.'
    ),
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
        `The ${section.label} section where full settings fit; compact phone landscapes show the quick-toggle shell that replaces it.`,
        `Settings/${section.id}`,
        async (page, viewport) => {
          await freshHome(page);
          const modal = await openSettings(page);
          if (await modal.locator('.quick-toggles').isVisible()) return;
          const row = modal.locator(settingsSectionRowSelector(section.id));
          await row.evaluate((element) => element.click());
          if (viewport.width < SETTINGS_WIDE_MIN_WIDTH_PX) {
            await modal
              .getByRole('heading', { name: section.title ?? section.label, exact: true })
              .waitFor();
          } else {
            await page.waitForFunction(
              ({ sectionId, scrollEndEpsilonPx, landedBandPx }) => {
                const pane = document.querySelector('#settingsModal .settings-pane');
                const target = document.querySelector(
                  `#settingsModal .settings-section[data-section="${sectionId}"]`
                );
                if (!(pane instanceof HTMLElement) || !(target instanceof HTMLElement))
                  return false;
                const paneRect = pane.getBoundingClientRect();
                const targetRect = target.getBoundingClientRect();
                const atEnd =
                  pane.scrollTop + pane.clientHeight >= pane.scrollHeight - scrollEndEpsilonPx;
                const belowPaneTop = targetRect.top - paneRect.top;
                return atEnd || (belowPaneTop >= 0 && belowPaneTop <= landedBandPx);
              },
              {
                sectionId: section.id,
                scrollEndEpsilonPx: SCROLL_END_EPSILON_PX,
                landedBandPx: SECTION_LANDED_BAND_PX,
              }
            );
          }
        }
      )
    ),
  ];
}

// Both Settings shells render a section row as a button stamped with the section
// id — the phone hub's list and the wide sidebar's table of contents — so the
// attribute addresses either without naming a shell's classes, which are styling
// and get renamed with it. The tag is load-bearing rather than decorative: the
// wide pane's own `.settings-section` wrappers carry the same attribute and are
// not rows, so a selector without it matches two elements inside the modal.
export function settingsSectionRowSelector(sectionId) {
  return `button[data-section="${sectionId}"]`;
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
      { cleanup: (page) => page.mouse.up() }
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
  const failure = (id, outcome, title, description) =>
    surface('ai', `ai-result-${id}`, title, description, `AiImageResult/${id}`, async (page) => {
      const dialog = await aiResult(page, outcome);
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
      (page) => aiResult(page)
    ),
    surface(
      'ai',
      'ai-result-success',
      'AI result · revealed',
      'The generated picture, download action, and report flag.',
      'AiImageResult/success',
      async (page) => {
        await aiResult(page, 'success');
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
        await aiResult(page, 'success');
        await page.locator('.stage-img.result.shown').waitFor({ timeout: ACTION_MS });
        await page.getByRole('button', { name: 'Report this picture' }).click();
        await page.locator('dialog.ai-report-confirm').waitFor();
      }
    ),
    failure('safety', 'safety', 'AI result · safety refusal', 'The child-safe refusal treatment.'),
    failure(
      'server-error',
      'server-error',
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
      'The in-place row expansion on phones and inline actions on tablets.',
      'InviteRowActions/responsive ledger',
      async (page) => {
        await admin(page);
        const more = page.getByRole('button', { name: /More options for/ }).first();
        if (await more.isVisible()) {
          // A single click was not reliably opening the row; the cause was
          // never isolated, and it cannot be a row left open by an earlier
          // surface because admin() navigates first. Hydration is the likely
          // candidate — the SSR'd button takes a press before its handler
          // attaches — so this retries the open rather than waiting longer.
          await retryOpen(
            page.locator('.row-actions.open').first(),
            () => more.click(),
            'Admin row actions'
          );
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

async function assertSurfaceReady(page) {
  await page.waitForFunction(() => document.readyState === 'complete');
  const hasVisibleContent = await page.evaluate(() => {
    const candidates = document.querySelectorAll(
      'canvas, dialog, h1, button, img, input, [role="alert"], [role="main"]'
    );
    return [...candidates].some((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.visibility !== 'hidden';
    });
  });
  if (!hasVisibleContent) throw new Error('reached no visible ready content');
}

async function captureOnce(page, item, viewport, theme, out) {
  try {
    await item.prepare(page, viewport);
    await settle(page);
    await assertSurfaceReady(page);
    const path = inventoryCapturePath(item, viewport, theme);
    const target = join(out, path);
    mkdirSync(resolve(target, '..'), { recursive: true });
    const png = await page.screenshot({ type: 'png' });
    await sharp(png).webp({ quality: WEBP_QUALITY, effort: 5 }).toFile(target);
    await assertCaptureRendered(target, viewport);
    return captureRecord(item, viewport, theme, path, sha256File(target));
  } finally {
    await item.cleanup?.(page);
  }
}

async function capture(page, item, viewport, theme, out) {
  const label = `${item.group}/${item.id} at ${viewport.id} in ${theme.id}`;
  let failure;
  for (let attempt = 1; attempt <= CAPTURE_ATTEMPTS; attempt += 1) {
    try {
      return await captureOnce(page, item, viewport, theme, out);
    } catch (error) {
      failure = error;
      console.warn(`${label} attempt ${attempt}/${CAPTURE_ATTEMPTS} failed: ${error.message}`);
    }
  }
  throw new Error(
    `Capture ${label} failed after ${CAPTURE_ATTEMPTS} attempts: ${failure.message}`,
    {
      cause: failure,
    }
  );
}

export function selectSpotCheckItems(candidates, requested, flag, describe) {
  if (!requested.length) return candidates;
  const chosen = new Set();
  for (const name of requested) {
    const matches = candidates.filter((candidate) => describe(candidate).includes(name));
    if (!matches.length) {
      const known = candidates.map((candidate) => describe(candidate)[0]).join(', ');
      throw new Error(`${flag} names nothing in this inventory: ${name}. Choose from: ${known}`);
    }
    for (const match of matches) chosen.add(match);
  }
  return candidates.filter((candidate) => chosen.has(candidate));
}

const isWithin = (root, path) => path === root || path.startsWith(`${root}${sep}`);

// generateOutputAtomically replaces --out wholesale: the directory is renamed
// aside, staging takes its name, and the original is then deleted recursively.
// So the flag may only name a directory this generator alone writes — the
// committed inventory a full run publishes, or a scratch directory under the
// spot-check root. Every other path it resolves to owns something this run was
// never asked to delete: `.` and `..` land on the repository, `scrapbook/<name>`
// on a committed collection, `.scrapbook-scratch` on the critique checkpoints,
// and an absolute path on whatever it names outside the worktree.
function assertOwnedOutputDirectory(out, spotCheck) {
  if (spotCheck && out.startsWith(`${SCRAPBOOK_ROOT}${sep}`)) {
    throw new Error(
      `A --surface/--viewport/--theme spot check captures only part of the inventory, so it must stay out of scrapbook/ where a partial manifest would be read as the coverage authority: ${out}`
    );
  }
  const owned = spotCheck ? isWithin(SPOT_CHECK_OUT_DEFAULT, out) : out === OUT_DEFAULT;
  if (owned) return;
  const requirement = spotCheck
    ? `a spot check may only write inside ${relative(ROOT, SPOT_CHECK_OUT_DEFAULT)} — drop --out for that directory, or name one beneath it`
    : `a full run may only write the inventory it publishes, ${relative(ROOT, OUT_DEFAULT)} — drop --out to write it, or pass --surface/--viewport/--theme to spot check into ${relative(ROOT, SPOT_CHECK_OUT_DEFAULT)}`;
  throw new Error(
    `--out is replaced wholesale, so it can only name a directory this generator writes as a whole, and ${out} is not one. Instead, ${requirement}.`
  );
}

// Exported as a seam: generatePageInventory builds the app and then replaces the
// resolved directory, so an accepted --out cannot be asserted through it.
export function parsePageInventoryOptions(argv) {
  const parsed = parseArgs({
    args: argv,
    options: {
      out: { type: 'string' },
      port: { type: 'string', default: String(PORT_DEFAULT) },
      critique: { type: 'string' },
      surface: { type: 'string', multiple: true },
      viewport: { type: 'string', multiple: true },
      theme: { type: 'string', multiple: true },
    },
    strict: true,
  }).values;
  const port = Number(parsed.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error(`Invalid --port: ${parsed.port}`);
  const surfaces = parsed.surface ?? [];
  const viewports = parsed.viewport ?? [];
  const themes = parsed.theme ?? [];
  const spotCheck = Boolean(surfaces.length || viewports.length || themes.length);
  const out = resolve(ROOT, parsed.out ?? (spotCheck ? SPOT_CHECK_OUT_DEFAULT : OUT_DEFAULT));
  assertOwnedOutputDirectory(out, spotCheck);
  if (spotCheck && parsed.critique) {
    throw new Error('--critique attaches feedback to a full inventory and cannot filter captures');
  }
  const defaultCritique = join(out, 'design-critique.json');
  const critique = parsed.critique ? resolve(ROOT, parsed.critique) : defaultCritique;
  if (parsed.critique && !existsSync(critique)) {
    throw new Error(`--critique does not exist: ${parsed.critique}`);
  }
  return {
    out,
    port,
    spotCheck,
    surfaces,
    viewports,
    themes,
    critique: !spotCheck && existsSync(critique) ? critique : undefined,
  };
}

async function openThemedPage(browser, port, view, theme) {
  const context = await browser.newContext({
    baseURL: `http://localhost:${port}`,
    viewport: { width: view.width, height: view.height },
    deviceScaleFactor: 1,
    hasTouch: true,
    userAgent: view.formFactor === 'phone' ? PHONE_UA : TABLET_UA,
    colorScheme: theme.id,
    reducedMotion: 'reduce',
  });
  await context.addInitScript(
    ({ defaults, themeId }) => {
      for (const [key, value] of Object.entries(defaults)) {
        if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
      }
      localStorage.setItem('splotch-theme', themeId);
    },
    { defaults: STORAGE, themeId: theme.id }
  );
  const page = await context.newPage();
  // A page that has not navigated yet has no origin, so localStorage is
  // unreachable from it. Every surface that seeds storage before navigating
  // reaches for it, and a filtered run can open on one of those.
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: ACTION_MS });
  return { theme, context, page };
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
  const {
    out,
    port,
    spotCheck,
    critique: critiquePath,
    ...filters
  } = parsePageInventoryOptions(argv);
  const items = attachExpectedCapturePaths(
    selectSpotCheckItems(allSurfaces(), filters.surfaces, '--surface', (item) => [
      `${item.group}/${item.id}`,
      item.id,
    ])
  );
  const views = selectSpotCheckItems(
    PAGE_INVENTORY_VIEWPORTS,
    filters.viewports,
    '--viewport',
    (view) => [view.id]
  );
  const themes = selectSpotCheckItems(PAGE_INVENTORY_THEMES, filters.themes, '--theme', (theme) => [
    theme.id,
  ]);
  // The inventory is evidence about what ships, so it is captured against a
  // production preview. `vite dev` is not the same app: hydration arrives late
  // enough that a shot can catch pre-hydration state — /design renders its
  // whole swatch table in light-mode token values under night mode, because
  // routes/design/+page.svelte adopts the applied theme in onMount — and 26 of
  // 42 surfaces differed between the two servers at one viewport and theme.
  // The build this costs was measured at 19 seconds against an ~80-minute run.
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
      const captures = [];
      // A viewport holds one page per theme at once, so a surface is shot in
      // every theme before the run moves on and the theme comparison below can
      // reject a page that stopped following night mode within seconds of
      // reaching it — rather than after the last of hundreds of captures.
      for (const view of views) {
        const themedPages = [];
        try {
          for (const theme of themes) {
            themedPages.push(await openThemedPage(browser, port, view, theme));
          }
          for (const item of items) {
            const themeCaptures = [];
            for (const { theme, page } of themedPages) {
              console.log(`${theme.id.padEnd(5)} ${view.id.padEnd(21)} ${item.id}`);
              themeCaptures.push(await capture(page, item, view, theme, staging));
            }
            validateThemeCaptureDifferences(themeCaptures, [item]);
            captures.push(...themeCaptures);
          }
        } finally {
          for (const { context } of themedPages) await context.close();
        }
      }
      if (spotCheck) {
        writeFileSync(
          join(staging, SPOT_CHECK_RECORDS_NAME),
          `${JSON.stringify({ captures }, null, 2)}\n`
        );
      } else {
        const manifest = createCaptureManifest(views, captures);
        writeFileSync(
          join(staging, CAPTURE_MANIFEST_NAME),
          `${JSON.stringify(manifest, null, 2)}\n`
        );
        let critique = new Map();
        if (critiquePath) {
          copyFileSync(critiquePath, join(staging, 'design-critique.json'));
          try {
            critique = readDesignCritique(critiquePath, manifest);
          } catch (error) {
            console.warn(`Preserved but detached stale design critique: ${error.message}`);
          }
        }
        writeFileSync(
          join(staging, 'index.html'),
          renderPageInventoryReport(
            items,
            critique,
            pixelIdenticalReviewGroups(manifest.captures, critique)
          )
        );
      }
      return {
        snapshots: captures.length,
        bytes: filesBelow(assets).reduce((sum, file) => sum + statSync(file).size, 0),
      };
    } finally {
      await browser?.close();
      server.stop();
    }
  });
  const wrote = spotCheck ? SPOT_CHECK_RECORDS_NAME : 'index.html';
  console.log(
    `Wrote ${snapshots} snapshots and ${relative(ROOT, join(out, wrote))} (${(bytes / 1024 / 1024).toFixed(1)} MiB)`
  );
  if (spotCheck) {
    console.log('Spot check: no capture manifest was written, so the committed inventory stands.');
  }
}

if (isMain(import.meta.url)) runMain(generatePageInventory);
