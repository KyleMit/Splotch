import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { WEB_HOST_ENV } from '../host/contract';
import {
  PROBE_DIALOG_ID,
  PROBE_DIALOG_OPENER_ID,
  PROBE_DIALOG_CLOSE_ID,
  PROBE_DIALOG_REFUSAL_ID,
  PROBE_DIALOG_SETTINGS_ID,
} from '../src/probeProps';
import { paletteHex } from '../../../../web/src/lib/palette';
import {
  draw,
  firstOpaquePixel,
  IPAD_UA,
  spaNavigate,
  expectNoReload,
  enforceProductionCsp,
} from '../../../../web/tests/helpers';
import { openDrawer } from '../../../../web/tests/flows-harness';
import {
  NEUTRAL_ISLAND_SELECTOR,
  readNeutralProof,
  requireNeutralProof,
  waitForNeutralAdoption,
} from './neutralProof';

const neutralMechanism =
  process.env[WEB_HOST_ENV.variant] === 'neutral-embedded' &&
  process.env[WEB_HOST_ENV.artifact] === 'mechanism';
const mismatch = process.env[WEB_HOST_ENV.fixture] === 'text-mismatch';
const DIALOG_REPEAT_COUNT = 3;
const COLOR_CHANNEL_TOLERANCE = 2;

test.skip(!neutralMechanism, 'shared client witnesses require the neutral mechanism artifact');
test.beforeEach(async ({ page }) => {
  await enforceProductionCsp(page);
});

test('React palette and brush controls share live selection, ink, undo, export and clear', async ({
  page,
}) => {
  await page.goto('/');
  await waitForNeutralAdoption(page);
  await requireNeutralProof(page, mismatch);
  const chrome = page.locator(NEUTRAL_ISLAND_SELECTOR);
  const blue = chrome.getByRole('button', { name: 'Blue', exact: true });
  await chrome.getByRole('button', { name: 'Eraser', exact: true }).click();
  await expect(chrome.getByRole('button', { name: 'Eraser', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await blue.click();
  await expect(blue).toHaveAttribute('aria-pressed', 'true');
  await expect(chrome.getByRole('button', { name: 'Pen', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.locator(`.color-swatch[data-color="${paletteHex('Blue')}"]`)).toHaveClass(
    /active/
  );
  await draw(page, [
    { x: 90, y: 120 },
    { x: 260, y: 190 },
  ]);
  await expect.poll(() => firstOpaquePixel(page)).not.toBeNull();
  await expect(chrome.getByRole('status')).toContainText('Undo ready');
  await openDrawer(page);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#screenshotButton').click();
  await page.locator('#clearButton').focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => firstOpaquePixel(page)).toBeNull();
  await expect(chrome.getByRole('status')).toContainText('Empty');
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error('The real Screenshot command did not publish a file');
  const { data, info } = await sharp(await readFile(path))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgb = paletteHex('Blue')
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16));
  let acceptedBluePixels = 0;
  for (let offset = 0; offset < data.length; offset += info.channels)
    if (
      rgb.every(
        (channel, index) => Math.abs(data[offset + index] - channel) <= COLOR_CHANNEL_TOLERANCE
      )
    )
      acceptedBluePixels += 1;
  expect(acceptedBluePixels).toBeGreaterThan(0);
  await page.locator('#undoButton').click();
  await expect.poll(() => firstOpaquePixel(page)).not.toBeNull();
  await expect(chrome.getByRole('status')).toContainText('Ink');
  await page.locator('#undoButton').click();
  await expect.poll(() => firstOpaquePixel(page)).toBeNull();
  await expect(chrome.getByRole('status')).toContainText('No undo');
  await page.locator(`.color-swatch[data-color="${paletteHex('Purple')}"]`).click();
  await expect(chrome.getByRole('button', { name: 'Purple', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
});

test('real dialog focus, refusal, nested Settings and Back leave no duplicate history', async ({
  page,
}) => {
  await page.goto('/privacy');
  await spaNavigate(page, '/');
  await waitForNeutralAdoption(page);
  await requireNeutralProof(page, mismatch);
  const dialog = page.locator(`#${PROBE_DIALOG_ID}`);
  const opener = page.locator(`#${PROBE_DIALOG_OPENER_ID}`);
  for (let cycle = 0; cycle < DIALOG_REPEAT_COUNT; cycle += 1) {
    await opener.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await dialog.locator(`#${PROBE_DIALOG_REFUSAL_ID}`).check();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(`#${PROBE_DIALOG_CLOSE_ID}`)).toBeDisabled();
    await dialog.locator(`#${PROBE_DIALOG_REFUSAL_ID}`).uncheck();
    await dialog.locator(`#${PROBE_DIALOG_SETTINGS_ID}`).click();
    const settings = page.locator('#settingsModal');
    await expect(settings).toBeVisible();
    await page.goBack();
    await expect(settings).not.toBeVisible();
    await expect(dialog).toBeVisible();
    await page.goBack();
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
    await expect(page).toHaveURL(/\/$/);
  }
  await page.goBack();
  await expect(page).toHaveURL(/\/privacy$/);
  await expectNoReload(page);
  await expect.poll(async () => (await readNeutralProof(page)).snapshot?.activeRoots).toBe(0);
});

test('iPad Safari shaped coarse-pointer Back consumes one drawing guard then navigates', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    userAgent: IPAD_UA,
    isMobile: true,
    hasTouch: true,
    viewport: { width: 1024, height: 768 },
  });
  const page = await context.newPage();
  try {
    await enforceProductionCsp(page);
    await page.goto('/privacy');
    await spaNavigate(page, '/');
    await waitForNeutralAdoption(page);
    await requireNeutralProof(page, mismatch);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    await draw(page, [
      { x: 90, y: 120 },
      { x: 260, y: 190 },
    ]);
    await expect.poll(() => firstOpaquePixel(page)).not.toBeNull();
    await page.locator(`#${PROBE_DIALOG_OPENER_ID}`).click();
    await expect(page.locator(`#${PROBE_DIALOG_ID}`)).toBeVisible();
    await page.goBack();
    await expect(page.locator(`#${PROBE_DIALOG_ID}`)).not.toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(() => firstOpaquePixel(page)).not.toBeNull();
    await page.goBack();
    await expect(page).toHaveURL(/\/privacy$/);
  } finally {
    await context.close();
  }
});
