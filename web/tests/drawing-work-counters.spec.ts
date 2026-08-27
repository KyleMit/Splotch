import { expect, test, type Page } from '@playwright/test';

import { gotoApp } from './helpers';
import { openDrawer, pickBrush } from './flows-harness';

const DEVICE_SCALE_FACTOR = 2;
const COUNTER_STROKE_MOVE_STEPS = 12;

// This spec uses Chromium-emulated geometry, including the iPad-shaped viewport; it validates
// deterministic renderer work and memory shapes, not WebKit behavior or physical-device timing.

// ADR-0085 found that more than sixteen cells worsens WebKit's per-surface overhead and seam risk;
// this independent ceiling must not track a finer grid from production constants.
const MAX_LIVE_SURFACE_ELEMENTS = 48;
const MAX_REALIZED_NORMAL_BACKINGS = 16;

// The restamp renderer deposits wax on the normal tiles and never realizes the vestigial preview
// planes (crayonPassBuffer.ts). Any realized crayon backing means the plane path came back.
const MAX_REALIZED_CRAYON_BACKINGS = 0;

// The fixed protocol input is one start dot plus twelve pointer moves. A scheduler cannot change
// the protocol event count, so any extra op is engine work rather than timing noise.
const MAX_INPUT_OPS_PER_STROKE = 13;

// Three diagonal corner crossings intentionally visit four cells; no op in this scenario needs to
// rasterize into the rest of the grid.
const MAX_SURFACE_VISITS_PER_OP = 4;

// The retained 4×4 culling shape rasterizes thirteen input ops twenty-two times after counting the
// three four-cell seam crossings. A higher total catches lost culling or added seam overdraw.
const MAX_RASTERIZED_OPS_PER_STROKE = 22;

// One committed command owns one undo-stack entry and at most one entry with live patch rasters.
const MAX_UNDO_SNAPSHOTS_PER_COMMAND = 1;
const MAX_UNDO_PATCH_RASTERS_PER_COMMAND = 1;

const RGBA_BYTES_PER_PIXEL = 4;

// ADR-0085's repeated physical-iPad campaign found 1.565 Mpx repeatably starvation-free and
// 2.346 Mpx unsafe. This is the measured upper bound every supported geometry must remain under.
const MAX_MEASURED_SAFE_SURFACE_BYTES = 1_565_000 * RGBA_BYTES_PER_PIXEL;

// Exact output of the fixed 4×4 topology and input at each supported geometry. These are ceilings,
// not baselines with tolerance: deterministic reductions pass, while one extra backing pixel or
// undo-patch pixel fails.
const BYTE_CEILINGS = {
  phone: {
    maxLiveBackingBytes: 346_080,
    totalLiveBackingBytes: 6_229_440,
    undoPatchBytes: 905_168,
  },
  tablet: {
    maxLiveBackingBytes: 729_600,
    totalLiveBackingBytes: 13_120_512,
    undoPatchBytes: 1_870_640,
  },
  ipadPro12: {
    maxLiveBackingBytes: 1_174_312,
    totalLiveBackingBytes: 21_117_104,
    undoPatchBytes: 2_994_012,
  },
} as const;

const VIEWPORTS = [
  { key: 'phone', label: 'phone', viewport: { width: 412, height: 915 } },
  { key: 'tablet', label: 'tablet', viewport: { width: 768, height: 1024 } },
  { key: 'ipadPro12', label: 'iPad Pro 12.9', viewport: { width: 1366, height: 915 } },
] as const;

async function drawingWork(page: Page) {
  return page.evaluate(() => window.__drawingDebug?.getDrawingWorkDebug() ?? null);
}

async function drawCounterStroke(page: Page) {
  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) throw new Error('drawing canvas has no bounds');
  await page.mouse.move(box.x + box.width / 8, box.y + box.height / 8);
  await page.mouse.down();
  await page.mouse.move(box.x + (box.width * 7) / 8, box.y + (box.height * 7) / 8, {
    steps: COUNTER_STROKE_MOVE_STEPS,
  });
  await page.mouse.up();
}

async function realizeOneCrayonTile(page: Page) {
  await openDrawer(page);
  await pickBrush(page, '#crayonBrushButton');
  const box = await page.locator('#drawingCanvas').boundingBox();
  if (!box) throw new Error('drawing canvas has no bounds');
  await page.mouse.click(box.x + (box.width * 3) / 8, box.y + (box.height * 3) / 8);
}

for (const profile of VIEWPORTS) {
  test.describe(profile.label, () => {
    test.use({ viewport: profile.viewport, deviceScaleFactor: DEVICE_SCALE_FACTOR });

    test('drawing work stays inside deterministic counter ceilings', async ({ page }) => {
      await gotoApp(page);
      await expect
        .poll(async () => {
          const work = await drawingWork(page);
          return Boolean(work && work.liveSurfaceElements > 0 && !work.backingMigrationPending);
        })
        .toBe(true);

      await drawCounterStroke(page);
      const penWork = await drawingWork(page);
      const undo = await page.evaluate(() => window.__drawingDebug?.getUndoDebug());
      await realizeOneCrayonTile(page);
      const withCrayon = await drawingWork(page);
      if (!penWork?.lastCommand || !undo || !withCrayon) {
        throw new Error('drawing work counters were not exposed by the test build');
      }
      const byteCeilings = BYTE_CEILINGS[profile.key];

      expect(withCrayon.liveSurfaceElements).toBeLessThanOrEqual(MAX_LIVE_SURFACE_ELEMENTS);
      expect(withCrayon.realizedNormalBackings).toBe(MAX_REALIZED_NORMAL_BACKINGS);
      expect(withCrayon.realizedCrayonBackings).toBe(MAX_REALIZED_CRAYON_BACKINGS);
      expect(withCrayon.maxLiveBackingBytes).toBeLessThanOrEqual(byteCeilings.maxLiveBackingBytes);
      expect(withCrayon.maxLiveBackingBytes).toBeLessThanOrEqual(MAX_MEASURED_SAFE_SURFACE_BYTES);
      expect(withCrayon.totalLiveBackingBytes).toBeLessThanOrEqual(
        byteCeilings.totalLiveBackingBytes
      );

      expect(penWork.lastCommand.inputOps).toBeLessThanOrEqual(MAX_INPUT_OPS_PER_STROKE);
      expect(penWork.lastCommand.maxSurfaceVisitsPerOp).toBeLessThanOrEqual(
        MAX_SURFACE_VISITS_PER_OP
      );
      expect(penWork.lastCommand.rasterizedOps).toBeLessThanOrEqual(MAX_RASTERIZED_OPS_PER_STROKE);
      expect(penWork.lastCommand.rasterizedOps).toBeGreaterThan(penWork.lastCommand.inputOps);

      expect(undo.snapshots).toBeLessThanOrEqual(MAX_UNDO_SNAPSHOTS_PER_COMMAND);
      expect(undo.liveRasters).toBeLessThanOrEqual(MAX_UNDO_PATCH_RASTERS_PER_COMMAND);
      expect(undo.patchBytes).toBeLessThanOrEqual(byteCeilings.undoPatchBytes);
    });
  });
}
