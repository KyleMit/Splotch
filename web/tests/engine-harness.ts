import { expect, test as base, type Page } from '@playwright/test';
import { dragStroke } from './helpers';

// Engine-level tests. These drive the real imperative drawing engine through
// the /dev/engine harness (see src/routes/dev/engine), which mounts a real
// <canvas> via the same initDrawingCanvas() seam the app uses and exposes the
// engine API + pixel readers on window. Strokes are real Playwright pointer
// input on the canvas; undo/clear are invoked the way the app's buttons do.
//
// Specs import `test` (and `expect`) from HERE, not from '@playwright/test':
// the navigate-and-wait-for-`__engineReady` step is a `page` fixture override,
// so a spec that imports the plain `test` silently runs against about:blank.
// scripts/tests/e2e-harness-imports.test.mjs enforces the import.

/** Drag a stroke through the given canvas-space points using real mouse input. */
export async function drawStroke(
  page: Page,
  box: { x: number; y: number; width: number; height: number } | null,
  points: { x: number; y: number }[]
) {
  await dragStroke(page, box, points);
}

export const state = (page: Page) => page.evaluate(() => window.__engineState);
export const count = (page: Page) => page.evaluate(() => window.__engine.nonTransparentCount());
export const alphaAt = (page: Page, x: number, y: number) =>
  page.evaluate(([px, py]) => window.__engine.pixelAt(px, py)[3], [x, y] as const);

// Navigate ONCE, then poll for readiness. The harness sets window.__engineReady
// in onMount. Against the default `vite preview` build this settles on the
// first poll; under DEV_SERVER=1 (`vite dev`) the first load can trigger a
// dep-optimize full-reload, so we ride through it by polling (swallowing the
// brief "execution context destroyed" while the reload is in flight). We must
// NOT re-navigate while polling — a fresh goto each retry keeps interrupting
// the reload before onMount can finish, which never converges.
async function openEngineHarness(page: Page) {
  await page.goto('/dev/engine', { waitUntil: 'commit' });
  await expect(async () => {
    const ready = await page.evaluate(() => window.__engineReady === true).catch(() => false);
    expect(ready).toBe(true);
  }).toPass({ timeout: 30_000 });
}

// A fixture, not a module-scope `test.beforeEach`. A hook registered while this
// module is evaluated attaches to whichever spec file happened to trigger that
// evaluation — and Node caches the module, so every LATER spec file loaded by
// the same worker got no hook at all and ran against about:blank (issue #624:
// ~12 failures whose signature was a missing #engineCanvas or an undefined
// window.__engine). Fixtures are resolved per test, so they can't be skipped
// this way.
export const test = base.extend({
  page: async ({ page }, use) => {
    await openEngineHarness(page);
    await use(page);
  },
});

export { expect };
