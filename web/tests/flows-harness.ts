import { expect, type Locator, type Page } from '@playwright/test';

import {
  drawCommittedStroke,
  gotoApp,
  openSettingsModal,
  renderedCanvasHandle,
  retryOpen,
  settleFlyIn,
} from './helpers';
import { LAUNCH_ZONE_DURATION_MS } from '../src/lib/actions/launchGuard';
import {
  coloringPackCacheName,
  coloringPackMarkerPath,
  coloringPackMarkerValue,
} from '../src/lib/coloringPacks/cacheKeys';
import {
  resolveColoringPackManifest,
  type ColoringPackManifest,
} from '../src/lib/coloringPacks/manifest';
import { coloringPackResolutionForScreen } from '../src/lib/coloringPacks/resolution';

// Layer 3 — full-UI end-to-end flows on the real app page. These exercise the
// Svelte component wiring (palette, action drawer, tool/stroke state, AI fetch,
// coloring overlay) that the engine-level specs (engine-*.spec.ts) deliberately
// bypasses. Interactions go through the real buttons; we drive the canvas with
// real pointer input and read back canvas pixels / reactive button state.

// The action drawer is collapsed by default (drawerOpen=false), so its buttons
// (brush menu, undo, screenshot, AI, coloring) aren't rendered until the chevron
// is tapped. Retrying the tap handles first-click hydration lag under parallel
// load.
export async function openDrawer(page: Page) {
  await retryOpen(
    page.locator('#undoButton'),
    () => page.locator('button[aria-label="Expand controls"]').click({ timeout: 3000 }),
    { timeout: 20_000 }
  );
}

async function gotoAppWithInstalledColoringBooks(
  page: Page,
  installedBookIds: (manifest: ColoringPackManifest) => string[]
) {
  const manifestResponse = page.waitForResponse(/\/coloring\/manifest-.+\.json$/);
  await gotoApp(page);
  const sourceManifest = (await (await manifestResponse).json()) as ColoringPackManifest;
  const screen = await page.evaluate(() => ({
    widthCssPx: window.screen.width,
    heightCssPx: window.screen.height,
    devicePixelRatio: window.devicePixelRatio,
  }));
  const manifest = resolveColoringPackManifest(
    sourceManifest,
    coloringPackResolutionForScreen(screen)
  );
  const installedIds = new Set(installedBookIds(sourceManifest));
  const markers = manifest.books
    .filter((book) => installedIds.has(book.id))
    .map((book) => ({
      path: coloringPackMarkerPath(manifest, book.id),
      value: coloringPackMarkerValue(book),
    }));
  await page.evaluate(
    async ({ cacheName, markers }) => {
      const cache = await caches.open(cacheName);
      await Promise.all(markers.map(({ path, value }) => cache.put(path, new Response(value))));
    },
    { cacheName: coloringPackCacheName(manifest), markers }
  );
  await gotoApp(page);
}

export async function gotoAppWithInstalledColoringBook(page: Page, bookId: string) {
  await gotoAppWithInstalledColoringBooks(page, () => [bookId]);
}

export async function gotoAppWithAllColoringBooksInstalled(page: Page) {
  await gotoAppWithInstalledColoringBooks(page, (manifest) =>
    manifest.books.filter((book) => book.id !== manifest.starterBookId).map((book) => book.id)
  );
}

export async function opaqueCanvasPixelCount(page: Page) {
  const canvas = await renderedCanvasHandle(page);
  try {
    return canvas.evaluate((element) => {
      const pixels = element
        .getContext('2d')!
        .getImageData(0, 0, element.width, element.height).data;
      let opaque = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > 0) opaque++;
      }
      return opaque;
    });
  } finally {
    await canvas.dispose();
  }
}

const AI_BUTTON_ENABLE_TIMEOUT_MS = 10_000;

export async function enableAiButtonWithStroke(page: Page) {
  const button = page.locator('#aiImageButton');
  if (await button.isEnabled().catch(() => false)) return;
  await drawCommittedStroke(page, [
    { x: 120, y: 120 },
    { x: 260, y: 200 },
  ]);
  await expect(button).toBeEnabled({ timeout: AI_BUTTON_ENABLE_TIMEOUT_MS });
}

// Open the Grown-Ups Only gate from the AI button — its Parent Center-managed
// operation boundary (ADR-0094: Settings entry itself is ungated). Requires a
// gotoApp with `gates: 'always'`. The collapsed drawer is opened after the
// setup stroke has durably committed and enabled the product action.
export async function openParentalGate(page: Page) {
  await enableAiButtonWithStroke(page);
  await openDrawer(page);
  const dialog = page.locator('#parentalGate');
  await retryOpen(dialog, () => page.locator('#aiImageButton').click({ timeout: 3000 }));
  await settleFlyIn(dialog);
  return dialog;
}

