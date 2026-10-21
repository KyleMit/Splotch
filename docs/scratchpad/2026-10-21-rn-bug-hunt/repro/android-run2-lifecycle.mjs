import { paletteHex } from '../../../../experiments/native-architecture/src/drawing/palette.ts';
import { paperDifference, RASTER_REPLAY_CHANNEL_TOLERANCE } from './android-run2-raster.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { spawn } from 'node:child_process';
import { writeFileSync, openSync, closeSync } from 'node:fs';
import { androidNow, androidVerdict } from './android-run2-verdict.mjs';
import { adb, capture, tap, input, guard, OUT } from './android-driver.mjs';
import { restart, open } from './android-run2-settings-helpers.mjs';
import { pathCommands, line, pause, inject } from './android-run2-touch.mjs';
const SERIAL = 'emulator-5680',
  PKG = 'art.splotch.migration.probe';
const sensor = adb('emu', 'sensor', 'get', 'acceleration')
  .toString()
  .match(/acceleration = ([^\r\n]+)/)[1];
const PERSISTED_COLOR_TOLERANCE = 3;
const MIN_PERSISTED_COLOR_PIXELS = 1000;
const results = [];
const correctionsOnly = process.argv.includes('--corrections-only');
const outputPrefix = correctionsOnly ? 'android-run2-life-corrected' : 'android-run2';
const digest = async (name) =>
  createHash('sha256')
    .update(
      await sharp(`${OUT}/${name}.png`)
        .extract({ left: 200, top: 600, width: 700, height: 1400 })
        .raw()
        .toBuffer()
    )
    .digest('hex');
