import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { deviceDriver, OUT, PKG } from './android-device-driver.mjs';
import { line } from './android-run2-touch.mjs';
import { kernelTouch } from './android-run2-api28-kernel-touch.mjs';
import { androidNow, androidVerdict } from './android-run2-verdict.mjs';

const eraserOnly = process.argv.includes('--eraser-only');
const serial = 'emulator-5684',
  d = deviceDriver(serial),
  prefix = eraserOnly
    ? 'android-run2-emulator-5684-five-eraser-corrected'
    : 'android-run2-emulator-5684-five';
const BAND_TOPS_PX = [600, 850, 1100, 1350, 1600];
const MIN_BAND_INK_PIXELS = 500;
const BAND_PADDING_PX = 30;
const BAND_HEIGHT_PX = 180;
const MIN_CHROMA_CHANNEL_LEVELS = 50;
const MAX_ERASED_INK_FRACTION = 0.5;
const crop = { left: 220, top: 500, width: 650, height: 1300 };
const checks = [],
  cleanupErrors = [];
async function pixels(tag) {
  const { data, info } = await sharp(`${OUT}/${tag}.png`)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const coloredBands = BAND_TOPS_PX.map((top) => {
    let count = 0;
    for (let y = top - BAND_PADDING_PX; y < top - BAND_PADDING_PX + BAND_HEIGHT_PX; y++)
      for (let x = 300; x < 800; x++) {
        const i = (y * info.width + x) * info.channels;
        if (
          Math.max(data[i], data[i + 1], data[i + 2]) -
            Math.min(data[i], data[i + 1], data[i + 2]) >
          MIN_CHROMA_CHANNEL_LEVELS
        )
          count++;
      }
    return count;
  });
  const digest = createHash('sha256')
    .update(await sharp(`${OUT}/${tag}.png`).extract(crop).raw().toBuffer())
    .digest('hex');
  return { coloredBands, digest };
}
try {
  for (const brush of eraserOnly ? ['Eraser'] : ['Pen', 'Crayon', 'Magic brush', 'Eraser'])
    for (let run = 1; run <= 2; run++) {
      const tag = `${prefix}-${brush.split(' ')[0]}-${run}`;
      let source = '',
        scenarioError = null;
      const details = {};
      d.restart();
      source = d.capture(`${tag}-start`);
      if (source.includes('content-desc="Expand controls"')) d.tap('Expand controls');
      d.tap('Purple');
      d.tap('Brushes');
      d.tap('Pen');
      d.tap('Stroke width');
      d.tap('Size 3');
      const sinceMs = Date.now(),
        startStamp = androidNow(serial);
      try {
        const paths = BAND_TOPS_PX.map((y) => line([350, y], [750, y + 100]));
        if (brush === 'Eraser') {
          details.seedInput = await kernelTouch(`${tag}-seed`, paths);
          d.capture(`${tag}-seed`);
        }
        d.tap('Brushes');
        d.tap(brush);
        d.tap('Stroke width');
        d.tap(brush === 'Eraser' ? 'Eraser size 3' : 'Size 3');
        d.capture(`${tag}-before`);
        const before = await pixels(`${tag}-before`);
        details.input = await kernelTouch(`${tag}-input`, paths);
        source = d.capture(`${tag}-drawn`);
        const after = await pixels(`${tag}-drawn`);
        details.before = before;
        details.after = after;
        if (brush === 'Eraser')
          assert.ok(
            after.coloredBands.every(
              (n, i) => n < before.coloredBands[i] * MAX_ERASED_INK_FRACTION
            ),
            'Five-contact erasing did not remove ink in each band'
          );
        else
          assert.ok(
            after.coloredBands.every((n) => n > MIN_BAND_INK_PIXELS),
            'A contact left no visible ink'
          );
        d.tap('Undo');
        source = d.capture(`${tag}-undo`);
        const undo = await pixels(`${tag}-undo`);
        assert.equal(undo.digest, before.digest, 'One Undo did not restore the exact prior paper');
        details.exactUndo = true;
      } catch (error) {
        scenarioError = String(error);
        process.exitCode = 1;
        try {
          source = d.capture(`${tag}-error`);
        } catch {
          source = '';
        }
      }
      const row = {
        id: `five-${brush}-${run}`,
        status: scenarioError ? 'needs-review' : 'pass',
        scenarioError,
        details,
        ...androidVerdict({ serial, pkg: PKG, startStamp, sinceMs, source }),
      };
      if (row.verdict !== 'alive') row.status = 'needs-review';
      checks.push(row);
      writeFileSync(`${OUT}/${tag}.json`, JSON.stringify(row, null, 2) + '\n');
      console.log(tag, row.status, row.verdict, scenarioError);
    }
} finally {
  for (const [label, action] of [
    [
      'restore Pen and width',
      () => {
        d.restart();
        const xml = d.capture(`${prefix}-restore`);
        if (xml.includes('content-desc="Expand controls"')) d.tap('Expand controls');
        d.tap('Brushes');
        d.tap('Pen');
        d.tap('Stroke width');
        d.tap('Size 3');
      },
    ],
    ['stop probe', () => d.adb('shell', 'am', 'force-stop', PKG)],
    ['remove driver XML', () => d.cleanup()],
  ])
    try {
      action();
    } catch (error) {
      cleanupErrors.push({ label, error: String(error) });
    }
  writeFileSync(
    `${OUT}/${prefix}-results.json`,
    JSON.stringify({ device: serial, checks, cleanupErrors }, null, 2) + '\n'
  );
  if (cleanupErrors.length) process.exitCode = 1;
}
