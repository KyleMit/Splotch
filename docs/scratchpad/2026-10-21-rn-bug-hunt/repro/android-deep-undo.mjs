import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { MAX_UNDO_DEPTH } from '../../../../web/src/lib/drawing/undoHistory.ts';
import { adb, capture, input, tap, OUT } from './android-driver.mjs';

const PACKAGE = 'art.splotch.migration.probe';
const STROKE_COUNT = 25;
const UNDO_SETTLE_MS = 650;
const PAPER = { left: 200, top: 600, width: 650, height: 1300 };
function undoEnabled(xml, expected) {
  assert.match(xml, new RegExp(`content-desc="Undo"[^>]*enabled="${expected}"`));
}
async function digest(name) {
  const pixels = await sharp(`${OUT}/${name}.png`).extract(PAPER).raw().toBuffer();
  return createHash('sha256').update(pixels).digest('hex');
}
adb('shell', 'am', 'force-stop', PACKAGE);
adb('shell', 'am', 'start', '-W', '-n', `${PACKAGE}/.MainActivity`);
let state = capture('android-deep-undo-blank');
if (state.includes('content-desc="Expand controls"')) tap('Expand controls');
tap('Brushes');
tap('Pen');
state = capture('android-deep-undo-empty-ready');
undoEnabled(state, false);
const blank = await digest('android-deep-undo-empty-ready');
for (let index = 0; index < STROKE_COUNT; index++) {
  input('tap', 300 + (index % 5) * 100, 800 + Math.floor(index / 5) * 180);
  if (index + 1 === STROKE_COUNT - MAX_UNDO_DEPTH) capture('android-deep-undo-retained-base');
}
const retainedBase = await digest('android-deep-undo-retained-base');
state = capture('android-deep-undo-25-dots');
undoEnabled(state, true);
const dotPixels = await digest('android-deep-undo-25-dots');
assert.notEqual(dotPixels, blank, 'Dots did not render');
const undoNode = [...state.matchAll(/<node\b[^>]*>/g)]
  .map(([node]) => node)
  .find((node) => node.includes('content-desc="Undo"'));
const bounds = [...undoNode.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)].slice(1).map(Number);
const center = [Math.round((bounds[0] + bounds[2]) / 2), Math.round((bounds[1] + bounds[3]) / 2)];
for (let count = 1; count < MAX_UNDO_DEPTH; count++) {
  input('tap', ...center);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, UNDO_SETTLE_MS);
}
state = capture('android-deep-undo-one-left');
undoEnabled(state, true);
input('tap', ...center);
state = capture('android-deep-undo-exhausted');
undoEnabled(state, false);
const exhausted = await digest('android-deep-undo-exhausted');
assert.equal(exhausted, retainedBase, 'Undo exhaustion did not retain the oldest dots');
input('tap', ...center);
capture('android-deep-undo-extra-press');
const extra = await digest('android-deep-undo-extra-press');
assert.equal(extra, retainedBase, 'Empty Undo changed paper');
input('swipe', 400, 850, 760, 1500, 500);
state = capture('android-deep-undo-new-stroke');
undoEnabled(state, true);
input('keycombination', '-t', 100, 'KEYCODE_CTRL_LEFT', 'KEYCODE_Z');
state = capture('android-deep-undo-new-undone');
undoEnabled(state, false);
assert.equal(await digest('android-deep-undo-new-undone'), retainedBase);
tap('Brushes');
capture('android-shortcut-brushes-open');
input('keyevent', 'KEYCODE_ESCAPE');
state = capture('android-shortcut-brushes-escaped');
assert.ok(!state.includes('content-desc="Magic brush"'), 'Escape left brush menu open');
writeFileSync(
  `${OUT}/android-deep-undo-results.json`,
  JSON.stringify(
    {
      strokes: STROKE_COUNT,
      undoPressesToEmpty: MAX_UNDO_DEPTH,
      blank,
      retainedBase,
      dotPixels,
      exhausted,
      extra,
      newStrokeCtrlZ: 'pass',
      flyoutEscape: 'pass',
    },
    null,
    2
  ) + '\n'
);
