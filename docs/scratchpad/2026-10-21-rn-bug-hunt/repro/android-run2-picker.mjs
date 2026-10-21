import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { capture, tap, input, OUT } from './android-driver.mjs';
import { center, restart } from './android-run2-settings-helpers.mjs';
import { inject, pathCommands, line } from './android-run2-touch.mjs';
const checks = [];
restart('android-run2-picker-corrected-root');
tap('Custom Color');
let xml = capture('android-run2-picker-corrected-open');
const colors = [...xml.matchAll(/<node\b[^>]*>/g)]
  .map((m) => m[0])
  .filter((n) => /content-desc="#[A-F0-9]{6}"/.test(n));
const from = colors[0],
  to = colors.at(-2),
  target = to.match(/content-desc="([^"]+)"/)[1];
input('tap', ...center(from));
tap('Custom Color');
capture('android-run2-picker-corrected-before');
await inject('android-run2-picker-corrected-drag', pathCommands([line(center(from), center(to))]));
xml = capture('android-run2-picker-corrected-picked');
assert.ok(!xml.includes('#FFB3C1'));
await inject('android-run2-picker-corrected-ink', pathCommands([line([350, 950], [750, 1500])]));
capture('android-run2-picker-corrected-ink');
const { data, info } = await sharp(`${OUT}/android-run2-picker-corrected-ink.png`)
  .extract({ left: 300, top: 900, width: 500, height: 650 })
  .raw()
  .toBuffer({ resolveWithObject: true });
const rgb = target
  .slice(1)
  .match(/../g)
  .map((h) => parseInt(h, 16));
let pixels = 0;
for (let i = 0; i < data.length; i += info.channels)
  if (rgb.every((v, k) => Math.abs(data[i + k] - v) < 3)) pixels++;
assert.ok(pixels > 1000, `Wrong picked ink ${target}: ${pixels}`);
tap('Undo');
checks.push({
  case: 'picker-drag-picks-final-color',
  status: 'pass',
  target,
  matchingInkPixels: pixels,
});
tap('Custom Color');
capture('android-run2-picker-corrected-selected');
input('tap', 30, 1200);
capture('android-run2-picker-corrected-scrim');
tap('Purple');
tap('Custom Color');
capture('android-run2-picker-corrected-recall');
const digest = async (name) =>
  createHash('sha256')
    .update(
      await sharp(`${OUT}/${name}.png`)
        .extract({ left: 65, top: 532, width: 950, height: 1340 })
        .raw()
        .toBuffer()
    )
    .digest('hex');
assert.equal(
  await digest('android-run2-picker-corrected-selected'),
  await digest('android-run2-picker-corrected-recall')
);
assert.notEqual(
  await digest('android-run2-picker-corrected-before'),
  await digest('android-run2-picker-corrected-selected')
);
checks.push({ case: 'picker-scrim-and-palette-recall-exact-grid', status: 'pass' });
input('tap', 30, 1200);
tap('Purple');
writeFileSync(`${OUT}/android-run2-picker-results.json`, JSON.stringify(checks, null, 2) + '\n');
