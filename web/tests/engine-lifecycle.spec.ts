import { count, drawStroke, expect, state, test } from './engine-harness';
import { LIVE_TILE_COUNT } from '../src/lib/drawing/liveTiles';

// ── teardown / re-init lifecycle (ADR-0004) ──────────────────────────────────
// Client-side navigation (`/` → `/privacy` → `/`) tears the engine down and
// re-inits it on a fresh canvas. Tiled drawing history
// persists across the cycle by design — a parent checking another page must not
// wipe the child's drawing — while pointer-input state must be reset by
// teardown().

test('the harness boots the template-owned tiled renderer', async ({ page }) => {
  const topology = await page.locator('#drawingCanvas').evaluate((canvas: HTMLCanvasElement) => ({
    inputBitmap: { width: canvas.width, height: canvas.height },
    liveTiles: canvas.parentElement!.querySelectorAll('canvas[data-live-tile]').length,
    crayonBottoms: canvas.parentElement!.querySelectorAll('canvas[data-live-crayon-bottom]').length,
    crayonTops: canvas.parentElement!.querySelectorAll('canvas[data-live-crayon-top]').length,
  }));

  expect(topology).toEqual({
    inputBitmap: { width: 1, height: 1 },
    liveTiles: LIVE_TILE_COUNT,
    crayonBottoms: LIVE_TILE_COUNT,
    crayonTops: LIVE_TILE_COUNT,
  });
});

test('the drawing persists across teardown + re-init (client-side navigation)', async ({
  page,
}) => {
  const box = await page.locator('#drawingCanvas').boundingBox();

  await drawStroke(page, box, [
    { x: 60, y: 60 },
    { x: 200, y: 120 },
  ]);
  expect(await count(page)).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.remount());

  // Rebuilt from retained tiled history onto the fresh init.
  expect(await count(page)).toBeGreaterThan(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(false);
  expect(s.canUndo).toBe(true);

  // The persisted tiled history is still live: undo reverts the pre-remount
  // stroke.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
  expect((await state(page)).canvasEmpty).toBe(true);
});

test('a pointer held through teardown cannot keep painting after remount', async ({ page }) => {
  // Navigating away mid-stroke tears the engine down with a finger still on the
  // glass. teardown() must commit the in-flight stroke and forget the pointer:
  // a stale activePointers entry would otherwise let hover moves paint when
  // the browser reuses the same pointerId after remount.
  const result = await page.evaluate(() => {
    const canvas = document.querySelector('#drawingCanvas') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const fire = (type: string, x: number, y: number, buttons: number) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 7,
          pointerType: 'mouse',
          buttons,
          clientX: rect.left + x,
          clientY: rect.top + y,
          bubbles: true,
          cancelable: true,
        })
      );
    // Mid-stroke when the teardown/re-init cycle lands…
    fire('pointerdown', 40, 40, 1);
    fire('pointermove', 100, 40, 1);
    window.__engine.remount();
    const afterRemount = window.__engine.nonTransparentCount();
    // …then the same pointerId comes back as plain hover moves (buttons 0).
    fire('pointermove', 100, 200, 0);
    fire('pointermove', 220, 200, 0);
    return {
      afterRemount,
      final: window.__engine.nonTransparentCount(),
      hoverPathAlpha: window.__engine.pixelAt(100, 120)[3],
    };
  });

  // The in-flight stroke was committed into the log, not lost.
  expect(result.afterRemount).toBeGreaterThan(0);
  // The reused pointer id painted nothing without a fresh pointerdown.
  expect(result.hoverPathAlpha).toBe(0);
  expect(result.final).toBe(result.afterRemount);
});
