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

// Select a brush from the Brush Menu by its entry id (e.g. '#eraserButton',
// '#magicBrushButton'). Selecting closes the flyout.
export async function pickBrush(page: Page, id: string) {
  await openBrushMenu(page);
  await page.locator(id).click();
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
  await dialog.getByRole('button', { name: /Farm coloring book/i }).click();
  await dialog
    .getByRole('button', { name: /Farm coloring page/i })
    .first()
    .click();
  await expect(dialog).toBeHidden();
  // Wait for the art itself, not just the element: the src lands only once the
  // image has decoded (the ready-gated swap in DrawingCanvas).
  await expect(page.locator('#coloringOverlay')).toHaveAttribute('src', /\.webp$/);
}
