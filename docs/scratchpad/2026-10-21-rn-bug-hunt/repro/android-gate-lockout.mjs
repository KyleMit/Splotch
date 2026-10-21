import { tap, capture, guard, adb, input } from './android-driver.mjs';
import { writeFileSync } from 'node:fs';
const root = 'docs/scratchpad/2026-10-21-rn-bug-hunt/evidence/';
adb('shell', 'am', 'force-stop', 'art.splotch.migration.probe');
adb('shell', 'am', 'start', '-W', '-n', 'art.splotch.migration.probe/.MainActivity');
capture('android-gate-fresh-process');
tap('Settings');
tap('Parent Center');
const before = capture('android-gate-lockout-setup');
function center(label) {
  const node = (before.match(/<node[^>]*>/g) ?? []).find(
    (n) =>
      n.includes('class="android.widget.Button"') &&
      (n.includes(`text="${label}"`) || n.includes(`content-desc="${label}"`))
  );
  const [, x, y, x2, y2] = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  return [Math.round((+x + +x2) / 2), Math.round((+y + +y2) / 2)];
}
const zero = center('0'),
  check = center('Check answer');
for (let i = 0; i < 3; i++) {
  input('tap', ...zero);
  input('tap', ...check);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
}
const started = Date.now();
guard();
writeFileSync(root + 'android-gate-lockout-raw.png', adb('exec-out', 'screencap', '-p'));
input('tap', ...zero);
input('tap', ...check);
writeFileSync(root + 'android-gate-lockout-after-tap.png', adb('exec-out', 'screencap', '-p'));
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 31000);
const ready = capture('android-gate-lockout-ended');
writeFileSync(
  root + 'android-gate-lockout-timing.json',
  JSON.stringify({ afterLockoutMs: Date.now() - started }) + '\n'
);
const [, x, y] = ready.match(/What is (\d+) times (\d+)\?/);
for (const digit of String(Number(x) * Number(y))) tap(digit);
tap('Check answer');
const unlocked = capture('android-gate-after-lockout-unlocked');
if (!unlocked.includes('Generating an AI image')) throw new Error('Gate destination did not open');
tap('Close');
