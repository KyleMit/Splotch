import { expect, test, type Page } from '@playwright/test';
import { gotoApp } from './helpers';
import { BLACK_INK, PALETTE_COLORS } from '../src/lib/palette';
import { STORAGE_KEYS } from '../src/lib/storageKeys';
import { RESOLVED_THEMES, type ResolvedTheme } from '../src/lib/theme';
import { themes } from '../src/lib/design/tokens';

// What the drawing route shows on its first frame. The route is prerendered, so
// anything the markup or the inline CSS gets wrong is on screen until hydration
// or a late request corrects it, and an installed app launches into that window
// every time it opens.

test.skip(
  !!process.env.DEV_SERVER,
  'guards the prerendered first paint; the dev server does not prerender'
);

const PHONE_PORTRAIT = { width: 390, height: 844 };
const BLACK_SWATCH = `.color-swatch[data-color="${BLACK_INK}"]`;
const LAST_TOOLBAR_CONTROL_ID = 'settingsButton';

// Slow enough that the document arrives across many frames, so a first paint
// taken before the last control is parsed is the normal case, not a race.
const SLOW_DOCUMENT_BYTES_PER_SECOND = 150_000;
const SLOW_DOCUMENT_LATENCY_MS = 20;
// The throttle holds the whole launch back, startup chunks included.
const SLOW_FIRST_FRAME_TIMEOUT_MS = 20_000;

declare global {
  interface Window {
    __firstFrameControls?: string[];
  }
}

function cssRgb(hex: string): string {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  return `rgb(${channels.join(', ')})`;
}

async function blackSwatchFill(page: Page) {
  const swatch = page.locator(BLACK_SWATCH);
  return {
    style: await swatch.getAttribute('style'),
    color: await swatch.evaluate((el) => getComputedStyle(el).backgroundColor),
  };
}

for (const theme of RESOLVED_THEMES) {
  test.describe(`${theme} system theme`, () => {
    test.use({ colorScheme: theme, viewport: PHONE_PORTRAIT });

    test('the prerendered Black swatch already wears the theme ink', async ({ browser }) => {
      const context = await browser.newContext({
        colorScheme: theme,
        viewport: PHONE_PORTRAIT,
        javaScriptEnabled: false,
      });
      const page = await context.newPage();
      await page.goto('/');
      expect((await blackSwatchFill(page)).color).toBe(cssRgb(themes[theme].blackSwatchInk));
      await context.close();
    });

    test('hydration leaves the Black swatch fill as prerendered', async ({ page, browser }) => {
      const context = await browser.newContext({
        colorScheme: theme,
        viewport: PHONE_PORTRAIT,
        javaScriptEnabled: false,
      });
      const prerendered = await context.newPage();
      await prerendered.goto('/');
      const before = await blackSwatchFill(prerendered);
      await context.close();

      await gotoApp(page);
      await expect.poll(() => page.evaluate(() => Boolean(window.__drawingDebug))).toBe(true);
      expect(await blackSwatchFill(page)).toEqual(before);
    });
  });
}

test.describe('explicit theme against the system theme', () => {
  const cases: { chosen: ResolvedTheme; system: ResolvedTheme }[] = [
    { chosen: 'dark', system: 'light' },
    { chosen: 'light', system: 'dark' },
  ];
  for (const { chosen, system } of cases) {
    test(`the Black swatch follows a chosen ${chosen} theme on a ${system} system`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ colorScheme: system, viewport: PHONE_PORTRAIT });
      const page = await context.newPage();
      await page.addInitScript(({ key, chosen }) => localStorage.setItem(key, chosen), {
        key: STORAGE_KEYS.theme,
        chosen,
      });
      await gotoApp(page);
      await expect(page.locator(BLACK_SWATCH)).toHaveCSS(
        'background-color',
        cssRgb(themes[chosen].blackSwatchInk)
      );
      await context.close();
    });
  }
});

test.describe('first frame', () => {
  test.use({ viewport: PHONE_PORTRAIT });

  test('waits for the last toolbar control in the markup', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: SLOW_DOCUMENT_LATENCY_MS,
      downloadThroughput: SLOW_DOCUMENT_BYTES_PER_SECOND,
      uploadThroughput: SLOW_DOCUMENT_BYTES_PER_SECOND,
    });
    // Animation frames run only once rendering is unblocked, so the first
    // callback sees the document as its first frame painted it.
    await page.addInitScript(() => {
      requestAnimationFrame(() => {
        window.__firstFrameControls = Array.from(document.querySelectorAll('button[id]')).map(
          (button) => button.id
        );
      });
    });
    await page.goto('/', { waitUntil: 'commit' });
    await expect
      .poll(() => page.evaluate(() => window.__firstFrameControls ?? []), {
        timeout: SLOW_FIRST_FRAME_TIMEOUT_MS,
      })
      .toContain(LAST_TOOLBAR_CONTROL_ID);
  });

  test('names the last toolbar control in the markup as its target', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: PHONE_PORTRAIT,
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('head link[rel="expect"][blocking="render"]')).toHaveAttribute(
      'href',
      `#${LAST_TOOLBAR_CONTROL_ID}`
    );
    const controlIds = await page
      .locator('body button[id]')
      .evaluateAll((buttons) => buttons.map((button) => button.id));
    expect(controlIds.at(-1)).toBe(LAST_TOOLBAR_CONTROL_ID);
    await context.close();
  });

  test('draws the Flat toolbar rule without a request', async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, 'bare'), STORAGE_KEYS.toolbarStyle);
    await gotoApp(page);
    const masks = await page
      .locator('.margin-rule')
      .evaluateAll((rules) => rules.map((rule) => getComputedStyle(rule).maskImage));
    expect(masks).toHaveLength(2);
    for (const mask of masks) expect(mask).toMatch(/^url\("data:image\/svg\+xml,/);
  });

  test('shows paper wherever the sheet has yet to reach', async ({ page }) => {
    await gotoApp(page);
    const surfaces = await page.evaluate(() => {
      const paint = (selector: string) => {
        const style = getComputedStyle(document.querySelector(selector)!);
        return { color: style.backgroundColor, image: style.backgroundImage };
      };
      return { container: paint('.canvas-container'), sheet: paint('.paper-sheet') };
    });
    expect(surfaces.container).toEqual(surfaces.sheet);
    expect(surfaces.sheet.image).toMatch(/^url\(/);
  });
});

test('the palette carries exactly one themed swatch', () => {
  expect(PALETTE_COLORS.filter(({ hex }) => hex === BLACK_INK)).toHaveLength(1);
});
