import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { deviceDriver, PKG, OUT, bounds, pause } from './android-device-driver.mjs';
import { line } from './android-run2-touch.mjs';
import { androidNow, androidVerdict } from './android-run2-verdict.mjs';
import { permissionHelper } from './android-run2-api28-permission-helper.mjs';
import { answerStoragePrompt } from './android-run2-api28-permission-prompt.mjs';

const serial = 'emulator-5684',
  d = deviceDriver(serial);
const prefix = 'android-run2-emulator-5684-legacy-save';
const PREF = `/data/user/0/${PKG}/shared_prefs/splotch-photo-permission.xml`;
const BACKUP = '/data/local/tmp/rn-hunt-api28-photo-permission.xml';
const PROMPT_XML = '/data/local/tmp/rn-hunt-api28-permission-ui.xml';
const WAIT_SAVE_MS = 2000;
const dirs = [`/sdcard/Android/media/${PKG}/Splotch`, '/sdcard/Pictures/Splotch'];
const checks = [],
  cleanupErrors = [];
let originalPref = null,
  originalGranted = false,
  scenarioError = null,
  verdict = null,
  sinceMs = null,
  startStamp = null,
  flagHelper = null,
  flagBaseline = null,
  flagsAfter = null;
function root(command) {
  return d.adb('shell', 'su', '0', 'sh', '-c', `'${command}'`).toString().trim();
}
function packageState() {
  return d.adb('shell', 'dumpsys', 'package', PKG).toString();
}
function files() {
  return d
    .adb(
      'shell',
      `for p in ${dirs.join(' ')}; do if test -d "$p"; then find "$p" -maxdepth 1 -type f; fi; done`
    )
    .toString()
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
}
async function inspectNew(before, tag, expectedDir) {
  pause(WAIT_SAVE_MS);
  const created = files().filter((p) => !before.includes(p));
  assert.equal(created.length, 1, `Expected one new photo: ${JSON.stringify(created)}`);
  assert.ok(created[0].startsWith(`${expectedDir}/`));
  const bytes = d.adb('exec-out', 'cat', created[0]);
  writeFileSync(`${OUT}/${tag}-output.png`, bytes);
  const { data, info } = await sharp(bytes)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.ok(info.width > 0 && info.height > 0);
  const pixelHash = createHash('sha256').update(data).digest('hex');
  return {
    path: created[0],
    pixelHash,
    width: info.width,
    height: info.height,
    evidence: `${tag}-output.png`,
  };
}
function cleanup(label, action) {
  try {
    action();
  } catch (error) {
    cleanupErrors.push({ label, error: String(error) });
  }
}
try {
  assert.equal(d.adb('shell', 'getprop', 'ro.build.version.sdk').toString().trim(), '28');
  flagHelper = permissionHelper();
  const initialFlags = flagHelper.read();
  assert.equal(initialFlags.length, 2);
  assert.ok(initialFlags.every((row) => row.permissionCheck === -1 && row.afterFlags === 0));
  flagBaseline = initialFlags;
  const state = packageState();
  writeFileSync(`${OUT}/${prefix}-permission-before.txt`, state);
  originalGranted = /android\.permission\.WRITE_EXTERNAL_STORAGE: granted=true/.test(state);
  assert.equal(originalGranted, false, 'Fresh-install denied permission expected');
  d.adb('shell', 'am', 'force-stop', PKG);
  originalPref = root(
    `test ! -e ${BACKUP} && if test -f ${PREF}; then cp -a ${PREF} ${BACKUP}; echo present; else echo absent; fi`
  );
  assert.ok(['present', 'absent'].includes(originalPref));
  root(`rm -f ${PREF}`);
  d.launch();
  let xml = d.capture(`${prefix}-start`);
  if (xml.includes('content-desc="Expand controls"')) d.tap('Expand controls');
  d.tap('Purple');
  d.tap('Brushes');
  d.tap('Pen');
  xml = d.capture(`${prefix}-blank`);
  const paper = [...xml.matchAll(/<node\b[^>]*>/g)]
    .map((m) => m[0])
    .find((n) => n.includes('content-desc="Drawing paper"'));
  const [l, t, r, b] = bounds(paper);
  await d.inject(`${prefix}-ink`, [
    line(
      [Math.round(l + (r - l) * 0.3), Math.round(t + (b - t) * 0.35)],
      [Math.round(l + (r - l) * 0.7), Math.round(t + (b - t) * 0.65)]
    ),
  ]);
  d.capture(`${prefix}-ink`);
  sinceMs = Date.now();
  startStamp = androidNow(serial);
  const before = files();
  d.tap('Save screenshot');
  answerStoragePrompt(d, `${prefix}-deny-prompt`, 'deny');
  d.capture(`${prefix}-after-deny`);
  const denied = await inspectNew(before, `${prefix}-denied`, dirs[0]);
  checks.push({
    id: 'deny-storage-permission-saves-app-media-fallback',
    status: 'pass',
    ...denied,
  });
  const secondBefore = files();
  d.tap('Save screenshot');
  d.capture(`${prefix}-second-denied-save`);
  const second = await inspectNew(secondBefore, `${prefix}-second-denied`, dirs[0]);
  assert.equal(second.pixelHash, denied.pixelHash);
  checks.push({
    id: 'denied-repeated-save-no-repeat-prompt-exact-pixels',
    status: 'pass',
    ...second,
  });
  const source = d.capture(`${prefix}-final`);
  verdict = androidVerdict({ serial, pkg: PKG, startStamp, sinceMs, source });
} catch (error) {
  scenarioError = String(error);
  console.error(error);
  process.exitCode = 1;
  if (startStamp) {
    let source = '';
    try {
      source = d.capture(`${prefix}-error`);
    } catch {}
    verdict = androidVerdict({ serial, pkg: PKG, startStamp, sinceMs, source });
  }
} finally {
  cleanup('stop probe', () => d.adb('shell', 'am', 'force-stop', PKG));
  if (originalPref !== null)
    cleanup('restore permission preference', () => {
      root(
        originalPref === 'present'
          ? `cp -a ${BACKUP} ${PREF} && restorecon ${PREF} && rm ${BACKUP}`
          : `rm -f ${PREF}`
      );
    });
  if (flagBaseline) {
    for (const row of flagBaseline)
      cleanup(`restore ${row.permission}`, () =>
        d.adb('shell', 'pm', 'revoke', PKG, row.permission)
      );
    cleanup('restore permission flags', () => {
      flagsAfter = flagHelper.read('clear-user');
      assert.deepEqual(
        flagsAfter.map((row) => [row.permission, row.afterFlags, row.permissionCheck]),
        flagBaseline.map((row) => [row.permission, row.afterFlags, row.permissionCheck])
      );
    });
  }
  if (flagHelper) cleanup('remove compiled permission helper', () => flagHelper.cleanup());
  cleanup('remove owned XML', () => d.adb('shell', 'rm', '-f', PROMPT_XML));
  cleanup('remove driver XML', () => d.cleanup());
  let permissionAfter = '';
  cleanup('capture restored permission', () => {
    permissionAfter = packageState();
  });
  writeFileSync(`${OUT}/${prefix}-permission-after.txt`, permissionAfter);
  writeFileSync(
    `${OUT}/${prefix}-results.json`,
    JSON.stringify(
      {
        device: serial,
        checks,
        scenarioError,
        verdict,
        originalGranted,
        originalPref,
        flagBaseline,
        flagsAfter,
        cleanupErrors,
        probeStopped: true,
      },
      null,
      2
    ) + '\n'
  );
  if (cleanupErrors.length) process.exitCode = 1;
}
