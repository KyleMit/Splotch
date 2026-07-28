import { expect, test, type Page } from '@playwright/test';
import { dragStroke } from './helpers';

// Engine-level tests. These drive the real imperative drawing engine through
// the /dev/engine harness (see src/routes/dev/engine), which mounts a real
// <canvas> via the same initDrawingCanvas() seam the app uses and exposes the
// engine API + pixel readers on window. Strokes are real Playwright pointer
// input on the canvas; undo/clear are invoked the way the app's buttons do.

/** Drag a stroke through the given canvas-space points using real mouse input. */
export async function drawStroke(
  page: Page,
  box: { x: number; y: number } | null,
  points: { x: number; y: number }[]
) {
  await dragStroke(page, box, points);
}

export const state = (page: Page) => page.evaluate(() => window.__engineState);
export const count = (page: Page) => page.evaluate(() => window.__engine.nonTransparentCount());

test.beforeEach(async ({ page }) => {
  // Navigate ONCE, then poll for readiness. The harness sets window.__engineReady
  // in onMount. Against the default `vite preview` build this settles on the
  // first poll; under DEV_SERVER=1 (`vite dev`) the first load can trigger a
  // dep-optimize full-reload, so we ride through it by polling (swallowing the
  // brief "execution context destroyed" while the reload is in flight). We must
  // NOT re-navigate while polling — a fresh goto each retry keeps interrupting
  // the reload before onMount can finish, which never converges.
  await page.goto('/dev/engine', { waitUntil: 'commit' });
  await expect(async () => {
    const ready = await page.evaluate(() => window.__engineReady === true).catch(() => false);
    expect(ready).toBe(true);
  }).toPass({ timeout: 30_000 });
});
