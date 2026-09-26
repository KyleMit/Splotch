// Runs a capture that finishes at once and then hands the device back slowly,
// so a test can send a real SIGINT while the hand-back's own child process is
// running. The hand-back touches the marker file named in argv, then sleeps.
import { spawnSync } from 'node:child_process';
import { driveHandingBack, processSignals } from '../../split-capture/capture-device-frames.mjs';

const [marker] = process.argv.slice(2);
let handedBack = false;
const driver = {
  release() {
    if (handedBack) return;
    handedBack = true;
    const child = spawnSync('sh', ['-c', 'touch "$1"; sleep 5', 'sh', marker]);
    console.log(`hand-back ended ${child.signal ?? child.status}`);
  },
};

await driveHandingBack(driver, async () => 'report', { signals: processSignals });
console.log('capture carried on');
