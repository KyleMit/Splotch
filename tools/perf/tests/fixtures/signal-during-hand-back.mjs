import { spawnSync } from 'node:child_process';
import { driveHandingBack, processSignals } from '../../split-capture/capture-device-frames.mjs';
import { HAND_BACK_WINDOW_MS } from './signal-hand-back-harness.mjs';

const [marker] = process.argv.slice(2);
let handedBack = false;
const driver = {
  release() {
    if (handedBack) return;
    handedBack = true;
    // The fallback remains live throughout the parent's readiness and close allocations.
    const child = spawnSync('sh', [
      '-c',
      'touch "$1"; sleep "$2"',
      'sh',
      marker,
      String(HAND_BACK_WINDOW_MS / 1000),
    ]);
    console.log(`hand-back ended ${child.signal ?? child.status}`);
  },
};

await driveHandingBack(driver, async () => 'report', { signals: processSignals });
console.log('capture carried on');
