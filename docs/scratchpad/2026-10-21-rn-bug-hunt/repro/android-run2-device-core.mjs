import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { deviceDriver, PKG, OUT, center } from './android-device-driver.mjs';
import { line } from './android-run2-touch.mjs';
import { androidNow, androidVerdict } from './android-run2-verdict.mjs';
const serial = process.argv[2];
assert.ok(['emulator-5682', 'emulator-5684'].includes(serial));
const resumeTail = process.argv.includes('--tail');
if (resumeTail) assert.equal(serial, 'emulator-5684');
const d = deviceDriver(serial),
  prefix = `android-run2-${serial}`,
  checks = resumeTail ? JSON.parse(readFileSync(`${OUT}/${prefix}-core-results.json`)).checks : [];
if (resumeTail) assert.equal(checks.length, 15);
let sinceMs = Date.now(),
  startStamp = androidNow(serial);
let xml;
let scenarioError = null;
function record(id, evidence, details = {}) {
  checks.push({ id, status: 'pass', evidence, ...details });
  writeFileSync(`${OUT}/${prefix}-core-checkpoints.json`, JSON.stringify(checks, null, 2) + '\n');
}
function paper(xml) {
  const n = [...xml.matchAll(/<node\b[^>]*>/g)]
    .map((m) => m[0])
    .find((n) => n.includes('content-desc="Drawing paper"'));
  assert.ok(n);
  const [l, t, r, b] = [...n.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)].slice(1).map(Number);
  return {
    left: Math.round(l + (r - l) * 0.27),
    top: Math.round(t + (b - t) * 0.28),
    width: Math.floor((r - l) * 0.4),
    height: Math.floor((b - t) * 0.4),
  };
}
async function digest(name, crop) {
  return createHash('sha256')
    .update(await sharp(`${OUT}/${name}.png`).extract(crop).raw().toBuffer())
    .digest('hex');
}
function brush(label) {
  d.tap('Brushes');
  d.tap(label);
}
async function stroke(tag, crop, n = 1) {
  const paths = Array.from({ length: n }, (_, i) =>
    line(
      [crop.left + 20 + i * 50, crop.top + 40],
      [crop.left + crop.width - 40, crop.top + crop.height - 40 - i * 50]
    )
  );
  await d.inject(tag, paths);
}
try {
  d.restart();
  sinceMs = Date.now();
  startStamp = androidNow(serial);
  xml = d.capture(`${prefix}-boot`);
  if (xml.includes('content-desc="Expand controls"')) d.tap('Expand controls');
  if (!resumeTail) {
    d.tap('Purple');
    for (const label of ['Pen', 'Crayon', 'Magic brush']) {
      brush(label);
      xml = d.capture(`${prefix}-${label.split(' ')[0]}-baseline`);
      const crop = paper(xml),
        base = await digest(`${prefix}-${label.split(' ')[0]}-baseline`, crop);
      for (const n of serial === 'emulator-5682' ? [1, 2] : [1]) {
        const tag = `${prefix}-${label.split(' ')[0]}-${n}-contacts`;
        await stroke(tag, crop, n);
        xml = d.capture(tag);
        assert.notEqual(await digest(tag, crop), base);
        d.tap('Undo');
        xml = d.capture(`${tag}-undo`);
        assert.equal(await digest(`${tag}-undo`, crop), base);
        record(`${label}-${n}-contacts-and-exact-undo`, `${tag}.png`);
      }
    }
    brush('Pen');
    xml = d.capture(`${prefix}-eraser-base`);
    const crop = paper(xml);
    await stroke(`${prefix}-eraser-ink`, crop);
    d.capture(`${prefix}-eraser-ink`);
    const ink = await digest(`${prefix}-eraser-ink`, crop);
    brush('Eraser');
    await stroke(`${prefix}-erased`, crop);
    d.capture(`${prefix}-erased`);
    assert.notEqual(await digest(`${prefix}-erased`, crop), ink);
    d.tap('Undo');
    d.capture(`${prefix}-eraser-undo`);
    assert.equal(await digest(`${prefix}-eraser-undo`, crop), ink);
    record('eraser-and-exact-undo', `${prefix}-erased.png`);
    brush('Pen');
    for (const size of [1, 5, 3]) {
      d.tap('Stroke width');
      d.tap(`Size ${size}`);
      xml = d.capture(`${prefix}-size-${size}`);
      record(`width-choice-${size}`, `${prefix}-size-${size}.xml`);
    }
    d.tap('Custom Color');
    xml = d.capture(`${prefix}-picker`);
    const c = [...xml.matchAll(/<node\b[^>]*>/g)]
      .map((m) => m[0])
      .find((n) => /content-desc="#[A-F0-9]{6}"/.test(n));
    assert.ok(c);
    const color = c.match(/content-desc="([^"]+)"/)[1];
    d.input('tap', ...center(c));
    d.tap('Custom Color');
    xml = d.capture(`${prefix}-picker-recall`);
    assert.ok(xml.includes(`content-desc="${color}"`));
    d.input('keyevent', 'KEYCODE_ESCAPE');
    d.tap('Purple');
    record('picker-select-recall', `${prefix}-picker-recall.xml`, { color });
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
      xml = d.capture(`${prefix}-settings-hub-${section.replace(' ', '-')}`);
      d.tap(section);
      xml = d.capture(`${prefix}-section-${section.replace(' ', '-')}`);
      assert.ok(xml.includes('content-desc="Close"'));
      d.tap('Close');
      record(`settings-entry-${section}`, `${prefix}-section-${section.replace(' ', '-')}.png`);
    }
  }
  d.tap('Settings');
  d.capture(`${prefix}-gate-hub`);
  d.scrollTap('Parent Center');
  xml = d.capture(`${prefix}-gate`);
  const q = xml.match(/What is (\d+) times (\d+)\?/);
  assert.ok(q);
  for (const digit of String(+q[1] * +q[2])) d.input('keyevent', `KEYCODE_${digit}`);
  d.input('keyevent', 'KEYCODE_ENTER');
  xml = d.capture(`${prefix}-parent`);
  assert.ok(xml.includes('Generating an AI image'));
  d.tap('Close');
  record('parent-hardware-gate', `${prefix}-parent.xml`);
  d.tap('Coloring books');
  xml = d.capture(`${prefix}-books`);
  d.tap('Farm coloring book');
  xml = d.capture(`${prefix}-farm`);
  d.tap('Cat coloring page');
  xml = d.capture(`${prefix}-cat`);
  record('bundled-farm-page', `${prefix}-cat.png`);
  brush('Magic brush');
  const pageCrop = paper(xml);
  await stroke(`${prefix}-cat-magic`, pageCrop);
  d.capture(`${prefix}-cat-magic`);
  record('magic-on-bundled-art', `${prefix}-cat-magic.png`);
  brush('Pen');
  d.tap('Settings');
  d.capture(`${prefix}-back-hub`);
  d.tap('Sound');
  d.capture(`${prefix}-back-section`);
  d.back();
  xml = d.capture(`${prefix}-back-root`);
  assert.ok(!xml.includes('content-desc="Close"'));
  record('system-back-dismisses-settings', `${prefix}-back-root.xml`);
  d.restart();
  xml = d.capture(`${prefix}-restart`);
  assert.ok(xml.includes('content-desc="Drawing paper"'));
  record('restart-alive', `${prefix}-restart.png`);
} catch (error) {
  scenarioError = String(error);
  throw error;
} finally {
  let source = '';
  try {
    source = d.capture(`${prefix}-core-final`);
  } catch {}
  const verdict = androidVerdict({ serial, pkg: PKG, startStamp, sinceMs, source });
  writeFileSync(
    `${OUT}/${prefix}-core-results.json`,
    JSON.stringify(
      {
        device: serial,
        api: d.adb('shell', 'getprop', 'ro.build.version.sdk').toString().trim(),
        checks,
        scenarioError,
        ...verdict,
      },
      null,
      2
    ) + '\n'
  );
  d.cleanup();
}
