import { expect, type Page } from '@playwright/test';

import { retryOpen } from './helpers';

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

export async function openFarmPageGrid(page: Page) {
  const dialog = page.locator('#coloring-book-dialog');
  const pages = dialog.getByRole('button', { name: /Farm coloring page/i });
  await retryOpen(
    pages.first(),
    () => dialog.getByRole('button', { name: /Farm coloring book/i }).click({ timeout: 1000 }),
    { settle: 1000 }
  );
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
    /\.(?:dark\.)?overlay\.webp$/,
    { timeout: COLORING_OVERLAY_DECODE_TIMEOUT_MS }
  );
}
