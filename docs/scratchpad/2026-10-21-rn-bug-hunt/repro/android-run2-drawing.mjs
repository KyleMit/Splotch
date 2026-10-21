import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { adb, capture, tap, OUT } from './android-driver.mjs';
import { inject, pathCommands, line } from './android-run2-touch.mjs';
const pkg = 'art.splotch.migration.probe';
const results = [];
function reset() {
  adb('shell', 'am', 'force-stop', pkg);
  adb('shell', 'am', 'start', '-W', '-n', `${pkg}/.MainActivity`);
  const x = capture('android-run2-draw-reset');
  if (x.includes('content-desc="Expand controls"')) tap('Expand controls');
}
function brush(label) {
  tap('Brushes');
  tap(label);
}
function size(n) {
  tap('Stroke width');
  tap(`Size ${n}`);
}
async function pixels(name) {
  const { data, info } = await sharp(`${OUT}/${name}.png`)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, info };
}
function colored(p, x, y) {
  const i = (y * p.info.width + x) * p.info.channels;
  const [r, g, b] = p.data.subarray(i, i + 3);
  return Math.max(r, g, b) - Math.min(r, g, b) > 25 && Math.min(r, g, b) < 220;
}
function coverage(p, y) {
  const rows = [];
  for (let dy = -90; dy <= 90; dy++) {
    let hit = false;
    for (let x = 400; x <= 700; x++)
      if (colored(p, x, y + dy)) {
        hit = true;
        break;
      }
    if (hit) rows.push(dy);
  }
  return rows.length ? rows.at(-1) - rows[0] + 1 : 0;
}
for (const label of ['Crayon', 'Magic brush']) {
  reset();
  tap('Purple');
  brush(label);
  for (let n = 1; n <= 5; n++) {
    size(n);
    await inject(
      `android-run2-${label.split(' ')[0]}-width-${n}`,
      pathCommands([line([350, 650 + n * 240], [800, 650 + n * 240])])
    );
  }
  const name = `android-run2-${label.split(' ')[0]}-widths`;
  capture(name);
  const p = await pixels(name);
  const widths = Array.from({ length: 5 }, (_, i) => coverage(p, 650 + (i + 1) * 240));
  assert.ok(
    widths.every((n, i) => n > 0 && (!i || n > widths[i - 1])),
    `${label} widths ${widths}`
  );
  results.push({ case: `${label}-five-widths`, widths });
  size(3);
  for (const count of [1, 2, 5]) {
    const name = `android-run2-${label.split(' ')[0]}-${count}-contacts`;
    const paths = Array.from({ length: count }, (_, c) =>
      line([350 + c * 65, 900 + c * 120], [750 + c * 30, 1050 + c * 120])
    );
    await inject(name, pathCommands(paths));
    capture(name);
    tap('Undo');
    capture(`${name}-undo`);
    results.push({ case: `${label}-${count}-contact-cohort`, status: 'captured' });
  }
}
for (const label of ['Pen', 'Crayon', 'Magic brush']) {
  reset();
  tap('Purple');
  brush(label);
  await inject(`android-run2-${label.split(' ')[0]}-dot`, pathCommands([[[550, 1100]]], 80));
  capture(`android-run2-${label.split(' ')[0]}-dot`);
  const p = await pixels(`android-run2-${label.split(' ')[0]}-dot`);
  assert.ok(coverage(p, 1100) > 0);
  tap('Undo');
  capture(`android-run2-${label.split(' ')[0]}-dot-undo`);
  results.push({ case: `${label}-dot`, status: 'pass' });
}
for (let run = 1; run <= 2; run++) {
  reset();
  brush('Magic brush');
  size(3);
  const paths = [
    Array.from({ length: 76 }, (_, i) => [
      Math.round(540 + Math.sin(i * 0.13) * 220),
      Math.round(1250 + Math.cos(i * 0.09) * 430),
    ]),
  ];
  const name = `android-run2-magic-clean-${run}`;
  await inject(name, pathCommands(paths), true);
  capture(name);
  tap('Undo');
  capture(`${name}-undo`);
  results.push({ case: `magic-clean-${run}`, status: 'captured-with-kernel-trace' });
}
reset();
brush('Pen');
tap('Purple');
await inject(
  'android-run2-edges',
  pathCommands([
    [
      ...line([550, 950], [4, 950]),
      ...line([4, 950], [1075, 950]),
      ...line([1075, 950], [550, 950]),
    ],
  ])
);
capture('android-run2-edges');
tap('Undo');
capture('android-run2-edges-undo');
results.push({ case: 'edge-crossings', status: 'captured' });
brush('Pen');
size(3);
writeFileSync(`${OUT}/android-run2-drawing-results.json`, JSON.stringify(results, null, 2) + '\n');
