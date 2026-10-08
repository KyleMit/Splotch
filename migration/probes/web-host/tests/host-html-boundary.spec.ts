import { test, expect } from '@playwright/test';
import { assertInitialPrerenderBoundary } from '../host/prerenderBoundary';

test('accepts initial two Svelte empty anchors around a React fragment with its nonempty separator', async ({
  page,
}) => {
  await page.setContent('<div id="inner"><!----><p>Drawing<!-- --> state pending</p><!----></div>');
  await expect(
    page.locator('#inner').evaluate(assertInitialPrerenderBoundary)
  ).resolves.toBeUndefined();
});

test('rejects an interior malformed-empty comment through the real browser DOM reader', async ({
  page,
}) => {
  await page.setContent('<div id="inner"><!----><p>one<!-->two</p><!----></div>');
  await expect(page.locator('#inner').evaluate(assertInitialPrerenderBoundary)).rejects.toThrow(
    /interior empty Comment/
  );
});

test('rejects missing or nonempty first and last delimiters before hydration', async ({ page }) => {
  for (const html of [
    '<p>pending</p><!---->',
    '<!----><p>pending</p>',
    '<!--not empty--><p>pending</p><!---->',
    '<!---->',
  ]) {
    await page.setContent(`<div id="inner">${html}</div>`);
    await expect(page.locator('#inner').evaluate(assertInitialPrerenderBoundary)).rejects.toThrow(
      /two exact empty Comment/
    );
  }
});
