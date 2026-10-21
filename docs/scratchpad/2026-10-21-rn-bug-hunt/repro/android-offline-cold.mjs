import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { adb, capture, guard, tap, OUT } from './android-driver.mjs';
import { controlledPath } from './android-controlled-path.mjs';

const PACKAGE = 'art.splotch.migration.probe';
const original = adb('shell', 'settings', 'get', 'global', 'airplane_mode_on').toString().trim();
assert.match(original, /^[01]$/);
try {
  guard();
  const beforePid = adb('shell', 'pidof', PACKAGE).toString().trim();
  adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable');
  assert.equal(
    adb('shell', 'settings', 'get', 'global', 'airplane_mode_on').toString().trim(),
    '1'
  );
  adb('shell', 'am', 'force-stop', PACKAGE);
  adb('shell', 'am', 'start', '-W', '-n', `${PACKAGE}/.MainActivity`);
  const root = capture('android-offline-cold-root');
  assert.ok(root.includes('content-desc="Drawing paper"'));
  if (root.includes('content-desc="Expand controls"')) tap('Expand controls');
  controlledPath([350, 900], [750, 1400]);
  const drawn = capture('android-offline-cold-drawn');
  assert.match(drawn, /content-desc="Undo"[^>]*enabled="true"/);
  const afterPid = adb('shell', 'pidof', PACKAGE).toString().trim();
  assert.notEqual(beforePid, afterPid);
  writeFileSync(
    `${OUT}/android-offline-cold-results.json`,
    JSON.stringify(
      {
        beforePid,
        afterPid,
        airplaneMode: adb('shell', 'settings', 'get', 'global', 'airplane_mode_on')
          .toString()
          .trim(),
        wifi: adb('shell', 'settings', 'get', 'global', 'wifi_on').toString().trim(),
        wifiStatus: adb('shell', 'cmd', 'wifi', 'status').toString().trim(),
        cache: 'warm',
        drawing: 'accepted',
      },
      null,
      2
    ) + '\n'
  );
} finally {
  adb('shell', 'cmd', 'connectivity', 'airplane-mode', original === '1' ? 'enable' : 'disable');
}