// Solve the currently displayed challenge: the equation row's accessible label
// carries the operands, and typing the last digit auto-submits. Each press is
// verified and retried: the gate flies in over the control that opened it, and
// a click landing inside that opening tap's launch dead zone (launchGuard,
// 72px/600ms) is swallowed by design — one unverified click can silently type
// nothing (bit the external-link flow, whose anchor sits mid-card under the
// keypad).
export async function solveParentalGate(page: Page) {
  const label = await page.locator('.gate-equation').getAttribute('aria-label');
  const [x, y] = label!.match(/\d+/g)!.map(Number);
  const answer = String(x * y);
  const keypad = page.locator('.gate-keypad');
  for (let i = 0; i < answer.length; i++) {
    await expect(async () => {
      await keypad.getByRole('button', { name: answer[i], exact: true }).click({ timeout: 2000 });
      if (i < answer.length - 1) {
        // The digit landed when its dab fills.
        await expect(page.locator('.gate-dab.filled')).toHaveCount(i + 1, { timeout: 1000 });
      } else {
        // The last digit auto-submits: the keypad leaves the DOM for the
        // success card, or the gate closes outright (immediate link handoffs).
        await expect(keypad).not.toBeVisible({ timeout: 1500 });
      }
    }).toPass({ timeout: 15_000 });
  }
}

// One protected operation's frequency picker inside Parent Center.
export function policyPicker(settings: Locator, feature: string) {
  return settings.getByRole('radiogroup', { name: `${feature} parental gate frequency` });
}

// Reach the unlocked Parent Center with every check armed — the state the
// turn-a-check-off flows start from, and the one the web build never ships.
export async function openArmedParentCenter(page: Page) {
  await gotoApp(page, '/', { gates: 'always' });
  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'Parent Center' }).click();
  await solveParentalGate(page);
  await expect(settings.getByText(/Choose when Splotch should ask/)).toBeVisible({ timeout: 5000 });
  return settings;
}

// Open the Brush Menu flyout and leave it open. The eraser and magic brush live
// in this flyout (they used to be top-level action buttons), so selecting them
// goes through here.
export async function openBrushMenu(page: Page) {
  await retryOpen(
    page.locator('#penBrushButton'),
    () => page.locator('#brushButton').click({ timeout: 1000 }),
    { settle: 1000 }
  );
}

// Open the Stroke Width flyout and leave it open. Its sentinel is present
// whenever the menu is open — the label is tool-aware (issue #286), so both
// spellings are matched rather than assuming the pen is the held brush.
export async function openStrokeMenu(page: Page) {
  await retryOpen(
    page.locator('button[aria-label="Size 3"], button[aria-label="Eraser size 3"]'),
    () => page.locator('#strokeWidthButton').click({ timeout: 1000 }),
    { settle: 1000 }
  );
}

// The Brush Menu's four entries, and the engine mode each one commits. Closed
// as a union so a call site can't name a button that has no expected mode.
type BrushButtonId = keyof typeof ENGINE_MODE_BY_BUTTON;
const ENGINE_MODE_BY_BUTTON = {
  '#penBrushButton': 'pen',
  '#crayonBrushButton': 'crayon',
  '#magicBrushButton': 'magic',
  '#eraserButton': 'eraser',
} as const;

// The engine has ~nothing to do to adopt a mode — it assigns a flag — so this
// only has to outlast a starved worker's Svelte flush, not any real work.
const BRUSH_COMMIT_TIMEOUT_MS = 10_000;
const COLORING_DIALOG_CLOSE_TIMEOUT_MS = 10_000;
const COLORING_DIALOG_CLOSE_SETTLE_MS = 1_000;
const COLORING_OVERLAY_DECODE_TIMEOUT_MS = 15_000;

// Answer the mode the ENGINE holds, or a legible stand-in when the dev-harness
// seam isn't there to ask (a build without PUBLIC_ENABLE_DEV_HARNESS, or a page
// that hasn't hydrated). Returning the stand-in rather than throwing puts it in
// the poll's "received" line, so the failure names the real problem.
function committedBrushMode(page: Page): Promise<string> {
  return page.evaluate(() => window.__committedBrushMode?.() ?? 'dev-harness-seam-missing');
}

// Select a brush from the Brush Menu by its entry id (e.g. '#eraserButton',
// '#magicBrushButton'). Selecting closes the flyout.
//
// Returns once the ENGINE has committed the mode, not merely once the button
// reports it (ADR-0080). The brush→engine toggle flows through a Svelte
// $effect, so between the two a stroke commits under the PREVIOUS brush — a
// wrong-mode stroke that is already painted by the time anything can observe it,
// which is why polling the button (`aria-pressed`) measured no improvement at
// all: 16/200 failures before and after (ADR-0078 §3).
export async function pickBrush(page: Page, id: BrushButtonId) {
  await openBrushMenu(page);
  await page.locator(id).click();
  await expect
    .poll(() => committedBrushMode(page), { timeout: BRUSH_COMMIT_TIMEOUT_MS })
    .toBe(ENGINE_MODE_BY_BUTTON[id]);
}

