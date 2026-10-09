import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const VIEWPORT = { width: 1200, height: 1100 };
const DRAW_STEPS = 24;
const PAGE_TIMEOUT_MS = 20_000;
const MIN_BUILDUP_FRACTION = 0.05;
const MIN_GREEN_PIXELS = 30;
const MIN_GRAIN_FRACTION = 0.1;
const MAX_GRAIN_FRACTION = 0.7;
const SETTLE_MS = 1000;

function argument(name) {
  const value = process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
  assert.ok(value, `--${name}= is required`);
  return value;
}

function countRegion(image, x, y, width, height) {
  let paper = 0;
  let green = 0;
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const offset = ((y + dy) * image.info.width + x + dx) * 4;
      const [red, greenChannel, blue] = image.data.subarray(offset, offset + 3);
      paper += red > 240 && greenChannel > 235 && blue > 225;
      green += red < 160 && greenChannel > blue;
    }
  }
  return { paperFraction: paper / (width * height), green };
}

async function decoded(png) {
  return sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

async function main() {
  const url = new URL(argument('url'));
  assert.equal(url.protocol, 'http:');
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  const output = resolve(argument('output'));
  await mkdir(output, { recursive: true });
  const report = {
    startedAt: new Date().toISOString(),
    source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
    url: url.href,
    viewport: VIEWPORT,
    checks: {},
  };
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url.href, { waitUntil: 'networkidle', timeout: PAGE_TIMEOUT_MS });
    const paper = page.getByTestId('drawing-paper');
    const box = await paper.boundingBox();
    assert.equal(box.width, 1024);
    const pick = (name) => page.getByRole('button', { name, exact: true }).click();
    const draw = async (x0, y0, x1, y1) => {
      await page.mouse.move(box.x + x0, box.y + y0);
      await page.mouse.down();
      await page.mouse.move(box.x + x1, box.y + y1, { steps: DRAW_STEPS });
      await page.mouse.up();
    };
    await pick('Crayon');
    await pick('Yellow paint');
    await draw(200, 200, 600, 200);
    const first = await paper.screenshot();
    await writeFile(resolve(output, 'crayon-first.png'), first);
    const before = countRegion(await decoded(first), 220, 193, 150, 14);
    assert.ok(
      before.paperFraction > MIN_GRAIN_FRACTION && before.paperFraction < MAX_GRAIN_FRACTION
    );
    await draw(200, 200, 380, 200);
    const second = await paper.screenshot();
    await writeFile(resolve(output, 'crayon-buildup.png'), second);
    const after = countRegion(await decoded(second), 220, 193, 150, 14);
    assert.ok(before.paperFraction - after.paperFraction > MIN_BUILDUP_FRACTION);
    report.checks.crayon = { before, after };
    await pick('Blue paint');
    await draw(400, 100, 400, 300);
    const crossing = await paper.screenshot();
    const mixed = countRegion(await decoded(crossing), 389, 189, 22, 22);
    assert.ok(mixed.green > MIN_GREEN_PIXELS);
    report.checks.mixing = mixed;
    await pick('Magic Brush');
    await draw(100, 400, 900, 400);
    const snapshot = await paper.screenshot();
    const image = await decoded(snapshot);
    const at = (x, y) => [
      ...image.data.subarray((y * image.info.width + x) * 4, (y * image.info.width + x) * 4 + 3),
    ];
    assert.notDeepEqual(at(150, 400), at(850, 400));
    report.checks.magic = { left: at(150, 400), right: at(850, 400) };
    await writeFile(resolve(output, 'composition.png'), snapshot);
    await pick('Save picture');
    await page.getByText('Picture saved on this device.').waitFor();
    await pick('Clear');
    await pick('Undo');
    assert.ok(snapshot.equals(await paper.screenshot()));
    report.checks.undoClear = true;
    await pick('Clear');
    await pick('Pictures');
    await page.getByRole('button', { name: /Open picture from/ }).click();
    await page.getByText('Picture opened. Undo returns to your previous picture.').waitFor();
    assert.ok(snapshot.equals(await paper.screenshot()));
    report.checks.reopen = true;
    const download = page.waitForEvent('download');
    await pick('Export PNG');
    const exported = resolve(output, 'export.png');
    await (await download).saveAs(exported);
    const metadata = await sharp(exported).metadata();
    assert.equal(metadata.width, 1024);
    assert.equal(metadata.height, 768);
    const exportPixels = await sharp(exported)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.ok(countRegion(exportPixels, 389, 189, 22, 22).green > MIN_GREEN_PIXELS);
    const exportGrain = countRegion(exportPixels, 450, 193, 100, 14);
    assert.ok(
      exportGrain.paperFraction > MIN_GRAIN_FRACTION &&
        exportGrain.paperFraction < MAX_GRAIN_FRACTION
    );
    const exportAt = (x, y) => [
      ...exportPixels.data.subarray(
        (y * exportPixels.info.width + x) * 4,
        (y * exportPixels.info.width + x) * 4 + 3
      ),
    ];
    assert.notDeepEqual(exportAt(150, 400), exportAt(850, 400));
    report.checks.export = {
      width: metadata.width,
      height: metadata.height,
      mixing: countRegion(exportPixels, 389, 189, 22, 22),
      grain: exportGrain,
      magic: { left: exportAt(150, 400), right: exportAt(850, 400) },
    };
    const saved = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((item) => item.startsWith('splotch-picture:'));
      return { key, value: localStorage.getItem(key) };
    });
    await page.evaluate(({ key, value }) => {
      const corrupt = JSON.parse(value);
      corrupt.strokes.find((stroke) => stroke.brush === 'crayon').seed = -1;
      localStorage.setItem(key, JSON.stringify(corrupt));
    }, saved);
    await pick('Pictures');
    await page.getByRole('button', { name: /Open picture from/ }).click();
    await page.getByText('This saved picture contains an invalid brush.').waitFor();
    await pick('Close');
    assert.ok(snapshot.equals(await paper.screenshot()));
    report.checks.corruptSeedRetainsPicture = true;
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), saved);
    await page.waitForTimeout(SETTLE_MS);
    assert.deepEqual(errors, []);
    report.checks.pageErrors = errors;
  } catch (error) {
    report.failure = error instanceof Error ? error.stack : String(error);
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    await writeFile(resolve(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    await browser.close();
  }
  console.log(JSON.stringify(report, null, 2));
}

await main();
