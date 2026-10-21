import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { deviceDriver, PKG, OUT, pause } from './android-device-driver.mjs';
import { permissionHelper } from './android-run2-api28-permission-helper.mjs';
import { answerStoragePrompt } from './android-run2-api28-permission-prompt.mjs';
import { androidNow, androidVerdict } from './android-run2-verdict.mjs';

const serial = 'emulator-5684',
  d = deviceDriver(serial),
  prefix = 'android-run2-emulator-5684-real-allow';
const PREF = `/data/user/0/${PKG}/shared_prefs/splotch-photo-permission.xml`;
const BACKUP = '/data/local/tmp/rn-hunt-api28-grant-pref.xml';
const PICTURES = '/sdcard/Pictures/Splotch';
const WAIT_SAVE_MS = 2000;
const results = [],
  cleanupErrors = [];
let helper = null,
  baseline = null,
  originalPref = null,
  restoredFlags = null;
function root(command) {
  return d.adb('shell', 'su', '0', 'sh', '-c', `'${command}'`).toString().trim();
}
function files() {
  return d
    .adb('shell', `if test -d ${PICTURES}; then find ${PICTURES} -maxdepth 1 -type f; fi`)
    .toString()
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
}
function cleanup(label, action) {
  try {
    action();
  } catch (error) {
    cleanupErrors.push({ label, error: String(error) });
  }
}
function revoke() {
  for (const row of baseline) d.adb('shell', 'pm', 'revoke', PKG, row.permission);
  return helper.read('clear-user');
}
try {
  helper = permissionHelper();
  baseline = helper.read();
  assert.ok(
    baseline.length === 2 && baseline.every((r) => r.permissionCheck === -1 && r.afterFlags === 0)
  );
  d.adb('shell', 'am', 'force-stop', PKG);
  originalPref = root(
    `test ! -e ${BACKUP} && if test -f ${PREF}; then cp -a ${PREF} ${BACKUP}; echo present; else echo absent; fi`
  );
  assert.ok(['present', 'absent'].includes(originalPref));
  for (let run = 1; run <= 2; run++) {
    const tag = `${prefix}-${run}`;
    d.adb('shell', 'am', 'force-stop', PKG);
    revoke();
    root(`rm -f ${PREF}`);
    d.launch();
    let xml = d.capture(`${tag}-start`);
    if (xml.includes('content-desc="Expand controls"')) d.tap('Expand controls');
    const recovering =
      xml.includes('Your picture wasn&apos;t saved') || xml.includes("Your picture wasn't saved");
    if (!recovering) {
      d.tap('Purple');
      d.tap('Brushes');
      d.tap('Pen');
      d.input('swipe', 350, 850, 700, 1350, 900);
      d.capture(`${tag}-ink`);
    }
    const sinceMs = Date.now(),
      startStamp = androidNow(serial),
      before = files();
    let scenarioError = null,
      output = null,
      grantedFlags = null;
    try {
      d.tap(recovering ? 'Try again' : 'Save screenshot');
      answerStoragePrompt(d, `${tag}-prompt`, 'allow');
      xml = d.capture(`${tag}-after-allow`);
      grantedFlags = helper.read();
      writeFileSync(
        `${OUT}/${tag}-granted-flags.json`,
        JSON.stringify(grantedFlags, null, 2) + '\n'
      );
      assert.ok(
        grantedFlags.every((r) => r.permissionCheck === 0),
        'Real Allow did not grant both storage permissions'
      );
      pause(WAIT_SAVE_MS);
      const created = files().filter((p) => !before.includes(p));
      assert.equal(created.length, 1, `Real Allow created ${created.length} public photos`);
      const bytes = d.adb('exec-out', 'cat', created[0]);
      writeFileSync(`${OUT}/${tag}-output.png`, bytes);
      const pixels = await sharp(bytes).removeAlpha().raw().toBuffer();
      output = { path: created[0], pixelHash: createHash('sha256').update(pixels).digest('hex') };
      if (recovering) {
        const previous = JSON.parse(
          readFileSync(`${OUT}/android-run2-emulator-5684-legacy-save-results.json`)
        );
        assert.equal(
          output.pixelHash,
          previous.checks[0].pixelHash,
          'Recovered fixture failure saved different pixels'
        );
      }
      assert.ok(
        !xml.includes("Your picture wasn't saved") &&
          !xml.includes('Your picture wasn&apos;t saved')
      );
    } catch (error) {
      scenarioError = String(error);
      console.error(error);
      process.exitCode = 1;
      try {
        xml = d.capture(`${tag}-error`);
      } catch {
        xml = '';
      }
    }
    results.push({
      id: `real-allow-${run}`,
      status: scenarioError ? 'needs-review' : 'pass',
      recovering,
      scenarioError,
      grantedFlags,
      output,
      evidence: `${tag}-after-allow.png`,
      ...androidVerdict({ serial, pkg: PKG, startStamp, sinceMs, source: xml }),
    });
    writeFileSync(
      `${OUT}/${prefix}-results.json`,
      JSON.stringify({ device: serial, checks: results }, null, 2) + '\n'
    );
  }
} finally {
  cleanup('stop probe', () => d.adb('shell', 'am', 'force-stop', PKG));
  if (originalPref !== null)
    cleanup('restore permission preference', () =>
      root(
        originalPref === 'present'
          ? `cp -a ${BACKUP} ${PREF} && restorecon ${PREF} && rm ${BACKUP}`
          : `rm -f ${PREF}`
      )
    );
  if (helper && baseline)
    cleanup('restore permission flags', () => {
      restoredFlags = revoke();
      assert.deepEqual(
        restoredFlags.map((r) => [r.permission, r.afterFlags, r.permissionCheck]),
        baseline.map((r) => [r.permission, r.afterFlags, r.permissionCheck])
      );
    });
  if (helper) cleanup('remove helper', () => helper.cleanup());
  cleanup('remove driver XML', () => d.cleanup());
  writeFileSync(
    `${OUT}/${prefix}-results.json`,
    JSON.stringify(
      {
        device: serial,
        checks: results,
        baseline,
        restoredFlags,
        originalPref,
        cleanupErrors,
        probeStopped: true,
      },
      null,
      2
    ) + '\n'
  );
  if (cleanupErrors.length) process.exitCode = 1;
}
