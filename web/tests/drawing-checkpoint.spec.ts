import { expect, test, type Page } from '@playwright/test';
import {
  applyFarmPage,
  clearViaGesture,
  opaqueCanvasPixelCount,
  openDrawer,
} from './flows-harness';
import { drawCommittedStroke, gotoApp } from './helpers';

// ADR-0178: the picture in progress survives the app's process ending. A reload is the closest a
// browser test gets to the OS ending the app: the page, its engine and its memory are gone, and
// only what reached IndexedDB comes back.

// The checkpoint is written CHECKPOINT_QUIET_MS after the last change; a starved worker gets
// generous headroom past it.
const CHECKPOINT_WRITTEN_TIMEOUT_MS = 15_000;
// How long a blank page is watched after a relaunch to prove nothing comes back: longer than a
// restore takes once the drawing route has mounted.
const NO_RESTORE_WATCH_MS = 3_000;

// The record the app stored, summarized, or null. The database is opened only once it exists: an
// open from here would create it without the app's object store, which the app never adds later.
function storedCheckpoint(page: Page) {
  return page.evaluate(async () => {
    const databases = await indexedDB.databases();
    if (!databases.some(({ name }) => name === 'splotch-drawing-checkpoint')) return null;
    return new Promise<{ bytes: number; page: unknown } | null>((resolve, reject) => {
      const open = indexedDB.open('splotch-drawing-checkpoint');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('checkpoint')) {
          db.close();
          resolve(null);
          return;
        }
        const read = db.transaction('checkpoint').objectStore('checkpoint').get('current');
        read.onerror = () => reject(read.error);
        read.onsuccess = () => {
          db.close();
          const value = read.result as { bytes: ArrayBuffer; page: unknown } | undefined;
          resolve(value ? { bytes: value.bytes.byteLength, page: value.page } : null);
        };
      };
    });
  });
}

const STROKE = [
  { x: 160, y: 160 },
  { x: 260, y: 220 },
  { x: 360, y: 180 },
];

test('a drawing comes back after the app relaunches', async ({ page }) => {
  await gotoApp(page);
  await drawCommittedStroke(page, STROKE);
  const inked = await opaqueCanvasPixelCount(page);
  await expect
    .poll(() => storedCheckpoint(page), { timeout: CHECKPOINT_WRITTEN_TIMEOUT_MS })
    .toMatchObject({ page: null });

  await gotoApp(page);

  await expect.poll(() => opaqueCanvasPixelCount(page)).toBe(inked);
  await expect(page.locator('#undoButton')).toBeDisabled();
});

test('a cleared page stays blank after the app relaunches', async ({ page }) => {
  await gotoApp(page);
  await drawCommittedStroke(page, STROKE);
  await expect
    .poll(() => storedCheckpoint(page), { timeout: CHECKPOINT_WRITTEN_TIMEOUT_MS })
    .not.toBeNull();

  await clearViaGesture(page);
  await expect
    .poll(() => storedCheckpoint(page), { timeout: CHECKPOINT_WRITTEN_TIMEOUT_MS })
    .toBeNull();
  await gotoApp(page);
  await page.waitForTimeout(NO_RESTORE_WATCH_MS);

  expect(await opaqueCanvasPixelCount(page)).toBe(0);
});

test('a coloring page comes back with the drawing on it', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);
  await applyFarmPage(page);
  await drawCommittedStroke(page, STROKE);
  const inked = await opaqueCanvasPixelCount(page);
  await expect
    .poll(() => storedCheckpoint(page), { timeout: CHECKPOINT_WRITTEN_TIMEOUT_MS })
    .toMatchObject({ page: { id: expect.any(String) } });

  await gotoApp(page);

  await expect(page.locator('#coloringOverlay')).toBeVisible();
  await expect.poll(() => opaqueCanvasPixelCount(page)).toBe(inked);
});
