import type { Browser, Page, Route } from '@playwright/test';
import sharp from 'sharp';
import {
  CONTROLS_LIVE_ATTRIBUTE,
  DRAWING_LIVE_ATTRIBUTE,
  PAPER_INPUT_TEST_ID,
} from '../../src/platform/firstFrameContract.ts';
import { expect, test } from '../fixtures.ts';

// The export paints a prerendered first frame for each reference screen (ADR-0180) and then
// hydrates it. The frame is only worth painting if the live screen lands on it, so with the app's
// scripts held back the frame is captured, then the scripts are let in and the settled screen is
// captured: where they differ, the page moved under the child's eyes.
const SCRIPT_BUNDLES = '**/_expo/static/js/**';
const FIRST_FRAME_VIEWPORT = /data-first-frame-viewport="(\d+)x(\d+)@[\d.]+"/g;
const SCHEMES = ['light', 'dark'] as const;
const RGB_CHANNELS = 3;
const CHANNEL_TOLERANCE = 8;
const SETTLE_POLL_MS = 400;
const WHOLE_SWEEP_TIMEOUT_MS = 180_000;
const SETTLE_TIMEOUT_MS = 20_000;

// Reference screens whose live layout still lands off the frame, each with the most pixels it may
// differ by (the swatches there sit a few pixels off, against ADR-0180's none); each is a gap the
// disposition table records. The cap holds the drift from growing, and a listed screen that stops
// differing fails until its entry is deleted.
const KNOWN_DRIFT_MAX_PIXELS: Readonly<Record<string, number>> = { '1366x1024': 7000 };

type Screen = { width: number; height: number; name: string };

async function referenceScreens(page: Page): Promise<Screen[]> {
  const response = await page.request.get('/');
  const names = new Set(
    [...(await response.text()).matchAll(FIRST_FRAME_VIEWPORT)].map(
      ([, width, height]) => `${width}x${height}`
    )
  );
  return [...names].map((name) => {
    const [width, height] = name.split('x').map(Number);
    return { width, height, name };
  });
}

async function holdScripts(page: Page) {
  const held: Route[] = [];
  let holding = true;
  await page.route(SCRIPT_BUNDLES, (route) => (holding ? held.push(route) : route.continue()));
  return async () => {
    holding = false;
    for (const route of held.splice(0)) await route.continue();
  };
}

async function steadyPixels(page: Page): Promise<Buffer> {
  let previous: Buffer | null = null;
  let steady: Buffer | null = null;
  await expect
    .poll(
      async () => {
        const current = await sharp(await page.screenshot())
          .removeAlpha()
          .raw()
          .toBuffer();
        steady = previous?.equals(current) ? current : null;
        previous = current;
        await page.waitForTimeout(SETTLE_POLL_MS);
        return steady !== null;
      },
      { timeout: SETTLE_TIMEOUT_MS, message: 'the screen never held still' }
    )
    .toBe(true);
  return steady as unknown as Buffer;
}

async function differingPixels(browser: Browser, screen: Screen, colorScheme: 'light' | 'dark') {
  const context = await browser.newContext({
    viewport: { width: screen.width, height: screen.height },
    colorScheme,
  });
  try {
    const page = await context.newPage();
    const release = await holdScripts(page);
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.getByTestId(PAPER_INPUT_TEST_ID)).toBeVisible();
    await expect(page.locator(`html[${DRAWING_LIVE_ATTRIBUTE}]`)).toHaveCount(0);
    const frame = await steadyPixels(page);
    await release();
    await expect(
      page.locator(`html[${DRAWING_LIVE_ATTRIBUTE}][${CONTROLS_LIVE_ATTRIBUTE}]`)
    ).toBeAttached({ timeout: SETTLE_TIMEOUT_MS });
    const settled = await steadyPixels(page);
    let differing = 0;
    for (let offset = 0; offset < frame.length; offset += RGB_CHANNELS) {
      const delta = Math.max(
        Math.abs(frame[offset] - settled[offset]),
        Math.abs(frame[offset + 1] - settled[offset + 1]),
        Math.abs(frame[offset + 2] - settled[offset + 2])
      );
      if (delta > CHANNEL_TOLERANCE) differing++;
    }
    return differing;
  } finally {
    await context.close();
  }
}

test('the settled screen lands on the prerendered first frame at every reference screen', async ({
  browser,
  page,
}) => {
  test.setTimeout(WHOLE_SWEEP_TIMEOUT_MS);
  const screens = await referenceScreens(page);
  expect(screens.length, 'reference screens the export prerenders').toBeGreaterThan(0);

  for (const screen of screens) {
    for (const colorScheme of SCHEMES) {
      const differing = await differingPixels(browser, screen, colorScheme);
      const cap = KNOWN_DRIFT_MAX_PIXELS[screen.name] ?? 0;
      const where = `${screen.name} ${colorScheme}`;
      expect(differing, `${where} differs by more than its ${cap} pixels`).toBeLessThanOrEqual(cap);
      expect(differing > 0, `${where} no longer differs: delete its drift entry`).toBe(cap > 0);
    }
  }
});
