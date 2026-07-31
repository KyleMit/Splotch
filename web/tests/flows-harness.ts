import { expect, type Page } from '@playwright/test';

import { retryOpen } from './helpers';

// Layer 3 — full-UI end-to-end flows on the real app page. These exercise the
// Svelte component wiring (palette, action drawer, tool/stroke state, AI fetch,
// coloring overlay) that the engine-level specs (engine-*.spec.ts) deliberately
// bypasses. Interactions go through the real buttons; we drive the canvas with
// real pointer input and read back canvas pixels / reactive button state.

// The action drawer is collapsed by default (drawerOpen=false), so its buttons
// (brush menu, undo, screenshot, AI, coloring) aren't rendered until the chevron
// is tapped. The chevron also snaps next to the palette once its width is
// measured on mount, so it can shift on the first frame; retrying the tap rides
// that out and any first-click hydration lag under parallel load.
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

// Apply the first Farm page and wait for its overlay + colored fill to be ready.
export async function applyFarmPage(page: Page) {
  await openColoringDialog(page);
  const dialog = page.locator('#coloring-book-dialog');
  const farmPage = dialog.getByRole('button', { name: /Farm coloring page/i }).first();
  await retryOpen(
    farmPage,
    () => dialog.getByRole('button', { name: /Farm coloring book/i }).click({ timeout: 1000 }),
    { settle: 1000 }
  );
  await expect(async () => {
    if (await dialog.isVisible()) await farmPage.click();
    await expect(dialog).toBeHidden();
  }).toPass();
  // Wait for the art itself, not just the element: the src lands only once the
  // image has decoded (the ready-gated swap in DrawingCanvas).
  await expect(page.locator('#coloringOverlay')).toHaveAttribute('src', /\.webp$/);
}
