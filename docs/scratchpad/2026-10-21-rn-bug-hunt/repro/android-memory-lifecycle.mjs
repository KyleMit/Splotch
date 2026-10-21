import { capture, input, guard, adb } from './android-driver.mjs';
import { writeFileSync } from 'node:fs';
input('swipe', 300, 900, 750, 1100, 500);
capture('android-before-memory-warning');
guard();
adb('shell', 'am', 'send-trim-memory', 'art.splotch.migration.probe', 'RUNNING_CRITICAL');
capture('android-after-memory-warning');
input('keyevent', 'KEYCODE_HOME');
adb('shell', 'am', 'start', '-W', '-n', 'art.splotch.migration.probe/.MainActivity');
capture('android-after-home-resume');
guard();
adb('shell', 'am', 'force-stop', 'art.splotch.migration.probe');
adb('shell', 'am', 'start', '-W', '-n', 'art.splotch.migration.probe/.MainActivity');
capture('android-after-process-death');
writeFileSync(
  'docs/scratchpad/2026-10-21-rn-bug-hunt/evidence/android-memory-logcat.txt',
  adb(
    'logcat',
    '-d',
    '-t',
    '300',
    '--pid',
    adb('shell', 'pidof', 'art.splotch.migration.probe').toString().trim(),
    '-v',
    'brief'
  )
);
