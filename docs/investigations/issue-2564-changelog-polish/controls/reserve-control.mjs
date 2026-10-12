import { chromium, expect } from '@playwright/test';
import { spawnViteServer } from '../../../../tools/lib/vite-server.mjs';
import { writeFileSync } from 'node:fs';
const server = spawnViteServer(5300, { command: 'preview', stdout: 'ignore', stderr: 'ignore' });
const browser = await chromium.launch();
const records = [];
try {
  await expect(async () =>
    expect((await fetch('http://localhost:5300/changelog')).ok).toBe(true)
  ).toPass({ timeout: 10000 });
  for (const reserve of [160, 96])
    for (const [width, height] of [
      [1280, 800],
      [1280, 600],
      [1280, 501],
      [320, 568],
      [812, 375],
    ])
      for (const route of ['changelog', 'privacy']) {
        const page = await browser.newPage({ viewport: { width, height } });
        await page.goto(`http://localhost:5300/${route}`);
        await page.locator('.lede-toggle').waitFor({ state: 'attached' });
        await page.evaluate(() => document.fonts.ready);
        if (route === 'changelog') {
          await expect(page.locator('.release-ago').first()).not.toHaveText('');
          await page.locator('.release-older summary').click();
        }
        if (reserve === 96)
          await page
            .locator('.page')
            .evaluate((el) => el.style.setProperty('--page-footer-reserve', '96px'));
        await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
        const selector = route === 'changelog' ? '#release-1-0-0' : '#contact';
        const toc =
          width <= 920 ? page.locator('.contents-disclosure') : page.locator('.contents-rail');
        await page.waitForTimeout(300);
        const record = await page.locator(selector).evaluate((el) => ({
          bottom: el.getBoundingClientRect().bottom,
          top: el.getBoundingClientRect().top,
          computedReserve: getComputedStyle(el).getPropertyValue('--page-footer-reserve').trim(),
        }));
        const active = await toc
          .locator('a[aria-current="location"]')
          .getAttribute('href')
          .catch(() => null);
        records.push({
          reserve,
          width,
          height,
          route,
          ...record,
          active,
          finalVisible: record.bottom >= 0,
          footerVisible: await page
            .locator('.page-footer')
            .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
        });
        await page.close();
      }
  console.log(JSON.stringify(records, null, 2));
} finally {
  writeFileSync(
    new URL('../../../../screenshots/issue-2564/reserve-control.json', import.meta.url),
    JSON.stringify(records, null, 2)
  );
  await browser.close();
  server.stop();
}
