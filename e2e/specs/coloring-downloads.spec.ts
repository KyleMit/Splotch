import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { waitForDrawingScreen } from '../support/app.ts';
import {
  ALL_BOOKS_STORED_TEST_TIMEOUT_MS,
  ALL_BOOKS_STORED_TIMEOUT_MS,
  openDrawer,
  openSettingsSection,
} from '../support/group-a.ts';

// Every file of a book that is not the starter, which the export carries inside the app.
const COLORING_ROOT = '/coloring/';
// How long a visit is watched for downloads that should not start: past the idle gap a download
// scheduled at load would have used, so a slower worker only lengthens the watch.
const IDLE_WORK_OBSERVATION_MS = 750;
const DOWNLOAD_START_TIMEOUT_MS = 15_000;
// The third stroke settles a child in and starts the downloads; two do not.
const STROKES_THAT_SETTLE_IN = 3;
const STROKE_ROW_SPACING_PX = 60;

const METERED_CONNECTIONS = [
  { name: 'Save-Data', connection: { saveData: true, type: 'wifi', effectiveType: '4g' } },
  { name: 'cellular', connection: { saveData: false, type: 'cellular', effectiveType: '4g' } },
  { name: '2g', connection: { saveData: false, type: 'unknown', effectiveType: '2g' } },
];

function recordColoringRequests(page: Page): string[] {
  const paths: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith(COLORING_ROOT)) paths.push(pathname);
  });
  return paths;
}

// Draws the strokes numbered from `first` up to, not including, `end`, each a row below the last.
async function drawStrokes(
  page: Page,
  paper: ReturnType<Page['getByTestId']>,
  first: number,
  end: number
) {
  const box = await paper.boundingBox();
  if (!box) throw new Error('The drawing paper is not laid out');
  for (let stroke = first; stroke < end; stroke++) {
    const y = box.y + box.height * 0.3 + stroke * STROKE_ROW_SPACING_PX;
    await page.mouse.move(box.x + box.width * 0.3, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, y + 30, { steps: 6 });
    await page.mouse.up();
  }
}

async function readDownloadedBooks(page: Page) {
  const section = await openSettingsSection(page, 'Coloring');
  return { section, summary: section.getByText(/ extra books/) };
}

test.describe('the coloring books a visit downloads', () => {
  test('are none at all for a visit nobody engages with', async ({ page }) => {
    const requests = recordColoringRequests(page);
    await page.goto('/');
    await waitForDrawingScreen(page);

    const { summary } = await readDownloadedBooks(page);
    await expect(summary).toHaveText(/^0 of \d+ extra books/);
    await page.waitForTimeout(IDLE_WORK_OBSERVATION_MS);

    expect(requests).toEqual([]);
  });

  test('start with the stroke that settles the child in, not the one before', async ({
    drawingScreen,
  }) => {
    const { page, paper } = drawingScreen;
    const requests = recordColoringRequests(page);
    await drawingScreen.pickColor('Black');

    await drawStrokes(page, paper, 0, STROKES_THAT_SETTLE_IN - 1);
    await page.waitForTimeout(IDLE_WORK_OBSERVATION_MS);
    expect(requests).toEqual([]);

    await drawStrokes(page, paper, STROKES_THAT_SETTLE_IN - 1, STROKES_THAT_SETTLE_IN);
    await expect
      .poll(() => requests.length, { timeout: DOWNLOAD_START_TIMEOUT_MS })
      .toBeGreaterThan(0);
  });

  test('start when the coloring picker is opened', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    const requests = recordColoringRequests(page);
    await openDrawer(page);
    await page.waitForTimeout(IDLE_WORK_OBSERVATION_MS);
    expect(requests).toEqual([]);

    await page.getByRole('button', { name: 'Coloring books', exact: true }).click();

    await expect
      .poll(() => requests.length, { timeout: DOWNLOAD_START_TIMEOUT_MS })
      .toBeGreaterThan(0);
  });

  test('are all stored once a settled-in child has waited for them', async ({ drawingScreen }) => {
    test.setTimeout(ALL_BOOKS_STORED_TEST_TIMEOUT_MS);
    const { page, paper } = drawingScreen;
    await drawingScreen.pickColor('Black');
    await drawStrokes(page, paper, 0, STROKES_THAT_SETTLE_IN);

    const { summary } = await readDownloadedBooks(page);

    await expect(summary).toHaveText(/^(\d+) of \1 extra books/, {
      timeout: ALL_BOOKS_STORED_TIMEOUT_MS,
    });
  });

  for (const { name, connection } of METERED_CONNECTIONS) {
    test(`wait on a ${name} connection until the parent allows mobile data`, async ({ page }) => {
      await page.addInitScript((fields) => {
        const network = Object.assign(new EventTarget(), fields);
        Object.defineProperty(Navigator.prototype, 'connection', {
          configurable: true,
          get: () => network,
        });
      }, connection);
      const requests = recordColoringRequests(page);
      await page.goto('/');
      await waitForDrawingScreen(page);
      const paper = page.getByTestId('drawing-paper');
      await drawStrokes(page, paper, 0, STROKES_THAT_SETTLE_IN);
      await page.waitForTimeout(IDLE_WORK_OBSERVATION_MS);
      expect(requests).toEqual([]);

      const { section, summary } = await readDownloadedBooks(page);
      await expect(summary).toHaveText(/^0 of \d+ extra books/);
      await section.getByRole('switch', { name: 'Download over mobile data' }).click();

      await expect
        .poll(() => requests.length, { timeout: DOWNLOAD_START_TIMEOUT_MS })
        .toBeGreaterThan(0);
    });
  }

  test('are not started while coloring books are switched off, and are once they are back on', async ({
    drawingScreen,
  }) => {
    const { page, paper } = drawingScreen;
    const requests = recordColoringRequests(page);
    const { section } = await readDownloadedBooks(page);
    const coloring = section.getByRole('switch', { name: 'Coloring book', exact: true });
    await coloring.click();
    await expect(coloring).not.toBeChecked();
    await section.getByRole('button', { name: 'Close', exact: true }).click();
    await drawingScreen.pickColor('Black');
    await drawStrokes(page, paper, 0, STROKES_THAT_SETTLE_IN);
    await openDrawer(page);

    await expect(page.getByRole('button', { name: 'Coloring books', exact: true })).toBeHidden();
    await page.waitForTimeout(IDLE_WORK_OBSERVATION_MS);
    expect(requests).toEqual([]);

    const reopened = await openSettingsSection(page, 'Coloring');
    await reopened.getByRole('switch', { name: 'Coloring book', exact: true }).click();
    await reopened.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Coloring books', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Coloring books', exact: true }).click();

    await expect
      .poll(() => requests.length, { timeout: DOWNLOAD_START_TIMEOUT_MS })
      .toBeGreaterThan(0);
  });
});
