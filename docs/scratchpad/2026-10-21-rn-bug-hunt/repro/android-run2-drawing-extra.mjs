import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { capture, tap, OUT } from './android-driver.mjs';
import { restart } from './android-run2-settings-helpers.mjs';
import { inject, pathCommands, line } from './android-run2-touch.mjs';
const checks = [],
  crop = { left: 200, top: 600, width: 700, height: 1300 };
async function digest(name) {
  return createHash('sha256')
    .update(await sharp(`${OUT}/${name}.png`).extract(crop).raw().toBuffer())
    .digest('hex');
}
function brush(label) {
  tap('Brushes');
  tap(label);
}
let xml = restart('android-run2-extra-start');
if (xml.includes('content-desc="Expand controls"')) tap('Expand controls');
tap('Purple');
brush('Pen');
tap('Stroke width');
tap('Size 5');
for (let i = 0; i < 5; i++)
  await inject(
    `android-run2-eraser-bg-${i}`,
    pathCommands([line([250, 800 + i * 220], [850, 800 + i * 220])])
  );
capture('android-run2-eraser-bg');
const bg = await digest('android-run2-eraser-bg');
brush('Eraser');
for (const n of [1, 2, 5]) {
  const name = `android-run2-eraser-${n}-contacts`;
  const paths = Array.from({ length: n }, (_, c) =>
    line([350 + c * 70, 650], [450 + c * 70, 1900])
  );
  const commands = pathCommands(paths);
  for (let i = commands.length - 2; i > commands.length - 2 - n; i--)
    commands.splice(i, 0, { id: 1, command: 'delay', duration: 80 });
  await inject(name, commands);
  capture(name);
  assert.notEqual(await digest(name), bg);
  tap('Undo');
  capture(`${name}-undo`);
  assert.equal(await digest(`${name}-undo`), bg);
  checks.push({ case: `eraser-${n}-contacts`, status: 'pass' });
}
await inject('android-run2-eraser-dot', pathCommands([[[550, 1240]]], 80));
capture('android-run2-eraser-dot');
assert.notEqual(await digest('android-run2-eraser-dot'), bg);
tap('Undo');
capture('android-run2-eraser-dot-undo');
assert.equal(await digest('android-run2-eraser-dot-undo'), bg);
checks.push({ case: 'eraser-dot', status: 'pass' });
for (const label of ['Pen', 'Crayon', 'Magic brush']) {
  restart(`android-run2-edge-${label.split(' ')[0]}-reset`);
  tap('Purple');
  brush(label);
  const points = [
    ...line([550, 1000], [5, 1000]),
    ...line([5, 1000], [1074, 1000]),
    ...line([1074, 1000], [550, 1000]),
    ...line([550, 1000], [550, 200]),
    ...line([550, 200], [550, 2300]),
    ...line([550, 2300], [550, 1000]),
  ];
  await inject(`android-run2-edge-${label.split(' ')[0]}`, pathCommands([points]));
  xml = capture(`android-run2-edge-${label.split(' ')[0]}`);
  assert.ok(
    !xml.includes('Color Picker') &&
      !xml.includes('Brush Menu') &&
      !xml.includes('content-desc="Close"')
  );
  tap('Undo');
  capture(`android-run2-edge-${label.split(' ')[0]}-undo`);
  checks.push({ case: `${label}-edge-crossings`, status: 'captured-no-chrome-activation' });
}
brush('Pen');
tap('Stroke width');
tap('Size 3');
await import('./android-run2-picker.mjs');
brush('Eraser');
tap('Stroke width');
tap('Eraser size 3');
brush('Pen');
writeFileSync(
  `${OUT}/android-run2-drawing-extra-results.json`,
  JSON.stringify(checks, null, 2) + '\n'
);
