import { tap, capture, guard, adb } from './android-driver.mjs';
adb('shell', 'am', 'force-stop', 'art.splotch.migration.probe');
adb('shell', 'am', 'start', '-W', '-n', 'art.splotch.migration.probe/.MainActivity');
const initial = capture('android-magic-control-boot');
if (initial.includes('content-desc="Expand controls"')) tap('Expand controls');
tap('Brushes');
tap('Magic brush');
for (const round of [1, 2]) {
  guard();
  adb('shell', 'uinput', '/data/local/tmp/rn-hunt-joined.jsonl');
  capture(`android-magic-control-${round}`);
  tap('Undo');
}
