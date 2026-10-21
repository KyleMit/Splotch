import { execFileSync } from 'node:child_process';
import { tap, capture, guard, adb } from './android-driver.mjs';
import { writeFileSync } from 'node:fs';
tap('Brushes');
tap('Pen');
const started = Date.now();
const beforePid = adb('shell', 'pidof', 'art.splotch.migration.probe').toString().trim();
guard();
execFileSync(
  'adb',
  ['-s', 'emulator-5680', 'shell', 'uinput', '/data/local/tmp/rn-hunt-stress.jsonl'],
  { timeout: 90000 }
);
capture('android-stress-five-after');
const pid = adb('shell', 'pidof', 'art.splotch.migration.probe').toString().trim();
writeFileSync(
  'docs/scratchpad/2026-10-21-rn-bug-hunt/evidence/android-stress-result.json',
  JSON.stringify({
    durationMs: Date.now() - started,
    pid,
    beforePid,
    contacts: 5,
    scheduledMotionMs: 60000,
  }) + '\n'
);
if (pid !== beforePid) throw new Error('App process changed during stress');
tap('Undo');
capture('android-stress-five-undo');
