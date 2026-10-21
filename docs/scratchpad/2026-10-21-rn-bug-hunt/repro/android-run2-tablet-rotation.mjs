import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { deviceDriver, PKG, OUT, nodes, bounds, pause } from './android-device-driver.mjs';
import { line } from './android-run2-touch.mjs';
import { androidNow, androidVerdict } from './android-run2-verdict.mjs';

const serial = 'emulator-5682',
  d = deviceDriver(serial);
const baseline = JSON.parse(readFileSync(`${OUT}/android-run2-${serial}-baseline.json`));
const sensor = baseline.sensor.match(/acceleration = ([^\r\n]+)/)[1];
const prefix = `android-run2-${serial}-rotation-continuous`;
const checks = [];
const sinceMs = Date.now(),
  startStamp = androidNow(serial);
let scenarioError = null;
const blankCrop = { left: 600, top: 600, width: 400, height: 400 };
async function digest(tag) {
  return createHash('sha256')
    .update(await sharp(`${OUT}/${tag}.png`).extract(blankCrop).raw().toBuffer())
    .digest('hex');
}
function rotate(value) {
  d.adb('emu', 'sensor', 'set', 'acceleration', value);
  pause(2000);
}
async function components(tag, xml) {
  const paper = nodes(xml).find((n) => n.token.includes('content-desc="Drawing paper"'));
  const [l, t, r, b] = bounds(paper.token);
  const insetX = Math.floor((r - l) * 0.1),
    insetY = Math.floor((b - t) * 0.1);
  const crop = {
    left: l + insetX,
    top: t + insetY,
    width: r - l - insetX * 2,
    height: b - t - insetY * 2,
  };
  const { data, info } = await sharp(`${OUT}/${tag}.png`)
    .extract(crop)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(info.width * info.height),
    queue = new Uint32Array(mask.length),
    sizes = [];
  for (let i = 0; i < mask.length; i++) {
    const at = i * info.channels;
    mask[i] = Number(
      data[at] > 100 &&
        data[at + 2] > 100 &&
        data[at] > data[at + 1] + 30 &&
        data[at + 2] > data[at + 1] + 30
    );
  }
  for (let i = 0; i < mask.length; i++)
    if (mask[i]) {
      let head = 0,
        tail = 1;
      queue[0] = i;
      mask[i] = 0;
      while (head < tail) {
        const at = queue[head++],
          x = at % info.width,
          y = Math.floor(at / info.width);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx,
              ny = y + dy,
              other = ny * info.width + nx;
            if (nx >= 0 && nx < info.width && ny >= 0 && ny < info.height && mask[other]) {
              mask[other] = 0;
              queue[tail++] = other;
            }
          }
      }
      if (tail >= 16) sizes.push(tail);
    }
  return { crop, components: sizes.sort((a, b) => b - a) };
}
try {
  assert.equal(
    d.adb('shell', 'settings', 'get', 'system', 'font_scale').toString().trim(),
    baseline.font
  );
  for (let run = 1; run <= 2; run++) {
    d.restart();
    let xml = d.capture(`${prefix}-${run}-start`);
    if (xml.includes('content-desc="Expand controls"')) d.tap('Expand controls');
    d.tap('Purple');
    d.tap('Brushes');
    d.tap('Pen');
    rotate('9.81:0:0');
    d.capture(`${prefix}-${run}-portrait-blank`);
    const blank = await digest(`${prefix}-${run}-portrait-blank`);
    rotate(sensor);
    d.capture(`${prefix}-${run}-landscape-blank`);
    await d.inject(`${prefix}-${run}-input`, [line([800, 650], [1700, 900])]);
    xml = d.capture(`${prefix}-${run}-landscape-ink`);
    const before = await components(`${prefix}-${run}-landscape-ink`, xml);
    assert.equal(before.components.length, 1, 'Calibrated landscape stroke fragmented');
    rotate('9.81:0:0');
    xml = d.capture(`${prefix}-${run}-portrait-ink`);
    const after = await components(`${prefix}-${run}-portrait-ink`, xml);
    assert.equal(after.components.length, 1, 'Rotated stroke fragmented');
    d.tap('Undo');
    d.capture(`${prefix}-${run}-portrait-undo`);
    assert.equal(await digest(`${prefix}-${run}-portrait-undo`), blank);
    checks.push({
      id: `continuous-stroke-rotation-${run}`,
      status: 'pass',
      before,
      after,
      exactBlankUndo: true,
      evidence: `${prefix}-${run}-portrait-ink.png`,
    });
    rotate(sensor);
  }
} catch (error) {
  scenarioError = String(error);
  throw error;
} finally {
  rotate(sensor);
  d.restart();
  let source = '';
  try {
    source = d.capture(`${prefix}-final`);
  } catch {}
  writeFileSync(
    `${OUT}/${prefix}-results.json`,
    JSON.stringify(
      {
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