adb('shell', 'am', 'start', '-W', '-n', `${PKG}/.MainActivity`);
capture('android-run2-life-preflight');
open('Appearance', 'android-run2-life-auto');
let xml;
tap('Auto');
tap('Close');
async function replayDifference(before, after) {
  return paperDifference(`${OUT}/${before}.png`, `${OUT}/${after}.png`, {
    left: 200,
    top: 600,
    width: 700,
    height: 1400,
  });
}
const BACKGROUND_ADMISSION_TIMEOUT_MS = 15000;
const BACKGROUND_POLL_MS = 250;
const BACKGROUND_STATES = new Set([
  'IMPORTANT_BACKGROUND',
  'TRANSIENT_BACKGROUND',
  'SERVICE',
  'RECEIVER',
  'HOME',
  'LAST_ACTIVITY',
  'CACHED_ACTIVITY',
  'CACHED_ACTIVITY_CLIENT',
  'CACHED_RECENT',
  'CACHED_EMPTY',
]);
function confirmBackground(pidBefore) {
  const uid = adb('shell', 'cmd', 'package', 'list', 'packages', '-U', PKG)
    .toString()
    .match(/uid:(\d+)/)?.[1];
  assert.ok(uid);
  const states = [],
    started = Date.now();
  while (Date.now() - started < BACKGROUND_ADMISSION_TIMEOUT_MS) {
    const raw = adb('shell', 'am', 'get-uid-state', uid).toString().trim();
    const label = raw.match(/^\d+ \(([A-Z_]+)\)$/)?.[1];
    const focus = adb('shell', 'dumpsys', 'window', 'displays')
      .toString()
      .match(/mCurrentFocus=([^\n]+)/)?.[1];
    states.push({ at: new Date().toISOString(), raw, focus });
    if (label && BACKGROUND_STATES.has(label) && focus && !focus.includes(PKG)) {
      assert.equal(adb('shell', 'pidof', PKG).toString().trim(), pidBefore);
      return { uid, states, waitMs: Date.now() - started };
    }
    pause(BACKGROUND_POLL_MS);
  }
  throw new Error(
    `App did not reach a confirmed background process state: ${JSON.stringify(states)}`
  );
}
async function interrupted(name, action) {
  const commands = pathCommands([line([350, 900], [750, 1550], 250)]),
    file = `${OUT}/${name}.input.jsonl`,
    remote = '/data/local/tmp/rn-hunt-life-touch.jsonl';
  writeFileSync(file, commands.map((c) => JSON.stringify(c)).join('\n') + '\n');
  adb('push', file, remote);
  guard();
  const fd = openSync(`${OUT}/${name}.input.log.txt`, 'w');
  const child = spawn('adb', ['-s', SERIAL, 'shell', 'uinput', remote], {
    stdio: ['ignore', fd, fd],
  });
  const completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`uinput exit ${code}`))
    );
  });
  try {
    await new Promise((r) => setTimeout(r, 2100));
    await action();
    await completed;
  } finally {
    child.kill('SIGTERM');
    await completed.catch(() => {});
    closeSync(fd);
    adb('shell', 'rm', '-f', remote);
  }
}
try {
  for (const scenario of correctionsOnly
    ? ['background-process-reclaim', 'background-trim-COMPLETE']
    : [
        'background-mid-stroke',
        'rotate-mid-drag',
        'background-process-reclaim',
        'background-trim-COMPLETE',
      ])
    for (let run = 1; run <= 2; run++) {
      const name = `${outputPrefix}-${scenario}-${run}`;
      xml = restart(`${name}-start`);
      if (xml.includes('content-desc="Expand controls"')) tap('Expand controls');
      tap('Purple');
      tap('Brushes');
      tap('Pen');
      if (scenario === 'background-process-reclaim') {
        tap('Stroke width');
        tap('Size 5');
      }
      const sinceMs = Date.now(),
        startStamp = androidNow(SERIAL),
        pidBefore = adb('shell', 'pidof', PKG).toString().trim();
      let error = null,
        returnStartStamp = null,
        returnSinceMs = null;
      const details = {};
      try {
        if (scenario === 'background-mid-stroke')
          await interrupted(name, async () => {
            input('keyevent', 'KEYCODE_HOME');
            pause(1200);
            details.backgroundFocus = adb('shell', 'dumpsys', 'window', 'displays')
              .toString()
              .match(/mCurrentFocus=([^\n]+)/)?.[1];
            assert.ok(details.backgroundFocus && !details.backgroundFocus.includes(PKG));
            adb('shell', 'am', 'start', '-W', '-n', `${PKG}/.MainActivity`);
          });
        else if (scenario === 'rotate-mid-drag') {
          await interrupted(name, async () => {
            adb('emu', 'rotate');
          });
          capture(`${name}-landscape`);
          const dimensions = await sharp(`${OUT}/${name}-landscape.png`).metadata();
          assert.ok(dimensions.width > dimensions.height, 'Mid-drag rotation did not land');
          details.rotatedDimensions = { width: dimensions.width, height: dimensions.height };
          adb('emu', 'sensor', 'set', 'acceleration', sensor);
          pause(2000);
        } else {
          await inject(`${name}-ink`, pathCommands([line([350, 900], [750, 1550])]));
          capture(`${name}-before-background`);
          input('keyevent', 'KEYCODE_HOME');
          pause(1500);
          details.backgroundAdmission = confirmBackground(pidBefore);
          if (scenario === 'background-process-reclaim') {
            assert.equal(adb('shell', 'pidof', PKG).toString().trim(), pidBefore);
            details.kill = adb('shell', 'am', 'kill', PKG).toString();
            pause(2000);
            let pid = '';
            try {
              pid = adb('shell', 'pidof', PKG).toString().trim();
            } catch {}
            assert.equal(pid, '', 'am kill did not reclaim process');
            details.intentionalReclaim = {
              command: `am kill ${PKG}`,
              pid: pidBefore,
              confirmedAbsent: true,
            };
            returnSinceMs = Date.now();
            returnStartStamp = androidNow(SERIAL);
          } else details.trim = adb('shell', 'am', 'send-trim-memory', PKG, 'COMPLETE').toString();
          adb('shell', 'am', 'start', '-W', '-n', `${PKG}/.MainActivity`);
          pause(2500);
        }
        xml = capture(`${name}-returned`);
        guard();
        const pidAfter = adb('shell', 'pidof', PKG).toString().trim();
        details.pidAfter = pidAfter;
        if (scenario === 'background-trim-COMPLETE') {
          assert.equal(await digest(`${name}-returned`), await digest(`${name}-before-background`));
          details.trimRetainedExactInk = true;
        }
        if (scenario === 'background-process-reclaim') {
          assert.match(xml, /content-desc="Undo"[^>]*enabled="false"/);
          assert.notEqual(pidAfter, pidBefore);

          tap('Stroke width');
          const widthXml = capture(`${name}-width-persisted`);
          assert.match(widthXml, /content-desc="Size 5"[^>]*(?:selected|checked)="true"/);
          tap('Size 3');
          details.changedWidthPersisted = true;
        } else assert.equal(pidAfter, pidBefore);
        const beforeInput = await digest(`${name}-returned`);
        await inject(`${name}-new-stroke`, pathCommands([line([350, 1800], [750, 1850])]));
        xml = capture(`${name}-responsive`);
        assert.notEqual(await digest(`${name}-responsive`), beforeInput);
        if (scenario === 'background-process-reclaim') {
          const expected = paletteHex('Purple')
            .slice(1)
            .match(/../g)
            .map((hex) => parseInt(hex, 16));
          const { data, info } = await sharp(`${OUT}/${name}-responsive.png`)
            .extract({ left: 300, top: 1750, width: 500, height: 200 })
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
          let pixels = 0;
          for (let i = 0; i < data.length; i += info.channels)
            if (expected.every((v, c) => Math.abs(data[i + c] - v) <= PERSISTED_COLOR_TOLERANCE))
              pixels++;
          assert.ok(
            pixels > MIN_PERSISTED_COLOR_PIXELS,
            'Returned app did not draw selected Purple'
          );
          details.recoveredPurplePixels = pixels;
        }
        tap('Undo');
        capture(`${name}-undo`);
        if (scenario === 'rotate-mid-drag') {
          details.undoRasterReplay = await replayDifference(`${name}-returned`, `${name}-undo`);
          assert.ok(
            details.undoRasterReplay.maxChannelDelta <= RASTER_REPLAY_CHANNEL_TOLERANCE,
            'Undo changed the picture beyond raster replay tolerance'
          );
        } else assert.equal(await digest(`${name}-undo`), beforeInput);
        details.inputRecovered = true;
        details.undoExact = scenario !== 'rotate-mid-drag';
      } catch (e) {
        error = String(e);
        console.log(name, error);
        try {
          xml = capture(`${name}-error`);
        } catch {
          xml = '';
        }
      }
      const wholeWindowVerdict = androidVerdict({
        serial: SERIAL,
        pkg: PKG,
        startStamp,
        sinceMs,
        source: xml,
      });
      const unexpectedFatal = wholeWindowVerdict.fatal.filter(
        (line) => !line.includes(`Process ${PKG} (pid ${pidBefore}) has died`)
      );
      const verdict =
        returnStartStamp && !unexpectedFatal.length && !wholeWindowVerdict.dropbox.length
          ? androidVerdict({
              serial: SERIAL,
              pkg: PKG,
              startStamp: returnStartStamp,
              sinceMs: returnSinceMs,
              source: xml,
            })
          : wholeWindowVerdict;
      const row = {
        scenario,
        run,
        device: SERIAL,
        startedAt: new Date(sinceMs).toISOString(),
        pidBefore,
        scenarioError: error,
        details,
        wholeWindowVerdict,
        verdictWindow: returnStartStamp
          ? 'Return after explicitly confirmed background reclaim; whole-window classifier retained separately'
          : 'Whole scenario',
        ...verdict,
      };
      results.push(row);
      writeFileSync(`${OUT}/${name}.json`, JSON.stringify(row, null, 2) + '\n');
      console.log(name, row.verdict, error);
      adb('emu', 'sensor', 'set', 'acceleration', sensor);
    }
} finally {
  adb('emu', 'sensor', 'set', 'acceleration', sensor);
  restart('android-run2-life-restoring');
  open('Appearance', 'android-run2-life-portrait');
  tap('Portrait');
  tap('Close');
  writeFileSync(
    `${OUT}/android-run2-lifecycle${correctionsOnly ? '-corrected' : ''}-summary.json`,
    JSON.stringify(
      { results, restoredSensor: adb('emu', 'sensor', 'get', 'acceleration').toString() },
      null,
      2
    ) + '\n'
  );
}
