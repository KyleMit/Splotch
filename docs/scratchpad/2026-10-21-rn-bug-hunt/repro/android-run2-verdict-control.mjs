import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { androidVerdict as unpatched } from '../../../../tools/device-parity/lib/crash-verdict.mjs';
import { androidNow, androidVerdict, repoVerdictSourceSha256 } from './android-run2-verdict.mjs';
import { deviceDriver, PKG, OUT, pause } from './android-device-driver.mjs';
const d = deviceDriver('emulator-5682');
d.launch();
const source = d.capture('android-run2-verdict-control-root');
const sinceMs = Date.now(),
  startStamp = androidNow(d.serial);
d.adb(
  'shell',
  "log -p e -t ReactNativeJS 'RN_HUNT_CONTROL_TIMESTAMP_READ art.splotch.migration.probe'"
);
pause(300);
const input = { serial: d.serial, pkg: PKG, startStamp, sinceMs, source };
const negative = unpatched(input),
  positive = androidVerdict(input);
assert.ok(!negative.log.some((s) => s.includes('RN_HUNT_CONTROL_TIMESTAMP_READ')));
assert.ok(positive.log.some((s) => s.includes('RN_HUNT_CONTROL_TIMESTAMP_READ')));
assert.equal(positive.verdict, 'alive');
writeFileSync(
  `${OUT}/android-run2-verdict-control.json`,
  JSON.stringify(
    {
      repoVerdictSourceSha256,
      startStamp,
      negative,
      positive,
      control:
        'Disclosed QA log marker, not an app error. Only the timestamp command construction is adapted in memory; repo files unchanged.',
    },
    null,
    2
  ) + '\n'
);
console.log('Timestamp negative and positive controls pass');
