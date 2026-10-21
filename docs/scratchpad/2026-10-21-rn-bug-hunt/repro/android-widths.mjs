import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import {
  STROKE_WIDTHS,
  STROKE_WIDTH_PX,
} from '../../../../experiments/native-architecture/src/drawing/strokeWidth.ts';
import { adb, capture, tap, OUT } from './android-driver.mjs';
import { controlledPath } from './android-controlled-path.mjs';

const PACKAGE = 'art.splotch.migration.probe';
const SIZES = [1, 2, 3, 4, 5];
const LINE_Y = [750, 1000, 1250, 1500, 1750];
const SCAN_X = 550;
const HALF_SCAN_PX = 90;
const WIDTH_TOLERANCE_PX = 2;
const density = Number(
  [
    ...adb('shell', 'wm', 'density')
      .toString()
      .matchAll(/density:\s*(\d+)/g),
  ].at(-1)?.[1]
);
assert.ok(density > 0, 'No emulator display density');
const pixelRatio = density / 160;
function selectBrush(label) {
  tap('Brushes');
  tap(label);
}
function size(label) {
  tap('Stroke width');
  tap(label);
}
async function scan(name, gaps) {
  const { data, info } = await sharp(`${OUT}/${name}.png`)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return LINE_Y.map((center) => {
    let count = 0;
    for (let y = center - HALF_SCAN_PX; y <= center + HALF_SCAN_PX; y++) {
      const offset = (y * info.width + SCAN_X) * info.channels;
      const [r, g, b] = data.subarray(offset, offset + 3);
      const purple = r >= 130 && r <= 210 && g >= 50 && g <= 155 && b >= 170;
      if (gaps ? !purple : purple) count++;
    }
    return count;
  });
}
function increasing(widths) {
  assert.ok(
    widths.every((width, index) => width > 0 && (index === 0 || width > widths[index - 1])),
    `Non-increasing rendered widths ${widths}`
  );
}
function matchesPolicy(widths, brush) {
  const expected = STROKE_WIDTHS.map((size) => STROKE_WIDTH_PX[brush][size] * pixelRatio);
  assert.ok(
    widths.every((width, index) => Math.abs(width - expected[index]) <= WIDTH_TOLERANCE_PX),
    `${brush}: measured ${widths}; expected ${expected}`
  );
}
adb('shell', 'am', 'force-stop', PACKAGE);
adb('shell', 'am', 'start', '-W', '-n', `${PACKAGE}/.MainActivity`);
const initial = capture('android-widths-initial');
if (initial.includes('content-desc="Expand controls"')) tap('Expand controls');
selectBrush('Pen');
tap('Purple');
tap('Stroke width');
const baseline = capture('android-widths-pen-baseline');
assert.match(baseline, /content-desc="Size 3"[^>]*selected="true"/);
tap('Size 3');
for (const index of SIZES) {
  size(`Size ${index}`);
  controlledPath([350, LINE_Y[index - 1]], [800, LINE_Y[index - 1]]);
}
capture('android-widths-pen-five');
const penWidths = await scan('android-widths-pen-five', false);
console.log('Pen widths', penWidths);
increasing(penWidths);
matchesPolicy(penWidths, 'pen');
tap('Stroke width');
const penLast = capture('android-widths-pen-last-selected');
assert.match(penLast, /content-desc="Size 5"[^>]*selected="true"/);
tap('Size 3');
adb('shell', 'am', 'force-stop', PACKAGE);
adb('shell', 'am', 'start', '-W', '-n', `${PACKAGE}/.MainActivity`);
capture('android-widths-eraser-restarted');
selectBrush('Pen');
size('Size 5');
controlledPath([SCAN_X, 600], [SCAN_X, 2000]);
capture('android-widths-eraser-background');
selectBrush('Eraser');
tap('Stroke width');
const eraserBaseline = capture('android-widths-eraser-baseline');
assert.match(eraserBaseline, /content-desc="Eraser size 3"[^>]*selected="true"/);
tap('Eraser size 3');
for (const index of SIZES) {
  size(`Eraser size ${index}`);
  controlledPath([350, LINE_Y[index - 1]], [800, LINE_Y[index - 1]]);
}
capture('android-widths-eraser-five');
const eraserGaps = await scan('android-widths-eraser-five', true);
console.log('Eraser gaps', eraserGaps);
increasing(eraserGaps);
matchesPolicy(eraserGaps, 'eraser');
size('Eraser size 3');
selectBrush('Pen');
size('Size 3');
writeFileSync(
  `${OUT}/android-widths-results.json`,
  JSON.stringify(
    {
      penWidths,
      eraserGaps,
      density,
      pixelRatio,
      tolerancePx: WIDTH_TOLERANCE_PX,
      scan: { x: SCAN_X, y: LINE_Y, halfHeight: HALF_SCAN_PX },
      restored: { brush: 'Pen', penSize: 3, eraserSize: 3 },
    },
    null,
    2
  ) + '\n'
);
capture('android-widths-restored');
