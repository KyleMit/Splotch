import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { openDocument } from '../support/app.ts';

const PHONE = { width: 360, height: 740 };
const DESKTOP = { width: 1280, height: 800 };

const PAGES_WITH_A_SUFFIX = [
  { path: '/beta', mark: 'Splotch beta' },
  { path: '/admin', mark: 'Splotch Admin' },
] as const;

// The masthead's mark on a page that names itself ("Splotch beta") and on one that does not. The
// changelog's plain "Splotch" is the yardstick: on a phone a suffixed mark gives up the name and
// is narrower than it, and on a desktop it keeps the name and is wider.
async function markBox(page: Page, mark: string) {
  const link = page.getByRole('link', { name: mark, exact: true }).first();
  await expect(link).toBeVisible();
  const box = await link.boundingBox();
  if (!box) throw new Error(`${mark} is not laid out`);
  const fontSize = await link.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  return { width: box.width, lines: Math.round(box.height / fontSize) };
}

async function plainMark(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await openDocument(page, '/changelog');
  return markBox(page, 'Splotch');
}

for (const { path, mark } of PAGES_WITH_A_SUFFIX) {
  test.describe(`the ${path} brand mark`, () => {
    test('shows only its suffix, on one line, beside the back link on a phone', async ({
      page,
    }) => {
      const plain = await plainMark(page, PHONE);

      await openDocument(page, path);
      const box = await markBox(page, mark);

      expect(box.width, 'the suffix alone is narrower than the name alone').toBeLessThan(
        plain.width
      );
      expect(box.lines, 'lines of text').toBe(1);
    });

    test('shows the whole mark on a desktop', async ({ page }) => {
      const plain = await plainMark(page, DESKTOP);

      await openDocument(page, path);
      const box = await markBox(page, mark);

      expect(box.width, 'the whole mark is wider than the name alone').toBeGreaterThan(plain.width);
      expect(box.lines, 'lines of text').toBe(1);
    });
  });
}
