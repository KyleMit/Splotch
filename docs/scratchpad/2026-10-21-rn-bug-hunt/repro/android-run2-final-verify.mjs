import { permissionHelper } from './android-run2-api28-permission-helper.mjs';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { deviceDriver, OUT, PKG } from './android-device-driver.mjs';

const serial = process.argv[2];
assert.ok(['emulator-5680', 'emulator-5682', 'emulator-5684'].includes(serial));
const d = deviceDriver(serial);
const phone = serial === 'emulator-5680';
const monkey = phone ? JSON.parse(readFileSync(`${OUT}/android-run2-monkey-summary.json`)) : null;
const baseline = phone
  ? {
      ...JSON.parse(readFileSync(`${OUT}/android-run2-monkey-os-restoration.json`)),
      wifi: monkey.baseline.wifi,
      data: monkey.baseline.data,
      immersive: '',
    }
  : JSON.parse(readFileSync(`${OUT}/android-run2-${serial}-baseline.json`));
const result = { at: new Date().toISOString(), device: serial, checks: [], errors: [] };
const read = (...args) =>
  d
    .adb(...args)
    .toString()
    .trim();
function check(name, expected, actual) {
  result.checks.push({ name, expected, actual, pass: expected === actual });
}
try {
  check('font', baseline.font, read('shell', 'settings', 'get', 'system', 'font_scale'));
  check('rotation', baseline.rotation, read('shell', 'settings', 'get', 'system', 'user_rotation'));
  check(
    'autoRotation',
    baseline.autoRotation,
    read('shell', 'settings', 'get', 'system', 'accelerometer_rotation')
  );
  check('night', baseline.night, read('shell', 'cmd', 'uimode', 'night'));
  check('wifi', baseline.wifi, read('shell', 'settings', 'get', 'global', 'wifi_on'));
  check('data', baseline.data, read('shell', 'settings', 'get', 'global', 'mobile_data'));
  check(
    'sensor',
    baseline.sensor.replaceAll('\r', '').trim(),
    read('emu', 'sensor', 'get', 'acceleration').replaceAll('\r', '')
  );
  const immersive = read('shell', 'settings', 'get', 'secure', 'immersive_mode_confirmations');
  if (serial === 'emulator-5682')
    result.checks.push({
      name: 'immersiveSemanticRestoration',
      actual: immersive,
      pass: ['', 'null'].includes(immersive),
      limitation:
        'Exact original value was not captured; initial guidance proves the unconfirmed state only.',
    });
  else check('immersive', baseline.immersive, immersive);
  if (phone)
    for (const difference of monkey.osDifferences)
      check(
        `${difference.namespace}.${difference.key}`,
        difference.before ?? 'null',
        read('shell', 'settings', 'get', difference.namespace, difference.key)
      );
  const apkPath = read('shell', 'pm', 'path', PKG).match(
    /^package:(\/data\/app\/[A-Za-z0-9_~+./=-]+\/base\.apk)$/
  )?.[1];
  assert.ok(apkPath, 'Unexpected installed APK path');
  const expectedSha = readFileSync(`${OUT}/android-artifact.sha256.txt`, 'utf8').split(/\s+/)[0];
  assert.match(expectedSha, /^[a-f0-9]{64}$/);
  check('sameApkSha256', expectedSha, read('shell', 'sha256sum', apkPath).split(/\s+/)[0]);
  let pid = '';
  try {
    pid = read('shell', 'pidof', PKG);
  } catch (error) {
    assert.equal(error.status, 1);
    assert.equal(String(error.stdout ?? '').trim(), '');
  }
  check('probeStopped', '', pid);
  if (serial === 'emulator-5684') {
    const helper = permissionHelper();
    try {
      const permissions = helper.read('inspect');
      assert.equal(permissions.length, 2);
      result.storagePermissions = permissions;
      result.permissionReadMethod =
        'Scoped API28 package-manager inspect; dumpsys omits denied permissions with no flags';
      for (const permission of permissions)
        result.checks.push({
          name: 'storagePermissionAndUserFlags',
          actual: permission,
          pass:
            permission.permissionCheck === -1 &&
            permission.beforeFlags === 0 &&
            permission.afterFlags === 0 &&
            !permission.clearedUserFlags,
        });
    } finally {
      helper.cleanup();
      result.permissionHelperRemoved = true;
    }
  }
} catch (error) {
  result.errors.push(String(error));
}
result.restored = result.errors.length === 0 && result.checks.every((check) => check.pass);
writeFileSync(
  `${OUT}/android-run2-${serial}-final-verification.json`,
  JSON.stringify(result, null, 2) + '\n'
);
console.log(JSON.stringify(result, null, 2));
if (!result.restored) process.exitCode = 1;
