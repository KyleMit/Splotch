import { expect, test } from '@playwright/test';
import {
  PAGE_SHARE_CARDS,
  SHARE_CARD_PATH_PARAM,
  SHARE_CARD_SIZE,
} from '../src/lib/components/page/socialCard';
import { QUICKSAND_FONT_FAMILY } from '../src/lib/fonts';

const SHARE_CARD_HARNESS = '/dev/share-cards';

for (const [path, card] of Object.entries(PAGE_SHARE_CARDS)) {
  test(`${path} renders a complete fixed light share card`, async ({ page }) => {
    await page.setViewportSize(SHARE_CARD_SIZE);
    const query = new URLSearchParams({ [SHARE_CARD_PATH_PARAM]: path });
    await page.goto(`${SHARE_CARD_HARNESS}?${query}`);
    await expect(page.locator('h1')).toHaveText(card.name);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    const assets = await page.evaluate(async (family) => {
      const fonts = await document.fonts.load(`700 120px "${family}"`);
      await document.fonts.ready;
      const paper = document.querySelector('.paper');
      if (!paper) throw new Error('Missing paper');
      const src = /^url\(["']?(.*?)["']?\)$/.exec(getComputedStyle(paper).backgroundImage)?.[1];
      if (!src) throw new Error('Missing texture');
      const texture = new Image();
      texture.src = src;
      await texture.decode();
      await Promise.all(
        [...document.querySelectorAll<HTMLImageElement>('.share-card img')].map((img) =>
          img.decode()
        )
      );
      return { fonts: fonts.length, textureWidth: texture.naturalWidth };
    }, QUICKSAND_FONT_FAMILY);
    expect(assets.fonts).toBeGreaterThan(0);
    expect(assets.textureWidth).toBeGreaterThan(0);
    const bounds = await page.locator('.share-card').boundingBox();
    expect(bounds).toEqual({ x: 0, y: 0, ...SHARE_CARD_SIZE });
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));
    expect(dimensions).toEqual(SHARE_CARD_SIZE);
    const light = await page.screenshot();
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    expect(await page.screenshot()).toEqual(light);
  });
}

for (const input of ['', '/unknown', '/privacy/', '__proto__']) {
  test(`share-card harness rejects invalid path ${JSON.stringify(input)}`, async ({ request }) => {
    const query = new URLSearchParams({ [SHARE_CARD_PATH_PARAM]: input });
    const response = await request.get(`${SHARE_CARD_HARNESS}?${query}`);
    expect(response.status()).toBe(400);
    expect(await response.text()).not.toContain('class="share-card');
  });
}
