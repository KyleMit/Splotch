import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { adb, capture, guard, input, tap, OUT } from './android-driver.mjs';

const FIXTURE = '/private/tmp/rn-hunt-clear.jsonl';
const REMOTE = '/data/local/tmp/rn-hunt-clear.jsonl';
const SAMPLE_MS = 16;
const LEG_STEPS = 30;
const PAPER = { left: 200, top: 600, width: 650, height: 1300 };
const START = [1015, 451];
const registration = JSON.parse(
  readFileSync(new URL('./joined-touch.jsonl', import.meta.url), 'utf8').split('\n')[0]
);
async function digest(name) {
  const pixels = await sharp(`${OUT}/${name}.png`).extract(PAPER).raw().toBuffer();
  return createHash('sha256').update(pixels).digest('hex');
}
function gesture(waypoints) {
  const commands = [registration, { id: 1, command: 'delay', duration: 1500 }];
  const emit = (events) =>
    commands.push({ id: 1, command: 'inject', events: [...events, 0, 0, 0] });
  emit([
    3,
    47,
    0,
    3,
    57,
    11,
    3,
    55,
    0,
    3,
    53,
    START[0],
    3,
    54,
    START[1],
    3,
    48,
    10,
    1,
    330,
    1,
    1,
    325,
    1,
  ]);
  let from = START;
  for (const to of waypoints) {
    for (let step = 1; step <= LEG_STEPS; step++) {
      const position = from.map((value, index) =>
        Math.round(value + ((to[index] - value) * step) / LEG_STEPS)
      );
      emit([3, 47, 0, 3, 53, position[0], 3, 54, position[1]]);
      commands.push({ id: 1, command: 'delay', duration: SAMPLE_MS });
    }
    from = to;
  }
  emit([3, 47, 0, 3, 57, -1, 1, 330, 0, 1, 325, 0]);
  commands.push({ id: 1, command: 'delay', duration: 500 });
  writeFileSync(FIXTURE, commands.map((command) => JSON.stringify(command)).join('\n') + '\n');
  adb('push', FIXTURE, REMOTE);
  guard();
  adb('shell', 'uinput', REMOTE);
}

try {
  const state = capture('android-clear-cancel-blank');
  assert.ok(
    state.includes('content-desc="Settings"') && !state.includes('content-desc="Close"'),
    'Start on blank root'
  );
  const blank = await digest('android-clear-cancel-blank');
  if (state.includes('content-desc="Expand controls"')) tap('Expand controls');
  tap('Brushes');
  tap('Pen');
  input('swipe', 400, 850, 760, 1500, 600);
  capture('android-clear-cancel-ink');
  const ink = await digest('android-clear-cancel-ink');
  gesture([[970, 451]]);
  capture('android-clear-short-returned');
  const short = await digest('android-clear-short-returned');
  assert.equal(short, ink, 'Short clear changed ink');
  gesture([[500, 950], START]);
  capture('android-clear-reversed-returned');
  const reversed = await digest('android-clear-reversed-returned');
  assert.equal(reversed, ink, 'Reversed clear changed ink');
  gesture([[500, 950]]);
  capture('android-clear-full-committed');
  const cleared = await digest('android-clear-full-committed');
  assert.notEqual(cleared, ink, 'Full clear did not change ink');
  assert.equal(cleared, blank, 'Full clear did not restore blank paper');
  tap('Undo');
  capture('android-clear-full-undone');
  const restored = await digest('android-clear-full-undone');
  assert.equal(restored, ink, 'Undo did not restore identical ink');
  writeFileSync(
    `${OUT}/android-clear-cancel-results.json`,
    JSON.stringify(
      {
        paper: PAPER,
        blank,
        ink,
        short,
        reversed,
        cleared,
        restored,
        checks: ['short preserves', 'reversed preserves', 'full commits', 'Undo restores'],
      },
      null,
      2
    ) + '\n'
  );
} finally {
  adb('shell', 'rm', '-f', REMOTE);
}
