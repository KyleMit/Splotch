import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { deviceDriver, PKG, OUT, nodes, bounds, pause } from './android-device-driver.mjs';
import { androidNow, androidVerdict } from './android-run2-verdict.mjs';

const serial = 'emulator-5682';
const d = deviceDriver(serial);
const baseline = JSON.parse(readFileSync(`${OUT}/android-run2-${serial}-baseline.json`));
const originalSensor = baseline.sensor.match(/acceleration = ([^\r\n]+)/)[1];
const prefix = `android-run2-${serial}-layout`;
const checks = [];
const sinceMs = Date.now(),
  startStamp = androidNow(serial);
let scenarioError = null;
const crop = { left: 600, top: 600, width: 400, height: 400 };
const digest = async (tag) =>
  createHash('sha256')
    .update(await sharp(`${OUT}/${tag}.png`).extract(crop).raw().toBuffer())
    .digest('hex');
async function colorPixels(tag) {
  const { data, info } = await sharp(`${OUT}/${tag}.png`)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let y = 400; y < info.height - 300; y++)
    for (let x = 300; x < info.width - 300; x++) {
      const i = (y * info.width + x) * info.channels;
      if (
        data[i] > 100 &&
        data[i + 2] > 100 &&
        data[i] > data[i + 1] + 30 &&
        data[i + 2] > data[i + 1] + 30
      )
        count++;
    }
  return count;
}
function record(id, evidence, details = {}) {
  checks.push({ id, status: 'pass', evidence, ...details });
}
function rotate(value) {
  d.adb('emu', 'sensor', 'set', 'acceleration', value);
  pause(2500);
}
function sectionTap(section) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const entries = nodes(d.source());
    if (entries.some((n) => n.visible && n.token.includes(`content-desc="${section}"`))) {
      d.tap(section);
      return;
    }
    const areas = entries
      .filter((n) => n.visible && n.token.includes('scrollable="true"'))
      .map((n) => bounds(n.token))
      .sort((a, b) => (b[2] - b[0]) * (b[3] - b[1]) - (a[2] - a[0]) * (a[3] - a[1]));
    assert.ok(areas.length, 'No scrollable Settings hub');
    const [l, t, r, b] = areas[0];
    d.input('swipe', Math.round((l + r) / 2), b - 40, Math.round((l + r) / 2), t + 40, 600);
  }
  d.tap(section);
}
try {
  d.restart();
  let xml = d.capture(`${prefix}-landscape-blank`);
  if (xml.includes('content-desc="Expand controls"')) d.tap('Expand controls');
  d.tap('Purple');
  rotate('9.81:0:0');
  d.capture(`${prefix}-portrait-blank`);
  const dimensions = await sharp(`${OUT}/${prefix}-portrait-blank.png`).metadata();
  assert.ok(dimensions.width < dimensions.height, 'Sensor did not establish portrait');
  const blank = await digest(`${prefix}-portrait-blank`);
  record('portrait-layout', `${prefix}-portrait-blank.png`, {
    width: dimensions.width,
    height: dimensions.height,
  });
  rotate(originalSensor);
  d.capture(`${prefix}-landscape-before-ink`);
  d.input('swipe', 600, 650, 1500, 900, 900);
  d.capture(`${prefix}-landscape-ink`);
  rotate('9.81:0:0');
  d.capture(`${prefix}-portrait-ink`);
  const pixels = await colorPixels(`${prefix}-portrait-ink`);
  assert.ok(pixels > 1000, 'Rotated paper lost its colored stroke');
  d.tap('Undo');
  d.capture(`${prefix}-portrait-undo`);
  assert.equal(await digest(`${prefix}-portrait-undo`), blank);
  record('rotate-ink-and-exact-undo', `${prefix}-portrait-undo.png`, { coloredPixels: pixels });
  rotate(originalSensor);
  d.capture(`${prefix}-landscape-restored`);
  d.tap('Settings');
  d.capture(`${prefix}-hub-normal`);
  d.tap('Close');
  d.adb('shell', 'settings', 'put', 'system', 'font_scale', '2.0');
  pause(2000);
  d.capture(`${prefix}-font-2-root`);
  for (const section of [
    'Appearance',
    'Sound',
    'Tool Drawer',
    'Accessibility',
    'Coloring',
    'AI Art',
    'Saving',
  ]) {
    d.tap('Settings');
    d.capture(`${prefix}-font-2-hub-${section.replaceAll(' ', '-')}`);
    sectionTap(section);
    xml = d.capture(`${prefix}-font-2-${section.replaceAll(' ', '-')}`);
    const close = nodes(xml).find((n) => n.visible && n.token.includes('content-desc="Close"'));
    assert.ok(close, 'Close is unreachable');
    assert.ok(bounds(close.token).every(Number.isFinite));
    d.tap('Close');
    record(
      `font-2-section-close-${section}`,
      `${prefix}-font-2-${section.replaceAll(' ', '-')}.png`
    );
  }
} catch (error) {
  scenarioError = String(error);
  throw error;
} finally {
  d.adb('shell', 'settings', 'put', 'system', 'font_scale', baseline.font);
  rotate(originalSensor);
  d.restart();
  let source = '';
  try {
    source = d.capture(`${prefix}-final`);
  } catch {}
  const restored = {
    font: d.adb('shell', 'settings', 'get', 'system', 'font_scale').toString().trim(),
    sensor: d.adb('emu', 'sensor', 'get', 'acceleration').toString().trim(),
  };
  writeFileSync(
    `${OUT}/${prefix}-results.json`,
    JSON.stringify(
      {
        checks,
        scenarioError,
        restored,
        ...androidVerdict({ serial, pkg: PKG, startStamp, sinceMs, source }),
      },
      null,
      2
    ) + '\n'
  );
  d.cleanup();
}
