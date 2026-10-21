import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { adb, capture, tap, OUT } from './android-driver.mjs';
import { open, restart } from './android-run2-settings-helpers.mjs';
import { pause } from './android-run2-touch.mjs';
const sensor = adb('emu', 'sensor', 'get', 'acceleration')
    .toString()
    .match(/acceleration = ([^\r\n]+)/)[1],
  checks = [];
async function shot(name, landscape) {
  capture(name);
  const m = await sharp(`${OUT}/${name}.png`).metadata();
  assert.equal(m.width > m.height, landscape);
  checks.push({ case: name, status: 'pass', width: m.width, height: m.height });
}
try {
  open('Appearance', 'android-run2-orientation-start');
  tap('Landscape');
  await shot('android-run2-lock-landscape', true);
  tap('Close');
  restart('android-run2-lock-landscape-restart');
  await shot('android-run2-lock-landscape-persisted', true);
  tap('Settings');
  capture('android-run2-lock-landscape-compact');
  tap('Portrait');
  await shot('android-run2-lock-portrait', false);
  tap('Close');
  restart('android-run2-lock-portrait-restart');
  await shot('android-run2-lock-portrait-persisted', false);
  open('Appearance', 'android-run2-lock-auto');
  tap('Auto');
  tap('Close');
  adb('emu', 'rotate');
  pause(1500);
  await shot('android-run2-auto-rotates-landscape', true);
  adb('emu', 'sensor', 'set', 'acceleration', sensor);
  pause(1500);
  await shot('android-run2-auto-rotates-back', false);
} finally {
  adb('emu', 'sensor', 'set', 'acceleration', sensor);
  restart('android-run2-orientation-cleanup-root');
  tap('Settings');
  const xml = capture('android-run2-orientation-cleanup-settings');
  if (!xml.includes('content-desc="Portrait"')) {
    tap('Appearance');
    capture('android-run2-orientation-cleanup-section');
  }
  tap('Portrait');
  capture('android-run2-orientation-cleanup-portrait');
  tap('Close');
  writeFileSync(
    `${OUT}/android-run2-orientation-results.json`,
    JSON.stringify(checks, null, 2) + '\n'
  );
}