// Open the coloring-book dialog robustly — same retry shape as openDrawer: a
// click fired right after hydration can hit the button before its handler is
// wired, so re-click until the dialog actually opens.
export async function openColoringDialog(page: Page) {
  await retryOpen(
    page.locator('#coloring-book-dialog'),
    () => page.locator('#coloringBookButton').click({ timeout: 1000 }),
    { settle: 1000 }
  );
}

// The bound on a picker that never lands on the grid — not a wait any healthy
// open spends: measured readiness is 181ms median, 386ms worst over 80 opens on
// two contending workers, and a reopen adds ~150ms. It is sized off the *inner*
// open instead: `openColoringDialog` may spend its own 10s re-clicking a
// launcher whose handler isn't wired yet, so a cap anywhere near that number
// would cut the first attempt short before this helper ever reached its second
// one — truncating the very tolerance it is built on. Three of those budgets.
const COLORING_BOOK_GRID_TIMEOUT_MS = 30_000;

// Open the picker on its Coloring Book Grid — the cover menu, which only exists
// once a second book is installed.
//
// That installed set resolves asynchronously after load (a manifest fetch plus
// a store scan — coloringPacks/manager.ts), and a dialog opened before it lands
// shows the starter book's pages instead, by design: a fresh install has one
// book and drills straight into it (coloring-pack-download.spec.ts pins that
// view). Crucially the dialog then *stays* there — ColoringBook picks the view
// once per open (`onOpen`) and only re-picks it when the active book goes away
// — so no amount of waiting on that open reaches the grid, which is how the
// eight-viewport cover-geometry spec came to fail with the grid simply absent
// (issue #936). Reopen until an open lands on it: each attempt re-reads the
// installed set.
export async function openColoringBookGrid(page: Page) {
  const dialog = page.locator('#coloring-book-dialog');
  await retryOpen(
    dialog.locator('.coloring-books-grid .coloring-tile').first(),
    async () => {
      if (await dialog.isVisible().catch(() => false)) {
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden({ timeout: COLORING_DIALOG_CLOSE_SETTLE_MS });
      }
      await openColoringDialog(page);
    },
    { timeout: COLORING_BOOK_GRID_TIMEOUT_MS }
  );
}

// Slack past a lapsed dead-zone window; zones self-clear on the next query, so
// this only has to cover clock slop.
const TAP_GUARD_LAPSE_MARGIN_MS = 100;

// Idle past a launchGuard dead zone so the next click at a just-tapped point
// registers instead of being swallowed. A fixed sleep is the right tool here:
// the window is a known duration and a zone self-clears on the next query, so
// there is no state to poll.
export async function settleTapGuard(page: Page) {
  await page.waitForTimeout(LAUNCH_ZONE_DURATION_MS + TAP_GUARD_LAPSE_MARGIN_MS);
}

export async function openFarmPageGrid(page: Page) {
  const dialog = page.locator('#coloring-book-dialog');
  const pages = dialog.getByRole('button', { name: / coloring page$/i });
  await retryOpen(
    pages.first(),
    () => dialog.getByRole('button', { name: /Farm coloring book/i }).click({ timeout: 1000 }),
    { settle: 1000 }
  );
  await expect(dialog.getByRole('heading', { name: 'Farm', exact: true })).toBeVisible();
  // The cover tap that opened this grid armed a dead zone at its own point
  // (ColoringBook's double-tap guard) and a page tile now sits there, so an
  // immediate click on one is swallowed by design. Callers click straight after
  // this returns — idle past the window so none of them has to know.
  await settleTapGuard(page);
  return pages;
}

// Apply the first Farm page and wait for its ready-gated full-resolution
// overlay; that decoded line art enables the deferred fill.
export async function applyFarmPage(page: Page) {
  await openColoringDialog(page);
  const dialog = page.locator('#coloring-book-dialog');
  const farmPage = (await openFarmPageGrid(page)).first();
  await expect(async () => {
    if (await dialog.isVisible()) await farmPage.click();
    await expect(dialog).toBeHidden({ timeout: COLORING_DIALOG_CLOSE_SETTLE_MS });
  }).toPass({ timeout: COLORING_DIALOG_CLOSE_TIMEOUT_MS });
  await expect(page.locator('#coloringOverlay')).toHaveAttribute(
    'src',
    /\.(?:dark\.)?presentation\.webp$/,
    { timeout: COLORING_OVERLAY_DECODE_TIMEOUT_MS }
  );
  await expect(page.locator('#coloringOverlay')).toHaveAttribute(
    'data-canonical-url',
    /\.(?:dark\.)?overlay\.svg$/
  );
}
