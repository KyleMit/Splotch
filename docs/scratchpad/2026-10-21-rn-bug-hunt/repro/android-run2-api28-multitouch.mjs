import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { deviceDriver, OUT, PKG } from './android-device-driver.mjs';
import { line } from './android-run2-touch.mjs';
import { kernelTouch } from './android-run2-api28-kernel-touch.mjs';
import { androidNow, androidVerdict } from './android-run2-verdict.mjs';

const serial = 'emulator-5684',
  d = deviceDriver(serial),
  prefix = 'android-run2-emulator-5684-kernel';
const crop = { left: 220, top: 500, width: 650, height: 1000 };
const checks = [];
let scenarioError = null,
  sinceMs = Date.now(),
  startStamp = androidNow(serial);
async function digest(tag) {
  return createHash('sha256')
    .update(await sharp(`${OUT}/${tag}.png`).extract(crop).raw().toBuffer())
    .digest('hex');
}
async function bands(tag) {
  const { data, info } = await sharp(`${OUT}/${tag}.png`)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return [
    [700, 1080],
    [1120, 1500],
  ].map(([top, bottom]) => {
    let pixels = 0;
    for (let y = top; y < bottom; y++)
      for (let x = 250; x < 850; x++) {
        const i = (y * info.width + x) * info.channels;
        if (Math.max(...data.subarray(i, i + 3)) - Math.min(...data.subarray(i, i + 3)) > 50)
          pixels++;
      }
    return pixels;
  });
}
try {
  d.restart();
  const xml = d.capture(`${prefix}-start`);
  if (xml.includes('content-desc="Expand controls"')) d.tap('Expand controls');
  d.tap('Purple');
  d.tap('Brushes');
  d.tap('Pen');
  sinceMs = Date.now();
  startStamp = androidNow(serial);
  const paths = [line([350, 800], [750, 1000]), line([350, 1200], [750, 1400])];
  for (const [label, contacts] of [
    ['Pen', 1],
    ['Pen', 2],
    ['Crayon', 2],
    ['Magic brush', 2],
  ]) {
    d.tap('Brushes');
    d.tap(label);
    const tag = `${prefix}-${label.split(' ')[0]}-${contacts}`;
    d.capture(`${tag}-blank`);
    const blank = await digest(`${tag}-blank`);
    await kernelTouch(tag, paths.slice(0, contacts));
    d.capture(tag);
    const coloredBands = await bands(tag);
    assert.ok(coloredBands[0] > 500, `Primary calibration band missing: ${coloredBands}`);
    if (contacts === 1) assert.ok(coloredBands[1] < 20, `Unexpected second band: ${coloredBands}`);
    else assert.ok(coloredBands[1] > 500, `Second contact missing: ${coloredBands}`);
    d.tap('Undo');
    d.capture(`${tag}-undo`);
    assert.equal(await digest(`${tag}-undo`), blank);
    checks.push({
      id: `kernel-${label}-${contacts}-contacts`,
      status: 'pass',
      coloredBands,
      exactUndo: true,
      evidence: `${tag}.png`,
    });
  }
} catch (error) {
  scenarioError = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  let source = '';
  try {
    source = d.capture(`${prefix}-final`);
  } catch {}
  writeFileSync(
    `${OUT}/${prefix}-results.json`,
    JSON.stringify(
      {
        device: serial,
        checks,
        scenarioError,
        ...androidVerdict({ serial, pkg: PKG, startStamp, sinceMs, source }),
      },
      null,
      2
    ) + '\n'
  );
  d.cleanup();
}
