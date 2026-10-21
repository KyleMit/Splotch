import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const SERIAL = 'emulator-5680';
const COMMAND_TIMEOUT_MS = 10000;
const ROOT = 'docs/scratchpad/2026-10-21-rn-bug-hunt/evidence';
const summaryName = process.argv[2] ?? 'android-run2-monkey-summary.json';
assert.match(summaryName, /^android-run2-monkey(?:-verified)?-summary\.json$/);
const summaryPath = `${ROOT}/${summaryName}`;
const evidenceName = summaryName.replace('-summary.json', '-os-restoration.json');
const summary = JSON.parse(readFileSync(summaryPath));
const result = {
  at: new Date().toISOString(),
  device: SERIAL,
  commands: [],
  after: [],
  errors: [],
};
function adb(...args) {
  return execFileSync('adb', ['-s', SERIAL, ...args], {
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: 2 << 20,
  })
    .toString()
    .trim();
}
function restore(...args) {
  const output = adb(...args);
  result.commands.push({ args, output });
}
try {
  adb('shell', 'true');
  restore('shell', 'cmd', 'connectivity', 'airplane-mode', 'disable');
  restore('shell', 'svc', 'wifi', summary.baseline.wifi === '1' ? 'enable' : 'disable');
  restore('shell', 'svc', 'data', summary.baseline.data === '1' ? 'enable' : 'disable');
  const bluetoothBefore = summary.settingsBefore.global
    .split('\n')
    .find((line) => line.startsWith('bluetooth_on='))
    ?.split('=')[1];
  assert.equal(bluetoothBefore, '1');
  restore('shell', 'svc', 'bluetooth', 'enable');
  for (const difference of summary.osDifferences) {
    const { namespace, key, before } = difference;
    assert.ok(['system', 'secure', 'global'].includes(namespace));
    assert.match(key, /^[a-z_][a-z0-9_.:-]*$/i);
    if (before !== null) assert.match(before, /^[a-z0-9_.:-]+$/i);
    restore(
      'shell',
      'settings',
      before === null ? 'delete' : 'put',
      namespace,
      key,
      ...(before === null ? [] : [before])
    );
  }
  for (const difference of summary.osDifferences) {
    const after = adb('shell', 'settings', 'get', difference.namespace, difference.key);
    result.after.push({ ...difference, after, restored: after === (difference.before ?? 'null') });
  }
  result.font = adb('shell', 'settings', 'get', 'system', 'font_scale');
  result.rotation = adb('shell', 'settings', 'get', 'system', 'user_rotation');
  result.autoRotation = adb('shell', 'settings', 'get', 'system', 'accelerometer_rotation');
  result.night = adb('shell', 'cmd', 'uimode', 'night');
  result.sensor = adb('emu', 'sensor', 'get', 'acceleration');
  result.restored = result.after.every((d) => d.restored);
  assert.ok(result.restored, 'OS baseline mismatch after restoration');
  summary.osRestorationVerificationPending = false;
  summary.osRestorationEvidence = evidenceName;
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');
} catch (error) {
  result.errors.push(String(error));
  result.restored = false;
  process.exitCode = 1;
} finally {
  writeFileSync(`${ROOT}/${evidenceName}`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
