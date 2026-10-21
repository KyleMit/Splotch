import { paperDifference, RASTER_REPLAY_CHANNEL_TOLERANCE } from './android-run2-raster.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { deviceDriver, PKG, OUT, pause } from './android-device-driver.mjs';
import { kernelTouch } from './android-run2-api28-kernel-touch.mjs';
import { line } from './android-run2-touch.mjs';
import { androidNow, androidVerdict } from './android-run2-verdict.mjs';

const serial = 'emulator-5684',
  d = deviceDriver(serial),
  prefix = 'android-run2-emulator-5684-life';
const baseline = JSON.parse(readFileSync(`${OUT}/android-run2-emulator-5684-baseline.json`));
const sensor = baseline.sensor.match(/acceleration = ([^\r\n]+)/)[1];
const BACKGROUND_MS = 1000,
  ROTATION_MS = 1500,
  RECLAIM_MS = 2000;
const results = [],
  cleanupErrors = [];
let originalOrientation = null;
async function digest(tag) {
  return createHash('sha256')
    .update(
      await sharp(`${OUT}/${tag}.png`)
        .extract({ left: 220, top: 500, width: 650, height: 1000 })
        .raw()
        .toBuffer()
    )
    .digest('hex');
}
async function replayDifference(before, after) {
  return paperDifference(`${OUT}/${before}.png`, `${OUT}/${after}.png`, {
    left: 220,
    top: 500,
    width: 650,
    height: 1000,
  });
}
function openAppearance(tag) {
  d.tap('Settings');
  d.scrollTap('Appearance');
  return d.capture(tag);
}
function cleanup(label, action) {
  try {
    action();
  } catch (error) {
    cleanupErrors.push({ label, error: String(error) });
  }
}
try {
  d.launch();
  d.capture(`${prefix}-preflight`);
  const appearance = openAppearance(`${prefix}-orientation-before`);
  originalOrientation = ['Portrait', 'Landscape', 'Auto'].find((choice) =>
    new RegExp(`content-desc="${choice}"[^>]*checked="true"`).test(appearance)
  );
  assert.ok(originalOrientation);
  d.tap('Auto');
  d.tap('Close');
  for (const scenario of [
    'background-mid-stroke',
    'rotate-mid-drag',
    'background-process-reclaim',
    'background-trim-COMPLETE',
  ])
    for (let run = 1; run <= 2; run++) {
      const tag = `${prefix}-${scenario}-${run}`;
      d.restart();
      let xml = d.capture(`${tag}-start`);
      if (xml.includes('content-desc="Expand controls"')) d.tap('Expand controls');
      d.tap('Purple');
      d.tap('Brushes');
      d.tap('Pen');
      if (scenario === 'background-process-reclaim') {
        d.tap('Stroke width');
        d.tap('Size 5');
      }
      const sinceMs = Date.now(),
        startStamp = androidNow(serial),
        pidBefore = d.adb('shell', 'pidof', PKG).toString().trim();
      let returnStamp = null,
        returnMs = null,
        scenarioError = null;
      const details = {};
      try {
        const paths = [line([350, 800], [750, 1000])];
        if (scenario === 'background-mid-stroke') {
          details.input = await kernelTouch(`${tag}-input`, paths, async () => {
            d.input('keyevent', 'KEYCODE_HOME');
            pause(BACKGROUND_MS);
            details.backgroundFocus = d
              .adb('shell', 'dumpsys', 'window', 'windows')
              .toString()
              .match(/mCurrentFocus=([^\n]+)/)?.[1];
            assert.ok(details.backgroundFocus && !details.backgroundFocus.includes(PKG));
            d.adb('shell', 'am', 'start', '-W', '-n', `${PKG}/.MainActivity`);
          });
        } else if (scenario === 'rotate-mid-drag') {
          details.input = await kernelTouch(`${tag}-input`, paths, async () => {
            d.adb('emu', 'sensor', 'set', 'acceleration', '9.81:0:0');
            pause(ROTATION_MS);
          });
          d.capture(`${tag}-landscape`);
          const dimensions = await sharp(`${OUT}/${tag}-landscape.png`).metadata();
          assert.ok(dimensions.width > dimensions.height);
          details.rotatedDimensions = { width: dimensions.width, height: dimensions.height };
          d.adb('emu', 'sensor', 'set', 'acceleration', sensor);
          pause(ROTATION_MS);
        } else {
          details.input = await kernelTouch(`${tag}-input`, paths);
          d.capture(`${tag}-before-background`);
          d.input('keyevent', 'KEYCODE_HOME');
          pause(BACKGROUND_MS);
          if (scenario === 'background-process-reclaim') {
            assert.equal(d.adb('shell', 'pidof', PKG).toString().trim(), pidBefore);
            details.kill = d.adb('shell', 'am', 'kill', PKG).toString();
            pause(RECLAIM_MS);
            let pid = '';
            try {
              pid = d.adb('shell', 'pidof', PKG).toString().trim();
            } catch {}
            assert.equal(pid, '', 'System reclaim did not remove the background PID');
            details.intentionalReclaim = {
              command: `am kill ${PKG}`,
              pid: pidBefore,
              confirmedAbsent: true,
            };
            returnMs = Date.now();
            returnStamp = androidNow(serial);
          } else
            details.trim = d.adb('shell', 'am', 'send-trim-memory', PKG, 'COMPLETE').toString();
          d.adb('shell', 'am', 'start', '-W', '-n', `${PKG}/.MainActivity`);
        }
        xml = d.capture(`${tag}-returned`);
        const pidAfter = d.adb('shell', 'pidof', PKG).toString().trim();
        details.pidAfter = pidAfter;
        if (scenario === 'background-process-reclaim') {
          assert.notEqual(pidAfter, pidBefore);
          assert.match(xml, /content-desc="Undo"[^>]*enabled="false"/);
          d.tap('Stroke width');
          const selected = d.capture(`${tag}-width-persisted`);
          assert.match(selected, /content-desc="Size 5"[^>]*(?:selected|checked)="true"/);
          d.tap('Size 3');
          details.widthPersisted = true;
        } else assert.equal(pidAfter, pidBefore);
        if (scenario === 'background-trim-COMPLETE') {
          assert.equal(await digest(`${tag}-returned`), await digest(`${tag}-before-background`));
          details.trimRetainsExactInk = true;
        }
        const before = await digest(`${tag}-returned`);
        await kernelTouch(`${tag}-recovered-input`, [line([350, 1300], [750, 1400])]);
        d.capture(`${tag}-responsive`);
        assert.notEqual(await digest(`${tag}-responsive`), before);
        d.tap('Undo');
        d.capture(`${tag}-undo`);
        if (scenario === 'rotate-mid-drag') {
          details.undoRasterReplay = await replayDifference(`${tag}-returned`, `${tag}-undo`);
          assert.ok(details.undoRasterReplay.maxChannelDelta <= RASTER_REPLAY_CHANNEL_TOLERANCE);
        } else assert.equal(await digest(`${tag}-undo`), before);
        details.inputRecovered = true;
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
      const wholeWindowVerdict = androidVerdict({
        serial,
        pkg: PKG,
        startStamp,
        sinceMs,
        source: xml,
      });
      const unexpected = wholeWindowVerdict.fatal.filter(
        (l) => !l.includes(`Process ${PKG} (pid ${pidBefore}) has died`)
      );
      const verdict =
        returnStamp && !unexpected.length && !wholeWindowVerdict.dropbox.length
          ? androidVerdict({
              serial,
              pkg: PKG,
              startStamp: returnStamp,
              sinceMs: returnMs,
              source: xml,
            })
          : wholeWindowVerdict;
      results.push({
        id: `${scenario}-${run}`,
        scenario,
        run,
        status: !scenarioError && verdict.verdict === 'alive' ? 'pass' : 'needs-review',
        scenarioError,
        pidBefore,
        details,
        wholeWindowVerdict,
        ...verdict,
      });
      writeFileSync(`${OUT}/${tag}.json`, JSON.stringify(results.at(-1), null, 2) + '\n');
      d.adb('emu', 'sensor', 'set', 'acceleration', sensor);
    }
} finally {
  cleanup('restore sensor', () => d.adb('emu', 'sensor', 'set', 'acceleration', sensor));
  cleanup('restore orientation and Pen width', () => {
    d.restart();
    const xml = d.capture(`${prefix}-restore-root`);
    if (xml.includes('content-desc="Expand controls"')) d.tap('Expand controls');
    d.tap('Brushes');
    d.tap('Pen');
    d.tap('Stroke width');
    d.tap('Size 3');
    if (originalOrientation) {
      openAppearance(`${prefix}-restore-appearance`);
      d.tap(originalOrientation);
      d.capture(`${prefix}-restored-appearance`);
      d.tap('Close');
    }
  });
  cleanup('stop probe', () => d.adb('shell', 'am', 'force-stop', PKG));
  cleanup('remove driver XML', () => d.cleanup());
  writeFileSync(
    `${OUT}/${prefix}-results.json`,
    JSON.stringify(
      {
        device: serial,
        checks: results,
        originalOrientation,
        restoredSensor: d.adb('emu', 'sensor', 'get', 'acceleration').toString(),
        cleanupErrors,
        probeStopped: true,
      },
      null,
      2
    ) + '\n'
  );
  if (cleanupErrors.length) process.exitCode = 1;
}
