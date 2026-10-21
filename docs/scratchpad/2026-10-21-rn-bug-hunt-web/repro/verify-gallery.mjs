import { chromium, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
const out = resolve('docs/scratchpad/2026-10-21-rn-bug-hunt-web');
const browser = await chromium.connect('ws://127.0.0.1:6190/');
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage(),
    errors = [],
    blocked = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await context.route('**/*', (r) => {
    const url = new URL(r.request().url());
    if (url.protocol === 'file:') return r.continue();
    blocked.push(url.href);
    return r.abort('blockedbyclient');
  });
  await page.goto(pathToFileURL(`${out}/evidence/visual/index.html`).href);
  await expect(page.locator('#title')).toContainText('chromium/');
  await expect(page.locator('img')).toHaveCount(3);
  for (const [id, value] of [
    ['engine', 'webkit'],
    ['viewport', 'phone-320x568'],
    ['theme', 'dark'],
    ['style', 'bare'],
    ['size', '130'],
    ['state', 'settings'],
  ])
    await page.locator('#' + id).selectOption(value);
  const selected = 'webkit/phone-320x568/dark-bare-130/settings';
  await expect(page.locator('#title')).toHaveText(selected);
  await expect
    .poll(() =>
      page
        .locator('img')
        .evaluateAll((images) =>
          images.every((i) => i.complete && i.naturalWidth === 320 && i.naturalHeight === 568)
        )
    )
    .toBe(true);
  await expect(page.locator('#boxes')).toContainText('settings-control:appearance');
  await page.screenshot({ path: `${out}/evidence/visual/gallery-validation.png` });
  await page.locator('#viewport').selectOption('tablet-820x1180');
  await expect(page.locator('#title')).toHaveText('No matching pairs');
  await expect(page.locator('img')).toHaveCount(0);
  await expect(page.locator('#position')).toContainText('0 / 0');
  await expect(page.getByRole('button', { name: 'Next pair', exact: true })).toBeDisabled();
  await page.locator('#viewport').selectOption('phone-320x568');
  await expect(page.locator('#title')).toHaveText(selected);
  await page.locator('#engine').selectOption('All');
  const first = await page.locator('#title').innerText();
  await page.getByRole('button', { name: 'Next pair', exact: true }).click();
  await expect(page.locator('#title')).not.toHaveText(first);
  await page.getByRole('button', { name: 'Previous pair', exact: true }).click();
  await expect(page.locator('#title')).toHaveText(first);
  expect(errors).toEqual([]);
  expect(blocked).toEqual([]);
  writeFileSync(
    `${out}/evidence/gallery-verification.json`,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        browserVersion: browser.version(),
        selected,
        threeOriginalSizeImagesLoaded: true,
        filtersWork: true,
        pagingWorks: true,
        excludedCombinationsClearOldImages: true,
        boxDetailsShown: true,
        pageErrors: errors,
        blockedExternalRequests: blocked,
      },
      null,
      2
    ) + '\n'
  );
  await context.close();
  console.log('Gallery filters, images, box details and paging pass.');
} finally {
  await browser.close();
}
