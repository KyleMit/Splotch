import { guard, adb, tap, capture } from './android-driver.mjs';
import { writeFileSync } from 'node:fs';
const original = adb('emu', 'sensor', 'get', 'acceleration')
  .toString()
  .match(/acceleration = ([^\r\n]+)/)[1];
try {
  guard();
  adb('emu', 'rotate');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
  capture('android-sensor-landscape');
  tap('Settings');
  capture('android-sensor-landscape-settings');
  tap('Close');
} finally {
  adb('emu', 'sensor', 'set', 'acceleration', original);
  writeFileSync(
    'docs/scratchpad/2026-10-21-rn-bug-hunt/evidence/android-restored-sensor.txt',
    adb('emu', 'sensor', 'get', 'acceleration')
  );
}
