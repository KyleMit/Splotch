import { expect, test } from '@playwright/test';

import {
  gotoAppWithInstalledColoringBook,
  MANIFEST_REQUEST,
  openColoringDialog,
  openDrawer,
  recordColoringRequests,
} from './flows-harness';
import { drawCommittedStroke, gotoApp, openSettingsModal } from './helpers';
import { booksForPlatform, STARTER_COLORING_BOOK_ID } from '../src/lib/state/books';
import { STORAGE_KEYS } from '../src/lib/storageKeys';

const WEB_COLORING_BOOK_COUNT = booksForPlatform('web').length;

// Proves a negative for longer than scheduleIdle's fallback window, so a
// download that was going to start at idle has had its chance to.
const IDLE_WORK_OBSERVATION_MS = 750;

// A file of a downloadable book: under /coloring/<book>/ or a responsive tier's
// /coloring/max-<n>px/<book>/, for any book but the precached starter.
function downloadedBookFiles(paths: string[]): string[] {
  return paths.filter((path) => {
    const segments = path.split('/').slice(2);
    const book = segments[0]?.startsWith('max-') ? segments[1] : segments[0];
    return (
      segments.length > 1 && !!book && !book.includes('.') && book !== STARTER_COLORING_BOOK_ID
    );
  });
}

test('a saved disabled setting blocks pack boot until coloring books are enabled', async ({
  page,
}) => {
  let manifestRequests = 0;
  page.on('request', (request) => {
    if (MANIFEST_REQUEST.test(request.url())) manifestRequests++;
  });
  await gotoAppWithInstalledColoringBook(page, 'dinosaur');
  await page.evaluate(
    (key) => localStorage.setItem(key, 'false'),
    STORAGE_KEYS.coloringBookEnabled
  );
  // Leave the enabled document before counting so its already-scheduled downloader
  // cannot be mistaken for work started by the disabled cold boot.
  await page.goto('about:blank');
  manifestRequests = 0;

  await gotoApp(page);
  await openDrawer(page);

  await expect(page.locator('html')).toHaveAttribute('data-off-coloring', '');
  await expect(page.locator('html')).toHaveCSS('--action-btn-count', '4');
  await expect(page.locator('#coloringBookButton')).toBeHidden();

  // This proves a negative over longer than scheduleIdle's fallback window: a
  // slower worker only lengthens the observation and cannot create a false pass.
  await page.waitForTimeout(500);
  expect(manifestRequests).toBe(0);

  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'Coloring', exact: true }).click();
  await expect(
    settings.getByText('Storage details are unavailable while coloring books are off')
  ).toBeVisible();
  await expect(settings.locator('#coloringPacksMeteredToggle')).toBeDisabled();
  await expect(settings.getByRole('button', { name: 'Remove downloaded pictures' })).toBeEnabled();
  await settings.locator('#coloringBookToggle').click();

  await expect(page.locator('#coloringBookButton')).toBeVisible();
  await expect.poll(() => manifestRequests).toBeGreaterThan(0);
});

// Chromium on desktop reports neither Save-Data nor a cellular link, so each
// connection the download policy refuses is installed over navigator.connection
// before any page script runs.
const METERED_CONNECTIONS = [
  { name: 'Save-Data', connection: { saveData: true, type: 'wifi', effectiveType: '4g' } },
  { name: 'cellular', connection: { saveData: false, type: 'cellular', effectiveType: '4g' } },
  { name: '2g', connection: { saveData: false, type: 'unknown', effectiveType: '2g' } },
];
for (const { name, connection } of METERED_CONNECTIONS) {
  test(`books already downloaded show in the picker on a ${name} connection without new downloads`, async ({
    page,
  }) => {
    await page.addInitScript((fields) => {
      const network = Object.assign(new EventTarget(), fields);
      Object.defineProperty(Navigator.prototype, 'connection', {
        configurable: true,
        get: () => network,
      });
    }, connection);
    const coloringRequests = recordColoringRequests(page);
    await gotoAppWithInstalledColoringBook(page, 'dinosaur');
    await openDrawer(page);

    const dialog = page.locator('#coloring-book-dialog');
    // An open that beats the installed-book scan shows the starter's pages, and
    // the scan's books join at the next open.
    await expect(async () => {
      if (await dialog.isVisible()) {
        await dialog.getByRole('button', { name: 'Close' }).click({ timeout: 2000 });
        await dialog.waitFor({ state: 'hidden', timeout: 2000 });
      }
      await openColoringDialog(page);
      await expect(dialog.getByRole('heading', { name: 'Coloring Books' })).toBeVisible({
        timeout: 2000,
      });
    }).toPass({ timeout: 30_000 });
    await expect(dialog.getByRole('button', { name: 'Dinosaurs coloring book' })).toBeVisible();

    await page.waitForTimeout(IDLE_WORK_OBSERVATION_MS);
    expect(
      downloadedBookFiles(coloringRequests).filter((path) => !path.includes('/dinosaur/'))
    ).toEqual([]);
  });
}

test('a visit nobody engages with downloads no coloring packs', async ({ page }) => {
  const coloringRequests = recordColoringRequests(page);
  await gotoApp(page);

  // The boot publishes "nothing downloaded" from Cache Storage alone, before any
  // manifest request, so the Coloring section reading it is the positive
  // signal that the gate has already decided.
  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'Coloring', exact: true }).click();
  await expect(
    settings.getByText(new RegExp(`^0 of ${WEB_COLORING_BOOK_COUNT - 1} extra books`))
  ).toBeVisible();
  await page.waitForTimeout(IDLE_WORK_OBSERVATION_MS);

  expect(coloringRequests).toEqual([]);
});

test('the stroke that settles the child in starts the downloads', async ({ page }) => {
  const coloringRequests = recordColoringRequests(page);
  await gotoApp(page);

  // SETTLED_IN_STROKES (lib/state/canvas.svelte.ts) is three; its module runs
  // runes at load, so the count is spelled out here as pwa-registration.spec.ts
  // spells it for the service worker's gate.
  for (const offset of [0, 60]) {
    await drawCommittedStroke(page, [
      { x: 140, y: 140 + offset },
      { x: 280, y: 180 + offset },
    ]);
  }
  await page.waitForTimeout(IDLE_WORK_OBSERVATION_MS);
  expect(downloadedBookFiles(coloringRequests)).toEqual([]);

  await drawCommittedStroke(page, [
    { x: 140, y: 260 },
    { x: 280, y: 300 },
  ]);
  await expect
    .poll(() => downloadedBookFiles(coloringRequests).length, { timeout: 15_000 })
    .toBeGreaterThan(0);
});

test('opening the coloring picker starts the downloads', async ({ page }) => {
  const coloringRequests = recordColoringRequests(page);
  await gotoApp(page);
  await openDrawer(page);
  await page.waitForTimeout(IDLE_WORK_OBSERVATION_MS);
  expect(downloadedBookFiles(coloringRequests)).toEqual([]);

  await openColoringDialog(page);
  await expect
    .poll(() => downloadedBookFiles(coloringRequests).length, { timeout: 15_000 })
    .toBeGreaterThan(0);
});
