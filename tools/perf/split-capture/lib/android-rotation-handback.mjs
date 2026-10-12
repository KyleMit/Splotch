import { capture, tryCapture } from '../../../lib/proc.mjs';
import { androidRotationRestoreCommands, readAndroidRotationSettings } from './android-input.mjs';

// Reads the phone's rotation settings before a tool turns it, and returns the
// `release` that puts them back. The tools that call this fail through
// process.exit, which skips every finally, so the release is also armed on
// `exit`. It runs at most once and disarms that hook, so an in-process caller
// keeps no stray listener. Each write goes through tryCapture: it is
// synchronous, so it still runs inside an exit handler, and it reports instead
// of exiting, so one failed write never skips the other. One retry per write,
// as androidDriver.release does, so a single dropped adb call does not leave
// the phone turned.
//
// androidDriver.release in capture-device-frames.mjs keeps its own copy: that
// module is hashed into the perf:device:frames instrument
// (INSTRUMENT_FILES_BY_COMMAND, guarded by instrument-import-graph.test.mjs), so
// sharing this one with it changes that fingerprint, and every android-*
// drawing campaign would then resume only with --accept-instrument-change.
export function armAndroidRotationHandBack(serial) {
  const previous = readAndroidRotationSettings((args) => capture('adb', ['-s', serial, ...args]));
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    process.off('exit', release);
    for (const command of androidRotationRestoreCommands(previous)) {
      const write = () => tryCapture('adb', ['-s', serial, ...command]);
      let restored = write();
      if (!restored.ok) restored = write();
      if (!restored.ok) {
        console.warn(
          `could not ${command.slice(1).join(' ')} on ${serial} (${restored.stderr.trim()}) — ` +
            'put the rotation back by hand before the next capture'
        );
      }
    }
  };
  process.once('exit', release);
  return { previous, release };
}
