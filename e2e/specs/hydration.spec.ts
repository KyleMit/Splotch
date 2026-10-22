import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { openDocument, waitForDrawingScreen } from '../support/app.ts';
import { expectWired } from '../support/group-a.ts';

// The export paints a prerendered document and React hydrates it. A hydration mismatch does not
// stop the app, so it goes unseen: React logs it and starts the screen over, which throws away the
// prerendered frame and the early input the shell was holding. The production build words it as a
// minified error number (418, 423 or 425) or with the word itself.
const HYDRATION_MESSAGE = /hydrat|minified react error #4(18|23|25)|did not match/i;
// How long a page is watched after it is live: hydration errors surface as it commits.
const HYDRATION_WATCH_MS = 750;

const DOCUMENTS = [
  { path: '/privacy', ready: (page: Page) => page.getByRole('heading', { level: 1 }) },
  { path: '/changelog', ready: (page: Page) => page.getByRole('heading', { level: 1 }) },
  { path: '/beta', ready: (page: Page) => page.getByRole('radio', { name: 'Android' }) },
  { path: '/feedback', ready: (page: Page) => page.getByRole('radio', { name: 'I have an idea' }) },
  { path: '/design', ready: (page: Page) => page.getByRole('radio', { name: 'Dark' }).first() },
  { path: '/admin', ready: (page: Page) => page.getByRole('heading', { name: 'Sign in' }) },
] as const;

function watchHydration(page: Page): string[] {
  const reports: string[] = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type()) && HYDRATION_MESSAGE.test(message.text()))
      reports.push(message.text());
  });
  page.on('pageerror', (error) => {
    if (HYDRATION_MESSAGE.test(error.message)) reports.push(error.message);
  });
  return reports;
}

test.describe('hydrating the prerendered documents', () => {
  test('the drawing screen adopts its first frame without a hydration error', async ({ page }) => {
    const reports = watchHydration(page);
    await openDocument(page, '/');
    await waitForDrawingScreen(page);
    await page.waitForTimeout(HYDRATION_WATCH_MS);

    expect(reports).toEqual([]);
  });

  for (const { path, ready } of DOCUMENTS) {
    test(`${path} hydrates without a hydration error`, async ({ page }) => {
      const reports = watchHydration(page);
      await openDocument(page, path);
      await expectWired(ready(page));
      await page.waitForTimeout(HYDRATION_WATCH_MS);

      expect(reports).toEqual([]);
    });
  }
});
