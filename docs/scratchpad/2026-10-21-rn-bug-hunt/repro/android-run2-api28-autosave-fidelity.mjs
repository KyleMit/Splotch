import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { deviceDriver, PKG, OUT, nodes, center, pause } from './android-device-driver.mjs';
import { permissionHelper } from './android-run2-api28-permission-helper.mjs';
import { kernelTouch } from './android-run2-api28-kernel-touch.mjs';
import { line } from './android-run2-touch.mjs';
import { androidNow, androidVerdict } from './android-run2-verdict.mjs';

const serial = 'emulator-5684',
  d = deviceDriver(serial),
  prefix = 'android-run2-emulator-5684-autosave-fidelity';
const PICTURES = '/sdcard/Pictures/Splotch';
const MIN_INK_PIXELS = 500;
const WAIT_SAVE_MS = 2000;
const checks = [],
  cleanupErrors = [];
let helper = null,
  baseline = null,
  originalAutoSave = null,
  restoredFlags = null,
  autoSaveRestored = false;
function cleanup(label, action) {
  try {
    action();
  } catch (error) {
    cleanupErrors.push({ label, error: String(error) });
  }
}
function files() {
  return d
    .adb('shell', `if test -d ${PICTURES}; then find ${PICTURES} -maxdepth 1 -type f; fi`)
    .toString()
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
}
function setAutoSave(wanted, tag) {
  const current = d.source();
  if (current.includes('content-desc="Close"')) d.tap('Close');
  d.tap('Settings');
  d.scrollTap('Saving');
  const xml = d.capture(`${tag}-saving`);
  const toggle = nodes(xml).find(
    (n) =>
      n.visible &&
      n.token.includes('content-desc="Auto-Save on Delete"') &&
      n.token.includes('class="android.widget.Switch"')
  );
  assert.ok(toggle);
  const was = toggle.token.includes('checked="true"');
  if (originalAutoSave === null) originalAutoSave = was;
  if (was !== wanted) d.tap('Auto-Save on Delete', { type: 'Switch' });
  const after = d.capture(`${tag}-saving-selected`);
  assert.ok(
    nodes(after).some(
      (n) =>
        n.token.includes('content-desc="Auto-Save on Delete"') &&
        n.token.includes('class="android.widget.Switch"') &&
        n.token.includes(`checked="${wanted}"`)
    )
  );
  d.tap('Close');
  return wanted;
}
async function colored(tag, screen) {
  const { data, info } = await sharp(`${OUT}/${tag}.png`)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const box = screen
    ? { l: 220, t: 500, r: 850, b: 1500 }
    : { l: 0, t: 0, r: info.width, b: info.height };
  let count = 0;
  for (let y = box.t; y < box.b; y++)
    for (let x = box.l; x < box.r; x++) {
      const i = (y * info.width + x) * info.channels,
        [r, g, b] = data.subarray(i, i + 3);
      if (Math.max(r, g, b) - Math.min(r, g, b) > 50) count++;
    }
  return count;
}
try {
  helper = permissionHelper();
  baseline = helper.read();
  assert.ok(baseline.every((r) => r.permissionCheck === -1 && r.afterFlags === 0));
  d.adb('shell', 'am', 'force-stop', PKG);
  for (const row of baseline) d.adb('shell', 'pm', 'grant', PKG, row.permission);
  assert.ok(helper.read().every((r) => r.permissionCheck === 0));
  d.launch();
  d.capture(`${prefix}-setup`);
  setAutoSave(true, `${prefix}-enable`);
  for (let run = 1; run <= 2; run++) {
    const tag = `${prefix}-${run}`;
    d.restart();
    let xml = d.capture(`${tag}-start`);
    if (xml.includes('content-desc="Expand controls"')) d.tap('Expand controls');
    d.tap('Purple');
    d.tap('Brushes');
    d.tap('Pen');
    const input = await kernelTouch(`${tag}-ink-input`, [line([350, 800], [750, 1000])]);
    xml = d.capture(`${tag}-ink`);
    const screenInk = await colored(`${tag}-ink`, true);
    assert.ok(screenInk > MIN_INK_PIXELS);
    const clear = nodes(xml).find(
      (n) => n.visible && n.token.includes('content-desc="Clear drawing"')
    );
    assert.ok(clear);
    const before = files(),
      sinceMs = Date.now(),
      startStamp = androidNow(serial);
    let output = null,
      afterClear = null,
      scenarioError = null,
      clearInput = null;
    try {
      clearInput = await kernelTouch(`${tag}-clear-input`, [
        line(center(clear.token), [540, 1000]),
      ]);
      xml = d.capture(`${tag}-cleared`);
      afterClear = await colored(`${tag}-cleared`, true);
      assert.equal(afterClear, 0, 'Clear did not remove the controlled ink');
      pause(WAIT_SAVE_MS);
      const created = files().filter((p) => !before.includes(p));
      assert.equal(created.length, 1, 'Auto-Save did not publish one photo');
      const bytes = d.adb('exec-out', 'cat', created[0]);
      writeFileSync(`${OUT}/${tag}-output.png`, bytes);
      output = {
        path: created[0],
        coloredPixels: await colored(`${tag}-output`, false),
        pixelHash: createHash('sha256')
          .update(await sharp(bytes).removeAlpha().raw().toBuffer())
          .digest('hex'),
      };
      assert.ok(
        !xml.includes("Your picture wasn't saved") &&
          !xml.includes('Your picture wasn&apos;t saved')
      );
      assert.ok(
        output.coloredPixels > MIN_INK_PIXELS,
        'Auto-Save omitted the ink removed by Clear'
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
    checks.push({
      id: `autosave-clear-${run}`,
      status: scenarioError?.includes('Auto-Save omitted')
        ? 'fail'
        : scenarioError
          ? 'needs-review'
          : 'pass',
      input,
      clearInput,
      screenInk,
      afterClear,
      output,
      scenarioError,
      evidence: `${tag}-cleared.png`,
      ...androidVerdict({ serial, pkg: PKG, startStamp, sinceMs, source: xml }),
    });
    writeFileSync(
      `${OUT}/${prefix}-results.json`,
      JSON.stringify({ device: serial, checks }, null, 2) + '\n'
    );
  }
} finally {
  if (originalAutoSave !== null)
    cleanup('restore Auto-Save', () => {
      d.launch();
      autoSaveRestored = setAutoSave(originalAutoSave, `${prefix}-restore`) === originalAutoSave;
    });
  cleanup('stop probe', () => d.adb('shell', 'am', 'force-stop', PKG));
  if (helper && baseline)
    cleanup('restore permissions', () => {
      for (const row of baseline) d.adb('shell', 'pm', 'revoke', PKG, row.permission);
      restoredFlags = helper.read('clear-user');
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
        checks,
        originalAutoSave,
        autoSaveRestored,
        restoredFlags,
        cleanupErrors,
        probeStopped: true,
      },
      null,
      2
    ) + '\n'
  );
  if (cleanupErrors.length) process.exitCode = 1;
}
