import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import {
  assertSamePngPixels,
  decodeRgbaPng,
  readPngHeader,
} from './probes/native-brush-pixels.mjs';

const VIEWPORT = { width: 1200, height: 1100 };
const DRAW_STEPS = 24;
const PAGE_TIMEOUT_MS = 20_000;
const MIN_BUILDUP_FRACTION = 0.05;
const MIN_GREEN_PIXELS = 30;
const MIN_GRAIN_FRACTION = 0.1;
const MAX_GRAIN_FRACTION = 0.7;
const SETTLE_MS = 1000;
const MAX_BLACK_CHANNEL = 60;
const MIN_YELLOW_RED = 220;
const MIN_YELLOW_GREEN = 180;
const MAX_YELLOW_BLUE = 80;

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

function pixelAt(image, x, y) {
  const offset = (y * image.info.width + x) * 4;
  return [...image.data.subarray(offset, offset + 3)];
}

function checkLaterInk(image) {
  const pencil = pixelAt(image, 800, 400);
  assert.ok(pencil.every((channel) => channel < MAX_BLACK_CHANNEL));
  const markerCore = [917, 925, 933].map((x) => pixelAt(image, x, 600));
  for (const [red, green, blue] of markerCore)
    assert.ok(red > MIN_YELLOW_RED && green > MIN_YELLOW_GREEN && blue < MAX_YELLOW_BLUE);
  assert.equal(countRegion(image, 941, 600, 1, 1).paperFraction, 1);
  return { pencil, markerCore, markerOutside: pixelAt(image, 941, 600) };
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
    pngs: {},
    gestures: [],
  };
  const browser = await chromium.launch({ headless: true });
  let page;
  let saved;
  try {
    page = await browser.newPage({ viewport: VIEWPORT });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url.href, { waitUntil: 'networkidle', timeout: PAGE_TIMEOUT_MS });
    assert.deepEqual(
      await page.evaluate(() =>
        Object.keys(localStorage).filter((key) => key.startsWith('splotch-picture:'))
      ),
      []
    );
    const paper = page.getByTestId('drawing-paper');
    const box = await paper.boundingBox();
    assert.equal(box.width, 1024);
    const pick = (name) => page.getByRole('button', { name, exact: true }).click();
    report.paperBounds = box;
    const capturePaper = async (name) => {
      const png = await paper.screenshot();
      await writeFile(resolve(output, name), png);
      report.pngs[name] = {
        ihdr: readPngHeader(png),
        sha256: createHash('sha256').update(png).digest('hex'),
      };
      return png;
    };
    const exportPicture = async (name) => {
      const download = page.waitForEvent('download');
      await pick('Export PNG');
      const path = resolve(output, name);
      await (await download).saveAs(path);
      await page.getByText('PNG ready. Your picture is still here.').waitFor();
      const image = await decodeRgbaPng(await readFile(path));
      assert.equal(image.ihdr.width, 1024);
      assert.equal(image.ihdr.height, 768);
      report.pngs[name] = { ihdr: image.ihdr, sha256: image.sha256 };
      return image;
    };
    const draw = async (x0, y0, x1, y1) => {
      const gesture = { from: [x0, y0], to: [x1, y1], startedAt: new Date().toISOString() };
      await page.mouse.move(box.x + x0, box.y + y0);
      await page.mouse.down();
      await page.mouse.move(box.x + x1, box.y + y1, { steps: DRAW_STEPS });
      await page.mouse.up();
      report.gestures.push({ ...gesture, finishedAt: new Date().toISOString() });
    };
    await pick('Crayon');
    await pick('Yellow paint');
    await draw(200, 200, 600, 200);
    const first = await capturePaper('crayon-first.png');
    const before = countRegion(await decoded(first), 220, 193, 150, 14);
    assert.ok(
      before.paperFraction > MIN_GRAIN_FRACTION && before.paperFraction < MAX_GRAIN_FRACTION
    );
    await draw(200, 200, 380, 200);
    const second = await capturePaper('crayon-buildup.png');
    const after = countRegion(await decoded(second), 220, 193, 150, 14);
    assert.ok(before.paperFraction - after.paperFraction > MIN_BUILDUP_FRACTION);
    report.checks.crayon = { before, after };
    await pick('Blue paint');
    await draw(400, 100, 400, 300);
    const crossing = await capturePaper('crayon-crossing.png');
    const mixed = countRegion(await decoded(crossing), 389, 189, 22, 22);
    assert.ok(mixed.green > MIN_GREEN_PIXELS);
    report.checks.mixing = mixed;
    await pick('Magic Brush');
    await draw(100, 400, 900, 400);
    const magic = await decoded(await capturePaper('composition-magic.png'));
    assert.notDeepEqual(pixelAt(magic, 150, 400), pixelAt(magic, 850, 400));
    report.checks.magic = { left: pixelAt(magic, 150, 400), right: pixelAt(magic, 850, 400) };
    await pick('Pencil');
    await pick('Black paint');
    await draw(800, 370, 800, 430);
    await pick('Marker');
    await pick('Yellow paint');
    await draw(925, 550, 925, 650);
    const snapshot = await capturePaper('composition.png');
    report.checks.laterInk = checkLaterInk(await decoded(snapshot));
    await pick('Save picture');
    await page.getByText('Picture saved on this device.').waitFor();
    saved = await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter((key) => key.startsWith('splotch-picture:'));
      return { keys, key: keys[0], value: localStorage.getItem(keys[0]) };
    });
    assert.equal(saved.keys.length, 1);
    assert.equal(typeof saved.value, 'string');
    await writeFile(resolve(output, 'saved-original.json'), saved.value, 'utf8');
    const drawing = JSON.parse(saved.value);
    assert.equal(drawing.version, 2);
    assert.equal(drawing.rainbow, 0);
    assert.deepEqual(
      drawing.strokes.map(({ points: _points, ...style }) => style),
      [
        { brush: 'crayon', color: 'Yellow', seed: 1 },
        { brush: 'crayon', color: 'Yellow', seed: 2 },
        { brush: 'crayon', color: 'Blue', seed: 3 },
        { brush: 'magic', rainbow: 0 },
        { brush: 'pencil', color: 'Black' },
        { brush: 'marker', color: 'Yellow' },
      ]
    );
    report.saved = {
      key: saved.key,
      file: 'saved-original.json',
      bytes: Buffer.byteLength(saved.value, 'utf8'),
      sha256: createHash('sha256').update(saved.value, 'utf8').digest('hex'),
      drawing,
    };
    const baselineExport = await exportPicture('export-before-clear.png');
    await pick('Clear');
    await capturePaper('cleared.png');
    await pick('Undo');
    const undoScreenshot = await capturePaper('undo-clear.png');
    assert.ok(snapshot.equals(undoScreenshot), 'Immediate whole-paper Undo screenshot changed');
    report.checks.undoClear = true;
    const undoExport = await exportPicture('export-after-undo.png');
    report.checks.undoExport = assertSamePngPixels(baselineExport, undoExport, 'Undo');
    await pick('Clear');
    await pick('Pictures');
    await page.getByRole('button', { name: /Open picture from/ }).click();
    await page.getByText('Picture opened. Undo returns to your previous picture.').waitFor();
    const reopenedScreenshot = await capturePaper('reopened.png');
    assert.ok(
      snapshot.equals(reopenedScreenshot),
      'Immediate whole-paper Reopen screenshot changed'
    );
    report.checks.reopen = true;
    const exportPixels = await exportPicture('export.png');
    report.checks.reopenExport = assertSamePngPixels(baselineExport, exportPixels, 'Reopen');
    assert.ok(countRegion(exportPixels, 389, 189, 22, 22).green > MIN_GREEN_PIXELS);
    const exportGrain = countRegion(exportPixels, 450, 193, 100, 14);
    assert.ok(
      exportGrain.paperFraction > MIN_GRAIN_FRACTION &&
        exportGrain.paperFraction < MAX_GRAIN_FRACTION
    );
    assert.notDeepEqual(pixelAt(exportPixels, 150, 400), pixelAt(exportPixels, 850, 400));
    report.checks.export = {
      width: exportPixels.ihdr.width,
      height: exportPixels.ihdr.height,
      mixing: countRegion(exportPixels, 389, 189, 22, 22),
      grain: exportGrain,
      magic: { left: pixelAt(exportPixels, 150, 400), right: pixelAt(exportPixels, 850, 400) },
      laterInk: checkLaterInk(exportPixels),
    };
    await page.evaluate(({ key, value }) => {
      const corrupt = JSON.parse(value);
      corrupt.strokes.find((stroke) => stroke.brush === 'crayon').seed = -1;
      localStorage.setItem(key, JSON.stringify(corrupt));
    }, saved);
    await pick('Pictures');
    await page.getByRole('button', { name: /Open picture from/ }).click();
    await page
      .getByRole('alert')
      .filter({ hasText: 'This saved picture contains an invalid brush.' })
      .waitFor();
    await page.screenshot({ path: resolve(output, 'corrupt-seed-modal.png') });
    await pick('Close');
    const retainedScreenshot = await capturePaper('corrupt-seed-retained.png');
    assert.ok(snapshot.equals(retainedScreenshot));
    report.checks.corruptSeedRetainsPicture = true;
    await page.waitForTimeout(SETTLE_MS);
    assert.deepEqual(errors, []);
    report.checks.pageErrors = errors;
  } catch (error) {
    report.failure = error instanceof Error ? error.stack : String(error);
    throw error;
  } finally {
    report.cleanupErrors = [];
    if (saved?.key && typeof saved.value === 'string' && page && !page.isClosed()) {
      try {
        report.savedValueRestored = await page.evaluate(({ key, value }) => {
          localStorage.setItem(key, value);
          return localStorage.getItem(key) === value;
        }, saved);
        assert.equal(report.savedValueRestored, true);
      } catch (error) {
        report.cleanupErrors.push(error instanceof Error ? error.stack : String(error));
      }
    }
    try {
      await browser.close();
      report.browserClosed = true;
    } catch (error) {
      report.cleanupErrors.push(error instanceof Error ? error.stack : String(error));
    }
    report.finishedAt = new Date().toISOString();
    await writeFile(resolve(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  if (report.cleanupErrors.length && !report.failure)
    throw new Error(report.cleanupErrors.join('\n'));
  console.log(JSON.stringify(report, null, 2));
}

await main();
