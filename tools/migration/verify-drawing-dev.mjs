import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';
import sharp from 'sharp';
import { paletteHex } from '../../experiments/native-architecture/src/drawing/palette.ts';

const DEFAULT_URL = 'http://localhost:5300';
const DEFAULT_OUTPUT = '/private/tmp/splotch-drawing-dev-checkpoint-01a11a00';
const NAVIGATION_TIMEOUT_MS = 45_000;
const EXPORT_TIMEOUT_MS = 15_000;
const PAPER_WIDTH = 1024;
const PAPER_HEIGHT = 768;
const MIN_PAINTED_PIXELS = 100;
const MARKER_WIDTH = 22;
const PENCIL_WIDTH = 7;
const purple = paletteHex('Purple');
const blue = paletteHex('Blue');

const url = process.argv[2] ?? DEFAULT_URL;
const output = process.argv[3] ?? DEFAULT_OUTPUT;
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('Development verification requires a local preview.');
}
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 1400 },
    acceptDownloads: true,
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(url, { waitUntil: 'networkidle', timeout: NAVIGATION_TIMEOUT_MS });
  await expect(page.getByText('Make something colorful.')).toBeVisible();
  const paper = page.getByTestId('drawing-paper');
  const bounds = await paper.boundingBox();
  if (!bounds) throw new Error('Drawing paper has no bounds.');

  async function draw(from, to) {
    await page.mouse.move(bounds.x + from[0], bounds.y + from[1]);
    await page.mouse.down();
    await page.mouse.move(bounds.x + to[0], bounds.y + to[1], { steps: 15 });
    await page.mouse.up();
  }

  await draw([100, 100], [260, 190]);
  await expect(paper.locator('path')).toHaveCount(1);
  await expect(paper.locator('path').first()).toHaveAttribute('stroke', purple);
  await expect(paper.locator('path').first()).toHaveAttribute('stroke-width', String(MARKER_WIDTH));
  await page.getByRole('button', { name: 'Blue paint', exact: true }).click();
  await page.getByRole('button', { name: 'Pencil', exact: true }).click();
  await draw([120, 220], [330, 300]);
  await expect(paper.locator('path')).toHaveCount(2);
  await expect(paper.locator('path').nth(1)).toHaveAttribute('stroke', blue);
  await expect(paper.locator('path').nth(1)).toHaveAttribute('stroke-width', String(PENCIL_WIDTH));
  const colorDownload = page.waitForEvent('download', { timeout: EXPORT_TIMEOUT_MS });
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  const colorPng = join(output, 'drawing-color-and-brush.png');
  await (await colorDownload).saveAs(colorPng);
  const colored = await sharp(colorPng).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const colorPixels = { Purple: 0, Blue: 0 };
  for (const [label, hex] of Object.entries({ Purple: purple, Blue: blue })) {
    const rgb = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
    for (let index = 0; index < colored.data.length; index += colored.info.channels) {
      if (rgb.every((channel, offset) => colored.data[index + offset] === channel))
        colorPixels[label]++;
    }
    expect(colorPixels[label]).toBeGreaterThan(MIN_PAINTED_PIXELS);
  }
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(paper.locator('path')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(paper.locator('path')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(paper.locator('path')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save picture', exact: true }).click();
  await expect(page.getByText('Picture saved on this device.')).toBeVisible();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Pictures', exact: true }).click();
  const savedEntry = page.getByRole('button', { name: /Open picture from/ });
  await expect(savedEntry).toBeVisible();
  await expect(page.getByText('Save a picture to find it here.')).toHaveCount(0);
  await savedEntry.evaluate((element) =>
    element.getAnimations({ subtree: true }).forEach((animation) => animation.finish())
  );
  await page.screenshot({
    path: join(output, 'saved-picture-list-settled.png'),
    fullPage: true,
    animations: 'disabled',
  });
  const savedLabel = await savedEntry.getAttribute('aria-label');
  await savedEntry.click();
  await expect(page.getByText('Your pictures', { exact: true })).toBeHidden();
  await expect(paper.locator('path')).toHaveCount(1);
  const downloadPromise = page.waitForEvent('download', { timeout: EXPORT_TIMEOUT_MS });
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  await (await downloadPromise).saveAs(join(output, 'drawing-verified.png'));
  const metadata = await sharp(join(output, 'drawing-verified.png')).metadata();
  const { data, info } = await sharp(join(output, 'drawing-verified.png'))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let paintedPixels = 0;
  for (let index = 0; index < data.length; index += info.channels) {
    if (data[index] !== 252 || data[index + 1] !== 251 || data[index + 2] !== 248) paintedPixels++;
  }
  if (
    metadata.format !== 'png' ||
    metadata.width !== PAPER_WIDTH ||
    metadata.height !== PAPER_HEIGHT ||
    paintedPixels < MIN_PAINTED_PIXELS
  ) {
    throw new Error('Export is not a painted 1024×768 raster PNG.');
  }
  await expect(page.getByText('PNG ready. Your picture is still here.')).toBeVisible();
  await page.screenshot({
    path: join(output, 'drawing-screen-settled.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(errors).toEqual([]);
  const result = {
    passed: true,
    checks: [
      'stroke',
      'color',
      'brush',
      'undo',
      'clear-undo',
      'save',
      'visible-saved-list',
      'reload-reopen',
      'raster-png',
    ],
    savedLabel,
    renderedBrushes: { marker: MARKER_WIDTH, pencil: PENCIL_WIDTH },
    exportedColorPixels: colorPixels,
    png: { format: metadata.format, width: metadata.width, height: metadata.height, paintedPixels },
    errors,
  };
  writeFileSync(
    join(output, 'browser-result-settled.json'),
    `${JSON.stringify(result, null, 2)}\n`
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
