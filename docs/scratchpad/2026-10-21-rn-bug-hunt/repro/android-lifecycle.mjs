import { tap, capture, guard, adb } from './android-driver.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
const root = 'docs/scratchpad/2026-10-21-rn-bug-hunt/evidence/';
const originalFont = readFileSync(root + 'android-original-font-scale.txt', 'utf8').trim();
const originalRotation = readFileSync(root + 'android-original-rotation.txt', 'utf8').trim();
const originalAccelerometer = readFileSync(
  root + 'android-original-accelerometer.txt',
  'utf8'
).trim();
try {
  tap('Settings');
  tap('Appearance');
  tap('Auto');
  tap('Close');
  guard();
  adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
  adb('shell', 'settings', 'put', 'system', 'user_rotation', '1');
  capture('android-landscape');
  tap('Settings');
  capture('android-landscape-settings');
  tap('Close');
  guard();
  adb('shell', 'settings', 'put', 'system', 'user_rotation', '0');
  capture('android-portrait-return');
  guard();
  adb('shell', 'settings', 'put', 'system', 'font_scale', '2.0');
  tap('Settings');
  capture('android-font2-hub');
  tap('Accessibility');
  capture('android-font2-accessibility');
  tap('Close');
  guard();
  adb('shell', 'cmd', 'uimode', 'night', 'yes');
  capture('android-dark-font2-root');
  tap('Settings');
  capture('android-dark-font2-settings');
  tap('Close');
} finally {
  adb('shell', 'settings', 'put', 'system', 'font_scale', originalFont);
  adb('shell', 'settings', 'put', 'system', 'user_rotation', originalRotation);
  adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', originalAccelerometer);
  adb('shell', 'cmd', 'uimode', 'night', 'no');
  writeFileSync(
    root + 'android-restored-os-settings.txt',
    `${adb('shell', 'settings', 'get', 'system', 'font_scale')}${adb('shell', 'settings', 'get', 'system', 'user_rotation')}${adb('shell', 'settings', 'get', 'system', 'accelerometer_rotation')}${adb('shell', 'cmd', 'uimode', 'night')}`
  );
}
